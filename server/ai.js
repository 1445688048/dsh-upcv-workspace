/**
 * AI 生成层：把业务输入组装成 messages，调用宿主 llm，做硬校验与归一。
 *
 * 所有模型流量都经 server/llm.js 的 callModelJson（带超时 / 重试 / 解析容错）。
 * 失败一律返回 { error, message }，由路由层决定 HTTP 状态码，**不假装成功**。
 *
 * @module dsh-upcv-workspace/ai
 */

import { callModelJson, aiMessageFor, profileFor } from './llm.js';
import { promptErrorMessage, renderMessages } from './prompts.js';
import { normalizeResume } from './resume-schema.js';
import { normalizeTags, topicDigest } from './interview-topics.js';
import { toGeneratedQuestion, normalizeModelVerdict } from './interview.js';

/** 把 prompts 加载/渲染失败转成业务错误消息；不吞错，交由路由层映射状态码。 */
function promptMessage(error) {
  const friendly = promptErrorMessage(error);
  if (friendly !== null) return friendly;
  return error instanceof Error ? error.message : String(error);
}

/** 题库生成的硬校验：必须是数组且非空。 */
function questionArrayValidator(value) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.questions) ? value.questions : null;
  if (list === null) return { ok: false, reason: '回包不是题目数组（应为 JSON 数组或 {questions:[...]}）。' };
  if (list.length === 0) return { ok: false, reason: '回包的题目数组为空。' };
  return null;
}

/**
 * 把模型回包归一成 3.1 契约形状（questionId/source/sourceRef/tags/question/points/isReplay），
 * 丢弃无法使用的条目并记录问题；tags 走同义折叠，points 缺失回落 point 单条。
 */
export function normalizeGeneratedQuestions(raw, { source, sourceRef = null }) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.questions) ? raw.questions : [];
  const questions = [];
  const problems = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') { problems.push('非对象题目已丢弃'); continue; }
    const question = toGeneratedQuestion(item, { source: source, sourceRef: sourceRef });
    if (question === null) { problems.push('空题干已丢弃'); continue; }
    if (question.points.length === 0) problems.push('题目「' + question.question.slice(0, 20) + '…」缺少判定要点，已补综合要点');
    if (question.points.length === 0) question.points.push('能给出具体、可核对的回答');
    questions.push(question);
  }
  return { questions: questions, problems: problems };
}

/** 出题模板 id（与 prompts/_manifest.json 的条目一一对应）。 */
const SOURCE_TEMPLATES = Object.freeze({
  jd: 'interview-questions-jd',
  resume: 'interview-questions-resume',
});

/**
 * 按题源生成新题（docs/INTERVIEW-V2-PLAN.md 5.1 的「新题补足」步骤）。
 * 入参由路由层准备：jd → jdText；resume → resumeText。
 * V3 Phase B 起移除错题集题源（错题回流由题库权重采样取代）。
 * @returns {Promise<{ questions: object[], provider?, model?, attempts?, problems?: string[] } | { error: string, message?: string, problems?: string[] }>}
 */
export async function generateSourceQuestions(llm, input = {}) {
  const source = String(input.source ?? '');
  const template = SOURCE_TEMPLATES[source];
  if (template === undefined) return { error: 'source-required', message: '请先选择题源（岗位 JD / 简历）。' };
  const count = Math.max(1, Math.min(15, Number(input.count) || 8));
  const tags = normalizeTags(input.tags);

  let material;
  if (source === 'jd') {
    const jdText = String(input.jdText ?? '').trim();
    if (jdText === '') return { error: 'source-material-required', message: '题源是岗位 JD，请选择库内岗位或粘贴 JD 原文。' };
    material = { jdText: jdText };
  } else {
    const resumeText = String(input.resumeText ?? '').trim();
    if (resumeText === '') return { error: 'source-material-required', message: '题源是简历，请先选择一份已保存的简历。' };
    material = { resumeText: resumeText };
  }

  let messages;
  try {
    messages = renderMessages(template, {
      ...material,
      tags: tags.length > 0 ? tags.join('、') : '（不限，按题源内容选择最核心的考点）',
      topics: topicDigest(5),
      count: count,
    });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }

  const result = await callModelJson(llm, messages, {
    ...profileFor(template),
    ...(input.options ?? {}),
    validate: questionArrayValidator,
  });
  if (result.error !== undefined) {
    return {
      error: result.error,
      message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : ''),
      ...(Array.isArray(result.problems) ? { problems: result.problems } : {}),
    };
  }
  const normalized = normalizeGeneratedQuestions(result.value, { source: source, sourceRef: input.sourceRef ?? null });
  if (normalized.questions.length === 0) {
    return { error: 'ai-empty', message: aiMessageFor('ai-empty'), problems: normalized.problems };
  }
  return {
    questions: normalized.questions.slice(0, count),
    problems: normalized.problems,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}

