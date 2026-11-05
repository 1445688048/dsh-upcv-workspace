/**
 * 题库生成闭环（interview V3 Phase B，docs/INTERVIEW-V3-PLAN.md §6）：
 * 简历知识点提取与 diff、按知识点分批生成（同步，客户端驱动进度）、
 * 后台补题队列（池子枯竭自动触发 + 题库页手动扩充）。
 *
 * 去重一律走 server/bank-dedup（经 ingestQuestions 入库）；
 * 生成 prompt 自带「已有题干」供给作为预防层。
 *
 * @module dsh-upcv-workspace/bank-gen
 */

import { callModelJson, aiMessageFor, profileFor } from './llm.js';
import { promptErrorMessage, renderMessages } from './prompts.js';
import { normalizeTags, topicDigest } from './interview-topics.js';
import { ingestQuestions } from './bank.js';
import { existingStemsForPrompt } from './bank-dedup.js';

const KIND_OPTIONS = ['concept', 'mechanism', 'practice', 'scenario'];
const LEVEL_OPTIONS = ['junior', 'mid', 'senior'];

const promptMessage = (error) => {
  const friendly = promptErrorMessage(error);
  if (friendly !== null) return friendly;
  return error instanceof Error ? error.message : String(error);
};

/** bank-generate 的硬校验：必须是数组且非空。 */
function bankArrayValidator(value) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.questions) ? value.questions : null;
  if (list === null) return { ok: false, reason: '回包不是题目数组（应为 JSON 数组或 {questions:[...]}）。' };
  if (list.length === 0) return { ok: false, reason: '回包的题目数组为空。' };
  return null;
}

// ── 知识点提取与 diff ────────────────────────────────────────────

/**
 * 从简历提取知识点（POST /bank/kg）。只提取不生成，返回待用户确认的清单。
 * @returns {Promise<{ summary: string, points: {tag,note}[], provider, model } | { error, message }>}
 */
