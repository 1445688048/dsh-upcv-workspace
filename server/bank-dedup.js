/**
 * 题库去重（interview V3）：入库前的三层闸门（docs/INTERVIEW-V3-PLAN.md §5）。
 *
 *   1. 精确层   题干规范化（去空白/标点、统一小写）后哈希，完全相同直接拒；
 *   2. 相似层   同 topic 内 3-gram Jaccard 相似度：≥0.8 拒绝；0.6-0.8 标疑似
 *              （有要点重叠佐证时直接拒，无模型复核时由人工在题库页处理）；
 *   3. 预防层   生成端喂已有题干（existingStems），由 prompt 层使用，不在本模块。
 *
 * 纯逻辑模块，不依赖宿主能力，可离线测试。
 *
 * @module dsh-upcv-workspace/bank-dedup
 */

import { createHash } from 'node:crypto';

/** 相似度 ≥ 该值直接判重复。 */
export const SIMILAR_REJECT = 0.8;
/**
 * 相似度 ≥ 该值进入疑似区：要点高度重叠（≥POINTS_OVERLAP_REJECT）时判重复，
 * 否则标 suspectDuplicate 交人工/AI 复核。
 * 阈值按中文 3-gram 实测校准：同话题不同题约 0.39-0.52，换词近似重复约 0.5+，
 * 取 0.45 分界，配合要点重叠信号区分「换说法的同题」与「同话题的新题」。
 */
export const SIMILAR_SUSPECT = 0.45;
/** essentials 重叠率 ≥ 该值视为「考点相同」的佐证。 */
export const POINTS_OVERLAP_REJECT = 0.6;

/** 规范化题干：去空白与标点、统一小写——只留用于比对的字符。 */
export function normalizeStem(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 精确层：规范化题干的 sha1。 */
export function stemHash(text) {
  return createHash('sha1').update(normalizeStem(text), 'utf8').digest('hex');
}

/** 字符 3-gram 集合；不足 3 字的串退化为整串单元素集合。 */
export function trigrams(text) {
  const s = normalizeStem(text);
  const set = new Set();
  if (s.length < 3) {
    if (s !== '') set.add(s);
    return set;
  }
  for (let i = 0; i <= s.length - 3; i += 1) set.add(s.slice(i, i + 3));
  return set;
}

/** Jaccard 相似度：交集 / 并集；两边都空视为 1（全空串等同）。 */
export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** essentials 重叠率：命中条数 / 较多一方条数（对称，避免长短列表虚低）。 */
export function pointsOverlap(listA, listB) {
  const norm = (list) => (Array.isArray(list) ? list.map((item) => normalizeStem(item)).filter((s) => s !== '') : []);
  const a = norm(listA);
  const b = norm(listB);
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const item of a) {
    if (setB.has(item)) { hit += 1; continue; }
    // 一方包含另一方也算命中（「说清 fork 的代价」vs「fork 有内存与停顿代价」）
    for (const other of b) {
      if (item.includes(other) || other.includes(item)) { hit += 1; break; }
    }
  }
  return hit / Math.max(a.length, b.length);
}

/**
 * 对单道新题跑三层闸门。
 * @param {string} text 新题题干
 * @param {{ id?: string, text: string, topic?: string[], essentials?: string[] }[]} existing 库内候选（同 topic 过滤后传入）
 * @param {string[]} [essentials] 新题的判定要点（用于重叠佐证）
 * @param {{ skipSimilarity?: boolean }} [options] 变体题传 skipSimilarity：与原题考点相同是刻意的，
 *        只保留精确层（题干完全相同仍拒收）。
 * @returns {{ duplicate: boolean, reason: string, suspect: boolean, matchId: string|null, ratio: number }}
 *   duplicate=true 必须拒收；suspect=true 且未拒收时建议标 suspectDuplicate。
 */
export function dedupeCheck(text, existing, essentials = [], options = {}) {
  const myHash = stemHash(text);
  for (const item of existing) {
    if (stemHash(item?.text) === myHash && normalizeStem(text) === normalizeStem(item?.text)) {
      return { duplicate: true, reason: '与已有题干完全相同', suspect: false, matchId: String(item?.id ?? ''), ratio: 1 };
    }
  }
  if (options.skipSimilarity === true) {
    return { duplicate: false, reason: '', suspect: false, matchId: null, ratio: 0 };
  }
  const mine = trigrams(text);
  let best = { ratio: 0, matchId: null, overlap: 0 };
  for (const item of existing) {
    const ratio = jaccard(mine, trigrams(item?.text));
    if (ratio > best.ratio) {
      best = { ratio: ratio, matchId: String(item?.id ?? ''), overlap: pointsOverlap(essentials, item?.essentials) };
    }
  }
  if (best.ratio >= SIMILAR_REJECT || (best.ratio >= SIMILAR_SUSPECT && best.overlap >= POINTS_OVERLAP_REJECT)) {
    return { duplicate: true, reason: '与已有题干高度相似（' + best.ratio.toFixed(2) + '）', suspect: false, matchId: best.matchId, ratio: best.ratio };
  }
  return {
    duplicate: false,
    reason: '',
    suspect: best.ratio >= SIMILAR_SUSPECT,
    matchId: best.ratio >= SIMILAR_SUSPECT ? best.matchId : null,
    ratio: best.ratio,
  };
}
// 注意：精确层已提前返回，这里只处理相似层

/**
 * 生成端预防层的数据：同 topic 的已有题干列表（上限 maxStems 条），
 * 由调用方拼进生成 prompt，要求模型避开。
 */
export function existingStemsForPrompt(items, topic, maxStems = 30) {
  const wanted = Array.isArray(topic) ? topic : topic ? [topic] : [];
  const pool = (Array.isArray(items) ? items : [])
    .filter((item) => String(item?.text ?? '').trim() !== '')
    .filter((item) => {
      if (wanted.length === 0) return true;
      const own = Array.isArray(item?.topic) ? item.topic : [];
      return own.some((tag) => wanted.includes(tag));
    })
    .slice(0, maxStems);
  return pool.map((item) => String(item.text));
}
