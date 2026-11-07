// 冒烟测试：把 server.mjs 拉起来，用真实 HTTP 请求验底线。
// 跑法：node tests/smoke.mjs   全过 exit 0，有任何一条挂了 exit 1。
// 不引任何测试框架 —— Node 18+ 自带 fetch 就够了。

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rm } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const PORT = Number(process.env.TEST_PORT) || 3107
const base = `http://127.0.0.1:${PORT}`

// 测试用独立的临时数据文件，绝不碰你自己的 data.json
const DATA = join(here, '.tmp-data.json')

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

// ---------- 起停服务（第 3 课起要能重启验证数据还在） ----------

let child = null

function start() {
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATA_FILE: DATA },
    stdio: 'ignore',
  })
  return child
}

function stop() {
  if (!child) return
  try {
    child.kill()
  } catch {
    // 已经退了
  }
  child = null
}

// 杀掉并等它真的退出，否则端口没释放、下一个服务起不来
async function stopAndWait() {
  const c = child
  if (!c) return
  const exited = new Promise(resolve => c.once('exit', resolve))
  try {
    c.kill()
  } catch {
    // 已经退了
  }
  await Promise.race([exited, new Promise(r => setTimeout(r, 3000))])
  child = null
}

function finish(code) {
  stop()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(code)
}

process.on('exit', stop)
process.on('SIGINT', async () => {
  await stopAndWait()
  process.exit(130)
})

// 上一轮残留的数据文件会让「首次启动写入初始数据」这条判断失真，先删
await rm(DATA, { force: true })
await rm(`${DATA}.tmp`, { force: true })

start()

if (!(await waitReady())) {
  bad('服务能在 8 秒内启动', `没有在 ${PORT} 上监听到 /api/activities`)
  finish(1)
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

// 5) 第 3 课的验收：杀掉进程再起来，报名记录还在
{
  await stopAndWait()
  start()
  if (!(await waitReady())) {
    bad('服务能重启', '重启后 8 秒内没起来')
    finish(1)
  }
  const list = await (await fetch(`${base}/api/activities`)).json()
  const a1 = list.find(a => a.id === 1)
  if (a1 && a1.joined === 2) ok('重启后活动 1 仍有 2 人（data.json 生效）')
  else bad('重启后报名记录还在', `joined=${a1 && a1.joined}`)

  // 满了的状态重启后依然得满：再报一次必须 409
  const r = await fetch(`${base}/api/activities/1/join`, { method: 'POST' })
  if (r.status === 409) ok('重启后活动 1 仍是满的（409）')
  else bad('重启后仍是满的', `status=${r.status}`)
}

// 6) 数据文件真的落到了磁盘上，而且是合法 JSON
{
  const { readFile } = await import('node:fs/promises')
  try {
    const parsed = JSON.parse(await readFile(DATA, 'utf8'))
    if (Array.isArray(parsed.activities) && parsed.activities[0].joined === 2) {
      ok('data.json 内容与服务端状态一致')
    } else {
      bad('data.json 内容一致', JSON.stringify(parsed).slice(0, 120))
    }
  } catch (err) {
    bad('data.json 可读且是合法 JSON', err.message)
  }
}

await stopAndWait()
await rm(DATA, { force: true })
await rm(`${DATA}.tmp`, { force: true })

finish(fail === 0 ? 0 : 1)
