/**
 * 题库自适应采样（interview V3 Phase B，docs/INTERVIEW-V3-PLAN.md §3）。
 *
 * 深度递进不靠引擎：concept 题答对→权重衰减→抽样自然落到还没掌握的
 * mechanism/practice 题（D7 涌现）。本模块只做三件事：
 *   1. 读权重（含复习唤醒与冷却判定）；
 *   2. 按 池子逐级放松 找候选；
 *   3. 冷启动走深度阶梯，热启动按权重随机。
 *
 * 纯逻辑模块：items 以参数传入，rng 可注入（测试用种子），可离线测试。
 *
 * @module dsh-upcv-workspace/bank-sampling
 */

import { WEIGHT_MIN, KINDS } from './bank.js';
import { expandTopics } from './interview-topics.js';

/** pass / partial 后的冷却：24h 内不再出现（fail 无冷却，尽快重现）。 */
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** 复习唤醒：超过 14 天没见过的已掌握题，权重抬回来一点（间隔重复）。 */
export const REVIVE_MS = 14 * 24 * 60 * 60 * 1000;
export const REVIVE_WEIGHT = 0.8;
/** 池子枯竭线：匹配候选少于 3 道，或全部权重已衰减到底。 */
export const POOL_LOW = 3;

/** 可注入的确定性随机源（测试断言分布用）。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toMs = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** 最近一次判定；没练过或 history 异常时返回 null。 */
function lastVerdictOf(item) {
  const history = item?.mastery?.history;
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = history[history.length - 1];
  return last !== null && typeof last === 'object' ? String(last.verdict ?? '') : '';
}

/**
 * 冷却中：24h 内练过且最近一次不是 fail（fail 无冷却，尽快重现）。
 * 没练过的题不冷却。
 */
export function isCooling(item, nowMs) {
  const lastSeen = toMs(item?.mastery?.lastSeenAt);
  if (lastSeen === 0) return false;
  if (nowMs - lastSeen >= COOLDOWN_MS) return false;
  return lastVerdictOf(item) !== 'fail';
}

/**
 * 采样用的有效权重：
 * 基础 weight（存储值），叠间隔重复唤醒——超过 14 天没练且权重已衰减的题，
 * 抬回 max(weight, 0.8)，让掌握过的题隔段时间还会冒出来复习。
 */
export function effectiveWeight(item, nowMs) {
  const weight = Number(item?.mastery?.weight);
  const base = Number.isFinite(weight) ? weight : 1;
  const lastSeen = toMs(item?.mastery?.lastSeenAt);
  if (lastSeen > 0 && nowMs - lastSeen >= REVIVE_MS && base < 1) return Math.max(base, REVIVE_WEIGHT);
  return base;
}

// topic 交集用同组双向扩展：请求 Redis 也能命中存量「缓存架构」标签的题（V0.24）
const topicOverlap = (itemTopics, wantedSet) => {
  const own = Array.isArray(itemTopics) ? itemTopics : [];
  if (wantedSet.size === 0) return true;
  return own.some((tag) => wantedSet.has(String(tag ?? '').toLowerCase()));
};

const scopeOk = (item, resumeId) =>
  item?.scope !== 'personal' || (resumeId !== '' && String(item?.origin?.resumeId ?? '') === resumeId);

