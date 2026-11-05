/**
 * 检索源（Phase 3.1）：渠道列表 + 登录状态 + 查询前 preflight。
 *
 * - 渠道与 auth 配置来自 <root>/jobs-spec.json（用户数据，本模块只读）；
 * - 登录检查结果写 <root>/sources-status.json（运行时数据，原子写）；
 * - 查询前只把状态 ok / 无需登录的渠道交给会话，其余跳过并报告。
 *
 * @module dsh-upcv-workspace/sources
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureSpec } from './jobs.js';

export const SOURCES_STATUS_FILE = 'sources-status.json';
const STATUS_MAX_BYTES = 256 * 1024;

export function sourcesStatusPath(root) {
  return join(root, SOURCES_STATUS_FILE);
}

/** 读 sources-status.json；坏文件/超大按空对象处理（检查结果丢了不影响检索）。 */
export function readSourcesStatus(root) {
  const file = sourcesStatusPath(root);
  if (!existsSync(file)) return {};
  try {
    if (readFileSync(file, 'utf8').length > STATUS_MAX_BYTES) return {};
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** 原子合并写一个源的状态（临时文件 + rename）。 */
export function writeSourceStatus(root, id, status) {
  if (typeof id !== 'string' || id === '') return false;
  const current = readSourcesStatus(root);
  current[id] = status;
  try {
    mkdirSync(root, { recursive: true });
    const tmp = sourcesStatusPath(root) + '.tmp';
    writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8');
    renameSync(tmp, sourcesStatusPath(root));
    return true;
  } catch {
    return false;
  }
}

/** 读 spec 里的渠道（只读，不重写）。 */
export function sourceConfigs(root) {
  const result = ensureSpec(root);
  if (result.error !== undefined) return { error: result.error, message: result.message, channels: [] };
  const channels = Array.isArray(result.spec.channels) ? result.spec.channels : [];
  return {
    channels: channels
      .filter((channel) => channel !== null && typeof channel === 'object' && typeof channel.id === 'string' && channel.id !== '')
      .map((channel) => ({
        id: channel.id,
        enabled: channel.enabled !== false,
        entry: typeof channel.entry === 'string' ? channel.entry : '',
        auth: channel.auth !== null && typeof channel.auth === 'object' ? channel.auth : null,
      })),
  };
}

/** 面板用：渠道 + 当前登录状态（不暴露 auth 内部的匹配规则）。 */
export function listSources(root) {
  const configs = sourceConfigs(root);
  if (configs.error !== undefined) return { error: configs.error, message: configs.message, sources: [] };
  const statuses = readSourcesStatus(root);
  return {
    sources: configs.channels.map((channel) => {
      const stored = statuses[channel.id];
      const status = channel.enabled !== true
        ? { state: 'disabled' }
        : channel.auth === null
          ? { state: 'no-auth' }
          : stored !== null && typeof stored === 'object' && typeof stored.state === 'string'
            ? stored
            : { state: 'unknown' };
      return {
        id: channel.id,
        enabled: channel.enabled,
        entry: channel.entry,
        hasAuth: channel.auth !== null,
        loginUrl: channel.auth !== null && typeof channel.auth.loginUrl === 'string' ? channel.auth.loginUrl : '',
        status: status,
      };
    }),
  };
}

/**
 * 检查登录态；ids 省略时检查所有 enabled + 有 auth 的渠道。
 * @param {{root:string, ids?:string[], check:Function}} options
 */
export async function checkSources(options = {}) {
  const root = options.root;
  const configs = sourceConfigs(root);
  if (configs.error !== undefined) return { error: configs.error, message: configs.message, results: [] };
  const ids = Array.isArray(options.ids) ? options.ids : null;
  const targets = configs.channels.filter((channel) => channel.enabled
    && channel.auth !== null
    && (ids === null || ids.includes(channel.id)));
  const results = [];
  for (const channel of targets) {
    let status;
    try {
      status = await options.check(channel);
    } catch (error) {
      status = { state: 'unknown', note: '检查失败：' + String(error?.message ?? error) };
    }
    if (status === null || typeof status !== 'object' || typeof status.state !== 'string') {
      status = { state: 'unknown', note: '检查没有返回有效结果' };
    }
    const record = { ...status, checkedAt: typeof status.checkedAt === 'string' ? status.checkedAt : new Date().toISOString() };
    writeSourceStatus(root, channel.id, record);
    results.push({ id: channel.id, ...record });
  }
  return { results: results };
}

/**
 * 查询前 preflight：返回本轮可跑的渠道与被跳过的原因。
 * @returns {{usable:string[], skipped:Array<{id:string,state:string,note?:string}>}}
 */
export function usableSources(root) {
  const configs = sourceConfigs(root);
  if (configs.error !== undefined) return { usable: [], skipped: [] };
  const statuses = readSourcesStatus(root);
  const usable = [];
  const skipped = [];
  for (const channel of configs.channels) {
    if (channel.enabled !== true) {
      skipped.push({ id: channel.id, state: 'disabled' });
      continue;
    }
    if (channel.auth === null) {
      usable.push(channel.id);
      continue;
    }
    const status = statuses[channel.id];
    if (status !== null && status !== undefined && status.state === 'ok') {
      usable.push(channel.id);
    } else {
      skipped.push({
        id: channel.id,
        state: status !== null && status !== undefined && typeof status.state === 'string' ? status.state : 'unknown',
        note: status !== null && status !== undefined && typeof status.note === 'string' ? status.note : '',
      });
    }
  }
  return { usable: usable, skipped: skipped };
}
