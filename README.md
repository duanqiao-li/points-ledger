# points-ledger · 活动报名与积分台账

一个学生社团 / 志愿组织用的小系统：**发布活动 → 学生报名（名额不超卖）→ 活动完结 → 按规则记积分 → 每一笔积分都能查到来源**。

零依赖，`node server.mjs` 就能跑。

## 为什么做这个

面试官不会问你框架怎么用，他会问这两个：

1. **名额会不会超卖？** 两个人同时点「报名」，最后一个名额只能给一个人。
2. **积分被改了怎么查？** 如果积分只是表里的一个数字，`UPDATE` 一下就查不出来了。

所以我们把「并发扣名额」和「只增不改的积分台账」做成这个仓库的主线，其余一律砍掉。

## 快速开始

需要 Node.js ≥ 18（`node -v` 能出数字就行）。

```bash
git clone <this-repo>
cd points-ledger
node server.mjs
```

打开 <http://localhost:3000>，点两次「我要报名」——第二个名额满了之后按钮会变灰，这就是服务端返回的 `409 名额已满`。

**数据会落盘**：首次运行会在项目根目录生成 `data.json`（已在 `.gitignore` 里）。报完名按 `Ctrl+C` 停掉，再 `node server.mjs` 起来，人数还在。

想换数据文件位置：`DATA_FILE=D:\tmp\my.json node server.mjs`。想重置：删掉 `data.json` 再启动。

### 自测

```bash
node tests/smoke.mjs
```

它会自己拉起一个服务（端口 3107，用独立的临时数据文件），跑 9 条断言：列表字段齐全、前两次报名成功、第三次 409、不存在的活动 404、乱敲地址 404、**杀进程重启后报名记录还在**、重启后名额仍是满的、`data.json` 内容与服务端一致。全过打印 `9 passed, 0 failed` 并 `exit 0`。

### 数据文件长什么样

```json
{
  "activities": [
    { "id": 1, "title": "周末图书馆志愿服务", "capacity": 2, "joined": 2, "points": 3 }
  ]
}
```

写入是**原子**的：先写 `data.json.tmp` 再 `rename` 覆盖，读者不会读到写了一半的 JSON；写失败时服务端回滚内存里的 `joined` 并返回 `500`，不让内存和磁盘对不上。

## 接口

| 方法 | 路径 | 说明 | 失败时 |
|---|---|---|---|
| GET | `/api/activities` | 活动列表（含已报名人数） | — |
| POST | `/api/activities/:id/join` | 报名，服务端原子扣名额 | `409 名额已满` / `404 活动不存在` |

## 数据模型（核心不变量）

积分走**台账**，不走字段：

```
ledger(id, userId, activityId, amount, reason, refId, createdAt)
```

- 当前积分 = 该用户所有 `amount` 之和，**不存在「总分」字段**；
- 扣分不是 `UPDATE`，而是**再插一条负数**，`refId` 指回被冲正的那条；
- 因此任何时刻都能回答「谁、什么时候、因为什么，加/减了多少分」。

## 目录结构

```
points-ledger/
├─ server.mjs          # 服务端 + 内嵌页面（第 0 课就能跑）
├─ public/             # 前端页面（第 5 课开始）
├─ tests/              # 冒烟测试（第 4 课开始）
└─ README.md
```

## 路线图

- [x] 第 0 课：零依赖跑起来（活动列表 + 报名 + 名额已满）
- [x] 第 3 课：数据持久化（`data.json` 原子写，重启后报名记录不丢）
- [ ] 第 4 课：积分台账（只增不改 + 冲正）
- [ ] 第 5 课：前端三页（列表 / 详情 / 我的积分）
- [ ] 第 6 课：README 完善 + CI + 发布 v0.1.0

## 三个人怎么分工

| 角色 | 负责 | 只碰这些文件 |
|---|---|---|
| A · 后端与数据 | 接口、数据表、名额并发、积分台账 | `server.mjs` |
| B · 前端与体验 | 页面、报名按钮状态、台账列表 | `public/` |
| C · 测试与工程 | 验收脚本、回归、README、CI、发布 | `tests/`、`README.md`、`.github/` |

分工不是分家：接口契约由 A 写、B 按契约调用、C 按契约验收。契约改了必须群里说。

## 开发约定

- 只有一条 `main`，任何人都不许直接推，走分支 + PR；
- commit 前缀：`feat:` / `fix:` / `docs:` / `test:` / `chore:`；
- 提交前跑一次 `node tests/smoke.mjs`（有了之后）；
- 不提交真实姓名、学号、手机号、`.env`、证书。

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
