// 冒烟测试：把 server.mjs 拉起来，用真实 HTTP 请求验四条底线。
// 跑法：node tests/smoke.mjs   全过 exit 0，有任何一条挂了 exit 1。
// 不引任何测试框架 —— Node 18+ 自带 fetch 就够了。

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PORT = Number(process.env.TEST_PORT) || 3107
const base = `http://127.0.0.1:${PORT}`

let pass = 0
let fail = 0

function ok(name) {
  pass++
  console.log(`PASS  ${name}`)
}

function bad(name, detail) {
  fail++
  console.log(`FAIL  ${name}`)
  if (detail) console.log(`      ${detail}`)
}

async function waitReady(ms = 8000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/activities`)
      if (r.ok) return true
    } catch {
      // 还没起来，继续等
    }
    await new Promise(r => setTimeout(r, 120))
  }
  return false
}

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
})

const stop = () => {
  try {
    child.kill()
  } catch {
    // 已经退了
  }
}
process.on('exit', stop)
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

if (!(await waitReady())) {
  bad('服务能在 8 秒内启动', `没有在 ${PORT} 上监听到 /api/activities`)
  stop()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(1)
}

// 1) 列表接口的字段是前端依赖的契约，缺一个字段页面就白屏
{
  const r = await fetch(`${base}/api/activities`)
  const list = await r.json()
  const need = ['id', 'title', 'capacity', 'joined', 'points']
  const missing = Array.isArray(list)
    ? [...new Set(list.flatMap(a => need.filter(k => !(k in a))))]
    : need
  if (Array.isArray(list) && list.length > 0 && missing.length === 0) {
    ok(`GET /api/activities 返回 ${list.length} 个活动且字段齐全`)
  } else {
    bad('GET /api/activities 字段齐全', `missing=${JSON.stringify(missing)}`)
  }
}

// 2) 名额用完之后必须拒绝 —— 这条就是「不超卖」
{
  const r = await fetch(`${base}/api/activities/1/join`, { method: 'POST' })
  const first = await r.json()
  if (r.status === 200 && first.ok) ok('第 1 次报名成功（200）')
  else bad('第 1 次报名成功', `status=${r.status} body=${JSON.stringify(first)}`)

  const r2 = await fetch(`${base}/api/activities/1/join`, { method: 'POST' })
  const second = await r2.json()
  if (r2.status === 200 && second.joined === 2) ok('第 2 次报名成功（joined=2）')
  else bad('第 2 次报名成功', `status=${r2.status} body=${JSON.stringify(second)}`)

  const r3 = await fetch(`${base}/api/activities/1/join`, { method: 'POST' })
  const third = await r3.json()
  if (r3.status === 409) ok('第 3 次报名被拒（409 名额已满）')
  else bad('第 3 次报名被拒', `status=${r3.status} body=${JSON.stringify(third)}`)
}

// 3) 不存在的活动要 404，不能 200
{
  const r = await fetch(`${base}/api/activities/999/join`, { method: 'POST' })
  if (r.status === 404) ok('报名不存在的活动返回 404')
  else bad('报名不存在的活动返回 404', `status=${r.status}`)
}

// 4) 乱敲地址不能把服务打挂
{
  const r = await fetch(`${base}/nope`)
  if (r.status === 404) ok('未知路径返回 404（服务仍存活）')
  else bad('未知路径返回 404', `status=${r.status}`)
}

stop()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