export async function extractKnowledgePoints(llm, input = {}) {
  const resumeText = String(input.resumeText ?? '').trim();
  if (resumeText === '') return { error: 'source-material-required', message: '请先选择一份已保存的简历。' };
  let messages;
  try {
    messages = renderMessages('bank-kg', { resumeText: resumeText, topics: topicDigest(5) });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }
  const result = await callModelJson(llm, messages, {
    ...profileFor('bank-kg'),
    ...(input.options ?? {}),
    validate: (value) => {
      const points = Array.isArray(value?.points) ? value.points : [];
      const valid = points.filter((item) => String(item?.tag ?? '').trim() !== '');
      if (valid.length === 0) return { ok: false, reason: '回包里没有可用的知识点（points 为空或缺 tag）。' };
      return null;
    },
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }
  const seen = new Set();
  // V0.24：两类知识点——direct（简历明面，具体技术）+ related（关联基础：伴考点 + 岗位通用八股）
  const direct = [];
  const related = [];
  for (const item of Array.isArray(result.value.points) ? result.value.points : []) {
    const tag = normalizeTags([item?.tag])[0] ?? '';
    if (tag === '' || seen.has(tag)) continue;
    const point = { tag: tag, note: String(item?.note ?? '').trim(), source: item?.source === 'related' ? 'related' : 'direct' };
    seen.add(tag);
    if (point.source === 'related') { if (related.length < 8) related.push(point); }
    else if (direct.length < 10) direct.push(point);
  }
  return {
    summary: String(result.value.summary ?? '').trim(),
    points: direct.concat(related),
    provider: result.provider,
    model: result.model,
  };
}

/**
 * 知识点 diff（简历更新增量，D3）：extracted 里有而 stored 里没有的算新增。
 * 按 tag（规范化后）比对。
 */
export function diffKnowledgePoints(extracted, stored) {
  const storedTags = new Set((Array.isArray(stored) ? stored : []).map((item) => String(item?.tag ?? '').trim()).filter((t) => t !== ''));
  const all = (Array.isArray(extracted) ? extracted : []).filter((item) => String(item?.tag ?? '').trim() !== '');
  const added = all.filter((item) => !storedTags.has(String(item.tag).trim()));
  return { added: added, all: all, unchanged: all.length - added.length };
}

// ── 按知识点生成（同步分批，客户端驱动进度）─────────────────────

/**
 * 给一个知识点出一批覆盖深度阶梯的题（prompts/bank-generate.md）。
 * @param {object} input { topic, note?, resumeText?, existingText?, count?, options? }
 * @returns {Promise<{ questions: object[], provider?, model?, attempts? } | { error, message }>}
 */
export async function generateForPoint(llm, input = {}) {
  const topic = String(input.topic ?? '').trim();
  if (topic === '') return { error: 'bank-topic-required', message: '缺少知识点标签，无法出题。' };
  const count = Math.max(1, Math.min(12, Number(input.count) || 8));
  const stems = Array.isArray(input.existingText) ? input.existingText : [];
  const existing = stems.length > 0 ? stems.map((s, i) => (i + 1) + '. ' + s).join('\n') : '（暂无，这是该知识点的前几道题）';

  // V0.22 取消 personal 机制：题库是纯通用资产，简历只提供知识点标签（出题不再注入简历内容）
  return callGenerateTemplate(llm, {
    template: 'bank-generate',
    variables: {
      topic: topic,
      note: String(input.note ?? '').trim() || '（无）',
      existing: existing,
      count: count,
      topics: topicDigest(5),
    },
    fallbackTopic: topic,
    enforce: {},
    options: input.options ?? {},
  });
}

/**
 * 一批生成的题入库（dedup 闸门在 ingestQuestions 里）。
 * personal 题只在带 resumeId 时成立；scope 由 ingest 按 personal 标记判定。
 * 变体题传 bypassSimilarity + variantOf（与原题考点相同是刻意的，见 prompts/bank-variant.md）。
 */
export function ingestGenerated(store, questions, { via = 'replenish', resumeId = '', now, bypassSimilarity = false, variantOf = '' } = {}) {
  return ingestQuestions(store, Array.isArray(questions) ? questions : [], { via: via, resumeId: resumeId, now: now, bypassSimilarity: bypassSimilarity, variantOf: variantOf });
}

// ── Phase C：连错降阶 / bestPractice 缺口补题 / 考点变体 ─────────

/**
 * 共用的模板生成 + 归一（scaffold/gap/variant 用）。
 * enforce 兜底 kind/level；这三类题一律 personal=false（不绑简历）。
 */
async function callGenerateTemplate(llm, { template, variables, count, fallbackTopic = '', enforce = {}, options = {} }) {
  let messages;
  try {
    messages = renderMessages(template, variables);
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }
  const result = await callModelJson(llm, messages, {
    ...profileFor(template),
    ...options,
    validate: bankArrayValidator,
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }
  const list = Array.isArray(result.value) ? result.value : Array.isArray(result.value?.questions) ? result.value.questions : [];
  const questions = [];
  for (const item of list) {
    const text = String(item?.question ?? '').trim();
    if (text === '') continue;
    const tags = normalizeTags(item?.tags);
    questions.push({
      questionId: 'bg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      question: text,
      tags: tags.length > 0 ? tags : (fallbackTopic !== '' ? [fallbackTopic] : []),
      concept: String(item?.concept ?? '').trim(),
      points: (Array.isArray(item?.points) ? item.points : []).map((p) => String(p ?? '').trim()).filter((p) => p !== ''),
      bestPractice: (Array.isArray(item?.bestPractice) ? item.bestPractice : []).map((p) => String(p ?? '').trim()).filter((p) => p !== '').slice(0, 2),
      level: LEVEL_OPTIONS.includes(item?.level) ? item.level : (enforce.level ?? 'mid'),
      kind: KIND_OPTIONS.includes(item?.kind) ? item.kind : (enforce.kind ?? 'concept'),
    });
  }
  return { questions: questions, provider: result.provider, model: result.model, attempts: result.attempts };
}

/** 台阶题（连错降阶）：concept/junior 的前置知识题。 */
export async function generateScaffold(llm, input = {}) {
  const topic = String(input.topic ?? '').trim();
  if (topic === '') return { error: 'bank-topic-required', message: '缺少知识点标签。' };
  const stems = Array.isArray(input.existingText) ? input.existingText : [];
  return callGenerateTemplate(llm, {
    template: 'bank-scaffold',
    variables: {
      question: String(input.question ?? ''),
      topic: topic,
      missedPoints: (Array.isArray(input.missedPoints) ? input.missedPoints : []).map((s, i) => (i + 1) + '. ' + s).join('\n') || '（未记录）',
      existing: stems.length > 0 ? stems.map((s, i) => (i + 1) + '. ' + s).join('\n') : '（暂无）',
      count: Math.max(1, Math.min(3, Number(input.count) || 2)),
    },
    fallbackTopic: topic,
    enforce: { kind: 'concept', level: 'junior' },
    options: input.options ?? {},
  });
}

/** 缺口专题题（bestPractice 缺口）：practice 层的生产权衡题。 */
export async function generateGap(llm, input = {}) {
  const topic = String(input.topic ?? '').trim();
  if (topic === '') return { error: 'bank-topic-required', message: '缺少知识点标签。' };
  const stems = Array.isArray(input.existingText) ? input.existingText : [];
  return callGenerateTemplate(llm, {
    template: 'bank-gap',
    variables: {
      topic: topic,
      gaps: (Array.isArray(input.gaps) ? input.gaps : []).map((s, i) => (i + 1) + '. ' + s).join('\n') || '（未记录）',
      existing: stems.length > 0 ? stems.map((s, i) => (i + 1) + '. ' + s).join('\n') : '（暂无）',
      count: Math.max(1, Math.min(3, Number(input.count) || 2)),
    },
    fallbackTopic: topic,
    enforce: { kind: 'practice', level: 'senior' },
    options: input.options ?? {},
  });
}

/** 变体题（防背答案）：考点与判定要点原样保留，换问法换场景。 */
export async function generateVariant(llm, input = {}) {
  const topic = String(input.topic ?? '').trim();
  const points = (Array.isArray(input.points) ? input.points : []).map((p) => String(p ?? '').trim()).filter((p) => p !== '');
  if (topic === '' || points.length === 0) return { error: 'bank-topic-required', message: '变体题需要知识点标签与判定要点。' };
  const stems = Array.isArray(input.existingText) ? input.existingText : [];
  const result = await callGenerateTemplate(llm, {
    template: 'bank-variant',
    variables: {
      question: String(input.question ?? ''),
      points: points.map((p, i) => (i + 1) + '. ' + p).join('\n'),
      topic: topic,
      existing: stems.length > 0 ? stems.map((s, i) => (i + 1) + '. ' + s).join('\n') : '（暂无）',
      count: 1,
    },
    fallbackTopic: topic,
    enforce: {},
    options: input.options ?? {},
  });
  // 判定要点与考点原样覆盖：变体考的是同一个考点
  if (result.questions !== undefined) {
    for (const q of result.questions) {
      q.points = points;
      if (String(input.concept ?? '').trim() !== '') q.concept = String(input.concept).trim();
      if (Array.isArray(input.bestPractice) && input.bestPractice.length > 0) q.bestPractice = input.bestPractice.map((p) => String(p)).slice(0, 2);
    }
  }
  return result;
}

/** 某 topic 下 betterApproach 缺口的总次数（含全部题的判定历史）。 */
export function countBetterApproachGaps(store, topics) {
  const wanted = normalizeTags(topics);
  const items = Array.isArray(store.list('questions').items) ? store.list('questions').items : [];
  let count = 0;
  for (const item of items) {
    const own = normalizeTags(item?.topic);
    if (wanted.length > 0 && !own.some((tag) => wanted.includes(tag))) continue;
    const history = Array.isArray(item?.mastery?.history) ? item.mastery.history : [];
    for (const row of history) {
      if (String(row?.betterApproach ?? '').trim() !== '') count += 1;
    }
  }
  return count;
}

/** 某道题是否已有变体（防重复生成）。 */
export function hasVariant(store, questionId) {
  const items = Array.isArray(store.list('questions').items) ? store.list('questions').items : [];
  return items.some((item) => item !== null && typeof item === 'object' && item.status !== 'removed' && String(item?.variantOf ?? '') === String(questionId));
}

// ── 后台生成队列（扩充 / 降阶 / 缺口 / 变体，Phase B+C）──────────

const genQueue = { tasks: [], running: false, completed: 0, lastError: '', lastDoneAt: '', gapQueuedAt: new Map() };
/** 待处理任务上限：防止判定风暴把队列塞爆。 */
export const QUEUE_MAX_PENDING = 8;

/** 队列状态（GET /bank/status）。 */
export function queueStatus() {
  return {
    running: genQueue.running,
    pending: genQueue.tasks.length,
    completed: genQueue.completed,
    lastError: genQueue.lastError,
    lastDoneAt: genQueue.lastDoneAt,
  };
}

const TASK_TYPES = ['replenish', 'scaffold', 'gap', 'variant'];

/**
 * 入队一个生成任务（异步后台跑，不阻塞响应）。
 * task: { type?: 'replenish'|'scaffold'|'gap'|'variant', ... }
 *   replenish: { topics | topic, level?, count? }
 *   scaffold:  { question: 题干, topic, missedPoints: string[] }
 *   gap:       { topic, gaps: string[] }
 *   variant:   { questionId, question: 题干, topic, points: string[], bestPractice?: string[] }
 */
export function enqueueGenerate(store, llm, available, task) {
  const type = TASK_TYPES.includes(task?.type) ? task.type : 'replenish';
  let normalized = null;
  if (type === 'scaffold') {
    const topic = String(task?.topic ?? '').trim() || (normalizeTags(task?.tags)[0] ?? '');
    if (topic === '' || String(task?.question ?? '').trim() === '') return { error: 'bank-topic-required', message: '降阶任务缺少题干或知识点。' };
    normalized = { type: type, question: String(task.question).trim(), topic: topic, missedPoints: (Array.isArray(task.missedPoints) ? task.missedPoints : []).map(String).slice(0, 4) };
  } else if (type === 'gap') {
    const topic = String(task?.topic ?? '').trim() || (normalizeTags(task?.topics)[0] ?? '');
    if (topic === '') return { error: 'bank-topic-required', message: '缺口任务缺少知识点。' };
    // 防重复：同一 topic 只在缺口计数**增长**后才再次入队（内存记录，重启丢失最多重复入队一次，无害）
    const seenAt = genQueue.gapQueuedAt.get(topic) ?? 0;
    if ((Number(task?.gapCount) || 0) <= seenAt) return { queued: false, pending: genQueue.tasks.length, skipped: 'gap-already-queued' };
    genQueue.gapQueuedAt.set(topic, Number(task.gapCount) || 0);
    normalized = { type: type, topic: topic, gaps: (Array.isArray(task.gaps) ? task.gaps : []).map(String).slice(0, 4) };
  } else if (type === 'variant') {
    const topic = String(task?.topic ?? '').trim() || (normalizeTags(task?.tags)[0] ?? '');
    const points = (Array.isArray(task?.points) ? task.points : []).map((p) => String(p).trim()).filter((p) => p !== '');
    if (topic === '' || points.length === 0 || String(task?.question ?? '').trim() === '') return { error: 'bank-topic-required', message: '变体任务缺少题干、知识点或判定要点。' };
    normalized = { type: type, questionId: String(task?.questionId ?? ''), question: String(task.question).trim(), topic: topic, points: points, bestPractice: (Array.isArray(task?.bestPractice) ? task.bestPractice : []).map(String).slice(0, 2), concept: String(task?.concept ?? '').trim() };
  } else {
    const topics = Array.isArray(task?.topics) ? task.topics.map((t) => String(t).trim()).filter((t) => t !== '')
      : String(task?.topic ?? '').trim() !== '' ? [String(task.topic).trim()] : [];
    if (topics.length === 0) return { error: 'bank-topic-required', message: '扩充任务缺少知识点标签。' };
    normalized = { type: 'replenish', topics: topics, level: String(task?.level ?? ''), count: Math.max(1, Math.min(12, Number(task?.count) || 8)) };
  }
  if (genQueue.tasks.length >= QUEUE_MAX_PENDING) {
    return { error: 'queue-full', message: '生成队列已满（' + QUEUE_MAX_PENDING + ' 个任务），稍后再试。' };
  }
  genQueue.tasks.push(normalized);
  if (genQueue.running !== true) void drainGenerateQueue(store, llm, available);
  return { queued: true, pending: genQueue.tasks.length };
}

async function drainGenerateQueue(store, llm, available) {
  genQueue.running = true;
  while (genQueue.tasks.length > 0) {
    const task = genQueue.tasks.shift();
    let done = false;
    let lastError = '';
    // 失败重试 1 次：模型偶发回包解析失败，重试通常能过（与 callModelJson 的 retries 语义对齐）
    for (let attempt = 0; attempt < 2 && done === false; attempt += 1) {
      try {
        const result = await runGenerateTask(store, llm, available, task);
        genQueue.completed += 1;
        genQueue.lastError = '';
        genQueue.lastAdded = result.added;
        done = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (done === false) genQueue.lastError = lastError;
  }
  genQueue.running = false;
  genQueue.lastDoneAt = new Date().toISOString();
}

/** 任务分发。 */
async function runGenerateTask(store, llm, available, task) {
  if (available !== true) return { added: 0, skipped: 'no-model' };
  const now = new Date().toISOString();
  const read = store.list('questions');
  const allItems = Array.isArray(read.items) ? read.items : [];
  if (task.type === 'scaffold') {
    const stems = existingStemsForPrompt(allItems, [task.topic], 30);
    const result = await generateScaffold(llm, { question: task.question, topic: task.topic, missedPoints: task.missedPoints, existingText: stems, count: 2 });
    if (result.error !== undefined) throw new Error(result.message);
    const ingested = ingestGenerated(store, result.questions, { via: 'scaffold', now: now });
    return { added: ingested.items.length };
  }
  if (task.type === 'gap') {
    const stems = existingStemsForPrompt(allItems, [task.topic], 30);
    const result = await generateGap(llm, { topic: task.topic, gaps: task.gaps, existingText: stems, count: 2 });
    if (result.error !== undefined) throw new Error(result.message);
    const ingested = ingestGenerated(store, result.questions, { via: 'gap', now: now });
    return { added: ingested.items.length };
  }
  if (task.type === 'variant') {
    const stems = existingStemsForPrompt(allItems, [task.topic], 30);
    const result = await generateVariant(llm, { question: task.question, topic: task.topic, points: task.points, bestPractice: task.bestPractice, concept: task.concept, existingText: stems });
    if (result.error !== undefined) throw new Error(result.message);
    const ingested = ingestGenerated(store, result.questions, { via: 'variant', now: now, bypassSimilarity: true, variantOf: task.questionId });
    return { added: ingested.items.length };
  }
  // replenish（Phase B）
  const stems = existingStemsForPrompt(allItems, task.topics, 30);
  const result = await generateForPoint(llm, {
    topic: task.topics.join('、'),
    note: '题库扩充（该知识点题量不足或权重已衰减）',
    existingText: stems,
    count: task.count,
  });
  if (result.error !== undefined) throw new Error(result.message);
  const ingested = ingestGenerated(store, result.questions, { via: 'replenish', now: now });
  return { added: ingested.items.length, skipped: ingested.skipped.length };
}
