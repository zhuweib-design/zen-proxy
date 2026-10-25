// zen-proxy 工具调用自检：node check-tools.mjs [代理地址，默认 http://127.0.0.1:8787]
// 目的：判断两条路由上"带工具的请求"能否正常拿到工具调用。
// 退出码：0 = 全部通过；1 = 有需要打补丁的故障；2 = 代理没起来。
const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const KEY = process.env.ZEN_CHECK_KEY || 'public'
const MODEL = process.env.ZEN_CHECK_MODEL || ''

const H = { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json; charset=utf-8' }
// 提示词必须明确要求调用工具：模型在弱提示下会只输出 reasoning 就停，
// 那样看起来像"没有 tool_use"，其实是模型没调（2026-10-25 换新版后实测）。
const Q = '列出当前目录下的文件夹。必须调用工具完成，不要直接回答。'

const OPENAI_TOOLS = [{ type: 'function', function: { name: 'run_shell', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } }]
const ANTHROPIC_TOOLS = [{ name: 'run_shell', description: 'Run a shell command', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } }]

async function pickModel() {
  if (MODEL) return MODEL
  const r = await fetch(`${BASE}/v1/models`, { headers: H })
  const j = await r.json()
  const list = (j.data || []).map((m) => m.id)
  return list.find((id) => id.includes('deepseek')) || list[0] || 'glm-5.3-flash-free'
}

async function post(path, body, headers) {
  const r = await fetch(BASE + path, { method: 'POST', headers: headers || H, body: JSON.stringify(body) })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch {}
  return { status: r.status, j, t }
}

function verdict(name, ok, detail) {
  console.log(`${ok ? '通过' : '失败'}  ${name.padEnd(26)} ${detail}`)
  return ok
}

const main = async () => {
  let health
  try {
    health = await (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(8000) })).json()
  } catch (e) {
    console.log(`代理没起来或地址不对：${BASE}  (${e.message})`)
    process.exit(2)
  }
  const model = await pickModel()
  console.log(`目标 ${BASE}  模型 ${model}  health.ok=${health.ok}\n`)

  const results = []

  // 429 和 403 各自说明的是额度与闸门状况，不能拿来推断补丁在不在。
  // 之前这条脚本在额度耗尽时把三项都报成"需要补丁 4"，把排查带进了死路。
  let external = 0
  const bump = (msg) => { if (msg) external++; return msg }
  function blocked(status, j) {
    const t = String(j?.error?.type || j?.type || j?.error?.code || '')
    if (status === 429) return `HTTP 429 ${t || '限流'} -> 免费额度到顶或限流，与补丁无关；等额度恢复后重跑`
    if (status === 403 && /Region/i.test(t)) return `HTTP 403 ${t} -> 该模型在此地区不可用，换一个模型再测（--model）`
    if (status === 403 && /FreeTier/i.test(t)) return `HTTP 403 ${t} -> 闸门拒绝，检查 ZEN_PROXY_AGENT_TOOLS 指向的清单`
    if (status === 401 || /AuthError/i.test(t)) return `HTTP ${status} ${t} -> 密钥问题，不是模型或补丁问题`
    if (status >= 500) return `HTTP ${status} -> 上游故障，稍后重跑`
    return null
  }

  // 1. OpenAI 路由（WorkBuddy / Trae / 多数客户端走这条）
  const o = await post('/v1/chat/completions', { model, max_tokens: 1200, messages: [{ role: 'user', content: Q }], tools: OPENAI_TOOLS, tool_choice: { type: 'function', function: { name: 'run_shell' } } })
  const oBlock = bump(blocked(o.status, o.j))
  if (oBlock) {
    results.push(verdict('OpenAI 路由 带工具', false, oBlock))
  } else if (o.status === 403) {
    results.push(verdict('OpenAI 路由 带工具', false, `403 闸门拒绝 -> 需要补丁 1（清单未无条件附带）`))
  } else {
    const m = o.j?.choices?.[0]?.message || {}
    const n = (m.tool_calls || []).length
    const reasoning = (m.reasoning_content || '').slice(0, 40)
    results.push(verdict('OpenAI 路由 带工具', n > 0,
      n > 0 ? `finish=${o.j.choices[0].finish_reason}，收到 ${n} 个工具调用`
            : o.status !== 200
              ? `HTTP ${o.status}，未拿到可判定的响应体`
              : `HTTP 200 但 tool_calls=0、content 长度 ${(m.content || '').length}，reasoning="${reasoning}" -> 工具调用被 stripToolCalls 吃掉，需要补丁 4`))
  }

  // 2. Anthropic 路由（Claude Desktop / Claude Code 走这条）
  const a = await post('/v1/messages', { model, max_tokens: 1200, messages: [{ role: 'user', content: Q }], tools: ANTHROPIC_TOOLS, tool_choice: { type: 'tool', name: 'run_shell' } },
    { ...H, 'anthropic-version': '2023-06-01' })
  const aBlock = bump(blocked(a.status, a.j))
  if (aBlock) {
    results.push(verdict('Anthropic 路由 带工具', false, aBlock))
  } else if (a.status === 403) {
    results.push(verdict('Anthropic 路由 带工具', false, `403 闸门拒绝 -> 桥接清单为空，需要补丁 3`))
  } else {
    const tu = (a.j?.content || []).filter((b) => b.type === 'tool_use').length
    results.push(verdict('Anthropic 路由 带工具', tu > 0,
      tu > 0 ? `stop=${a.j.stop_reason}，收到 ${tu} 个 tool_use` : `HTTP ${a.status} 但没有 tool_use 块`))
  }

  // 3. 回归：不带工具的普通问答不能被塞进工具调用
  const p = await post('/v1/chat/completions', { model, max_tokens: 300, messages: [{ role: 'user', content: '用一句话介绍北京' }] })
  const leaked = (p.j?.choices?.[0]?.message?.tool_calls || []).length
  const pBlock = bump(blocked(p.status, p.j))
  results.push(verdict('不带工具不漏出调用', p.status === 200 && leaked === 0,
    pBlock || `HTTP ${p.status}，tool_calls=${leaked}，正文 ${(p.j?.choices?.[0]?.message?.content || '').length} 字`))

  const pass = results.every(Boolean)
  const fail = results.filter((r) => !r).length
  console.log(`\n结论：${pass ? '两条路由都正常，不用打补丁。'
    : fail === external ? `${fail} 项失败全部来自额度、地区或上游状态，与补丁无关。等条件恢复后重跑，不要据此改代码或重打补丁。`
    : '有失败项，按上面提示打对应补丁后重跑本脚本。'}`)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.log('自检脚本出错：' + e.message); process.exit(2) })
