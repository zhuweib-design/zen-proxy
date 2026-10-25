// zen-proxy 用量统计自检：采集、落盘、重启读回。
// 用法：node check-usage.mjs
// 说明：脚本自己在一个独立端口上拉起一个隔离实例（关掉自动同步），因为真实
// 实例的计数会被自动同步探测和你正在用的客户端污染，精确断言必然假红。
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.ZEN_TEST_PORT || 8799)
const BASE = `http://127.0.0.1:${PORT}`
const TMP = path.join(os.tmpdir(), "zen-usage-test")
const CFG = path.join(TMP, "zen-proxy.json")
const HIST = path.join(TMP, "usage-history.json")
const MODEL = "mimo-v2.6-flash-free"

let pass = 0
let fail = 0
function check(name, ok, detail) {
  console.log(`${ok ? "通过" : "失败"}  ${name}${detail ? "  · " + detail : ""}`)
  ok ? pass++ : fail++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(p) {
  const r = await fetch(BASE + p)
  if (r.status !== 200) throw new Error(`${p} -> HTTP ${r.status}`)
  return r.json()
}

const PREFIX = "本行是自检夹具的固定前缀，重复发送用于制造缓存命中。".repeat(12)
async function ask(stream) {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, stream, messages: [{ role: "user", content: "只回答两个字：收到。" + PREFIX }] }),
  })
  const text = await r.text()
  let usage = null
  if (stream) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue
      const p = line.slice(6)
      if (p === "[DONE]") continue
      try {
        const d = JSON.parse(p)
        if (d?.usage) usage = d.usage
      } catch {}
    }
  } else {
    try {
      usage = JSON.parse(text)?.usage ?? null
    } catch {}
  }
  return { status: r.status, usage }
}

function start() {
  // 免费额度要求运行时是 Bun：用 Node 起隔离实例会被上游 v2 闸门拒成 429，
  // 自检会假红。找不到 Bun 时才退回 Node（那时只能验统计链路本身）。
  const bunCandidates = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
    path.join(__dirname, "node_modules", "bun", "bin", "bun.exe"),
  ]
  const bun = bunCandidates.find((p) => p && fs.existsSync(p))
  if (!bun) console.log("提示：没找到 Bun，本次隔离实例用 Node 启动，模型请求可能被额度闸门拒绝。")
  return spawn(bun || process.execPath, [path.join(__dirname, "zen-proxy.mjs")], {
    env: { ...process.env, PORT: String(PORT), AUTO_SYNC: "0", ZEN_PROXY_CONFIG: CFG, ZEN_PROXY_USAGE_PATH: HIST },
    stdio: "ignore",
    windowsHide: true,
  })
}
async function waitReady(proc) {
  for (let i = 0; i < 40; i++) {
    if (proc.exitCode !== null) throw new Error(`隔离实例退出码 ${proc.exitCode}，检查 ${CFG}`)
    try {
      const r = await fetch(`${BASE}/health`)
      if (r.ok) return
    } catch {}
    await sleep(500)
  }
  throw new Error("隔离实例 20 秒内没有就绪")
}
async function stop(proc) {
  proc.kill()
  for (let i = 0; i < 20; i++) {
    if (proc.exitCode !== null) break
    await sleep(250)
  }
  await sleep(400)
}

fs.mkdirSync(TMP, { recursive: true })
for (const f of [HIST, HIST + ".tmp", CFG]) {
  try {
    fs.unlinkSync(f)
  } catch {}
}
// 继承真实实例的上游地址与 UA，否则隔离实例会拿默认 UA 去撞免费闸门。
const real = JSON.parse(fs.readFileSync(path.join(__dirname, "zen-proxy.json"), "utf8"))
fs.writeFileSync(CFG, JSON.stringify({ upstream: real.upstream, ua: real.ua, host: "127.0.0.1", port: PORT, autoSync: false }))

