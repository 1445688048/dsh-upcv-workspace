/**
 * 题库系统（interview V3）：questions 集合的入库、掌握度权重、存量迁移与内置题库导入。
 * 设计契约见 docs/INTERVIEW-V3-PLAN.md §2（数据模型）§3（权重与采样）§9（Phase A）。
 *
 * 职责边界：
 * - 判定升级（hitPoints/betterApproach 的解析）在 server/interview.js 与 server/ai.js；
 *   本模块消费判定结果，驱动 mastery。
 * - 采样（pickNext）Phase B 才接入面试流，这里只提供权重读数与更新。
 * - 去重闸门在 server/bank-dedup.js，入库一律先过闸。
 *
 * 本模块不依赖宿主能力（store 以参数传入），全部逻辑可离线测试。
 *
 * @module dsh-upcv-workspace/bank
 */

import { expandTopics, normalizeTags } from './interview-topics.js';
import { dedupeCheck, jaccard, normalizeStem, trigrams } from './bank-dedup.js';
import { MOCK_INTERVIEW_BANKS } from './mock.js';
import { bankTopicsFor } from './bank-topics.js';
import { BANK_META } from './bank-meta.js';

/** 级别标签。 */
export const LEVELS = Object.freeze(['junior', 'mid', 'senior']);
/** 题型（深度）标签：concept → mechanism → practice → scenario 由浅入深。 */
export const KINDS = Object.freeze(['concept', 'mechanism', 'practice', 'scenario']);
/** 作用域：general 全局共享；personal 只属于创建它的简历。 */
export const SCOPES = Object.freeze(['general', 'personal']);

/** weight 夹在区间内：下限保证已掌握的题偶而仍可被抽到，上限防单题垄断。 */
export const WEIGHT_MIN = 0.05;
export const WEIGHT_MAX = 8;
/** mastery.history 上限：复盘视图只需要最近几次判定。 */
export const HISTORY_LIMIT = 5;

const clampWeight = (value) => Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, value));

/** 无掌握度记录时的默认值。 */
export function emptyMastery() {
  return { seen: 0, pass: 0, partial: 0, fail: 0, streak: 0, weight: 1, lastSeenAt: 0, history: [] };
}

/**
 * 两层判定要点：essentials 判定只看这层；bestPractice 只进反馈（更优解）不进判定。
 * 兼容旧扁平数组（全部视为 essentials）。
 */
export function normalizePoints(raw) {
  if (Array.isArray(raw)) {
    const essentials = raw.map((item) => String(item ?? '').trim()).filter((item) => item !== '').slice(0, 4);
    return { essentials: essentials, bestPractice: [] };
  }
  const pick = (list, limit) =>
    (Array.isArray(list) ? list : []).map((item) => String(item ?? '').trim()).filter((item) => item !== '').slice(0, limit);
  return { essentials: pick(raw?.essentials, 4), bestPractice: pick(raw?.bestPractice, 2) };
}

const stringList = (value, limit = 8) =>
  (Array.isArray(value) ? value : []).map((item) => String(item ?? '').trim()).filter((item) => item !== '').slice(0, limit);

