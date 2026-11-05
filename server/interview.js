/**
 * 模拟面试 v2 纯逻辑层：题源出题、判定归一、报告聚合。
 * V3 Phase B 起移除错题本联动（pickReplay/syncMistake）：错题回流由题库权重采样取代。
 *
 * docs/INTERVIEW-V2-PLAN.md 的 schema 契约（第 3 节）逐字段实现在这里：
 *   题目 {questionId, source, sourceRef, tags, question, points, isReplay}
 *   判定 {verdict, missedPoints, judgedBy, judgedAt}
 *   错题 {id, source, tags, question, points, answer, verdict, missedPoints,
 *         status, addedAt, solvedAt, history}
 *
 * 本模块不依赖宿主能力（store 以参数传入），全部逻辑可离线测试。
 *
 * @module dsh-upcv-workspace/interview
 */

import { bankTopicsFor } from './bank-topics.js';
import { normalizeTags } from './interview-topics.js';
import { MOCK_INTERVIEW_BANKS } from './mock.js';
import { LEVELS, KINDS } from './bank.js';

/** 生成题的合法题源（V3 Phase B 起移除错题集：错题回流被题库权重采样取代）。 */
export const QUESTION_SOURCES = Object.freeze(['jd', 'resume']);
/** 判定结论的合法取值。 */
export const VERDICTS = Object.freeze(['pass', 'partial', 'fail']);

