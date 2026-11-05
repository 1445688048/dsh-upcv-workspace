/**
 * UPCV 求职工作台的 exact /api 路由处理器。
 *
 * 宿主的路由注册表只支持 exact path（没有 :param 占位符），资源一律用 query 参数指定。
 * 每个 handler 都是 (req, res) => void|Promise<void>；信任围栏（loopback + 自定义头）
 * 由宿主入口 src/server/index.js 统一负责。
 *
 * @module dsh-upcv-workspace/api
 */

import { alignJd, generateInterviewReport, generateSourceQuestions, importResume, nextInterviewStep, optimizeResume } from './ai.js';
import { checkSource, closeBrowser, ensureBrowser, isCdpUp, openLogin } from './browser.js';
import { ensureSpec, ingestFeed, loadJobs, updateJobStatus } from './jobs.js';
import { readCollectorStatus, startCollect } from './collector.js';
import { advanceSessionCollect, isSessionController, startSessionCollect } from './session-collect.js';
import { checkSources, listSources, usableSources } from './sources.js';
import { bankQuestionsByTags, buildLocalReport, makeJudgment, QUESTION_SOURCES } from './interview.js';
import { applyJudgment, buildBankRecord, consecutiveFails, ensureBankReady, findBankQuestion, ingestQuestions, listQuestions, markMastered } from './bank.js';
import { effectiveWeight, pickNext } from './bank-sampling.js';
import { existingStemsForPrompt } from './bank-dedup.js';
import { expandTopics, normalizeTags } from './interview-topics.js';
import { countBetterApproachGaps, diffKnowledgePoints, enqueueGenerate, extractKnowledgePoints, generateForPoint, hasVariant, ingestGenerated, queueStatus } from './bank-gen.js';
import { MOCK_INTERVIEW_BANKS } from './mock.js';
import { contentDisposition, renderPdf } from './pdf.js';
import { resumeToPlainText } from './resume-schema.js';

/** 岗位库条目 → 出题用 JD 文本：结构化字段 + raw 里的描述（有哪个用哪个，不编造）。 */
function jdTextFromJob(job) {
  const record = job !== null && typeof job === 'object' ? job : {};
  const raw = record.raw !== null && typeof record.raw === 'object' && record.raw !== null ? record.raw : {};
  const description = [raw.description, raw.jd, raw.text, raw.desc]
    .find((value) => typeof value === 'string' && value.trim() !== '') ?? '';
  const tags = Array.isArray(record.tags) ? record.tags.map(String).join('、') : '';
  return [record.title, record.company, record.cityNorm ?? record.city, record.salary, tags, description]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value !== '')
    .join('\n');
}

/** 简历记录 → 出题用文本；形状不对返回空串（调用方据此报缺料）。 */
function resumeTextOf(record) {
  const data = record !== null && typeof record === 'object' ? record.data : null;
  if (data === null || typeof data !== 'object') return '';
  try {
    return String(resumeToPlainText(data) ?? '').trim();
  } catch {
    return '';
  }
}

export const BASE = '/api/dsh-upcv-workspace';

/** 界面会显示这个版本号，用于确认当前加载的是哪一版客户端。 */
export const BUILD_VERSION = '0.25.5';

/** 变更请求必须带这个自定义请求头（自定义头会触发预检，从而挡住跨站页面）。 */
export const ACTION_HEADER = 'x-dsh-upcv-action';

export const ROUTES = {
  meta: `${BASE}/meta`,
  banks: `${BASE}/banks`,
  interviewQuestions: `${BASE}/interview/questions`,
  interviewVerdict: `${BASE}/interview/verdict`,
  interviewReport: `${BASE}/interview/report`,
  // 真实岗位检索闭环（docs/JOBS-FEED-PLAN.md）：摄取收件箱 / 读岗位库 / 状态 / 检索规格
  jobsIngest: `${BASE}/jobs/ingest`,
  jobsFeed: `${BASE}/jobs/feed`,
  jobsStatus: `${BASE}/jobs/status`,
  jobsSpec: `${BASE}/jobs/spec`,
  // 内建采集器（Phase 2.5）：拉起 collector 进程 / 读它与我们共享的状态文件
  jobsCollect: `${BASE}/jobs/collect`,
  jobsCollectStatus: `${BASE}/jobs/collect/status`,
  // 检索源登录管理（Phase 3.1）：列表 / 检查 / 打开登录标签
  jobsSources: `${BASE}/jobs/sources`,
  jobsSourcesCheck: `${BASE}/jobs/sources/check`,
  jobsSourcesLogin: `${BASE}/jobs/sources/login`,
  resumeOptimize: `${BASE}/resume/optimize`,
  // 简历导入：文件/粘贴文本 → JSON Resume → 我们的 schema
  resumeImport: `${BASE}/resume/import`,
  // JD 对齐：贴 JD 原文 → 结构化要求 → 逐条对齐 → 关键词覆盖 + ATS
  jdAlign: `${BASE}/jd/align`,
  // 面试追问：根据已答内容决定「追问」还是「下一题」
  interviewNext: `${BASE}/interview/next`,
  // 题库（interview V3）：筛选列表 / 单题操作（改判·标掌握·删除）
  bankList: `${BASE}/bank/list`,
  // 题库标签词表（练习配置的下拉多选数据源）：聚合实际标签 + 题量
  bankTopics: `${BASE}/bank/topics`,
  bankVerdict: `${BASE}/bank/verdict`,
  // 题库 Phase B：练习模式采样 / 知识点提取 / 生成（分批同步 + 后台队列）/ 队列状态
  bankPracticeNext: `${BASE}/bank/practice/next`,
  bankKg: `${BASE}/bank/kg`,
  bankGenerate: `${BASE}/bank/generate`,
  bankStatus: `${BASE}/bank/status`,
  // 本地持久化：简历 / 面试记录 / JD 对齐结果（JSON 落盘到 config.root）
  storeList: `${BASE}/store`,
  storeSave: `${BASE}/store/save`,
  storeDelete: `${BASE}/store/delete`,
  // 导出 PDF：服务端拉起本机 Chromium 把简历 HTML 打印成真 PDF（与预览同一份 HTML/CSS）
  pdfExport: `${BASE}/pdf/export`,
};