function newBankId() {
  return 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * 把入库候选（生成题 / 内置题 / 迁移错题）归一成 questions 记录。
 * text 为空返回 null；level/kind 非法回落默认；personal 必须带 resumeId。
 */
export function buildBankRecord(input, { now }) {
  const text = String(input?.text ?? '').trim();
  if (text === '') return null;
  const level = LEVELS.includes(input?.level) ? input.level : 'mid';
  const kind = KINDS.includes(input?.kind) ? input.kind : 'concept';
  const resumeId = input?.origin?.resumeId != null && String(input.origin.resumeId) !== '' ? String(input.origin.resumeId) : '';
  // V0.22 取消 personal：新入库一律 general；scope 字段保留读取以兼容旧数据展示
  const scope = 'general';
  const origin = input?.origin !== null && typeof input?.origin === 'object' ? input.origin : {};
  return {
    id: typeof input?.id === 'string' && input.id !== '' ? input.id : newBankId(),
    text: text,
    points: normalizePoints(input?.points),
    concept: String(input?.concept ?? '').trim(),
    topic: normalizeTags(input?.topic ?? input?.tags),
    level: level,
    kind: kind,
    scope: scope,
    origin: {
      source: ['builtin', 'ai', 'user'].includes(origin.source) ? origin.source : 'ai',
      via: ['jd', 'resume', 'replenish', 'manual', 'import', 'mistake-migrate', 'session', 'scaffold', 'gap', 'variant'].includes(origin.via) ? origin.via : 'session',
      ...(resumeId !== '' ? { resumeId: resumeId } : {}),
      ...(origin.jobId ? { jobId: String(origin.jobId) } : {}),
      ...(origin.sessionId ? { sessionId: String(origin.sessionId) } : {}),
      ...(origin.mistakeId ? { mistakeId: String(origin.mistakeId) } : {}),
      ...(origin.bankId ? { bankId: String(origin.bankId) } : {}),
      ...(origin.num !== undefined ? { num: Number(origin.num) } : {}),
    },
    ...(input?.variantOf != null && String(input.variantOf) !== '' ? { variantOf: String(input.variantOf) } : {}),
    mastery: input?.mastery !== null && typeof input?.mastery === 'object' ? { ...emptyMastery(), ...input.mastery } : emptyMastery(),
    suspectDuplicate: input?.suspectDuplicate === true,
    status: input?.status === 'removed' ? 'removed' : 'active',
    createdAt: now,
  };
}

/** 旧判定（无 hitRatio）按 verdict 映射；partial 取 0.5 与旧权重语义一致。 */
const VERDICT_RATIO = { pass: 1, partial: 0.5, fail: 0 };
/** 合法判定值（migration 用）。 */
const VERDICTS_WRAP = ['pass', 'partial', 'fail'];

function stemContains(a, b) {
  const sa = normalizeStem(a);
  const sb = normalizeStem(b);
  if (sa === '' || sb === '') return false;
  // 快速路径：一方包含另一方
  if (sa.includes(sb) || sb.includes(sa)) return true;
  // 兜底：模型把要点改写得太狠时，用 3-gram 相似度兜住（阈值与去重疑似线一致）
  return jaccard(trigrams(sa), trigrams(sb)) >= 0.45;
}

/**
 * 判定的要点命中率：优先用判定自带 hitRatio；否则按 missedPoints 对照
 * essentials 原文反推；连要点都没有时按 verdict 映射。
 */
export function hitRatioOf(judgment, points) {
  const explicit = Number(judgment?.hitRatio);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit));
  const { essentials } = normalizePoints(points);
  const missed = stringList(judgment?.missedPoints);
  if (essentials.length > 0) {
    const hit = essentials.filter((point) => !missed.some((m) => stemContains(m, point))).length;
    return hit / essentials.length;
  }
  return VERDICT_RATIO[judgment?.verdict] ?? 0.5;
}

/** 判定 → weight 乘数（docs/INTERVIEW-V3-PLAN.md §3.1）：pass ×0.5 / fail ×3 / partial 按命中率平滑。 */
export function weightMultiplier(verdict, hitRatio) {
  if (verdict === 'pass') return 0.5;
  if (verdict === 'fail') return 3;
  const r = Number.isFinite(hitRatio) ? Math.max(0, Math.min(1, hitRatio)) : 0.5;
  return 1 + 2 * (1 - r);
}

/**
 * 判定落 mastery（纯函数，返回新 mastery）：
 * 计数器累加、weight 按乘数更新并夹取、streak 规则（pass+1 / partial 不动 / fail 清零）、
 * history 追加并截断到 HISTORY_LIMIT。
 */