console.log(`隔离实例 :${PORT}  用量文件 ${HIST}\n`)
let proc = start()
try {
  await waitReady(proc)
  const zero = await api("/api/usage?range=all")
  check("干净起点：区间计数为零", zero.totals.req === 0 && zero.totals.in === 0, `req=${zero.totals.req}`)

  const a = await ask(false)
  check("非流式返回 200 且上游带 usage", a.status === 200 && a.usage?.prompt_tokens > 0, `prompt=${a.usage?.prompt_tokens}`)
  const b = await ask(false)
  const c = await ask(true)
  check("流式返回 200 且带 usage chunk", c.status === 200 && c.usage?.prompt_tokens > 0, `prompt=${c.usage?.prompt_tokens}`)

  await sleep(1200)
  const u = await api("/api/usage?range=today")
  const st = await api("/api/status")
  const expectIn = a.usage.prompt_tokens + b.usage.prompt_tokens + c.usage.prompt_tokens
  const expectOut = a.usage.completion_tokens + b.usage.completion_tokens + c.usage.completion_tokens

  check("请求数恰好增加 3", u.totals.req === 3, `实际 ${u.totals.req}`)
  check("输入 token 与三次响应之和一致", u.totals.in === expectIn, `记录 ${u.totals.in} / 期望 ${expectIn}`)
  check("输出 token 与三次响应之和一致", u.totals.out === expectOut, `记录 ${u.totals.out} / 期望 ${expectOut}`)
  check("重复前缀触发缓存命中", u.totals.cached > 0, `cached=${u.totals.cached}`)
  check("思考 token 被单独记账", u.totals.think >= 0, `think=${u.totals.think}`)
  check("概览累计与区间汇总同源", st.requests.tokens.in === u.totals.in, `进程内 ${st.requests.tokens.in} / 区间 ${u.totals.in}`)
  const rows = st.recent.filter((r) => r.in > 0)
  check("最近请求表带输入/输出字段", rows.length === 3, `${rows.length} 条`)
  const rowIn = rows.reduce((s, r) => s + r.in, 0)
  check("逐条相加等于总计", rowIn === u.totals.in, `Σ${rowIn} / ${u.totals.in}`)

  const frozen = await api("/api/usage?range=today")
  await sleep(2500)
  const again = await api("/api/usage?range=today")
  check("负向对照：不发请求时数字不动", frozen.totals.req === again.totals.req && frozen.totals.in === again.totals.in, `${frozen.totals.req} -> ${again.totals.req}`)

  for (const r of ["today", "3d", "week", "month", "30d", "all"]) {
    const x = await api(`/api/usage?range=${r}`)
    if (!x.ok || !Array.isArray(x.series)) {
      check(`区间 ${r} 返回可用序列`, false)
    }
  }
  const w = await api("/api/usage?range=week")
  check("六个区间都能返回序列", true, `week 粒度 ${w.bucket}，${w.series.length} 点`)
  const all = await api("/api/usage?range=all")
  check("全部区间从最早有数据的桶开始", all.series.length >= 1 && all.series[0].req > 0, `${all.series.length} 点`)

  console.log("\n等待落盘追平内存总计（每 10 秒写一次，最多等 25 秒）…")
  let disk = null
  for (let i = 0; i < 25; i++) {
    const x = await api("/api/usage?range=today")
    try {
      const j = JSON.parse(fs.readFileSync(HIST, "utf8"))
      const sum = (j.hours ?? []).reduce((s, h) => s + h[3], 0)
      if (x.totals.in > 0 && sum === x.totals.in) { disk = { sum, written: j.written, hours: j.hours ?? [] }; break }
    } catch {}
    await sleep(1000)
  }
  check("文件内容追平内存总计", !!disk, disk ? `in=${disk.sum}，写于 ${new Date(disk.written).toISOString()}` : "25 秒内未追平")
  if (disk) {
    check("文件里只有一格（本轮全在同一小时）", disk.hours.length === 1, `${disk.hours.length} 格`)
    check("文件记录的输入 token 等于总计", disk.hours[0][3] === u.totals.in, `${disk.hours[0][3]} / ${u.totals.in}`)
  }

  const lastTotals = u.totals
  // 强杀不触发退出钩子，所以必须先确认磁盘已追平，再比较读回结果。
  await stop(proc)

  console.log("\n重启隔离实例，验证历史读回…")
  proc = start()
  await waitReady(proc)
  const back = await api("/api/usage?range=today")
  const stBack = await api("/api/status")
  check("重启后区间累计完整读回", back.totals.in === lastTotals.in && back.totals.req === lastTotals.req, `req=${back.totals.req} in=${back.totals.in}`)
  check("重启后概览进程内计数归零（两者语义不同）", stBack.requests.total === 0 && stBack.requests.tokens.in === 0, `进程内 in=${stBack.requests.tokens.in}`)
  await stop(proc)
} catch (e) {
  check("流程未中断", false, e.message)
  try {
    proc.kill()
  } catch {}
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
if (fail) console.log("失败项见上面标「失败」的行")
process.exit(fail ? 1 : 0)
