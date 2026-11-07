# 参与贡献

## 一条铁律

任何人都不许直接往 `main` 推。流程永远是：开分支 → 改 → 提交 → PR → 一个人看过 → 合并。

## 分支命名

| 前缀 | 用途 | 例子 |
|---|---|---|
| `feat/` | 加功能 | `feat/ledger-reverse` |
| `fix/` | 修 bug | `fix/duplicate-join-409` |
| `docs/` | 只改文档 | `docs/readme-quickstart` |
| `test/` | 加/改测试 | `test/smoke-api` |

## 提交信息

```
<前缀>: <做了什么>
```

例：`feat: 积分台账支持冲正（插负数，不改原记录）`

写「做了什么」，不写「修改了一些东西」。changelog 从这里生成。

## 改代码前先对齐接口

前端（B）可以先用假数据把页面写完，但**接口字段一旦定了就写进 README 的接口表**，谁改谁在群里说一声。

## 提 PR 之前

```bash
node tests/smoke.mjs   # 有的话必须绿
node server.mjs        # 自己先点一遍
```

PR 描述里写三行：改了什么、为什么、怎么验证的。

## 不要提交

`node_modules/`、`.env`、任何真实姓名/学号/手机号、证书和私钥、`*.log`。