/** 在候选里按有效权重随机抽一题（rng 可注入）。 */
function weightedPick(candidates, nowMs, rng) {
  const weights = candidates.map((item) => Math.max(effectiveWeight(item, nowMs), 0.0001));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return null;
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * 防背答案换发（V3 Phase C）：抽中的题已连续答对 2 次（背题风险区），
 * 且它有可用的变体题（variantOf 指向它、同 scope、不在冷却）→ 改发变体。
 * 掌握度仍挂题干（D6）：变体是独立条目，各自积累 mastery。
 */
function maybeSwapVariant(picked, all, nowMs, rng) {
  if (picked === null || picked === undefined) return picked;
  if ((Number(picked?.mastery?.streak) || 0) < 2) return picked;
  const variants = all.filter((item) =>
    item?.status !== 'removed'
    && String(item?.variantOf ?? '') === String(picked.id)
    && scopeOk(item, String(picked?.origin?.resumeId ?? ''))
    && !isCooling(item, nowMs));
  if (variants.length === 0) return picked;
  return weightedPick(variants, nowMs, rng) ?? picked;
}

/**
 * 冷启动：该 topic 池子里**零答题历史**时，按深度阶梯出题
 * （concept → mechanism → practice → scenario，取第一个有未练过题的深度）。
 */
function coldStartPick(candidates, nowMs, rng) {
  for (const kind of KINDS) {
    const fresh = candidates.filter((item) => item?.kind === kind && (Number(item?.mastery?.seen) || 0) === 0);
    if (fresh.length > 0) return { item: weightedPick(fresh, nowMs, rng), kind: kind };
  }
  return null;
}

/**
 * 采样下一题（docs/INTERVIEW-V3-PLAN.md §3.3）。
 *
 * @param {object[]} items questions 集合全量（调用方负责 ensureBankReady）
 * @param {object} opts { topics[], levels[]|level, resumeId, now, rng, kinds[], excludeIds[] }
 *   levels     级别带（练习起点难度爬升：随连对解锁上档）；省略/空 = 不限。旧 level 单值仍兼容
 *   kinds      深度带（面试模式按判定方向定向要题）；候选为空时自动放宽到全深度
 *   excludeIds 本会话已答过的题 id（面试模式同一知识点不重复出题）
 * @returns {{ item: object|null, pool: { matched: number, mode: 'cold'|'weighted'|null, relaxed: 'none'|'cooldown'|'level'|'topic', depleted: boolean, reason: string, variantSwapped: boolean } }}
 *   relaxed 记录最终用了哪一级放松；depleted=true 时调用方应触发补题。
 */
export function pickNext(items, opts = {}) {
  const all = (Array.isArray(items) ? items : []).filter((item) => item !== null && typeof item === 'object' && item.status !== 'removed');
  const wanted = expandTopics((Array.isArray(opts.topics) ? opts.topics : []).map((t) => String(t ?? '').trim()).filter((t) => t !== ''));
  // 级别带（V0.25.3 练习起点难度爬升）：levels 数组优先；旧 level 单值仍兼容
  const levels = Array.isArray(opts.levels)
    ? opts.levels.map((l) => String(l ?? '').trim()).filter((l) => l !== '')
    : (String(opts.level ?? '').trim() !== '' ? [String(opts.level).trim()] : []);
  const levelOk = (item) => levels.length === 0 || levels.includes(String(item?.level ?? ''));
  const kinds = (Array.isArray(opts.kinds) ? opts.kinds : []).filter((k) => KINDS.includes(k));
  const exclude = new Set((Array.isArray(opts.excludeIds) ? opts.excludeIds : []).map((id) => String(id)));
  const resumeId = String(opts.resumeId ?? '');
  const nowMs = toMs(opts.now ?? Date.now());
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;

  const pool = { matched: 0, mode: null, relaxed: 'none', depleted: false, reason: '', variantSwapped: false };

  // 第 0 级：topic 交集 + scope + 级别 + 排除冷却 + 排除本会话已答
  const inScope = all
    .filter((item) => !exclude.has(String(item?.id)))
    .filter((item) => topicOverlap(item?.topic, wanted) && scopeOk(item, resumeId));
  pool.matched = inScope.length;
  if (inScope.length === 0) {
    pool.depleted = true;
    pool.reason = '题库里没有匹配当前标签/简历的题';
    return { item: null, pool: pool };
  }
  const strict = inScope.filter((item) => levelOk(item) && !isCooling(item, nowMs));
  // 深度带：只对 strict 层生效（带内没题自动放宽，避免面试模式卡住）
  const banded = kinds.length > 0 ? strict.filter((item) => kinds.includes(item?.kind)) : strict;

  // 冷启动：严格池零历史 → 深度阶梯（不看冷却——没练过的题本来也不在冷却里）
  const hasHistory = inScope.some((item) => (Number(item?.mastery?.seen) || 0) > 0);
  if (!hasHistory) {
    const bandOk = (item) => kinds.length === 0 || kinds.includes(item?.kind);
    const cold = coldStartPick(inScope.filter((item) => levelOk(item) && bandOk(item)), nowMs, rng)
      ?? coldStartPick(inScope.filter(bandOk), nowMs, rng)
      ?? coldStartPick(inScope, nowMs, rng);
    if (cold !== null && cold.item !== null) {
      pool.mode = 'cold';
      // 冷启动也要报枯竭：全新知识点只有 1-2 道题时，练完就断供了
      if (inScope.length < POOL_LOW) {
        pool.depleted = true;
        pool.reason = '这个知识点还是新的，题量不足 ' + POOL_LOW + ' 道';
      }
      return { item: cold.item, pool: pool };
    }
  }

  // 热启动：候选不足或全部权重衰减到底 → 枯竭（仍照常抽，但调用方要补题）
  const weights = strict.map((item) => effectiveWeight(item, nowMs));
  if (strict.length < POOL_LOW || (weights.length > 0 && Math.max(...weights) <= WEIGHT_MIN + 0.001)) {
    pool.depleted = true;
    pool.reason = strict.length === 0 ? '该范围的可练题都在冷却中' : '这个范围的题快练完了（候选 ' + strict.length + ' 道或权重已衰减到底）';
  }
  const weightedPool = banded.length > 0 ? banded : strict;
  if (weightedPool.length > 0) {
    pool.mode = 'weighted';
    const picked = weightedPick(weightedPool, nowMs, rng);
    const swapped = maybeSwapVariant(picked, all, nowMs, rng);
    pool.variantSwapped = swapped !== picked;
    return { item: swapped, pool: pool };
  }

  // 第 1 级放松：冷却（刚练过的题也拿出来）
  pool.relaxed = 'cooldown';
  const withCooling = inScope.filter((item) => levelOk(item));
  if (withCooling.length > 0) {
    pool.mode = 'weighted';
    const picked = weightedPick(withCooling, nowMs, rng);
    const swapped = maybeSwapVariant(picked, all, nowMs, rng);
    pool.variantSwapped = swapped !== picked;
    return { item: swapped, pool: pool };
  }

  // 第 2 级放松：级别（cross-level）
  pool.relaxed = 'level';
  if (inScope.length > 0) {
    pool.mode = 'weighted';
    const picked = weightedPick(inScope, nowMs, rng);
    const swapped = maybeSwapVariant(picked, all, nowMs, rng);
    pool.variantSwapped = swapped !== picked;
    return { item: swapped, pool: pool };
  }

  // 第 3 级放松：topic 交集（scope 仍不放开——personal 题绝不外流）
  pool.relaxed = 'topic';
  const anyTopic = all.filter((item) => scopeOk(item, resumeId));
  if (anyTopic.length > 0) {
    pool.mode = 'weighted';
    const picked = weightedPick(anyTopic, nowMs, rng);
    const swapped = maybeSwapVariant(picked, all, nowMs, rng);
    pool.variantSwapped = swapped !== picked;
    return { item: swapped, pool: pool };
  }

  pool.depleted = true;
  pool.reason = '题库为空';
  return { item: null, pool: pool };
}