export function nextMastery(mastery, judgment, { now, hitRatio } = {}) {
  const base = mastery !== null && typeof mastery === 'object' ? { ...emptyMastery(), ...mastery } : emptyMastery();
  const ratio = Number.isFinite(hitRatio) ? Math.max(0, Math.min(1, hitRatio)) : hitRatioOf(judgment, null);
  const verdict = judgment?.verdict === 'pass' || judgment?.verdict === 'partial' || judgment?.verdict === 'fail' ? judgment.verdict : 'partial';
  const history = (Array.isArray(base.history) ? base.history : []).slice();
  history.push({
    at: now,
    verdict: verdict,
    hitRatio: Math.round(ratio * 100) / 100,
    missedPoints: stringList(judgment?.missedPoints),
    ...(String(judgment?.betterApproach ?? '').trim() !== '' ? { betterApproach: String(judgment.betterApproach).trim() } : {}),
    judgedBy: judgment?.judgedBy === 'user' ? 'user' : 'ai',
  });
  return {
    seen: base.seen + 1,
    pass: base.pass + (verdict === 'pass' ? 1 : 0),
    partial: base.partial + (verdict === 'partial' ? 1 : 0),
    fail: base.fail + (verdict === 'fail' ? 1 : 0),
    streak: verdict === 'pass' ? base.streak + 1 : verdict === 'fail' ? 0 : base.streak,
    weight: clampWeight(base.weight * weightMultiplier(verdict, ratio)),
    lastSeenAt: now,
    history: history.slice(-HISTORY_LIMIT),
    // 防挫败润滑的一次性标记：答对即清，之后再次连错 3 次可重新触发台阶题
    ...(base.scaffoldQueued === true && verdict !== 'pass' ? { scaffoldQueued: true } : {}),
  };
}

/** 对题库记录应用一次判定（含 weight 重算），返回更新后的记录；未变时原样返回。 */
export function applyJudgment(question, judgment, { now } = {}) {
  if (question === null || typeof question !== 'object') return question;
  const mastery = nextMastery(question.mastery, judgment, { now, hitRatio: hitRatioOf(judgment, question.points) });
  return { ...question, mastery: mastery };
}

/** 主动标记已掌握：weight 压到下限（采样自然淡出），计数器不动。 */
export function markMastered(question) {
  if (question === null || typeof question !== 'object') return question;
  return { ...question, mastery: { ...emptyMastery(), ...question.mastery, weight: WEIGHT_MIN } };
}

/**
 * 连续答错次数（history 末尾连续 fail 的条数）。
 * 防挫败润滑的触发依据：恰好等于 3 时触发一次降阶补题（pass 重置后可再次触发）。
 */
export function consecutiveFails(mastery) {
  const history = Array.isArray(mastery?.history) ? mastery.history : [];
  let count = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (String(history[i]?.verdict ?? '') !== 'fail') break;
    count += 1;
  }
  return count;
}

/**
 * 入库：候选题逐条过三层去重闸（库内同 topic + 批内已接受），通过的批量落盘。
 * @param {object[]} questions 生成题形状（questionId/question/points/tags + 可选 level/kind/bestPractice）
 * @returns {{ items: object[], idMap: {from,to,action}[], skipped: {from,reason}[] }}
 *   idMap 把原 questionId 映射到题库 id（新建或命中已有），调用方据此改写会话题的 questionId，
 *   让后续判定能落对 mastery。
 */
