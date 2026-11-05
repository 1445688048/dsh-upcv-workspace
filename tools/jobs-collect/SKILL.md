# jobs-collect · 岗位真实检索薄启动器

> 本文件是 ZCode skill 的 repo 留档副本（正式安装位置 `~/.zcode/skills/jobs-collect/SKILL.md`）。
> 它只负责「触发 → 读规格 → 写收件箱」；任何平台专属的检索逻辑都写在
> `jobs-spec.json` 里，本文件不含、也不该含抓取细节。
> 契约定义见 dsh-upcv-workspace 的 `docs/JOBS-FEED-PLAN.md` 第 3 节，字段名不得自行变更。

## ① 触发

用户输入 `/jobs-collect <关键词>` 触发，参数全部可选：

- 关键词（如 `前端 React`，空格分隔多个），缺省用 spec 的 `defaults.keywords`；
- 城市**不再由指令传入**（0.14.0 起插件界面也不输入城市），一律取 spec 的 `defaults.city`；
- 可选渠道名（如 `只搜实习僧`），缺省跑全部 `enabled` 渠道。

示例：`/jobs-collect 前端`。

## ② 执行步骤

1. 找到本机 DSH 工作台数据目录里的 `jobs-spec.json`
   （macOS：`~/Library/Application Support/dsh-desktop/harness/dsh-upcv-workspace/jobs-spec.json`；
   它的 `feedPath` 字段就是收件箱绝对路径，spec 与 feed 同目录）。读不出 spec 就停下来报错，
   **不要自己编一个路径或默认规格**。
2. 逐个 `enabled: true` 的渠道，把 `entry` 里的 `{keyword}` 替换成参数关键词、`{city}` 替换成
   spec 的 `defaults.city`（两者都要 URL 编码），
   用浏览器打开并提取 `fields` 里列出的字段；**每个渠道单轮不超过 `maxPages` 页**。
3. 把每条岗位按第 ③ 节的 schema 组装成一行 JSON，**追加**写入 `feedPath` 指向的
   `jobs-feed.jsonl`（UTF-8，每行一个 JSON 对象，不要覆盖文件已有内容）。
4. 结束后向用户汇报：每个渠道提取多少条、多少条因缺 `sourceUrl` 被放弃，不夸大数据。

## ③ 输出 schema（jobs-feed.jsonl 每行，字段名逐字一致）

```json
{"collectedAt":"2026-10-20T14:30:00+08:00","source":"shixiseng","sourceUrl":"https://www.shixiseng.com/intern/xxx","title":"前端实习","company":"某某科技","city":"深圳","salary":"250-400元/天","tags":["Vue","React"],"raw":{}}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| collectedAt | 是 | ISO 8601 带时区；确实拿不到时省略（插件会补当前时间并记 warning） |
| source | 是 | 渠道 id，必须取自 spec.channels 里的 `id`，不要自创 |
| sourceUrl | 是 | **缺失即整行不入库**——没有链接的条目一律放弃，绝不编造链接 |
| title / company / city / salary | 是 | 原始字符串，**不做任何归一化预处理**（归一化由插件做） |
| tags / raw | 否 | 数组 / 任意对象透传 |

## ④ 红线（硬约束，不是建议）

**只读不写**：

- 不点「投递 / 申请 / 沟通 / 收藏」等任何会改变求职者状态的按钮；
- 不发消息、不碰会话窗口、不登录新账号、不解风控；
- 只做「打开列表页 → 读取条目 → （必要时）打开职位详情页确认链接」这类读操作。

写盘只允许一个动作：向 `feedPath` 追加行。其余文件一律不碰。
