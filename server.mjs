// 第 3 课：把数据从内存搬到磁盘（data.json），重启不丢。
// 运行：node server.mjs      然后浏览器打开 http://localhost:3000
// 想换数据文件：DATA_FILE=D:\tmp\my.json node server.mjs

import { createServer } from 'node:http'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = process.env.DATA_FILE || join(ROOT, 'data.json')

// 第一次运行时用的初始数据（之后以 data.json 为准）
const SEED = [
  { id: 1, title: '周末图书馆志愿服务', capacity: 2, joined: 0, points: 3 },
  { id: 2, title: '校园文明引导岗', capacity: 3, joined: 0, points: 2 },
]

let activities = SEED
let saveChain = Promise.resolve()   // 写盘排队，避免两次报名同时写坏文件

const PORT = Number(process.env.PORT) || 3000

// ---------- 读写盘 ----------

async function load() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.activities) && parsed.activities.length > 0) {
      activities = parsed.activities
      return
    }
    console.warn(`[data] ${DATA_FILE} 里的 activities 不是非空数组，改用初始数据`)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[data] 读 ${DATA_FILE} 失败，改用初始数据：${err.message}`)
    }
  }
  await save()   // 首次运行：把初始数据落盘，下次启动才有东西可读
}

function save() {
  // 原子写：先写 data.json.tmp，再 rename 覆盖。
  // rename 在同一分区上是原子的 —— 别人要么看到旧文件，要么看到新文件，不会读到写了一半的 JSON。
  const run = saveChain.then(async () => {
    const tmp = `${DATA_FILE}.tmp`
    await writeFile(tmp, JSON.stringify({ activities }, null, 2), 'utf8')
    await rename(tmp, DATA_FILE)
  })
  saveChain = run.catch(() => {})   // 让后续保存不被前一次的失败卡住
  return run
}

// ---------- HTTP ----------

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const page = `<!doctype html>
<meta charset="utf-8">
<title>活动积分台账 · 第 3 课</title>
<style>
  body{font:15px/1.7 system-ui,"Microsoft YaHei";max-width:720px;margin:40px auto;padding:0 16px;color:#222}
  h1{font-size:20px}
  .card{border:1px solid #e3e3e3;border-radius:10px;padding:14px 16px;margin:12px 0}
  .meta{color:#777;font-size:13px}
  button{padding:6px 14px;border:1px solid #c81e3a;color:#c81e3a;background:#fff;border-radius:6px;cursor:pointer}
  button:disabled{opacity:.4;cursor:not-allowed}
  #msg{margin-top:16px;color:#c81e3a}
</style>
<h1>活动积分台账（第 3 课 · 数据已落盘）</h1>
<p class="meta">报完名可以 Ctrl+C 停掉服务，再 <code>node server.mjs</code> 起来 —— 人数还在。</p>
<div id="list"></div>
<div id="msg"></div>
<script>
async function load(){
  const list = await (await fetch('/api/activities')).json()
  document.querySelector('#list').innerHTML = list.map(a => \`
    <div class="card">
      <b>\${a.title}</b>
      <div class="meta">名额 \${a.joined}/\${a.capacity} · \${a.points} 分</div>
      <p><button \${a.joined>=a.capacity?'disabled':''} onclick="join(\${a.id})">
        \${a.joined>=a.capacity?'已满':'我要报名'}</button></p>
    </div>\`).join('')
}
async function join(id){
  const r = await fetch('/api/activities/'+id+'/join',{method:'POST'})
  const d = await r.json()
  document.querySelector('#msg').textContent = d.error ? '失败：'+d.error : '报名成功，当前已报 '+d.joined+' 人'
  load()
}
load()
</script>`

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const parts = url.pathname.split('/').filter(Boolean)   // ['api','activities','1','join']

  // 1) 首页
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8')

  // 2) 查全部活动
  if (req.method === 'GET' && url.pathname === '/api/activities') return send(res, 200, activities)

  // 3) 报名：名额判断 + 落盘，任何一步失败都不算成功
  if (req.method === 'POST' && parts.length === 4 && parts[3] === 'join') {
    const act = activities.find(a => a.id === Number(parts[2]))
    if (!act) return send(res, 404, { error: '活动不存在' })
    if (act.joined >= act.capacity) return send(res, 409, { error: '名额已满' })

    act.joined += 1
    try {
      await save()
    } catch (err) {
      act.joined -= 1   // 写盘失败就回滚，不能让内存和磁盘对不上
      console.error(`[data] 保存失败：${err.message}`)
      return send(res, 500, { error: '保存失败，请稍后重试' })
    }
    return send(res, 200, { ok: true, joined: act.joined })
  }

  send(res, 404, { error: '没有这个地址' })
})

await load()

server.listen(PORT, () => {
  console.log(`服务已启动 → 浏览器打开 http://localhost:${PORT}`)
  console.log(`数据文件：${DATA_FILE}`)
  console.log('停止：在这个窗口按 Ctrl+C')
})
