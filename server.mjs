// 这是第 0 课的全部代码：一个不依赖任何第三方包的小服务。
// 运行方式：在这个文件夹里打开 PowerShell，敲  node server.mjs
// 然后浏览器打开 http://localhost:3000

import { createServer } from 'node:http'

// 现在数据放在内存里（重启就没了）。第 1 课再换数据库。
let activities = [
  { id: 1, title: '周末图书馆志愿服务', capacity: 2, joined: 0, points: 3 },
  { id: 2, title: '校园文明引导岗', capacity: 3, joined: 0, points: 2 },
]

const PORT = 3000

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const page = `<!doctype html>
<meta charset="utf-8">
<title>活动积分台账 · 第 0 课</title>
<style>
  body{font:15px/1.7 system-ui,"Microsoft YaHei";max-width:720px;margin:40px auto;padding:0 16px;color:#222}
  h1{font-size:20px}
  .card{border:1px solid #e3e3e3;border-radius:10px;padding:14px 16px;margin:12px 0}
  .meta{color:#777;font-size:13px}
  button{padding:6px 14px;border:1px solid #c81e3a;color:#c81e3a;background:#fff;border-radius:6px;cursor:pointer}
  button:disabled{opacity:.4;cursor:not-allowed}
  #msg{margin-top:16px;color:#c81e3a}
</style>
<h1>活动积分台账（第 0 课）</h1>
<p class="meta">这是你亲手跑起来的第一版。名额满了会自动拒绝。</p>
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

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const parts = url.pathname.split('/').filter(Boolean)   // ['api','activities','1','join']

  // 1) 首页
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page, 'text/html; charset=utf-8')

  // 2) 查全部活动
  if (req.method === 'GET' && url.pathname === '/api/activities') return send(res, 200, activities)

  // 3) 报名：这里就是「不超卖」的那段逻辑
  if (req.method === 'POST' && parts.length === 4 && parts[3] === 'join') {
    const act = activities.find(a => a.id === Number(parts[2]))
    if (!act) return send(res, 404, { error: '活动不存在' })
    if (act.joined >= act.capacity) return send(res, 409, { error: '名额已满' })
    act.joined += 1
    return send(res, 200, { ok: true, joined: act.joined })
  }

  send(res, 404, { error: '没有这个地址' })
})

server.listen(PORT, () => {
  console.log(`服务已启动 → 浏览器打开 http://localhost:${PORT}`)
  console.log('停止：在这个窗口按 Ctrl+C')
})