function newQuestionId() {
  return 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function stringList(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter((item) => item !== '').slice(0, limit);
}

/**
 * 把模型回包（或题库题目）归一成 3.1 契约形状。
 * points 缺失时回落到考察点（point）单条；tags 走同义折叠。
 * V3 起可选携带入库元数据（level/kind/concept/bestPractice），缺失时不出字段，
 * 保持旧形状字节不变（docs/INTERVIEW-V3-PLAN.md §2.1）。
 */
export function toGeneratedQuestion(raw, { source, sourceRef = null, isReplay = false }) {
  const question = String(raw?.question ?? '').trim();
  if (question === '' || !QUESTION_SOURCES.includes(source)) return null;
  const points = stringList(raw?.points);
  const point = String(raw?.point ?? '').trim();
  const level = String(raw?.level ?? '').trim();
  const kind = String(raw?.kind ?? '').trim();
  const concept = String(raw?.concept ?? '').trim();
  const bestPractice = stringList(raw?.bestPractice, 2);
  return {
    questionId: String(raw?.questionId ?? '').trim() || newQuestionId(),
    source: source,
    sourceRef: sourceRef === null || sourceRef === undefined || sourceRef === '' ? null : String(sourceRef),
    tags: normalizeTags(raw?.tags),
    question: question,
    points: points.length > 0 ? points : point === '' ? [] : [point],
    isReplay: isReplay === true,
    ...(LEVELS.includes(level) ? { level: level } : {}),
    ...(KINDS.includes(kind) ? { kind: kind } : {}),
    ...(concept !== '' ? { concept: concept } : {}),
    ...(bestPractice.length > 0 ? { bestPractice: bestPractice } : {}),
  };
}

/** 题库题与 bank-topics 标注合并成 3.1 形状（缺标注时回落到题库 point）。
 * questionId 用与题库导入一致的稳定 id（'bq-<bankId>-<题号>'），判定直接落对题库条目。 */
function bankQuestion(bankId, item, source) {
  const topics = bankTopicsFor(bankId, item?.id);
  return toGeneratedQuestion(
    {
      questionId: 'bq-' + bankId + '-' + (item?.id ?? ''),
      question: item?.question,
      point: item?.point,
      tags: topics === null ? [] : topics.t,
      points: topics === null ? [] : topics.p,
    },
    { source: source }
  );
}

/**
 * 无模型兜底：按标签就近从题库选新题（标签交集多者优先，其次按题库顺序稳定排列）。
 * 只出未掌握过的新题；回流题由调用方另行混入。
 */
export function bankQuestionsByTags(tags, count, source = 'jd') {
  const wanted = normalizeTags(tags);
  const pool = [];
  for (const bank of MOCK_INTERVIEW_BANKS) {
    for (const item of bank.questions) {
      const question = bankQuestion(bank.id, item, source);
      if (question === null) continue;
      const score = wanted.length === 0
        ? 0
        : question.tags.filter((tag) => wanted.includes(tag)).length;
      pool.push({ score: score, question: question });
    }
  }
  return pool
    .map((entry, index) => ({ ...entry, index: index }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, Math.max(0, count))
    .map((entry) => entry.question);
}

/**
 * 归一模型给出的判定；缺字段/非法值返回 null（调用方降级为用户自判，不猜结论）。
 * V3 起模型可给 hitPoints（命中的要点原文）与 betterApproach（更优解反馈）；
 * 缺失时不出字段，hitRatio 由 server/bank.js 按 missedPoints 对照要点反推。
 */
export function normalizeModelVerdict(value) {
  const verdict = String(value?.verdict ?? '').trim();
  if (!VERDICTS.includes(verdict)) return null;
  const hitPoints = stringList(value?.hitPoints);
  const better = String(value?.betterApproach ?? '').trim();
  return {
    verdict: verdict,
    missedPoints: stringList(value?.missedPoints),
    ...(hitPoints.length > 0 ? { hitPoints: hitPoints } : {}),
    ...(better !== '' ? { betterApproach: better } : {}),
  };
}

/** 组装一条判定记录（3.2）。V3 起可选携带 hitPoints / betterApproach（extra）。 */
export function makeJudgment(verdict, missedPoints, judgedBy, at, extra = {}) {
  const hitPoints = stringList(extra?.hitPoints);
  const better = String(extra?.betterApproach ?? '').trim();
  return {
    verdict: verdict,
    missedPoints: stringList(missedPoints),
    ...(hitPoints.length > 0 ? { hitPoints: hitPoints } : {}),
    ...(better !== '' ? { betterApproach: better } : {}),
    judgedBy: judgedBy === 'user' ? 'user' : 'ai',
    judgedAt: at,
  };
}

/**
 * 会话内报告聚合（纯本地，无模型也成立）：
 * verdict 分布 + 按标签聚合的薄弱点（missed 题数优先）。
 */
export function aggregateInterview(transcript, topN = 5) {
  const entries = Array.isArray(transcript) ? transcript : [];
  const dist = { pass: 0, partial: 0, fail: 0, unjudged: 0 };
  const byTag = new Map();
  for (const item of entries) {
    const verdict = item === null || typeof item !== 'object' ? null : item.verdict;
    const v = verdict !== null && typeof verdict === 'object' ? String(verdict.verdict ?? '') : '';
    if (VERDICTS.includes(v)) dist[v] += 1;
    else dist.unjudged += 1;
    const tags = normalizeTags(item?.tags);
    if (tags.length === 0 || !VERDICTS.includes(v)) continue;
    for (const tag of tags) {
      const slot = byTag.get(tag) ?? { tag: tag, total: 0, missed: 0 };
      slot.total += 1;
      if (v !== 'pass') slot.missed += 1;
      byTag.set(tag, slot);
    }
  }
  const weakTags = [...byTag.values()]
    .sort((a, b) => (b.missed - a.missed) || (b.total - a.total) || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(1, topN));
  return { verdictDist: dist, weakTags: weakTags, judgedCount: dist.pass + dist.partial + dist.fail };
}

/**
 * 无模型（或模型失败）时的本地报告：沿用旧启发式评分，并叠加 v2 聚合与错题去向。
 * 旧会话（transcript 无 verdict 字段）完全兼容：聚合全落 unjudged，评分走长度启发式。
 */
export function buildLocalReport(transcript, options = {}) {
  const entries = Array.isArray(transcript) ? transcript : [];
  const answers = entries.map((item) => String(item?.answer ?? ''));
  const total = answers.reduce((sum, text) => sum + text.length, 0);
  const avgLen = answers.length === 0 ? 0 : total / answers.length;

  const judged = entries.filter((item) => item?.verdict !== null && item?.verdict !== undefined && typeof item.verdict === 'object');
  const passRate = judged.length === 0
    ? null
    : judged.filter((item) => item.verdict.verdict === 'pass').length / judged.length;
  // 有判定时专业分直接来自 pass 率；无判定沿用旧的长度启发式
  const professionalism = passRate === null
    ? Math.max(45, Math.min(92, Math.round(45 + avgLen / 3)))
    : Math.round(passRate * 100);

  const structure = Math.round(
    (answers.filter((text) => /我|项目|结果|数据|提升|降低|用户|负责/.test(text)).length / Math.max(1, answers.length)) * 20 + 62
  );
  const overall = passRate === null
    ? Math.round((professionalism + structure) / 2)
    : Math.round((professionalism * 2 + structure) / 3);

  const aggregation = aggregateInterview(entries, options.topN ?? 5);

  const strengths = [];
  const suggestions = [];
  if (aggregation.verdictDist.pass > 0) strengths.push('有 ' + aggregation.verdictDist.pass + ' 题一次答对，相关知识点掌握扎实');
  if (avgLen >= 60) strengths.push('回答有足够细节，能展开说明背景与做法');
  if (strengths.length === 0) strengths.push('能完整作答，态度认真');
  if (aggregation.weakTags.length > 0) {
    suggestions.push('优先补薄弱点：' + aggregation.weakTags.map((slot) => slot.tag).join('、'));
  }
  suggestions.push(avgLen < 60 ? '回答偏短，建议每题至少覆盖「背景—做法—结果」三层信息' : '回答长度合适，可以进一步突出个人贡献');
  if (aggregation.verdictDist.unjudged > 0) suggestions.push('还有 ' + aggregation.verdictDist.unjudged + ' 题未判定，判完再看薄弱点更准');

  const perQuestion = entries.map((item, index) => {
    const v = item?.verdict;
    const missed = v !== null && typeof v === 'object' ? v.missedPoints ?? [] : [];
    if (missed.length > 0) return { index: index + 1, comment: '缺失要点：' + missed.join('；') };
    if (v !== null && typeof v === 'object' && v.verdict === 'pass') return { index: index + 1, comment: '要点覆盖完整。' };
    return { index: index + 1, comment: String(item?.answer ?? '').length < 40 ? '回答较短，可补充细节与结果。' : '回答较完整，可再强调量化成果。' };
  });

  return {
    overall: overall,
    communication: structure,
    professionalism: professionalism,
    logic: structure,
    strengths: strengths.slice(0, 3),
    suggestions: suggestions.slice(0, 5),
    perQuestion: perQuestion,
    verdictDist: aggregation.verdictDist,
    weakTags: aggregation.weakTags,
  };
}