export function ingestQuestions(store, questions, { via = 'session', resumeId = '', jobId = '', sessionId = '', now, bypassSimilarity = false, variantOf = '' } = {}) {
  const read = store.list('questions');
  const existing = (Array.isArray(read.items) ? read.items : [])
    .filter((item) => item !== null && typeof item === 'object' && item.status !== 'removed')
    .map((item) => {
      const points = normalizePoints(item?.points);
      return { id: String(item?.id ?? ''), text: String(item?.text ?? ''), topic: normalizeTags(item?.topic), essentials: points.essentials, trigrams: null, hash: null };
    });
  const accepted = [];
  const idMap = [];
  const skipped = [];
  for (const raw of Array.isArray(questions) ? questions : []) {
    const text = String(raw?.question ?? '').trim();
    if (text === '') { skipped.push({ from: String(raw?.questionId ?? ''), reason: '空题干' }); continue; }
    const flatPoints = Array.isArray(raw?.points) && raw.points.length > 0 ? raw.points : [raw?.point];
    const points = normalizePoints({ essentials: flatPoints, bestPractice: raw?.bestPractice });
    const topic = normalizeTags(raw?.tags ?? raw?.topic);
    const level = LEVELS.includes(raw?.level) ? raw.level : 'mid';
    const kind = KINDS.includes(raw?.kind) ? raw.kind : 'concept';
    const candidates = existing.filter((item) => topic.length === 0 || item.topic.length === 0 || item.topic.some((tag) => topic.includes(tag)));
    // 变体题与原题考点相同是刻意的：跳过相似层，只保留精确去重
    const verdict = dedupeCheck(
      text,
      candidates.map((item) => ({ id: item.id, text: item.text, essentials: item.essentials })),
      points.essentials,
      { skipSimilarity: bypassSimilarity === true }
    );
    if (verdict.duplicate) {
      skipped.push({ from: String(raw?.questionId ?? ''), reason: verdict.reason });
      // 与库内已有题重复：映射到已有条目，判定照样落对 mastery
      if (verdict.matchId) idMap.push({ from: String(raw?.questionId ?? ''), to: verdict.matchId, action: 'matched' });
      continue;
    }
    const record = buildBankRecord(
      {
        text: text,
        points: points,
        topic: topic,
        level: level,
        kind: kind,
        // V0.22 取消 personal：题库纯通用资产（存量 personal 题由 migratePersonalToGeneral 迁转）
        scope: 'general',
        origin: { source: 'ai', via: via, resumeId: resumeId, jobId: jobId, sessionId: sessionId },
        ...(variantOf !== '' ? { variantOf: variantOf } : {}),
        suspectDuplicate: verdict.suspect,
      },
      { now: now }
    );
    accepted.push(record);
    existing.push({ id: record.id, text: record.text, topic: topic, essentials: points.essentials });
    idMap.push({ from: String(raw?.questionId ?? ''), to: record.id, action: 'created' });
  }
  if (accepted.length > 0) store.upsertMany('questions', accepted);
  return { items: accepted, idMap: idMap, skipped: skipped };
}

/** 按 id 找题；找不到时退回题干精确匹配（旧会话里的随机 id 也能落到同题）。 */
export function findBankQuestion(store, { id, text } = {}) {
  const read = store.list('questions');
  const items = Array.isArray(read.items) ? read.items : [];
  const key = id != null && String(id) !== '' ? String(id) : '';
  if (key !== '') {
    const byId = items.find((item) => String(item?.id) === key);
    if (byId !== undefined) return byId;
  }
  const stem = String(text ?? '').trim();
  if (stem === '') return undefined;
  return items.find((item) => normalizeStem(item?.text) === normalizeStem(stem));
}

/**
 * 题库筛选列表。view: all（默认）/ review（近期有 fail/partial）/ mastered（weight 已衰减到底）。
 * 其余过滤：topic 数组交集、level、kind、scope、q（题干子串）。排序 weight 降序，新题靠前。
 */
