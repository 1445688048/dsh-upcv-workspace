/**
 * 本地数据存储：每个集合一个 JSON 文件，落在 `config.root` 下（DSH home 里的本工作台目录）。
 *
 * 设计取舍：
 * - 不做数据库。数据量是用户自己的简历/面试记录，每集合上限 100 条，单文件足够。
 * - 集合名走**白名单**，不接受任意字符串——避免路径穿越。
 * - 写盘用「临时文件 + rename」保证原子性：中途崩溃不会留下半截 JSON。
 * - 读取失败（文件损坏/不存在）一律当作空集合，不让工作台打不开。
 *
 * @module dsh-upcv-workspace/store
 */

import { mkdirSync, readFileSync, renameSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 允许的集合：简历 / 面试记录 / JD 对齐结果 / 真实检索岗位 / 错题本（jobs.json 由 server/jobs.js 管理）。
 * questions（题库，interview V3）由 server/bank.js 写入：题量大，走独立容量表。 */
export const COLLECTIONS = Object.freeze(['resumes', 'interviews', 'jd', 'jobs', 'mistakes', 'questions']);

/** 每个集合最多保留多少条，防止单文件无限膨胀。 */
const MAX_ITEMS = 100;

/** 按集合覆盖默认容量：题库要装下内置 300 题 + 持续生成的题（docs/INTERVIEW-V3-PLAN.md §2.2）。 */
const CAPS = Object.freeze({ questions: 2000 });

const capOf = (collection) => CAPS[collection] ?? MAX_ITEMS;

const isCollection = (name) => COLLECTIONS.includes(name);

/** 生成一个够用的 id（时间戳 + 随机后缀，可排序且不冲突）。 */
function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function createStore(root) {
  const dir = typeof root === 'string' && root !== '' ? root : null;
  const pathOf = (collection) => join(dir, collection + '.json');

  function ensureDir() {
    if (dir === null) throw new Error('store: 没有配置数据根目录（config.root）');
    mkdirSync(dir, { recursive: true });
  }

  /** 读集合；任何异常都返回空数组，并附上原因供调用方判断。 */
  function readRaw(collection) {
    if (dir === null || !isCollection(collection)) return { items: [], note: 'unavailable' };
    const file = pathOf(collection);
    if (!existsSync(file)) return { items: [], note: 'empty' };
    try {
      if (statSync(file).size > 8 * 1024 * 1024) return { items: [], note: 'oversized' };
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      return { items: items, note: 'ok' };
    } catch {
      // 文件坏了也不要让工作台打不开：当空集合处理，并留下原因
      return { items: [], note: 'corrupt' };
    }
  }

  /** 原子写：先写 .tmp 再 rename，避免半截 JSON。 */
  function writeRaw(collection, items) {
    ensureDir();
    const file = pathOf(collection);
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf8');
    renameSync(tmp, file);
  }

  return {
    get root() { return dir; },

    list(collection) {
      if (!isCollection(collection)) return { error: 'invalid-collection' };
      const read = readRaw(collection);
      return { items: read.items, note: read.note };
    },

    /** 新增或按 id 覆盖；item 没有 id 时生成一个。 */
    upsert(collection, item) {
      if (!isCollection(collection)) return { error: 'invalid-collection' };
      if (item === null || typeof item !== 'object' || Array.isArray(item)) return { error: 'invalid-item' };
      const read = readRaw(collection);
      const id = typeof item.id === 'string' && item.id !== '' ? item.id : newId();
      const record = { ...item, id: id, updatedAt: new Date().toISOString() };
      const index = read.items.findIndex((entry) => entry?.id === id);
      const next = index === -1 ? [record, ...read.items] : read.items.map((entry, i) => (i === index ? record : entry));
      const cap = capOf(collection);
      writeRaw(collection, next.slice(0, cap));
      return { item: record, count: Math.min(next.length, cap) };
    },

    /** 批量新增/按 id 覆盖（单次落盘）：题库导入 300 条时避免逐条全量重写。 */
    upsertMany(collection, items) {
      if (!isCollection(collection)) return { error: 'invalid-collection' };
      const list = (Array.isArray(items) ? items : [])
        .filter((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
      if (list.length === 0) return { items: [], count: readRaw(collection).items.length };
      const read = readRaw(collection);
      const byId = new Map(read.items.map((entry) => [String(entry?.id), entry]));
      const out = [];
      for (const item of list) {
        const id = typeof item.id === 'string' && item.id !== '' ? item.id : newId();
        const record = { ...item, id: id, updatedAt: new Date().toISOString() };
        byId.set(id, record);
        out.push(record);
      }
      const cap = capOf(collection);
      const merged = [...byId.values()];
      writeRaw(collection, merged.slice(0, cap));
      return { items: out, count: Math.min(merged.length, cap) };
    },

    remove(collection, id) {
      if (!isCollection(collection)) return { error: 'invalid-collection' };
      if (typeof id !== 'string' || id === '') return { error: 'id-required' };
      const read = readRaw(collection);
      const next = read.items.filter((entry) => entry?.id !== id);
      if (next.length === read.items.length) return { error: 'not-found' };
      writeRaw(collection, next);
      return { removed: true, count: next.length };
    },

    /** 各集合条数，用于界面显示与自检。 */
    stats() {
      const out = {};
      for (const collection of COLLECTIONS) out[collection] = readRaw(collection).items.length;
      return { root: dir, counts: out };
    },
  };
}