/** 简历生成：至少要解析出姓名或一段经历，否则视为失败。 */
function resumeValidator(value) {
  const name = String(value == null || value.basics == null ? '' : value.basics.name == null ? '' : value.basics.name).trim();
  const work = Array.isArray(value == null ? undefined : value.work) ? value.work.length : 0;
  const projects = Array.isArray(value == null ? undefined : value.projects) ? value.projects.length : 0;
  const education = Array.isArray(value == null ? undefined : value.education) ? value.education.length : 0;
  if (name === '' && work === 0 && projects === 0 && education === 0) {
    return { ok: false, reason: '回包里既没有姓名也没有任何经历，生成结果不可用。' };
  }
  return null;
}

/**
 * 简历生成/优化：原始素材 → 对准目标岗位的 JSON Resume → 我们的 schema。
 * 与导入共用 normalizeResume，所以生成出来的简历和导入的一样可以在编辑器里逐项修改。
 */
export async function optimizeResume(llm, input = {}) {
  const targetJob = String(input.targetJob == null ? '' : input.targetJob).trim();
  if (targetJob === '') return { error: 'target-job-required', message: '请先填写目标岗位。' };
  const name = String(input.name == null ? '' : input.name).trim() || '候选人';

  let messages;
  try {
    messages = renderMessages('resume-optimize', {
      targetJob: targetJob,
      name: name,
      experience: String(input.experience == null ? '' : input.experience).trim() || '（未提供）',
      project: String(input.project == null ? '' : input.project).trim() || '（未提供）',
      skills: String(input.skills == null ? '' : input.skills).trim() || '（未提供）',
      education: String(input.education == null ? '' : input.education).trim() || '（未提供）',
    });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }

  const result = await callModelJson(llm, messages, {
    ...profileFor('resume-optimize'),
    ...(input.options == null ? {} : input.options),
    validate: resumeValidator,
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }
  const normalized = normalizeResume(result.value);
  return {
    resume: normalized.resume,
    problems: normalized.problems,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}

/** 面试报告：根据问答生成结构化评分。 */
export async function generateInterviewReport(llm, input = {}) {
  const jobTitle = String(input.jobTitle ?? '').trim() || '目标岗位';
  const transcript = Array.isArray(input.transcript) ? input.transcript : [];
  const usable = transcript.filter((item) => String(item?.answer ?? '').trim() !== '');
  if (usable.length === 0) return { error: 'no-answer', message: '还没有作答内容，无法生成报告。' };

  const lines = [];
  usable.forEach((item, index) => {
    lines.push('第' + (index + 1) + '题：' + String(item.question ?? ''));
    lines.push('考察点：' + String(item.point ?? '未标注'));
    const tags = Array.isArray(item.tags) && item.tags.length > 0 ? '标签：' + item.tags.join('、') : null;
    if (tags !== null) lines.push(tags);
    if (item.verdict !== null && typeof item.verdict === 'object') {
      const missed = Array.isArray(item.verdict.missedPoints) && item.verdict.missedPoints.length > 0
        ? '（缺失：' + item.verdict.missedPoints.join('；') + '）'
        : '';
      lines.push('判定：' + String(item.verdict.verdict ?? '未判定') + missed);
    }
    lines.push('候选人回答：' + String(item.answer));
    lines.push('');
  });

  let messages;
  try {
    messages = renderMessages('interview-report', { jobTitle: jobTitle, transcript: lines.join('\n') });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }

  const profile = profileFor('interview-report');
  const result = await callModelJson(llm, messages, {
    ...profile,
    ...(input.options ?? {}),
    validate: (value) => {
      const overall = Number(value?.overall);
      if (!Number.isFinite(overall)) return { ok: false, reason: '回包缺少数值型 overall 字段。' };
      return null;
    },
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }
  const value = result.value;
  const clamp = (input) => {
    const num = Number(input);
    return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : 0;
  };
  return {
    report: {
      overall: clamp(value.overall),
      communication: clamp(value.communication),
      professionalism: clamp(value.professionalism),
      logic: clamp(value.logic),
      strengths: Array.isArray(value.strengths) ? value.strengths.map((item) => String(item)) : [],
      suggestions: Array.isArray(value.suggestions) ? value.suggestions.map((item) => String(item)) : [],
      perQuestion: Array.isArray(value.perQuestion)
        ? value.perQuestion.map((item) => ({ index: Number(item?.index) || 0, comment: String(item?.comment ?? '') }))
        : [],
    },
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}

/** JD 对齐：硬校验（要有要求清单和 ATS 分）。 */
function jdValidator(value) {
  const requirements = Array.isArray(value?.requirements) ? value.requirements : null;
  if (requirements === null || requirements.length === 0) return { ok: false, reason: '回包缺少 requirements 数组。' };
  if (!Number.isFinite(Number(value?.atsScore))) return { ok: false, reason: '回包缺少数值型 atsScore。' };
  return null;
}

const clampScore = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : 0;
};

/**
 * JD 对齐：把 JD 拆成可核对的要求，逐条对照简历判断覆盖，给出关键词命中/缺失与改写建议。
 * 与「简历优化」的区别：优化是改写文风，对齐是**核对覆盖**——先说缺什么，再说怎么改。
 */
export async function alignJd(llm, input = {}) {
  const jdText = String(input.jdText ?? '').trim();
  if (jdText === '') return { error: 'jd-text-required', message: '请先粘贴岗位 JD 原文。' };
  const targetJob = String(input.targetJob ?? '').trim() || '目标岗位';
  const resumeText = String(input.resumeText ?? '').trim() || '（候选人暂未提供简历内容）';

  let messages;
  try {
    messages = renderMessages('jd-align', { targetJob: targetJob, jdText: jdText, resumeText: resumeText });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }

  const result = await callModelJson(llm, messages, {
    ...profileFor('jd-align'),
    ...(input.options ?? {}),
    validate: jdValidator,
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }

  const value = result.value;
  const requirements = (Array.isArray(value.requirements) ? value.requirements : [])
    .map((item, index) => ({
      id: String(item?.id ?? 'r' + (index + 1)),
      text: String(item?.text ?? '').trim(),
      type: item?.type === 'nice' ? 'nice' : 'must',
      keywords: Array.isArray(item?.keywords) ? item.keywords.map((k) => String(k)).slice(0, 6) : [],
    }))
    .filter((item) => item.text !== '');

  const known = new Set(requirements.map((item) => item.id));
  const coverageInput = (Array.isArray(value.coverage) ? value.coverage : [])
    .filter((item) => known.has(String(item?.requirementId ?? '')));
  const coverageById = new Map(coverageInput.map((item) => [String(item.requirementId), item]));
  // 每条要求都必须有覆盖结论：模型漏给的按「未命中、需人工判断」补齐，不假装命中
  const coverage = requirements.map((requirement) => {
    const item = coverageById.get(requirement.id);
    if (item === undefined) {
      return { requirementId: requirement.id, matched: false, evidence: '', suggestion: '模型没有给出这条要求的判断，需要人工复核。' };
    }
    return {
      requirementId: requirement.id,
      matched: item.matched === true,
      evidence: String(item.evidence ?? '').trim(),
      suggestion: String(item.suggestion ?? '').trim(),
    };
  });

  const matchedCount = coverage.filter((item) => item.matched).length;
  return {
    alignment: {
      targetJob: targetJob,
      requirements: requirements,
      coverage: coverage,
      keywordHits: (Array.isArray(value.keywordHits) ? value.keywordHits : []).map((k) => String(k)).slice(0, 40),
      keywordMisses: (Array.isArray(value.keywordMisses) ? value.keywordMisses : []).map((k) => String(k)).slice(0, 40),
      atsScore: clampScore(value.atsScore),
      summary: String(value.summary ?? ''),
      rewriteSuggestions: (Array.isArray(value.rewriteSuggestions) ? value.rewriteSuggestions : []).map((s) => String(s)).slice(0, 10),
      stats: { total: requirements.length, matched: matchedCount, missed: requirements.length - matchedCount },
    },
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}

/** 追问决策：硬校验。type=next 时允许（不强制）带判定结论，判定归一交给调用方。 */
function stepValidator(value) {
  const type = value?.type;
  if (type !== 'followup' && type !== 'next') return { ok: false, reason: 'type 必须是 followup 或 next。' };
  if (String(value?.question ?? '').trim() === '') return { ok: false, reason: 'question 不能为空。' };
  return null;
}

/**
 * 面试追问 v2：根据最近一轮问答，决定「深挖追问（最多两层）」还是「推进下一题」。
 * 推进时模型必须对照 points 给出判定（verdict/missedPoints）；判定缺字段或非法时
 * 返回 verdict: null —— 调用方降级为用户自判，**不猜结论**。
 */
export async function nextInterviewStep(llm, input = {}) {
  const jobTitle = String(input.jobTitle ?? '').trim() || '目标岗位';
  const asked = Array.isArray(input.asked) ? input.asked.map((q) => String(q)).filter((q) => q !== '') : [];
  const transcript = Array.isArray(input.transcript) ? input.transcript : [];
  const last = transcript[transcript.length - 1] ?? {};
  const remaining = Math.max(0, Number(input.remaining) || 0);
  const followupsUsed = Math.max(0, Math.min(2, Number(input.followupsUsed) || 0));
  const points = Array.isArray(input.points) ? input.points.map((p) => String(p)).filter((p) => p.trim() !== '') : [];

  if (String(last.answer ?? '').trim() === '') {
    return { error: 'no-answer', message: '还没有作答内容，无法决定下一步。' };
  }

  const askedText = asked.length === 0
    ? '（这是第一题）'
    : asked.map((question, index) => (index + 1) + '. ' + question).join('\n');
  const transcriptText = [
    '题目：' + String(last.question ?? ''),
    '考察点：' + String(last.point ?? '未标注'),
    '候选人回答：' + String(last.answer ?? ''),
  ].join('\n');
  const bestPractice = (Array.isArray(input.bestPractice) ? input.bestPractice : [])
    .map((p) => String(p ?? '').trim())
    .filter((p) => p !== '');

  let messages;
  try {
    messages = renderMessages('interview-followup', {
      jobTitle: jobTitle,
      currentQuestion: String(input.currentQuestion ?? last.question ?? ''),
      points: points.length > 0 ? points.map((p, i) => (i + 1) + '. ' + p).join('\n') : '（本题未提供参考要点，按常识判断覆盖度）',
      bestPractice: bestPractice.length > 0 ? bestPractice.map((p, i) => (i + 1) + '. ' + p).join('\n') : '（无）',
      asked: askedText,
      transcript: transcriptText,
      remaining: remaining,
      followupsUsed: followupsUsed,
    });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }

  const result = await callModelJson(llm, messages, {
    ...profileFor('interview-followup'),
    ...(input.options ?? {}),
    validate: stepValidator,
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }

  const value = result.value;
  const type = value.type === 'followup' ? 'followup' : 'next';
  return {
    step: {
      type: type,
      question: String(value.question).trim(),
      point: String(value.point ?? '').trim() || '综合能力',
      hint: String(value.hint ?? '').trim(),
      reason: String(value.reason ?? '').trim(),
    },
    // 推进才有判定；判定缺字段时为 null（由用户自判兜底）
    verdict: type === 'next' ? normalizeModelVerdict(value) : null,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}

/** 导入文本的硬校验（PDF/DOCX 提取失败在客户端就拦了，这里是最后一道）。 */
export function requireImportText(text) {
  const value = String(text == null ? '' : text).trim();
  if (value === '') return { error: 'import-text-required', message: '简历内容为空：请选择文件或粘贴文本。' };
  if (value.length > 60000) return { error: 'import-too-large', message: '简历内容过长（' + value.length + ' 字符，上限 60000）。' };
  return { text: value };
}

/**
 * 已有简历导入：文本 → JSON Resume 结构化 → 我们的 schema。
 * 防虚构口径：提示词明确「只搬运不补写」，这里再校验一次——既没姓名也没经历就判失败，
 * 不拿一份空简历糊弄用户。
 */
export async function importResume(llm, input = {}) {
  const checked = requireImportText(input.text);
  if (checked.error !== undefined) return checked;
  const targetJob = String(input.targetJob == null ? '' : input.targetJob).trim() || '（未指定）';

  let messages;
  try {
    messages = renderMessages('resume-import', { resumeText: checked.text, targetJob: targetJob });
  } catch (error) {
    return { error: 'prompts-error', message: promptMessage(error) };
  }

  const result = await callModelJson(llm, messages, {
    ...profileFor('resume-import'),
    ...(input.options == null ? {} : input.options),
    validate: (value) => {
      const name = String((value == null ? undefined : value.basics) == null ? '' : value.basics.name == null ? '' : value.basics.name).trim();
      const work = Array.isArray(value == null ? undefined : value.work) ? value.work.length : 0;
      const projects = Array.isArray(value == null ? undefined : value.projects) ? value.projects.length : 0;
      const education = Array.isArray(value == null ? undefined : value.education) ? value.education.length : 0;
      if (name === '' && work === 0 && projects === 0 && education === 0) {
        return { ok: false, reason: '回包里既没有姓名也没有任何经历，疑似没有解析出简历内容。' };
      }
      return null;
    },
  });
  if (result.error !== undefined) {
    return { error: result.error, message: aiMessageFor(result.error) + (result.reason ? ' ' + result.reason : '') };
  }
  const normalized = normalizeResume(result.value);
  return {
    resume: normalized.resume,
    problems: normalized.problems,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}