export function listQuestions(store, { topic, level, kind, scope, q, view = 'all', offset = 0, limit = 50 } = {}) {
  const read = store.list('questions');
  let items = (Array.isArray(read.items) ? read.items : []).filter((item) => item?.status !== 'removed');
  // V0.24：筛选走同组双向扩展（搜 Redis 能命中「缓存架构」标签的存量题）
  const wanted = expandTopics(topic);
  if (wanted.size > 0) items = items.filter((item) => normalizeTags(item?.topic).some((tag) => wanted.has(tag.toLowerCase())));
  if (LEVELS.includes(level)) items = items.filter((item) => item?.level === level);
  if (KINDS.includes(kind)) items = items.filter((item) => item?.kind === kind);
  if (SCOPES.includes(scope)) items = items.filter((item) => item?.scope === scope);
  const keyword = String(q ?? '').trim().toLowerCase();
  if (keyword !== '') items = items.filter((item) => String(item?.text ?? '').toLowerCase().includes(keyword));
  if (view === 'review') items = items.filter((item) => (item?.mastery?.fail ?? 0) + (item?.mastery?.partial ?? 0) > 0);
  if (view === 'mastered') items = items.filter((item) => (item?.mastery?.weight ?? 1) <= WEIGHT_MIN + 0.01);
  items = items.slice().sort((a, b) => (b?.mastery?.weight ?? 1) - (a?.mastery?.weight ?? 1) || String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? '')));
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  return { items: items.slice(start, start + size), total: items.length };
}

// ── 存量迁移与内置导入（幂等：按稳定 id 跳过已存在，绝不覆盖已有 mastery）────

/** 错题条目 → 题库记录：fail 起步高权重（weight 3），solved 视为已掌握一次。 */
function mistakeToQuestion(entry, { now }) {
  const text = String(entry?.question ?? '').trim();
  if (text === '') return null;
  const verdict = entry?.verdict === 'fail' || entry?.verdict === 'partial' || entry?.verdict === 'pass' ? entry.verdict : 'fail';
  const oldHistory = (Array.isArray(entry?.history) ? entry.history : []).slice(-HISTORY_LIMIT).map((item) => ({
    at: String(item?.at ?? ''),
    verdict: VERDICTS_WRAP.includes(item?.verdict) ? item.verdict : verdict,
    hitRatio: VERDICT_RATIO[item?.verdict] ?? 0.5,
    missedPoints: stringList(item?.missedPoints),
    judgedBy: item?.judgedBy === 'user' ? 'user' : 'ai',
  }));
  const seed = verdict === 'pass' ? { pass: 1, streak: 1, weight: 0.5 } : verdict === 'partial' ? { partial: 1, weight: 2 } : { fail: 1, weight: 3 };
  return {
    id: 'mq-' + String(entry.id),
    text: text,
    points: normalizePoints({ essentials: entry?.points }),
    topic: normalizeTags(entry?.tags),
    level: 'mid',
    kind: 'practice',
    scope: 'general',
    origin: { source: 'ai', via: 'mistake-migrate', mistakeId: String(entry.id) },
    mastery: { ...emptyMastery(), ...seed, seen: 1, lastSeenAt: String(entry?.addedAt ?? now), history: oldHistory },
    status: 'active',
    createdAt: String(entry?.addedAt ?? now),
  };
}

/**
 * 一次性迁移 mistakes → questions。幂等：带稳定 id 'mq-<mistakeId>'，
 * 已存在的直接跳过（保住迁移后积累的 mastery）；removed 错题不迁移（用户明确移出过）。
 * 迁移完成后不再往 mistakes 写新数据——后续判定走 questions。
 */
export function migrateMistakes(store, { now } = {}) {
  const read = store.list('mistakes');
  const mistakes = Array.isArray(read.items) ? read.items : [];
  const existing = new Set((Array.isArray(store.list('questions').items) ? store.list('questions').items : []).map((item) => String(item?.id)));
  const pending = mistakes
    .filter((entry) => entry?.status !== 'removed' && entry?.id != null)
    .map((entry) => ({ entry: entry, record: mistakeToQuestion(entry, { now: now }) }))
    .filter((pair) => pair.record !== null && !existing.has(pair.record.id))
    .map((pair) => pair.record);
  if (pending.length === 0) return { migrated: 0 };
  store.upsertMany('questions', pending);
  return { migrated: pending.length };
}

