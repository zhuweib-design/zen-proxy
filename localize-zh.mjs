// zen-proxy 面板中文化脚本
// 用法：node localize-zh.mjs          （对 public/index.html 就地翻译，自动备份）
//       node localize-zh.mjs --check  （只检查有多少条没匹配上，不改文件）
// 设计成可重复执行：上游更新后重跑一次即可恢复中文。已是中文的条目会跳过。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(__dirname, 'public', 'index.html')
const BAK = path.join(__dirname, 'public', 'index.html.en.bak')
const CHECK = process.argv.includes('--check')

// [原文, 中文, 期望出现次数]
const R = [
  // ---- 锁屏 ----
  ['<h2>Locked 🔒</h2>', '<h2>已上锁 🔒</h2>', 1],
  ['<p>This dashboard is protected. Enter the admin key (<code>PROXY_KEY</code>) to get in.</p>',
   '<p>本面板已开启访问保护。输入管理员密钥（<code>PROXY_KEY</code>）进入。</p>', 1],
  ['placeholder="admin key"', 'placeholder="管理员密钥"', 1],
  ['onclick="submitAuth()">Unlock</button>', 'onclick="submitAuth()">解锁</button>', 1],
  ['toast("Unlocked")', 'toast("已解锁")', 1],
  ['toast("Wrong key", "bad")', 'toast("密钥错误", "bad")', 1],

  // ---- 顶栏与导航 ----
  ['<button data-tab="overview" class="active">Overview</button>', '<button data-tab="overview" class="active">概览</button>', 1],
  ['<button data-tab="models">Models</button>', '<button data-tab="models">模型</button>', 1],
  ['<button data-tab="config">Settings</button>', '<button data-tab="config">设置</button>', 1],
  ['<button data-tab="logs">Logs</button>', '<button data-tab="logs">日志</button>', 1],
  ['<span id="upstreamText">checking…</span>', '<span id="upstreamText">检测中…</span>', 1],
  ['st.upstreamOk ? "upstream OK" : "upstream DOWN"', 'st.upstreamOk ? "上游正常" : "上游不可用"', 1],
  ['$("upstreamText").textContent = "unreachable"', '$("upstreamText").textContent = "连不上代理"', 1],

  // ---- 跑马灯 ----
  ['<span>anonymous free tier</span>', '<span>匿名免费额度</span>', 2],
  ['<span>no accounts</span>', '<span>无需账号</span>', 2],
  ['<span>no keys</span>', '<span>无需密钥</span>', 2],
  ['<span>openai + anthropic compatible</span>', '<span>OpenAI + Anthropic 兼容</span>', 2],
  ['<span>100% local</span>', '<span>100% 本地运行</span>', 2],

  // ---- 概览卡片 ----
  ['<div class="label">Requests served</div>', '<div class="label">已处理请求</div>', 1],
  ['<div class="label">Upstream</div>', '<div class="label">上游</div>', 1],
  ['<div class="label">Uptime</div>', '<div class="label">运行时长</div>', 1],
  ['<div class="label">Last minute</div>', '<div class="label">最近一分钟</div>', 1],
  ['<div class="label">Models</div>', '<div class="label">模型</div>', 1],
  ['st.requests.errors + " errors"', 'st.requests.errors + " 个错误"', 1],
  ['st.requests.last5m + " in 5 min"', 'st.requests.last5m + " · 5 分钟内"', 1],
  ['st.models.allowed + " allowed"', 'st.models.allowed + " 个可用"', 1],
  ['"latest opencode: " + st.uaAutoVersion', '"最新 opencode 版本: " + st.uaAutoVersion', 1],

  // ---- 最近请求表 ----
  ['<span class="hh">Recent requests</span>', '<span class="hh">最近请求</span>', 1],
  ['<span class="sticker grape" style="transform:none">live feed</span>', '<span class="sticker grape" style="transform:none">实时</span>', 1],
  // 表头那一条英文锚点已删：加"输入/输出"两列时整行被重写，英文原文在本文件里
  // 已不存在，留着只会让 --check 常年报一条假红。现在的中文表头直接维护。
  ['no requests yet — go make some noise.', '还没有请求记录。', 2],
  ['onclick="pageTable(-1)" ${tablePage <= 1 ? "disabled" : ""}>‹ prev</button>',
   'onclick="pageTable(-1)" ${tablePage <= 1 ? "disabled" : ""}>‹ 上一页</button>', 1],
  ['<span class="pager-info">page ${tablePage} / ${pages} · ${rows.length} entries</span>',
   '<span class="pager-info">第 ${tablePage} / ${pages} 页 · 共 ${rows.length} 条</span>', 1],
  ['onclick="pageTable(1)" ${tablePage >= pages ? "disabled" : ""}>next ›</button>',
   'onclick="pageTable(1)" ${tablePage >= pages ? "disabled" : ""}>下一页 ›</button>', 1],

  // ---- 模型页 ----
  ['<span class="hh">Allowed models</span>', '<span class="hh">可用模型</span>', 1],
  ['<p class="hint" style="margin-bottom:16px">These are served on <code>/v1/models</code> and accepted by the proxy. Hit <b>TEST</b> to send a tiny completion and see live status. The default model is used when a request asks for an unknown one. Auto-sync probes every upstream free model and prunes the dead ones automatically.</p>',
   '<p class="hint" style="margin-bottom:16px">这里列出 <code>/v1/models</code> 实际提供、且代理接受的模型。点 <b>测试</b> 会发一个极小的请求看实时状态。请求里写了未知模型时，会用默认模型兜底。自动同步会逐个探测上游免费模型，并自动剔除已下线的。</p>', 1],
  ['<span class="badge mut" id="syncStatus">auto-sync: …</span>', '<span class="badge mut" id="syncStatus">自动同步: …</span>', 1],
  ['<button id="syncBtn" style="margin-left:auto" onclick="syncNow()">⟳ Sync now</button>',
   '<button id="syncBtn" style="margin-left:auto" onclick="syncNow()">⟳ 立即同步</button>', 1],
  ['btn.textContent = "syncing…"', 'btn.textContent = "同步中…"', 1],
  ['btn.textContent = "⟳ Sync now"', 'btn.textContent = "⟳ 立即同步"', 1],
  ['<th>Model</th><th>Default</th><th>Last test</th><th></th>',
   '<th>模型</th><th>默认</th><th>最近测试</th><th></th>', 1],
  ['no models available right now.', '当前没有可用模型。', 1],
  ['placeholder="add a model id, e.g. nemotron-3-ultra-free"', 'placeholder="输入模型 ID 添加，例如 nemotron-3-ultra-free"', 1],
  ['<button onclick="addModel()">+ Add</button>', '<button onclick="addModel()">+ 添加</button>', 1],
  ["toast(\"Added \" + m)", 'toast("已添加 " + m)', 1],
  ["toast(\"Removed \" + m)", 'toast("已移除 " + m)', 1],
  ['list.length + " available" + (unconfigured.length ? ` · ${unconfigured.length} not in fallback` : "")',
   'list.length + " 个可用" + (unconfigured.length ? ` · ${unconfigured.length} 个未加入回退` : "")', 1],
  ['>not in fallback</span>', '>未加入回退</span>', 1],
  ["onclick='testModel(${jsStr(m)})'>Test</button>", "onclick='testModel(${jsStr(m)})'>测试</button>", 1],
  ['toast("Default model: " + m)', 'toast("默认模型已设为 " + m)', 1],
  ['cell.textContent = "testing…"', 'cell.textContent = "检测中…"', 1],
  ['cell.textContent = "error"', 'cell.textContent = "出错"', 1],
  ['>◦ gate-blocked</span> <span class="hint">the free-tier gate refused an agent-shaped probe</span>',
   '>◦ 被闸门拦下</span> <span class="hint">免费闸门拒绝了智能体形态的探测请求</span>', 1],
  ['toast(m + " is gate-blocked — the free tier refused an agent-shaped probe", "bad")',
   'toast(m + " 被闸门拦下：免费额度拒绝了智能体形态的探测", "bad")', 1],
  ['toast(r.ok ? m + " works" : m + " failed (" + r.status + ")", r.ok ? "ok" : "bad")',
   'toast(r.ok ? m + " 可用" : m + " 失败 (" + r.status + ")", r.ok ? "ok" : "bad")', 1],

  // ---- 状态标签与提示气泡 ----
  ['label: "ok (live traffic)", title: "live traffic"', 'label: "正常（真实流量）", title: "真实流量验证过"', 1],
  ['{ cls: "mut", label: "untested", tip: TIP.untested }', '{ cls: "mut", label: "未检测", tip: TIP.untested }', 2],
  ['{ cls: "ok", label: "ok", tip: TIP.ok }', '{ cls: "ok", label: "正常", tip: TIP.ok }', 1],
  ['{ cls: "warn", label: "rate-limited", tip: TIP.limited }', '{ cls: "warn", label: "限流 429", tip: TIP.limited }', 1],
  ['{ cls: "warn", label: "gate-blocked", tip: TIP.gated }', '{ cls: "warn", label: "被闸门拦", tip: TIP.gated }', 1],
  ['{ cls: "warn", label: "flaky", tip: TIP.flaky }', '{ cls: "warn", label: "不稳定", tip: TIP.flaky }', 1],
  ['{ cls: "bad", label: "dead", tip: TIP.dead }', '{ cls: "bad", label: "已下线", tip: TIP.dead }', 1],
  ['live: "A real request through this proxy just succeeded.",', 'live: "刚刚有真实请求经过这个代理并成功。",', 1],
  ['ok: "Health probe got a clean 200 upstream.",', 'ok: "健康探测从上游拿到干净的 200。",', 1],
  ['gated: "The free-tier gate refused even an agent-shaped probe (tools + stream). Real requests will likely fail until the block lifts.",',
   'gated: "免费闸门连智能体形态的探测（带工具 + 流式）都拒绝。在拦截解除前，真实请求大概率也会失败。",', 1],
  ['flaky: "Temporary trouble — timeout or 5xx. Kept, it recovers.",', 'flaky: "暂时性问题：超时或 5xx。保留在列表里，会自行恢复。",', 1],
  ['limited: "Upstream returned 429. Quota refills.",', 'limited: "上游返回 429，额度会自行补充回来。",', 1],
  ['dead: "Upstream says it\'s gone (404). Only state that removes it.",', 'dead: "上游说该模型已不存在（404）。只有这个状态会把它移出列表。",', 1],
  ['untested: "No health check yet. Hit “Sync now”.",' , 'untested: "还没做过健康检查。点“立即同步”。",', 1],
  ['responses: "Served on /v1/responses. Proxy translates it.",', 'responses: "走 /v1/responses 协议，由代理做转换。",', 1],
  ['notconfigured: "Upstream has it, your list doesn\'t.",', 'notconfigured: "上游有这个模型，但你的列表里没配。",', 1],
  ['syncing: "Probing every free model right now.",', 'syncing: "正在逐个探测所有免费模型。",', 1],
  ['syncnever: "Auto-sync has not run yet.",', 'syncnever: "自动同步还没跑过。",', 1],
  ['syncdone: "Last health check. Models are probed exactly the way real agent traffic hits them.",',
   'syncdone: "最近一次健康检查。探测方式与真实智能体请求完全一致。",', 1],
  ['el.setAttribute("data-tip-title", "auto-sync")', 'el.setAttribute("data-tip-title", "自动同步")', 1],
  ['el.textContent = "auto-sync: probing…"', 'el.textContent = "自动同步: 探测中…"', 1],
  ['el.textContent = "auto-sync: never"', 'el.textContent = "自动同步: 从未运行"', 1],
  ['const ago = fmtUp(Math.max(1, Math.floor((Date.now() - s.at) / 1000))) + " ago"',
   'const ago = fmtUp(Math.max(1, Math.floor((Date.now() - s.at) / 1000))) + "前"', 1],
  ['el.textContent = `auto-sync: ${ago} · ${s.working.length} ok · ${s.rateLimited.length} rate-limited · ${(s.gated||[]).length} gate-blocked · ${s.flaky.length} flaky · ${s.dead.length} dead`',
   'el.textContent = `自动同步: ${ago} · 正常 ${s.working.length} · 限流 ${s.rateLimited.length} · 被拦 ${(s.gated||[]).length} · 不稳定 ${s.flaky.length} · 已下线 ${s.dead.length}`', 1],
  ['toast(r.ok ? "Models synced" : "Sync failed: " + (r.error || ""), r.ok ? "ok" : "bad")',
   'toast(r.ok ? "模型同步完成" : "同步失败: " + (r.error || ""), r.ok ? "ok" : "bad")', 1],
  ['catch { toast("Sync failed", "bad") }', 'catch { toast("同步失败", "bad") }', 1],

  // ---- 设置页 ----
  ['<span class="hh">Server settings</span>', '<span class="hh">服务端设置</span>', 1],
  ['<span class="sticker coral" style="transform:none">port / host need restart</span>',
   '<span class="sticker coral" style="transform:none">改端口/Host 需重启</span>', 1],
  ['<label>Host</label>', '<label>监听地址 Host</label>', 1],
  ['<label>Port</label>', '<label>端口 Port</label>', 1],
  ['<label>Upstream url</label>', '<label>上游地址</label>', 1],
  ['<label>User-agent (the unlock)</label>', '<label>User-Agent（解锁的关键）</label>', 1],
  ['<label>Default model <span class="hint">(empty = auto-pick healthy free model)</span></label>',
   '<label>默认模型 <span class="hint">（留空 = 自动挑一个健康的免费模型）</span></label>', 1],
  ['<label>Proxy key (empty = open)</label>', '<label>面板访问密钥 Proxy key（留空 = 不鉴权）</label>', 1],
  ['<label>Zen key (byok, optional)</label>', '<label>Zen key（自带密钥，可选）</label>', 1],
  ['>Test key</button>', '>测试密钥</button>', 1],
  ['<label>Timeout (ms)</label>', '<label>超时（毫秒）</label>', 1],
  ['<label>Fallback models (json array — tried in order on 429/5xx)</label>',
   '<label>回退模型（JSON 数组，遇到 429/5xx 时按顺序尝试）</label>', 1],
  ['<label>Model aliases (json map — e.g. {"gpt-4o":"space-bunny-free"})</label>',
   '<label>模型别名（JSON 映射，例如 {"gpt-4o":"space-bunny-free"}）</label>', 1],
  ['<span>Trust <code>x-forwarded-for</code> from a reverse proxy</span>',
   '<span>信任反向代理传来的 <code>x-forwarded-for</code></span>', 1],
  ['<span>Auto-sync models (probe upstream free models, prune dead ones)</span>',
   '<span>自动同步模型（探测上游免费模型，剔除已下线的）</span>', 1],
  ['<label>Auto-sync interval (ms)</label>', '<label>自动同步间隔（毫秒）</label>', 1],
  ['<label>Health-probe credentials</label>', '<label>健康探测使用的凭据</label>', 1],
  ['<option value="auto">Auto — use my Zen key if set, else anonymous</option>',
   '<option value="auto">自动 — 设了 Zen key 就用它，否则匿名</option>', 1],
  ['<option value="anonymous">Always anonymous (public free tier)</option>',
   '<option value="anonymous">始终匿名（公共免费额度）</option>', 1],
  ['<option value="key">Always my Zen key (tests my own quota)</option>',
   '<option value="key">始终用我的 Zen key（测的是我自己的额度）</option>', 1],
  ['<span>Auto-track opencode releases &amp; update the User-Agent</span>',
   '<span>自动跟随 opencode 新版本并更新 User-Agent</span>', 1],
  ['<label>User-agent refresh interval (ms)</label>', '<label>User-Agent 刷新间隔（毫秒）</label>', 1],
  ['<span>Inject <code>x-opencode-session</code> header per client (free tier needs it)</span>',
   '<span>为每个客户端注入 <code>x-opencode-session</code> 头（免费额度需要）</span>', 1],
  ['<span>Rate-limit chat requests per client (0 = off)</span>',
   '<span>按客户端限流对话请求（0 = 关闭）</span>', 1],
  ['<label>Requests / window</label>', '<label>每窗口请求数</label>', 1],
  ['<label>Window (ms)</label>', '<label>窗口时长（毫秒）</label>', 1],
  ['<label>Responses-API models (json array — patterns may end in *)</label>',
   '<label>Responses API 模型（JSON 数组，模式可用 * 结尾）</label>', 1],
  ['<button class="primary" onclick="saveConfig()">Save &amp; apply</button>',
   '<button class="primary" onclick="saveConfig()">保存并应用</button>', 1],
  ['<button onclick="reloadConfig()">Discard / reload</button>', '<button onclick="reloadConfig()">放弃并重载</button>', 1],
  ['<button onclick="restoreModels()" title="Re-add any model the proxy is missing (keeps your keys)">Restore model list</button>',
   '<button onclick="restoreModels()" title="把代理缺失的模型重新加回来（保留你的密钥）">恢复模型列表</button>', 1],
  ['$("cfgDefault").placeholder = "(auto)"', '$("cfgDefault").placeholder = "（自动）"', 1],
  ['eff ? "auto → " + st.effectiveDefault : "(auto)"', 'eff ? "自动 → " + st.effectiveDefault : "（自动）"', 1],
  ['auth.mode === "proxy+byok" ? "proxy key + your zen key"', 'auth.mode === "proxy+byok" ? "面板密钥 + 我的 Zen key"', 1],
  ['auth.mode === "byok" ? "your zen key"', 'auth.mode === "byok" ? "我的 Zen key"', 1],
  ['auth.mode === "proxy" ? "proxy key"', 'auth.mode === "proxy" ? "面板密钥"', 1],
  [': "anonymous public"', ': "匿名公共额度"', 1],
  ['$("cfgAuth").textContent = "auth: "', '$("cfgAuth").textContent = "鉴权方式: "', 1],
  ['toast("Saved & applied")', 'toast("已保存并应用")', 1],
  ['toast("Invalid JSON — responses models", "bad")', 'toast("JSON 格式有误：Responses 模型", "bad")', 1],
  ['toast("Invalid JSON — check config", "bad")', 'toast("JSON 格式有误，请检查配置", "bad")', 1],
  ['toast("Model list restored (" + config.fallbackModels.length + " models) — syncing now")',
   'toast("模型列表已恢复（" + config.fallbackModels.length + " 个）— 正在同步")', 1],
  ['catch { toast("Restore failed", "bad") }', 'catch { toast("恢复失败", "bad") }', 1],
  ['toast("Reloaded from file")', 'toast("已从文件重新载入")', 1],
  ['hint.textContent = "testing…"', 'hint.textContent = "检测中…"', 1],
  ['hint.textContent = "test failed"; toast("Test failed", "bad")', 'hint.textContent = "检测失败"; toast("测试失败", "bad")', 1],
  ['◦ gate refused an agent-shaped probe', '◦ 闸门拒绝了智能体形态的探测', 1],
  ['toast("The free-tier gate refused an agent-shaped probe", "bad")', 'toast("免费闸门拒绝了智能体形态的探测", "bad")', 1],
  ['toast(r.ok ? "Key works: " + r.model : "Key rejected (" + r.status + ")", r.ok ? "ok" : "bad")',
   'toast(r.ok ? "密钥可用: " + r.model : "密钥被拒 (" + r.status + ")", r.ok ? "ok" : "bad")', 1],

  // ---- 日志页 ----
  ['<span class="hh">Server logs</span>', '<span class="hh">服务端日志</span>', 1],
  ['onclick="loadLogs()">Refresh</button>', 'onclick="loadLogs()">刷新</button>', 1],
  ['<div class="empty">Loading…</div>', '<div class="empty">加载中…</div>', 1],
  ["'<div class=\"empty\">No logs</div>'", "'<div class=\"empty\">暂无日志</div>'", 1],

  // ---- 补漏：扫描出来的残留 ----
  ['<title>Zen Proxy — the free-tier hype machine</title>', '<title>Zen Proxy — 免费额度中转面板</title>', 1],
  ['alt="zen-proxy logo"', 'alt="zen-proxy 图标"', 2],
  ['<div class="sub">seconds online</div>', '<div class="sub">本次启动至今</div>', 1],
  ['<div class="sub" id="ovErr">0 errors</div>', '<div class="sub" id="ovErr">0 个错误</div>', 1],
  ['<div class="sub" id="ov5m">– in 5 min</div>', '<div class="sub" id="ov5m">– 近 5 分钟</div>', 1],
  ['<div class="sub" id="ovAllowed">– allowed</div>', '<div class="sub" id="ovAllowed">– 个可用</div>', 1],
  ["<button onclick='addModel(${jsStr(m)})'>+ add</button>", "<button onclick='addModel(${jsStr(m)})'>+ 加入</button>", 1],
  [`'<span style="color:var(--ink)">✓ works (' + r.model + ")</span>"`,
   `'<span style="color:var(--ink)">✓ 可用（' + r.model + "）</span>"`, 1],

  // ---- 中文排版适配：表头是两字中文，被窄列挤成竖排 ---
  ['th { font-family:var(--mono); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:var(--muted) }',
   'th { font-family:var(--mono); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); white-space:nowrap }', 1],
]

