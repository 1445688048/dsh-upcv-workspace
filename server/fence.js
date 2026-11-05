/**
 * /api 路由的信任围栏。
 *
 * 宿主的 exact 路由绕过 connection 插件的 RPC 围栏，所以本模块自己兜住：
 *   1. 只接受 GET/POST；
 *   2. 只接受 loopback 的 remote address 与 loopback 的 Host 头；
 *   3. 变更请求必须带自定义头 x-dsh-upcv-action —— 自定义头会强制预检，
 *      而 exact 路由从不授予 CORS，跨站页面无法满足；
 *   4. 带 body 的请求必须声明 application/json。
 *
 * 单独成模块是为了能被 tests/ai.test.mjs 直接覆盖，不牵入宿主依赖。
 *
 * @module dsh-upcv-workspace/fence
 */

import { ACTION_HEADER, json } from './api.js';

const ALLOWED_METHODS = ['GET', 'POST'];

export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false;
  const value = address.startsWith('::ffff:') ? address.slice(7) : address;
  return value === '::1' || value === '127.0.0.1' || value.startsWith('127.');
}

export function isLoopbackHostHeader(req) {
  const host = req.headers?.host;
  if (typeof host !== 'string' || host === '') return false;
  const name = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name.startsWith('127.');
}

export function hasBody(req) {
  const length = req.headers?.['content-length'];
  if (typeof length === 'string' && length !== '' && Number(length) > 0) return true;
  const encoding = req.headers?.['transfer-encoding'];
  return typeof encoding === 'string' && encoding !== '';
}

/**
 * @returns {boolean} true 表示已经回过响应，调用方应立即返回
 */
export function rejectForeign(req, res, { mutation }) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    json(res, 405, { ok: false, error: 'method-not-allowed' });
    return true;
  }
  if (!isLoopbackAddress(req.socket?.remoteAddress) || !isLoopbackHostHeader(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }
  if (!mutation) return false;
  if (req.headers?.[ACTION_HEADER] === undefined) {
    json(res, 403, { ok: false, error: 'forbidden-action' });
    return true;
  }
  if (!hasBody(req)) return false;
  const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    json(res, 403, { ok: false, error: 'forbidden-action' });
    return true;
  }
  return false;
}
