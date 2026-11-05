# DSH LLM 接入说明（已确认）

> 结论来源：本机可用的 DSH 插件 `dsh-novel-workbench`（`server/llm.js`、`dsh/index.js`）
> 的真实调用代码，以及本仓库 `tests/llm.test.mjs` 的实测。
>
> 上一版文档里的「ctx.llm / ctx.agent / ctx.api.llm 待确认」已作废。

---

## 1. 入口

```js
// 不要写 ctx.llm —— 宿主把模型服务注册在根上下文，用 get 取
const llm = ctx.get('llm');
```

- 用 `ctx.get('llm')` 是**有意不写进 inject**：宿主没有模型时插件照常加载，
  AI 路由降级（回退本地题库 / 返回 `ai-unavailable`），而不是整个插件起不来。
- `ctx.get` 必须包 try/catch —— 旧宿主上可能抛错。见 `dsh/index.js` 的 `safeGet`。

## 2. 能力探测

```js
const available = typeof llm?.stream === 'function';   // 唯一的可用性判据
await llm.listProviders();        // [{ id }] 或 { providers: [...] }
await llm.listModels(providerId); // [{ id }] 或 { models: [...] }
```

两个 list 方法都返回 Promise，且**挂在原型上**（Typert 远程方法）。
如果你需要包装 llm（例如注入 AbortSignal），必须显式透传原型链上的函数，
否则 `resolveRoute` 会退化成 `ai-no-provider`。

## 3. 生成：只有 stream，没有 generate

```js
const iterator = llm.stream({
  provider, model,
  messages: [{ role: 'user', content: [{ type: 'text', text: '...' }] }],
  temperature, maxTokens,        // 可选，宿主不认就静默忽略
  signal,                        // 可选，用于取消
})[Symbol.asyncIterator]();

// 分片形状（kind 与 type 两种字段名都要认，值还有 text / reasoning 变体）：
//   { kind: 'text-delta',      text }   -> 正文
//   { kind: 'reasoning-delta', text }   -> 思考过程（不能混进正文）
//   { kind: 'finish', reason: { kind: 'stop' | 'max-tokens' | 'length' | 'error', failure? } }
//   { kind: 'usage', ... }              -> token 统计，可有可无
//   { kind: 'error' | 'aborted', ... }
```

**没有 `.generate()` / `.chat()`。** 所有文本都要自己聚合分片。

## 4. 本仓库的实现分层

| 层 | 文件 | 职责 |
|----|------|------|
| 传输层 | `server/llm.js` | provider/model 解析、分片聚合、超时与看门狗、JSON 解析容错、带反馈重试、错误码 |
| 业务层 | `server/ai.js` | 组装 messages、归一模型输出、硬校验（不合格就当失败重试） |
| 路由层 | `server/api.js` | exact `/api` 路由、HTTP 状态码映射 |
| 围栏 | `server/fence.js` | loopback + 自定义头 + content-type 三道校验 |
| 客户端 | `client/src/*.js` → `lib/client.js` | fetch 调路由、Web Speech、无模型时的降级提示 |
| 存储 | `server/store.js` | 每个集合一个 JSON 文件，原子写，集合名白名单 |

### 为什么必须有超时

宿主侧没有超时保证。一次卡住的流会把整条链路挂死，所以 `src/lib/llm.js` 同时设了：

- **整体超时**（按节点分档，`NODE_PROFILES`，60s–180s）；
- **分片间隙超时**（`STREAM_IDLE_TIMEOUT_MS`，60s 没有新分片即判挂起）——
  只在分片到达时检查 deadline 是不够的，首个分片之前的挂起会永久阻塞。

### 为什么重试要带错误反馈

解析失败时把「【上次输出错误，必须修正】+ 原因」追加进最后一条 user 消息再试
（`withRetryFeedback`），而不是原样重发同样的 messages。
输出被 `maxTokens` 截断（`finish.reason.kind` 为 `max-tokens` / `length`）或空回包时，
重试前把输出预算翻倍（`escalateMaxTokens`，上限 65536）。

## 5. 已实现的 /api 路由

exact 路由（宿主路由表不支持 `:param`），全部挂在 `webServer` 上：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/dsh-upcv-workspace/meta` | 模型可用性、provider/model、题库数、版本号 |
| GET  | `/api/dsh-upcv-workspace/banks` | 内置题库清单（无模型时的兜底来源） |
| POST | `/api/dsh-upcv-workspace/interview/questions` | 生成面试题（无模型时**自动回退**本地题库并标 `source: local-bank`） |
| POST | `/api/dsh-upcv-workspace/interview/report` | 按问答生成结构化评分报告 |
| POST | `/api/dsh-upcv-workspace/jobs` | 生成岗位推荐 |
| POST | `/api/dsh-upcv-workspace/resume/optimize` | 简历优化 |
| POST | `/api/dsh-upcv-workspace/jd/align` | JD 对齐：拆要求 → 逐条核对覆盖 → 关键词缺口 + ATS 分 |
| POST | `/api/dsh-upcv-workspace/interview/next` | 面试追问：按最近一轮问答决定追问还是推进下一题 |
| GET  | `/api/dsh-upcv-workspace/store?collection=` | 读取本地集合（resumes / interviews / jd） |
| POST | `/api/dsh-upcv-workspace/store/save` | 落盘一条记录（原子写） |
| POST | `/api/dsh-upcv-workspace/store/delete` | 删除一条记录 |

**变更请求（POST）必须带 `x-dsh-upcv-action` 头**：exact 路由绕过宿主的 RPC 信任围栏，
自定义头会强制预检，而 exact 路由从不授予 CORS，因此跨站页面无法伪造写请求。

## 6. 错误码

| 错误码 | HTTP | 含义 |
|--------|------|------|
| `ai-unavailable` | 409 | 宿主没有可流式调用的模型服务 |
| `ai-no-provider` | 409 | 有服务但既没给 provider 也列不出模型 |
| `ai-timeout` | 504 | 整体超时或分片间隙超时 |
| `ai-empty` | 502 | 回包为空（轻则重试，重则换更大输出预算） |
| `ai-unparsable` | 502 | 抽不出合法 JSON（重试耗尽） |
| `ai-failed` / `ai-error:*` | 502 | 传输层或模型侧报错 |

给用户看的中文文案集中在 `AI_ERROR_MESSAGES` / `aiMessageFor()`，不要在路由里另写一份。

## 7. 验证方式

```bash
cd dsh-upcv-workspace
node tests/llm.test.mjs      # 传输层：解析容错 / 重试 / 超时 / 降级
node tests/ai.test.mjs       # 业务层 + 路由层 + 围栏 + 题库完整性
node tests/routes.test.mjs   # 起真实 http server 走一遍围栏与回包
```

> 如果 `node` 不在 PATH 上，可用 `ELECTRON_RUN_AS_NODE=1 "<DSH 的 Electron 可执行文件>" tests/llm.test.mjs` 运行（实测 Node v24.17.0）。