const original = fs.readFileSync(FILE, 'utf8')
let html = original
const missing = []
const already = []
let applied = 0

for (const [from, to, want] of R) {
  const n = html.split(from).length - 1
  if (n === 0) {
    if (html.includes(to)) already.push(from.slice(0, 50))
    else missing.push(`[${want} 次未匹配] ${from.slice(0, 90)}`)
    continue
  }
  if (n !== want) missing.push(`[次数不符：找到 ${n}，期望 ${want}] ${from.slice(0, 70)}`)
  if (CHECK) continue
  html = html.split(from).join(to)
  applied += n
}

console.log(`替换条目 ${R.length} 条，实际改动 ${applied} 处`)
if (already.length) console.log(`已是中文，跳过 ${already.length} 条`)
if (missing.length) { console.log('未匹配，需要人工确认:'); missing.forEach((m) => console.log('  - ' + m)) }

if (!CHECK && applied > 0) {
  if (!fs.existsSync(BAK)) { fs.writeFileSync(BAK, original, 'utf8'); console.log('已备份原文到 public/index.html.en.bak') }
  fs.writeFileSync(FILE, html, 'utf8')
  // 翻译只动文案，语法必须原样。写完立刻验一次，不过就退回改之前那版。
  const tmp = path.join(__dirname, '.ui-syntax-check.mjs')
  fs.writeFileSync(tmp, [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'), 'utf8')
  let bad = null
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' })
  } catch (e) {
    bad = String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')
  } finally {
    fs.unlinkSync(tmp)
  }
  if (bad) {
    fs.writeFileSync(FILE, original, 'utf8')
    console.log('内联脚本语法检查未通过，已退回原文，本次改动没有生效:\n' + bad)
    process.exit(2)
  }
  console.log('已写入 public/index.html，内联脚本语法检查通过')
}
process.exit(missing.length ? 1 : 0)