/** 业务错误码 -> HTTP 状态码。 */
const STATUS = {
  'job-title-required': 400,
  'target-job-required': 400,
  'no-answer': 409,
  'ai-unavailable': 409,
  'ai-no-provider': 409,
  'ai-timeout': 504,
  'ai-aborted': 499,
  'ai-empty': 502,
  'ai-unparsable': 502,
  'ai-failed': 502,
  // 提示词文档坏了属于打包/配置错误，不是用户输入问题
  'prompts-error': 500,
  // 本地存储：集合名/条目非法是入参问题；根目录没配置是部署问题
  'invalid-collection': 400,
  'invalid-item': 400,
  'not-found': 404,
  'store-unavailable': 500,
  // 简历导入入参
  'import-text-required': 400,
  'import-too-large': 400,
  // JD 对齐入参
  'jd-text-required': 400,
  'jd-too-large': 400,
  // 岗位检索闭环：状态值非法 / spec 坏 JSON（保留原文件，属部署配置错误）
  'invalid-status': 400,
  'spec-invalid': 500,
  // 采集器 / 会话式检索：未安装 / 不可用 / 已在跑 / 启动失败都属于「当前不能启动」，不是入参不合法
  'collector-not-installed': 409,
  'collector-unavailable': 409,
  'collector-running': 409,
  'collector-spawn-failed': 500,
  // 浏览器管家 / 登录管理
  'browser-unavailable': 409,
  'login-required': 409,
  'source-not-found': 404,
  'source-no-login': 400,
  // 模拟面试 v2：题源未选 / 题源缺料 / 错题集无料 / 判定值非法 / 题干缺失
  'source-required': 400,
  'source-material-required': 400,
  'invalid-verdict': 400,
  'question-required': 400,
  'bank-question-not-found': 404,
  'bank-action-required': 400,
  // 题库 Phase B
  'bank-topic-required': 400,
  'bank-mode-required': 400,
  'queue-full': 429,
  'bank-empty': 409,
};

export function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** 回一个 { error } 业务结果；没有 error 返回 false。 */
export function fail(res, result) {
  if (result?.error === undefined) return false;
  json(res, STATUS[result.error] ?? 400, {
    ok: false,
    error: result.error,
    ...(result.message === undefined ? {} : { message: result.message }),
    ...(Array.isArray(result.problems) ? { problems: result.problems } : {}),
  });
  return true;
}

export async function readJsonBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error('request body too large');
    chunks.push(chunk);
  }
  if (total === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('request body must be a JSON object');
  return parsed;
}

/**
 * 构建处理器表。
 * @param {{ llm?: object, available: boolean }} deps
 */
