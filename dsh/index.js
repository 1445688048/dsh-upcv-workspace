/**
 * dsh-upcv-workspace — server half.
 *
 * 本地求职工作台：AI 简历优化、模拟面试出题与评分、岗位推荐。
 * 服务端通过 exact /api 路由把能力暴露给本工作台自己的浏览器面板
 * （路由表见 server/api.js，各层分工见 docs/ARCHITECTURE.md）。
 *
 * 模型能力通过 ctx.get('llm') 解析（**不注入**）：宿主没有可用模型时插件照常加载，
 * 出题回退内置题库、其余 AI 路由明确返回 ai-unavailable —— 不静默返回假数据。
 *
 * exact /api 路由绕过 connection 插件的 RPC 信任围栏，所以本模块自己兜住整个工作台：
 * loopback 地址 + loopback Host，以及变更请求上的非简单头 x-dsh-upcv-action，
 * 使外部页面无法 CSRF 本地写请求。实现见 server/fence.js。
 *
 * @module dsh-upcv-workspace
 */

import Schema from '@deepseek-ai/schemastery'
import { dirname, join } from 'node:path'

import { BASE, BUILD_VERSION, ROUTES, createHandlers, json } from '../server/api.js'
import { rejectForeign } from '../server/fence.js'
import { ensureSpec } from '../server/jobs.js'
import { stopAllMonitors } from '../server/session-collect.js'
import { createStore } from '../server/store.js'

export const name = 'dsh-upcv-workspace'

/**
 * webServer 提供 exact 路由注册表，connection 是宿主 HTTP 面。
 * llm 走 ctx.get 而不是 inject：没有模型的宿主也能加载本工作台。
 */
export const inject = ['webServer', 'connection']

export const Config = Schema.object({
  // 数据根由 cordis.patch.yml 用 dshHomePath('dsh-upcv-workspace') 注入，
  // 保证用户数据只写在 DSH home 下的本工作台目录。
  root: Schema.string().required(),
  repository: Schema.string().default('https://github.com/fanyukun/dsh-upcv-workspace'),
  // 可选：本机 Chromium 路径。留空则自动探测 Chrome / Chromium / Edge / Brave。
  chromePath: Schema.string().default(''),
  // 浏览器管家：MCP 与插件共用的 profile / CDP 端口 / Playwright 安装目录。
  browserPort: Schema.number().default(9333),
  browserProfile: Schema.string().default(''),
  browserModuleDir: Schema.string().default(''),
  resumeApiBaseUrl: Schema.string().default('https://www.upcv.tech/api'),
})

export { BASE, ROUTES }

/** ctx.get 在旧宿主或不完整上下文上不能抛错。 */
function safeGet(ctx, serviceName) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(serviceName) : undefined
  } catch {
    return undefined
  }
}

/** 宿主是否提供了可流式调用的模型服务。 */
const isStreamingService = (service) => service !== undefined && service !== null && typeof service.stream === 'function'

export function apply(ctx, config) {
  const llm = safeGet(ctx, 'llm')
  const available = isStreamingService(llm)
  // 数据落盘到 config.root（cordis.patch.yml 用 dshHomePath 注入），与兄弟工作台一致
  const store = createStore(config?.root)
  // 会话式检索：优先让宿主 agent 在后台会话里用 jobs-collect skill + 浏览器 MCP；
  // 没有 sessionController 的宿主仍照常退回内建采集器。
  // 注意：这两个服务可能比本插件晚注册，必须按调用时解析（不能在 apply 时缓存）。
  const getSessionController = () => safeGet(ctx, 'sessionController')
  const agentStatus = (sessionId) => {
    try {
      const agents = safeGet(ctx, 'agents')
      const agent = agents !== null && agents !== undefined && typeof agents.get === 'function' ? agents.get(sessionId) : undefined
      return agent !== null && agent !== undefined && typeof agent.status === 'string' ? agent.status : null
    } catch { return null }
  }
  // 浏览器管家：默认复用 browser MCP 的 profile 与 Playwright 安装目录。
  const dshHome = dirname(String(config?.root ?? ''))
  const browser = {
    port: Number(config?.browserPort) > 0 ? Number(config.browserPort) : 9333,
    profile: config?.browserProfile !== undefined && config.browserProfile !== ''
      ? config.browserProfile
      : join(dshHome, 'mcp/playwright/profile'),
    moduleDir: config?.browserModuleDir !== undefined && config.browserModuleDir !== ''
      ? config.browserModuleDir
      : join(dshHome, 'mcp/playwright/node_modules'),
    // 会话 cookie 的快照：Chrome 关掉后登录态还能恢复
    statePath: join(String(config?.root ?? ''), 'browser-state.json'),
    chromePath: config?.chromePath ?? '',
  }
  const handlers = createHandlers({
    chromePath: config?.chromePath ?? '', llm, available, store, getSessionController, agentStatus, browser })

  // 岗位检索契约①：首次 apply 引导创建 jobs-spec.json；已存在或坏 JSON 都绝不覆盖
  const spec = ensureSpec(config?.root)
  if (spec.error !== undefined) ctx.logger?.warn?.('dsh-upcv-workspace: ' + String(spec.message))
  else if (spec.created) ctx.logger?.info?.('dsh-upcv-workspace: 已创建默认检索规格 jobs-spec.json')

  const webServer = safeGet(ctx, 'webServer')
  if (webServer === undefined || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('dsh-upcv-workspace: 宿主没有 webServer，面板路由未注册。')
    return
  }

  for (const path of Object.values(ROUTES)) {
    const table = handlers[path]
    if (table === undefined) continue
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: path,
      handler: (req, res) => {
        const mutation = req.method !== 'GET'
        if (rejectForeign(req, res, { mutation: mutation })) return
        const handler = table[req.method]
        if (handler === undefined) {
          json(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        return Promise.resolve()
          .then(() => handler(req, res))
          .catch((error) => {
            ctx.logger?.warn?.('dsh-upcv-workspace: ' + req.method + ' ' + path + ' failed: ' + String(error))
            if (res.headersSent) { res.end(); return }
            json(res, 500, { ok: false, error: 'internal', message: error instanceof Error ? error.message : String(error) })
          })
      },
    }), 'dsh-upcv-workspace: ' + path)
  }

  ctx.effect(() => () => stopAllMonitors(), 'dsh-upcv-workspace: stop session monitors')

  ctx.logger?.info?.('dsh-upcv-workspace v' + BUILD_VERSION + ' ready (ai=' + String(available) + ', session=' + String(getSessionController() !== undefined) + ', browser=' + String(browser.port) + ', data=' + String(config?.root) + ') at ' + BASE)
}