/** 内置题 bank-topics 标注缺失时的兜底：category → kind 粗映射。 */
const CATEGORY_KIND = { behavioral: 'scenario', case: 'scenario', technical: 'concept' };

function bankRecord(bank, item, { now }) {
  const num = Number(item?.id);
  const topics = bankTopicsFor(bank.id, item?.id);
  const meta = BANK_META?.[bank.id]?.[num] ?? null;
  const points = (topics === null ? [] : topics.p).map((p) => String(p ?? '').trim()).filter((p) => p !== '');
  const bp = (Array.isArray(meta?.bp) ? meta.bp : []).filter((index) => Number.isInteger(index) && index >= 0 && index < points.length);
  const bestPractice = bp.map((index) => points[index]);
  const essentials = points.filter((point, index) => !bp.includes(index));
  const level = meta !== null && LEVELS.includes(meta.l) ? meta.l : 'mid';
  const kind = meta !== null && KINDS.includes(meta.k) ? meta.k : CATEGORY_KIND[item?.category] ?? 'concept';
  return {
    id: 'bq-' + bank.id + '-' + item?.id,
    text: String(item?.question ?? '').trim(),
    points: normalizePoints({ essentials: essentials, bestPractice: bestPractice }),
    concept: String(meta?.c ?? ''),
    topic: topics === null ? [] : topics.t,
    level: level,
    kind: kind,
    scope: 'general',
    origin: { source: 'builtin', via: 'import', bankId: bank.id, num: num },
    mastery: emptyMastery(),
    status: 'active',
    createdAt: now,
  };
}

let readyDone = false;

/**
 * 一次性导入内置 300 题（docs/INTERVIEW-V3-PLAN.md §2.4）。幂等：稳定 id
 * 'bq-<bankId>-<num>'，已存在的跳过。首次使用题库时调用（ensureBankReady）。
 */
export function importBuiltinBank(store, { now } = {}) {
  const existing = new Set((Array.isArray(store.list('questions').items) ? store.list('questions').items : []).map((item) => String(item?.id)));
  const pending = [];
  for (const bank of MOCK_INTERVIEW_BANKS) {
    for (const item of bank.questions ?? []) {
      const record = bankRecord(bank, item, { now: now });
      if (record.text === '') continue;
      if (existing.has(record.id)) continue;
      pending.push(record);
    }
  }
  if (pending.length === 0) return { imported: 0 };
  store.upsertMany('questions', pending);
  return { imported: pending.length };
}

/**
 * V0.22 一次性迁移：存量 personal 题转 general（取消 personal 机制）。
 * origin.resumeId 保留作溯源；幂等——库里没有 personal 题时零操作。
 */
export function migratePersonalToGeneral(store) {
  const read = store.list('questions');
  const items = Array.isArray(read.items) ? read.items : [];
  const pending = items.filter((item) => item?.scope === 'personal');
  if (pending.length === 0) return { migrated: 0 };
  store.upsertMany('questions', pending.map((item) => ({ ...item, scope: 'general' })));
  return { migrated: pending.length };
}

/**
 * 题库就绪：进程内只跑一次存量迁移 + 内置导入。失败不阻塞调用方（返回 null），
 * 下次调用会重试（memo 只在成功后置位）。
 */
export function ensureBankReady(store, { now } = {}) {
  if (readyDone) return { skipped: true };
  try {
    const migrated = migrateMistakes(store, { now: now });
    const imported = importBuiltinBank(store, { now: now });
    migratePersonalToGeneral(store);
    readyDone = true;
    return { migrated: migrated.migrated, imported: imported.imported };
  } catch {
    return null;
  }
}

/** 测试用：重置 ensureBankReady 的进程内 memo。 */
export function resetBankReadyForTest() {
  readyDone = false;
}