export function createHandlers({ llm, available, store = null, chromePath = '', sessionController = null, getSessionController = null, agentStatus = null, browser = null, browserOps = null }) {
  // 浏览器操作可注入（测试用）；默认走真实实现。
  const ops = browserOps !== null && browserOps !== undefined
    ? browserOps
    : { ensureBrowser: ensureBrowser, checkSource: checkSource, isCdpUp: isCdpUp, openLogin: openLogin, closeBrowser: closeBrowser };
  // 宿主服务可能晚于本插件注册：按调用时解析，显式传入的 sessionController 优先（测试用）。
  const resolveSessionController = () => {
    const live = typeof getSessionController === 'function' ? getSessionController() : null;
    return live !== null && live !== undefined ? live : sessionController;
  };
  // ── V3 Phase C：判定后的三类自动触发（全部走后台队列，不阻塞作答）──
  // ① 连错降阶：连错 ≥3 次 → 台阶题（scaffoldQueued 标记防重复，答对自动清除标记）
  // ② bestPractice 缺口：某标签缺口累计 ≥3 → 专题题（队列按 gapCount 增长防重复）
  // ③ 考点变体：连对 ≥2 次且尚无变体 → 换问法题（hasVariant 防重复）
  // V0.22：触发条件从 === 改为 >=——队列任务失败后，后续判定仍能再次触发，不再永久错过。
  const runPostJudgmentTriggers = (updated, judgment) => {
    if (store === null || available !== true || updated === null || updated === undefined) return;
    const topics = normalizeTags(updated?.topic);
    if (consecutiveFails(updated?.mastery) >= 3 && updated?.mastery?.scaffoldQueued !== true) {
      const enqueued = enqueueGenerate(store, llm, true, {
        type: 'scaffold',
        question: String(updated.text ?? ''),
        topic: topics[0] ?? '',
        tags: topics,
        missedPoints: Array.isArray(judgment?.missedPoints) ? judgment.missedPoints : [],
      });
      if (enqueued.queued === true) {
        updated.mastery.scaffoldQueued = true;
        store.upsert('questions', updated);
      }
    }
    const better = String(judgment?.betterApproach ?? '').trim();
    if (better !== '') {
      for (const topic of topics) {
        const gapCount = countBetterApproachGaps(store, [topic]);
        if (gapCount >= 3) {
          const enqueued = enqueueGenerate(store, llm, true, { type: 'gap', topic: topic, gaps: [better], gapCount: gapCount });
          if (enqueued.queued === true) break; // 一次判定最多补一个标签
        }
      }
    }
    if ((Number(updated?.mastery?.streak) || 0) >= 2 && hasVariant(store, updated.id) !== true) {
      enqueueGenerate(store, llm, true, {
        type: 'variant',
        questionId: String(updated.id ?? ''),
        question: String(updated.text ?? ''),
        topic: topics[0] ?? '',
        tags: topics,
        points: updated.points?.essentials ?? [],
        bestPractice: updated.points?.bestPractice ?? [],
        concept: String(updated.concept ?? ''),
      });
    }
  };
  return {
    [ROUTES.meta]: {
      GET: async (req, res) => {
        let providers = [];
        let models = [];
        if (typeof llm?.listProviders === 'function') {
          try {
            const raw = await llm.listProviders();
            providers = (Array.isArray(raw) ? raw : raw?.providers ?? [])
              .map((item) => (typeof item === 'string' ? item : item?.id))
              .filter((item) => typeof item === 'string' && item !== '');
          } catch { providers = []; }
        }
        if (providers.length > 0 && typeof llm?.listModels === 'function') {
          try {
            const raw = await llm.listModels(providers[0]);
            models = (Array.isArray(raw) ? raw : raw?.models ?? [])
              .map((item) => (typeof item === 'string' ? item : item?.id ?? item?.model))
              .filter((item) => typeof item === 'string' && item !== '');
          } catch { models = []; }
        }
        json(res, 200, {
          ok: true,
          version: BUILD_VERSION,
          ai: { available: available, providers: providers, models: models },
          bankCount: MOCK_INTERVIEW_BANKS.length,
        });
      },
    },

    // 本地题库：无模型时前端仍可用（LLM 生成失败时的兜底）
    [ROUTES.banks]: {
      GET: async (req, res) => {
        json(res, 200, {
          ok: true,
          banks: MOCK_INTERVIEW_BANKS.map((bank) => ({
            id: bank.id, slug: bank.slug, title: bank.title, category: bank.category,
            questionCount: bank.questionCount, isHot: bank.isHot === true,
            previewQuestions: bank.previewQuestions ?? [],
          })),
        });
      },
    },

    [ROUTES.interviewQuestions]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        const source = String(body.source ?? '');
        if (!QUESTION_SOURCES.includes(source)) {
          json(res, 400, { ok: false, error: 'source-required', message: '请先选择题源：岗位 JD / 简历，未选不出题。' });
          return;
        }
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        // 题数默认 8（5-15 可调）
        const count = Math.max(5, Math.min(15, Number(body.count) || 8));
        const tags = Array.isArray(body.tags) ? body.tags : [];
        ensureBankReady(store, { now: new Date().toISOString() });

        const notices = [];
        let questions = [];
        let bankCount = 0;
        let sourceTag = 'ai';
        let provider;
        let model;
        let attempts;
        let problems;

        // ── JD 先抽后补（docs/INTERVIEW-V3-PLAN.md §6.3）：标签匹配的题库题按权重
        // 优先复用（上限约 60%），答错权重高的先重现；缺口由下方即时生成并沉淀。
        if (source === 'jd') {
          const wanted = normalizeTags(tags);
          const budget = Math.floor(count * 0.6);
          if (wanted.length > 0 && budget > 0) {
            const wantedSet = expandTopics(wanted);
            const read = store.list('questions');
            const candidates = (Array.isArray(read.items) ? read.items : [])
              .filter((item) => item !== null && typeof item === 'object' && item.status !== 'removed' && item.scope !== 'personal')
              .filter((item) => normalizeTags(item?.topic).some((tag) => wantedSet.has(tag.toLowerCase())));
            if (candidates.length > 0) {
              const nowMs = Date.now();
              const picked = candidates
                .slice()
                .sort((a, b) => effectiveWeight(b, nowMs) - effectiveWeight(a, nowMs))
                .slice(0, Math.min(budget, count));
              for (const item of picked) {
                questions.push({
                  questionId: String(item.id),
                  source: 'jd',
                  sourceRef: null,
                  tags: normalizeTags(item?.topic),
                  question: String(item.text ?? ''),
                  points: item.points?.essentials ?? [],
                  bestPractice: item.points?.bestPractice ?? [],
                  isReplay: (Number(item.mastery?.seen) || 0) > 0,
                  level: item.level,
                  kind: item.kind,
                });
              }
              bankCount = picked.length;
              if (picked.length > 0) notices.push('已从题库复用 ' + picked.length + ' 道高权重题（练错多的优先重现）。');
            }
          }
        }

        const remaining = count - questions.length;
        if (remaining > 0) {
          if (available !== true) {
            sourceTag = 'local-bank';
            notices.push('本机没有可调用的模型，新题已按标签就近回退到内置题库。');
            questions = questions.concat(bankQuestionsByTags(tags, remaining, source));
          } else {
            let materialError = null;
            const input = { source: source, tags: tags, count: remaining, options: { provider: body.provider, model: body.model } };
            if (source === 'jd') {
              let jdText = String(body.jdText ?? '').trim();
              const jobId = String(body.jobId ?? '');
              if (jdText === '' && jobId !== '') {
                const job = loadJobs(store.root).items.find((item) => String(item?.id) === jobId);
                if (job !== undefined) jdText = jdTextFromJob(job);
              }
              if (jdText === '') materialError = { error: 'source-material-required', message: '题源是岗位 JD：请选择库内岗位或粘贴 JD 原文。' };
              else input.jdText = jdText;
            } else {
              const resumeId = String(body.resumeId ?? '');
              const record = store.list('resumes').items.find((item) => String(item?.id) === resumeId);
              const resumeText = record === undefined ? '' : resumeTextOf(record);
              if (resumeText === '') materialError = { error: 'source-material-required', message: '题源是简历：请先选择一份已保存的简历。' };
              else input.resumeText = resumeText;
            }
            if (materialError !== null) { json(res, 400, { ok: false, ...materialError }); return; }

            const result = await generateSourceQuestions(llm, input);
            if (fail(res, result)) return;
            questions = questions.concat(result.questions);
            provider = result.provider;
            model = result.model;
            attempts = result.attempts;
            problems = result.problems;
          }
        }

        if (questions.length === 0) {
          json(res, 409, { ok: false, error: 'bank-empty', message: '没有可用的题目：请调整标签后重试。' });
          return;
        }

        // ── V3 沉淀：生成题去重入库并改写 questionId；题库题（bq-*）与复用题 id 已天然对齐
        const toIngest = questions.filter((item) => !String(item.questionId ?? '').startsWith('bq-'));
        if (toIngest.length > 0) {
          const via = source === 'jd' ? 'jd' : 'resume';
          const ingested = ingestQuestions(store, toIngest, {
            via: via,
            resumeId: source === 'resume' ? String(body.resumeId ?? '') : '',
            now: new Date().toISOString(),
          });
          const idMap = new Map(ingested.idMap.map((entry) => [entry.from, entry.to]));
          for (const item of toIngest) {
            const to = idMap.get(item.questionId);
            if (to !== undefined) item.questionId = to;
          }
        }

        json(res, 200, {
          ok: true,
          source: sourceTag,
          questionSource: source,
          count: questions.length,
          bankCount: bankCount,
          questions: questions,
          ...(notices.length > 0 ? { notice: notices.join(' ') } : {}),
          ...(provider === undefined ? {} : { provider: provider }),
          ...(model === undefined ? {} : { model: model }),
          ...(attempts === undefined ? {} : { attempts: attempts }),
          ...(Array.isArray(problems) && problems.length > 0 ? { problems: problems } : {}),
        });
      },
    },

    // ── 用户判定 / 改判 / 手动录入（judgedBy:user 是终局）──────────────
    [ROUTES.interviewVerdict]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const verdict = String(body.verdict ?? '');
        if (!(verdict === 'pass' || verdict === 'partial' || verdict === 'fail')) {
          json(res, 400, { ok: false, error: 'invalid-verdict', message: '判定只能是 pass / partial / fail。' });
          return;
        }
        const question = body.question !== null && typeof body.question === 'object' ? body.question : {};
        if (String(question.question ?? '').trim() === '') {
          json(res, 400, { ok: false, error: 'question-required', message: '缺少题目，无法入错题本。' });
          return;
        }
        const now = new Date().toISOString();
        const judgment = makeJudgment(verdict, body.missedPoints, 'user', now, {
          hitPoints: body.hitPoints,
          betterApproach: body.betterApproach,
        });
        // V3 Phase B：判定只落题库 mastery（错题本已退役为只读档案，复盘走 /bank/list?view=review）
        ensureBankReady(store, { now: now });
        let bankFound = findBankQuestion(store, { id: question.questionId, text: question.question });
        // V0.22（Q3）：题库外题目判定不再丢——按当前题干补建条目，mastery 照常积累
        if (bankFound === undefined) {
          const created = buildBankRecord({
            text: String(question.question ?? ''),
            points: { essentials: Array.isArray(question.points) ? question.points : [], bestPractice: Array.isArray(question.bestPractice) ? question.bestPractice : [] },
            topic: question.tags,
            concept: String(question.concept ?? ''),
            origin: { source: 'ai', via: 'session' },
          }, { now: now });
          if (created !== null) {
            store.upsert('questions', created);
            bankFound = created;
          }
        }
        let bankItem = null;
        if (bankFound !== undefined) {
          bankItem = applyJudgment(bankFound, judgment, { now: now });
          store.upsert('questions', bankItem);
          runPostJudgmentTriggers(bankItem, judgment);
        }
        json(res, 200, {
          ok: true,
          judgment: judgment,
          ...(bankItem !== null ? { bankQuestion: { id: bankItem.id, mastery: bankItem.mastery } } : {}),
        });
      },
    },

    // ── 题库（interview V3）：筛选列表 / 单题操作 ───────────────────
    [ROUTES.bankList]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        // 首次使用题库时导入内置 300 题 + 迁移旧错题（进程内幂等）
        ensureBankReady(store, { now: new Date().toISOString() });
        const params = new URL(req.url, 'http://127.0.0.1').searchParams;
        const topic = (params.get('topic') ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '');
        const result = listQuestions(store, {
          topic: topic,
          level: params.get('level') ?? undefined,
          kind: params.get('kind') ?? undefined,
          scope: params.get('scope') ?? undefined,
          q: params.get('q') ?? '',
          view: params.get('view') ?? 'all',
          offset: Number(params.get('offset')) || 0,
          limit: Number(params.get('limit')) || 50,
        });
        json(res, 200, { ok: true, items: result.items, total: result.total });
      },
    },

    // ── 标签词表：题库实际存在的知识点标签 + 题量（下拉多选数据源，不写死词表）──
    [ROUTES.bankTopics]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        ensureBankReady(store, { now: new Date().toISOString() });
        const read = store.list('questions');
        const counts = new Map();
        for (const item of (Array.isArray(read.items) ? read.items : [])) {
          if (item === null || typeof item !== 'object' || item.status === 'removed') continue;
          if (item.scope === 'personal') continue; // personal 题不进通用词表
          for (const tag of (Array.isArray(item.topic) ? item.topic : [])) {
            const key = String(tag ?? '').trim();
            if (key === '') continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        const topics = [...counts.entries()]
          .map(([tag, count]) => ({ tag: tag, count: count }))
          .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag, 'zh'));
        json(res, 200, { ok: true, topics: topics });
      },
    },

    [ROUTES.bankVerdict]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const body = await readJsonBody(req);
        const action = String(body.action ?? '');
        if (action !== 'verdict' && action !== 'master' && action !== 'remove') {
          json(res, 400, { ok: false, error: 'bank-action-required', message: 'action 必须是 verdict / master / remove。' });
          return;
        }
        const found = findBankQuestion(store, { id: String(body.id ?? ''), text: body.text });
        if (found === undefined) { json(res, 404, { ok: false, error: 'bank-question-not-found', message: '题库里没有这道题。' }); return; }
        const now = new Date().toISOString();
        let updated = found;
        if (action === 'master') {
          updated = markMastered(found);
        } else if (action === 'remove') {
          updated = { ...found, status: 'removed' };
        } else {
          const verdict = String(body.verdict ?? '');
          if (verdict !== 'pass' && verdict !== 'partial' && verdict !== 'fail') {
            json(res, 400, { ok: false, error: 'invalid-verdict', message: '判定只能是 pass / partial / fail。' });
            return;
          }
          updated = applyJudgment(found, makeJudgment(verdict, body.missedPoints, 'user', now, {
            hitPoints: body.hitPoints,
            betterApproach: body.betterApproach,
          }), { now: now });
        }
        store.upsert('questions', updated);
        json(res, 200, { ok: true, item: updated });
      },
    },

    // ── 题库 Phase B：练习模式采样 / 知识点提取 / 生成 / 队列状态 ─────
    [ROUTES.bankPracticeNext]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        ensureBankReady(store, { now: new Date().toISOString() });
        const topics = Array.isArray(body.topics) ? body.topics.map((item) => String(item)).filter((item) => item.trim() !== '') : [];
        const read = store.list('questions');
        const sampled = pickNext(Array.isArray(read.items) ? read.items : [], {
          topics: topics,
          // 级别带（起点难度爬升）：levels 数组优先；旧 level 单值仍兼容
          levels: Array.isArray(body.levels) ? body.levels.map((l) => String(l ?? '').trim()).filter((l) => l !== '') : undefined,
          level: String(body.level ?? ''),
          resumeId: String(body.resumeId ?? ''),
          // 面试模式定向采样：单知识点（topics 单元素）+ 深度带 + 排除本会话已答
          kinds: Array.isArray(body.kinds) ? body.kinds : [],
          excludeIds: Array.isArray(body.excludeIds) ? body.excludeIds : [],
          now: Date.now(),
        });
        if (sampled.item === null) {
          json(res, 409, { ok: false, error: 'bank-empty', message: sampled.pool.reason || '题库里没有可练的题。' });
          return;
        }
        // 池子枯竭 → 自动触发后台补题（不阻塞本题作答）
        let replenishQueued = false;
        if (sampled.pool.depleted === true && available === true) {
          const taskTopics = topics.length > 0 ? topics : normalizeTags(sampled.item?.topic);
          const enqueued = enqueueGenerate(store, llm, available, { topics: taskTopics, level: sampled.item.level, count: 8 });
          replenishQueued = enqueued.queued === true;
        }
        const item = sampled.item;
        json(res, 200, {
          ok: true,
          question: {
            questionId: String(item.id),
            question: String(item.text ?? ''),
            tags: normalizeTags(item?.topic),
            points: item.points?.essentials ?? [],
            bestPractice: item.points?.bestPractice ?? [],
            level: item.level,
            kind: item.kind,
            scope: item.scope,
            ...(item.variantOf ? { variantOf: item.variantOf } : {}),
            source: 'bank',
            // 练过的题再次出现：界面据此显示「重练」pill；变体换发显示「变体题」
            isReplay: (Number(item.mastery?.seen) || 0) > 0,
          },
          pool: {
            depleted: sampled.pool.depleted === true,
            relaxed: sampled.pool.relaxed,
            mode: sampled.pool.mode,
            reason: sampled.pool.reason,
            replenishQueued: replenishQueued,
          },
        });
      },
    },

    [ROUTES.bankKg]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        if (available !== true) { json(res, 409, { ok: false, error: 'ai-unavailable', message: '本机没有可调用的模型，无法提取知识点。' }); return; }
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const resumeId = String(body.resumeId ?? '');
        const record = store.list('resumes').items.find((item) => String(item?.id) === resumeId);
        const resumeText = record === undefined ? '' : resumeTextOf(record);
        if (resumeText === '') { json(res, 400, { ok: false, error: 'source-material-required', message: '请先选择一份已保存的简历。' }); return; }
        const result = await extractKnowledgePoints(llm, { resumeText: resumeText, options: { provider: body.provider, model: body.model } });
        if (fail(res, result)) return;
        const diff = diffKnowledgePoints(result.points, record?.knowledgeProfile?.points);
        json(res, 200, {
          ok: true,
          summary: result.summary,
          points: result.points,
          added: diff.added,
          unchanged: diff.unchanged,
          hasProfile: Array.isArray(record?.knowledgeProfile?.points) && record.knowledgeProfile.points.length > 0,
          provider: result.provider,
          model: result.model,
        });
      },
    },

    [ROUTES.bankGenerate]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const mode = String(body.mode ?? '');
        // 手动扩充 / 枯竭补题：进后台队列，不阻塞
        if (mode === 'expand') {
          const enqueued = enqueueGenerate(store, llm, available, { topics: body.topics, level: body.level, count: Number(body.count) || 8 });
          if (fail(res, enqueued)) return;
          json(res, 200, { ok: true, queued: true, status: queueStatus() });
          return;
        }
        // 简历题库收尾：把确认过的知识点清单写回 resume.knowledgeProfile
        if (mode === 'resume-finish') {
          const resumeId = String(body.resumeId ?? '');
          const record = store.list('resumes').items.find((item) => String(item?.id) === resumeId);
          if (record === undefined) { json(res, 404, { ok: false, error: 'not-found', message: '没有这份简历。' }); return; }
          const points = (Array.isArray(body.points) ? body.points : [])
            .map((item) => ({ tag: String(item?.tag ?? '').trim(), note: String(item?.note ?? '').trim() }))
            .filter((item) => item.tag !== '');
          const updated = {
            ...record,
            knowledgeProfile: {
              points: points,
              version: (Number(record?.knowledgeProfile?.version) || 0) + 1,
              generatedAt: new Date().toISOString(),
            },
          };
          store.upsert('resumes', updated);
          json(res, 200, { ok: true, knowledgeProfile: updated.knowledgeProfile });
          return;
        }
        // resume-first / resume-diff：同步分批，一次调用生成一个知识点的题（客户端驱动进度条）
        if (mode !== 'resume-first' && mode !== 'resume-diff') {
          json(res, 400, { ok: false, error: 'bank-mode-required', message: 'mode 必须是 resume-first / resume-diff / resume-finish / expand。' });
          return;
        }
        if (available !== true) { json(res, 409, { ok: false, error: 'ai-unavailable', message: '本机没有可调用的模型，无法生成题库。' }); return; }
        const resumeId = String(body.resumeId ?? '');
        const points = Array.isArray(body.points) ? body.points : [];
        const index = Math.max(0, Number(body.index) || 0);
        const point = points[index];
        if (point === undefined || String(point?.tag ?? '').trim() === '') {
          json(res, 400, { ok: false, error: 'bank-topic-required', message: '缺少知识点标签，无法出题。' });
          return;
        }
        // V0.22 取消 personal：出题不注入简历内容（简历只提供知识点标签）
        const read = store.list('questions');
        const stems = existingStemsForPrompt(Array.isArray(read.items) ? read.items : [], [String(point.tag)], 30);
        const result = await generateForPoint(llm, {
          topic: String(point.tag),
          note: point.note,
          existingText: stems,
          count: Number(body.count) || 8,
          options: { provider: body.provider, model: body.model },
        });
        if (fail(res, result)) return;
        const ingested = ingestGenerated(store, result.questions, { via: 'resume', resumeId: resumeId, now: new Date().toISOString() });
        json(res, 200, {
          ok: true,
          index: index,
          total: points.length,
          topic: String(point.tag),
          added: ingested.items.length,
          skipped: ingested.skipped.length,
          done: index + 1 >= points.length,
          provider: result.provider,
          model: result.model,
        });
      },
    },

    [ROUTES.bankStatus]: {
      GET: async (req, res) => {
        json(res, 200, { ok: true, queue: queueStatus(), ai: { available: available === true } });
      },
    },

    // ── 本地持久化 ────────────────────────────────────────────────
    [ROUTES.storeList]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const collection = new URL(req.url, 'http://127.0.0.1').searchParams.get('collection') ?? '';
        if (collection === 'all') { json(res, 200, { ok: true, ...store.stats() }); return; }
        const result = store.list(collection);
        if (result.error !== undefined) { json(res, 400, { ok: false, error: result.error, message: '未知集合：' + collection }); return; }
        json(res, 200, { ok: true, collection: collection, items: result.items, note: result.note });
      },
    },

    [ROUTES.storeSave]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const body = await readJsonBody(req);
        const collection = String(body.collection ?? '');
        let item = body.item;
        // 简历字段保护（V0.25.5）：编辑器只回写自己的字段，会把知识点档案整个抹掉——
        // 入参缺 knowledgeProfile 且库里现存时，原样保留（真实更新走 resume-finish，必带该字段）
        if (collection === 'resumes' && item !== null && typeof item === 'object' && !Array.isArray(item)
          && item.knowledgeProfile === undefined && typeof item.id === 'string' && item.id !== '') {
          const existing = store.list('resumes').items.find((entry) => String(entry?.id) === item.id);
          if (existing !== undefined && existing.knowledgeProfile !== undefined) {
            item = { ...item, knowledgeProfile: existing.knowledgeProfile };
          }
        }
        const result = store.upsert(collection, item);
        if (result.error !== undefined) { json(res, STATUS[result.error] ?? 400, { ok: false, error: result.error }); return; }
        json(res, 200, { ok: true, item: result.item, count: result.count });
      },
    },

    [ROUTES.storeDelete]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const body = await readJsonBody(req);
        const result = store.remove(String(body.collection ?? ''), String(body.id ?? ''));
        if (result.error !== undefined) { json(res, STATUS[result.error] ?? 400, { ok: false, error: result.error }); return; }
        json(res, 200, { ok: true, count: result.count });
      },
    },

    // ── 导出 PDF ────────────────────────────────────────────────
    [ROUTES.pdfExport]: {
      POST: async (req, res) => {
        let body = null;
        try { body = await readJsonBody(req, 8 * 1024 * 1024); }
        catch (err) { json(res, 400, { ok: false, error: 'pdf-body-invalid', message: '请求体过大或不是合法 JSON。' }); return; }
        const html = typeof body.html === 'string' ? body.html : '';
        if (html.trim() === '') { json(res, 400, { ok: false, error: 'pdf-html-required', message: '没有可导出的内容。' }); return; }
        const result = await renderPdf(html, { chromePath: chromePath });
        if (result.error !== undefined) {
          json(res, result.error === 'no-browser' ? 501 : 500, { ok: false, error: result.error, message: result.message });
          return;
        }
        const buffer = result.pdf;
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': contentDisposition(body.filename),
          'content-length': buffer.length,
          'cache-control': 'no-store',
        });
        res.end(buffer);
      },
    },

    // ── 简历导入 ────────────────────────────────────────────────
    [ROUTES.resumeImport]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        const text = String(body.text == null ? '' : body.text);
        if (text.trim() === '') { json(res, 400, { ok: false, error: 'import-text-required', message: '请先选择文件或粘贴简历内容。' }); return; }
        if (text.length > 60000) { json(res, 400, { ok: false, error: 'import-too-large', message: '简历内容过长（上限 6 万字符）。' }); return; }
        if (available !== true) { json(res, 409, { ok: false, error: 'ai-unavailable', message: '本机没有可调用的模型，无法解析简历。' }); return; }
        const result = await importResume(llm, {
          text: text,
          targetJob: body.targetJob,
          options: { provider: body.provider, model: body.model },
        });
        if (fail(res, result)) return;
        json(res, 200, {
          ok: true,
          resume: result.resume,
          ...(Array.isArray(result.problems) && result.problems.length > 0 ? { problems: result.problems } : {}),
          provider: result.provider,
          model: result.model,
        });
      },
    },

    // ── JD 对齐 ──────────────────────────────────────────────────
    [ROUTES.jdAlign]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        const jdText = String(body.jdText ?? '');
        if (jdText.trim() === '') { json(res, 400, { ok: false, error: 'jd-text-required', message: '请先粘贴岗位 JD 原文。' }); return; }
        if (jdText.length > 60000) { json(res, 400, { ok: false, error: 'jd-too-large', message: 'JD 原文过长（上限 6 万字符）。' }); return; }
        if (available !== true) { json(res, 409, { ok: false, error: 'ai-unavailable', message: '本机没有可调用的模型，无法做 JD 对齐。' }); return; }
        const result = await alignJd(llm, {
          jdText: jdText,
          targetJob: body.targetJob,
          resumeText: body.resumeText,
          options: { provider: body.provider, model: body.model },
        });
        if (fail(res, result)) return;
        json(res, 200, { ok: true, alignment: result.alignment, provider: result.provider, model: result.model, attempts: result.attempts });
      },
    },

    // ── 面试追问 v2：推进时随响应返回当前题判定并即刻联动错题本 ──────────
    [ROUTES.interviewNext]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        if (available !== true) {
          // 没有模型时不追问也不判定：交给客户端降级为用户自判
          json(res, 200, { ok: true, source: 'local-bank', step: { type: 'next', question: '', point: '', hint: '' }, verdict: null });
          return;
        }
        const transcript = Array.isArray(body.transcript) ? body.transcript : [];
        const last = transcript[transcript.length - 1] ?? {};
        const question = body.question !== null && typeof body.question === 'object' ? body.question : {};
        const result = await nextInterviewStep(llm, {
          jobTitle: body.jobTitle,
          asked: body.asked,
          transcript: transcript,
          remaining: body.remaining,
          currentQuestion: question.question,
          points: question.points,
          bestPractice: question.bestPractice,
          followupsUsed: body.followupsUsed,
          options: { provider: body.provider, model: body.model },
        });
        if (fail(res, result)) return;

        // AI 判定即刻落题库 mastery；判定缺失时 verdict 为 null，由用户自判兜底
        let judgment = null;
        if (result.verdict !== null) {
          judgment = makeJudgment(result.verdict.verdict, result.verdict.missedPoints, 'ai', new Date().toISOString(), {
            hitPoints: result.verdict.hitPoints,
            betterApproach: result.verdict.betterApproach,
          });
          if (store !== null) {
            ensureBankReady(store, { now: judgment.judgedAt });
            let bankFound = findBankQuestion(store, { id: question.questionId, text: question.question });
            if (bankFound === undefined) {
              const created = buildBankRecord({
                text: String(question.question ?? ''),
                points: { essentials: Array.isArray(question.points) ? question.points : [], bestPractice: Array.isArray(question.bestPractice) ? question.bestPractice : [] },
                topic: question.tags,
                concept: String(question.concept ?? ''),
                origin: { source: 'ai', via: 'session' },
              }, { now: judgment.judgedAt });
              if (created !== null) {
                store.upsert('questions', created);
                bankFound = created;
              }
            }
            if (bankFound !== undefined) {
              const updated = applyJudgment(bankFound, judgment, { now: judgment.judgedAt });
              store.upsert('questions', updated);
              runPostJudgmentTriggers(updated, judgment);
            }
          }
        }
        json(res, 200, {
          ok: true,
          source: 'ai',
          step: result.step,
          verdict: judgment,
          provider: result.provider,
          model: result.model,
        });
      },
    },

    // ── 面试报告：AI 之外永远叠加本地聚合；无模型时整体降级为本地规则 ────
    [ROUTES.interviewReport]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        const transcript = Array.isArray(body.transcript) ? body.transcript : [];
        if (!transcript.some((item) => String(item?.answer ?? '').trim() !== '')) {
          json(res, 409, { ok: false, error: 'no-answer', message: '还没有作答内容，无法生成报告。' });
          return;
        }
        const local = buildLocalReport(transcript);
        if (available !== true) {
          json(res, 200, {
            ok: true,
            source: 'local',
            report: local,
            notice: '本机没有可调用的模型：评分来自本地规则，薄弱点聚合按本地判定统计。',
          });
          return;
        }
        const result = await generateInterviewReport(llm, {
          jobTitle: body.jobTitle,
          transcript: transcript,
          options: { provider: body.provider, model: body.model },
        });
        if (fail(res, result)) return;
        json(res, 200, {
          ok: true,
          source: 'ai',
          report: { ...result.report, verdictDist: local.verdictDist, weakTags: local.weakTags },
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
        });
      },
    },

    // ── 真实岗位检索闭环（不依赖 LLM：无模型时全部可用）──────────────
    [ROUTES.jobsIngest]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        // 摄取 → 去重入库 → feed 轮转；统计字段见 docs/JOBS-FEED-PLAN.md 4.2
        const result = ingestFeed({ root: store.root, now: new Date().toISOString() });
        json(res, 200, { ok: true, ...result });
      },
    },

    [ROUTES.jobsFeed]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const result = loadJobs(store.root);
        json(res, 200, { ok: true, items: result.items, note: result.note });
      },
    },

    [ROUTES.jobsStatus]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const body = await readJsonBody(req);
        const result = updateJobStatus(store.root, String(body.id ?? ''), body.status, new Date().toISOString());
        if (fail(res, result)) return;
        json(res, 200, { ok: true, item: result.item });
      },
    },

    [ROUTES.jobsSpec]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const result = ensureSpec(store.root);
        if (result.error !== undefined) { json(res, 500, { ok: false, error: result.error, message: result.message }); return; }
        json(res, 200, { ok: true, spec: result.spec, created: result.created });
      },
    },

    // ── 岗位检索（Phase 3）：优先开后台会话，让 agent 用 skill + 浏览器 MCP 检索 ──
    // 宿主没有会话服务时退回内建采集器（Phase 2.5）：命令式拉起采集进程。
    // 未安装/不可用时明确返回错误码（不是 500 崩溃）；已有检索在跑时返回 collector-running。
    [ROUTES.jobsCollect]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const body = await readJsonBody(req);
        const liveSessionController = resolveSessionController();
        if (isSessionController(liveSessionController)) {
          if (browser === null) {
            json(res, 409, { ok: false, error: 'browser-unavailable', message: '插件没有配置浏览器管家（browser）。' });
            return;
          }
          const ensured = await ops.ensureBrowser(browser);
          if (ensured.running !== true) {
            json(res, 409, { ok: false, error: 'browser-unavailable', message: ensured.message ?? '浏览器管家没有启动。' });
            return;
          }
          // 查询前刷新登录状态：检查失败的渠道跳过，绝不带着失效登录态去跑
          const checked = await checkSources({
            root: store.root,
            check: (channel) => ops.checkSource({ ...browser, auth: channel.auth }),
          });
          if (checked.error !== undefined) {
            json(res, 500, { ok: false, error: checked.error, message: checked.message });
            return;
          }
          const pick = usableSources(store.root);
          if (pick.usable.length === 0) {
            json(res, 409, {
              ok: false,
              error: 'login-required',
              message: '没有可用的检索源：请先在「检索源」里登录并检查。',
              sources: pick.skipped,
            });
            return;
          }
          const session = await startSessionCollect({
            root: store.root,
            keyword: body.keyword,
            sessionController: liveSessionController,
            agentStatus: agentStatus,
            allowed: pick.usable,
            // 检索结束（成功或超时）就把自动化浏览器收掉，别把窗口留给用户
            onFinish: () => (typeof ops.closeBrowser === 'function' ? ops.closeBrowser(browser) : null),
          });
          if (fail(res, session)) return;
          json(res, 200, {
            ok: true,
            mode: 'session',
            sessionId: session.sessionId,
            started: true,
            status: session.status,
            skipped: pick.skipped,
            sources: checked.results,
          });
          return;
        }
        const timeoutMs = Number(body.timeoutMs) > 0 ? Number(body.timeoutMs) : undefined;
        const result = await startCollect({ root: store.root, keyword: body.keyword, timeoutMs });
        if (fail(res, result)) return;
        json(res, 200, { ok: true, mode: 'collector', started: result.started, pid: result.pid, timeoutMs: result.timeoutMs, status: result.status });
      },
    },

    // ── 检索源登录管理：列表 / 检查 / 打开登录标签（不经过 agent）──────────
    [ROUTES.jobsSources]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        const list = listSources(store.root);
        if (list.error !== undefined) { json(res, 500, { ok: false, error: list.error, message: list.message }); return; }
        const running = browser === null ? false : await ops.isCdpUp(browser.port);
        json(res, 200, {
          ok: true,
          sources: list.sources,
          browser: { port: browser === null ? null : browser.port, running: running },
        });
      },
    },

    [ROUTES.jobsSourcesCheck]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        if (browser === null) { json(res, 409, { ok: false, error: 'browser-unavailable', message: '插件没有配置浏览器管家（browser）。' }); return; }
        const body = await readJsonBody(req);
        const ids = typeof body.id === 'string' && body.id !== '' ? [body.id] : undefined;
        const checked = await checkSources({
          root: store.root,
          ids: ids,
          check: (channel) => ops.checkSource({ ...browser, auth: channel.auth }),
        });
        if (checked.error !== undefined) { json(res, 500, { ok: false, error: checked.error, message: checked.message }); return; }
        json(res, 200, { ok: true, results: checked.results });
      },
    },

    [ROUTES.jobsSourcesLogin]: {
      POST: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        if (browser === null) { json(res, 409, { ok: false, error: 'browser-unavailable', message: '插件没有配置浏览器管家（browser）。' }); return; }
        const body = await readJsonBody(req);
        const list = listSources(store.root);
        if (list.error !== undefined) { json(res, 500, { ok: false, error: list.error, message: list.message }); return; }
        const source = list.sources.find((item) => item.id === String(body.id ?? ''));
        if (source === undefined) { json(res, 404, { ok: false, error: 'source-not-found', message: '没有这个渠道。' }); return; }
        if (source.loginUrl === '') { json(res, 400, { ok: false, error: 'source-no-login', message: '这个渠道没有配置登录地址。' }); return; }
        const result = await ops.openLogin({ ...browser, url: source.loginUrl });
        if (result.ok !== true) {
          json(res, 409, { ok: false, error: result.error ?? 'browser-unavailable', message: result.message ?? '无法打开登录窗口。' });
          return;
        }
        json(res, 200, { ok: true, url: result.url });
      },
    },

    [ROUTES.jobsCollectStatus]: {
      GET: async (req, res) => {
        if (store === null) { json(res, 500, { ok: false, error: 'store-unavailable', message: '没有配置数据根目录。' }); return; }
        // 会话式检索的收尾（自动 ingest）由状态机推进；插件重启后这里也能自愈。
        const liveSessionController = resolveSessionController();
        if (isSessionController(liveSessionController)) {
          // 只在「本次调用把 running 推进到 done/error」时关浏览器；已经 done 的旧状态不再动浏览器
          const before = readCollectorStatus(store.root).status;
          const advanced = advanceSessionCollect({ root: store.root, agentStatus: agentStatus });
          if (before !== null && before !== undefined && before.state === 'running'
            && advanced !== null && advanced !== undefined && advanced.state !== 'running'
            && browser !== null && typeof ops.closeBrowser === 'function') {
            void ops.closeBrowser(browser);
          }
        }
        const result = readCollectorStatus(store.root);
        const installed = isSessionController(liveSessionController) || result.installed;
        json(res, 200, { ok: true, installed: installed, status: result.status });
      },
    },

    [ROUTES.resumeOptimize]: {
      POST: async (req, res) => {
        const body = await readJsonBody(req);
        if (available !== true) {
          json(res, 409, { ok: false, error: 'ai-unavailable', message: '本机没有可调用的模型，无法生成简历。' });
          return;
        }
        const result = await optimizeResume(llm, {
          name: body.name,
          targetJob: body.targetJob,
          experience: body.experience,
          project: body.project,
          skills: body.skills,
          education: body.education,
          options: { provider: body.provider, model: body.model },
        });
        if (fail(res, result)) return;
        json(res, 200, {
          ok: true,
          resume: result.resume,
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
        });
      },
    },
  };
}
