/**
 * 模拟面试 v2 专项自检（docs/INTERVIEW-V2-PLAN.md 第 9 节）：
 *   标签折叠 / 判定入本规则 / 回流混题 / 容错续答 / 旧记录兼容 / 无模型降级 / manifest 一致性。
 * 运行：node tests/interview-v2.test.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeTags, TOPIC_GROUPS, CANONICAL_TOPICS } from '../server/interview-topics.js';
import { bankQuestionsByTags, aggregateInterview, buildLocalReport, toGeneratedQuestion } from '../server/interview.js';
import { applyJudgment, findBankQuestion, resetBankReadyForTest } from '../server/bank.js';
import { BANK_TOPICS } from '../server/bank-topics.js';
import { MOCK_INTERVIEW_BANKS } from '../server/mock.js';
import { listPrompts } from '../server/prompts.js';
import { ACTION_HEADER, ROUTES, createHandlers, json } from '../server/api.js';
import { rejectForeign } from '../server/fence.js';
import { createStore } from '../server/store.js';

const nl = String.fromCharCode(10);
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

function fakeLlm(payloads) {
  let call = 0;
  return {
    listProviders: async () => [{ id: 'p1' }],
    listModels: async () => [{ id: 'm1' }],
    stream: () => {
      const payload = payloads[Math.min(call, payloads.length - 1)];
      call += 1;
      return (async function* () { yield { kind: 'text-delta', text: payload }; yield { kind: 'finish', reason: { kind: 'stop' } }; })();
    },
  };
}

function buildHost(llm, available, store) {
  const handlers = createHandlers({ llm: llm, available: available, store: store ?? null });
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const table = handlers[url.pathname];
    if (table === undefined) { json(res, 404, { ok: false, error: 'not-found' }); return; }
    if (rejectForeign(req, res, { mutation: req.method !== 'GET' })) return;
    const handler = table[req.method];
    if (handler === undefined) { json(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
    Promise.resolve().then(() => handler(req, res)).catch((error) => {
      if (res.headersSent) { res.end(); return; }
      json(res, 500, { ok: false, error: 'internal', message: String(error) });
    });
  });
}

async function listen(host) {
  await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + host.address().port;
  const post = (path, body) => fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify(body || {}),
  });
  const get = (path) => fetch(origin + path);
  return { origin, post, get, close: () => new Promise((resolve) => host.close(resolve)) };
}

// ═══ 1. 标签折叠（归一化用例表：输入 → 期望 → 实际逐条打印）═══
console.log('标签折叠（归一化用例表）');
const CASES = [
  ['["  事件循环  "]', ['事件循环'], 'trim 去首尾空白'],
  ['["React性能"]', ['React 原理'], '同义折叠：React性能 → React 原理'],
  ['["js事件循环"]', ['事件循环'], '同义折叠：js事件循环'],
  ['["Event Loop"]', ['事件循环'], '同义折叠：英文变体（大小写/空格不敏感）'],
  ['["promise"]', ['Promise'], '同义折叠：小写英文归一'],
  ['["我自定义的标签"]', ['我自定义的标签'], '未知标签原样入库（词表是引导不是白名单）'],
  ['["事件循环","js事件循环","事件循环"]', ['事件循环'], '折叠后去重'],
  ['["", null, 42, "闭包"]', ['闭包'], '非字符串与空值丢弃'],
  ['[]', [], '空输入给空数组'],
  ['"闭包"', ['闭包'], '单个字符串也能归一'],
  ['["原型","继承"]', ['原型链', '原型链'], '（折叠后应去重为 1 个）'],
  ['["' + '超'.repeat(30) + '"]', ['超'.repeat(24)], '超长标签截断到 24 字符'],
];
for (const [inputText, expected, reason] of CASES) {
  const input = JSON.parse(inputText);
  const actual = normalizeTags(input);
  const want = reason.includes('去重为 1 个') ? ['原型链'] : expected;
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (!ok) process.exitCode = 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + inputText.slice(0, 42) + (inputText.length > 42 ? '…' : '')
    + '  → 期望 ' + JSON.stringify(want) + '，实际 ' + JSON.stringify(actual) + '（' + reason + '）');
  if (ok) passed += 1;
}

await check('词表自洽：折叠表目标全部在词表内（模块加载即校验）', async () => {
  assert.ok(TOPIC_GROUPS.length >= 6, '至少六个方向分组');
  assert.ok(CANONICAL_TOPICS.length >= 60, '词表要有足够覆盖');
  assert.ok(CANONICAL_TOPICS.includes('事件循环') && CANONICAL_TOPICS.includes('React 原理'));
});

// ═══ 2. 题库 300 题标注覆盖 ═══
console.log('题库标注覆盖');
await check('6 个题库 × 50 题 = 300 题全部带 tags/points 标注', async () => {
  let total = 0;
  let annotated = 0;
  for (const bank of MOCK_INTERVIEW_BANKS) {
    for (const question of bank.questions) {
      total += 1;
      const topics = BANK_TOPICS[bank.id]?.[String(Number(question.id))];
      if (topics === undefined) continue;
      const tags = normalizeTags(topics.t);
      if (tags.length === 0 || tags.length !== topics.t.length) continue;
      if (!Array.isArray(topics.p) || topics.p.length < 2 || topics.p.some((point) => String(point).trim() === '')) continue;
      annotated += 1;
    }
  }
  assert.equal(total, 300, '题库应有 300 题');
  assert.equal(annotated, 300, '300 题应全部带有效标注，实际 ' + annotated);
});

await check('题库兜底出题按标签就近排序', async () => {
  const matched = bankQuestionsByTags(['事件循环', 'Promise'], 6, 'jd');
  assert.equal(matched.length, 6);
  assert.ok(matched[0].tags.includes('事件循环') || matched[0].tags.includes('Promise'), '第一名必须命中标签');
  const hitFirst3 = matched.slice(0, 3).filter((q) => q.tags.some((tag) => ['事件循环', 'Promise'].includes(tag))).length;
  assert.ok(hitFirst3 >= 2, '前三至少两题命中标签，实际 ' + hitFirst3);
  const noTags = bankQuestionsByTags([], 4, 'resume');
  assert.equal(noTags.length, 4);
  assert.equal(noTags[0].source, 'resume');
});

// ═══ 3-6. 判定落题库 mastery（V3 Phase B：错题本退役为只读档案）═══
console.log('判定与题库联动');
const now = '2026-10-20T00:00:00.000Z';
const accRoot = mkdtempSync(join(tmpdir(), 'upcv-iv2-acc-'));
const accStore = createStore(accRoot);
const genPayload = JSON.stringify([
  { question: '新题一：React Fiber 的调度流程', tags: ['React 原理'], points: ['可中断渲染', '优先级'] },
  { question: '新题二：浏览器缓存策略', tags: ['浏览器缓存'], points: ['强缓存', '协商缓存'] },
  { question: '新题三：TypeScript 类型体操', tags: ['TypeScript'], points: ['泛型', '条件类型'] },
  { question: '新题四：前端监控体系', tags: ['前端监控'], points: ['错误上报', '性能指标'] },
  { question: '新题五：微前端隔离方案', tags: ['微前端'], points: ['样式隔离', 'JS 沙箱'] },
  { question: '新题六：HTTP/2 多路复用', tags: ['HTTP 协议'], points: ['二进制分帧', '头部压缩'] },
]);
const judgePayload = JSON.stringify({ type: 'next', question: '我们继续下一题', verdict: 'fail', missedPoints: ['宏微任务顺序'] });
// 调用顺序：预置并判定(judge) → 改判(无模型调用) → 容错续答(gen)
const accAi = await listen(buildHost(fakeLlm([judgePayload, genPayload]), true, accStore));

await check('旧错题随首次判定迁移进题库；AI 判 fail 叠加 mastery；响应不再带 mistake', async () => {
  accStore.upsert('mistakes', { source: 'jd', tags: ['事件循环'], question: '错题一：宏任务微任务顺序', points: ['先清微任务'], answer: '当时答错', verdict: 'fail', missedPoints: ['先清微任务'], status: 'active', addedAt: '2026-10-19T09:00:00.000Z', solvedAt: null, history: [] });
  accStore.upsert('mistakes', { source: 'jd', tags: ['闭包'], question: '错题二：闭包的内存问题', points: ['词法作用域'], answer: '', verdict: 'fail', missedPoints: [], status: 'active', addedAt: '2026-10-19T09:01:00.000Z', solvedAt: null, history: [] });
  const res = await accAi.post(ROUTES.interviewNext, {
    jobTitle: '前端工程师',
    asked: [],
    transcript: [{ question: '错题一：宏任务微任务顺序', answer: '我这次的回答' }],
    remaining: 2,
    followupsUsed: 0,
    question: { questionId: 'q-replay1', question: '错题一：宏任务微任务顺序', tags: ['事件循环'], points: ['先清微任务'], source: 'jd', sourceRef: null, isReplay: false },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.verdict.verdict, 'fail');
  assert.equal(data.verdict.judgedBy, 'ai');
  assert.equal(data.mistake, undefined, '错题本已退役：响应不再带 mistake');
  // 迁移幂等由 bank-store 覆盖；这里验证判定路径触发了迁移 + 判定叠加
  const listed = (await (await accAi.get(ROUTES.storeList + '?collection=questions')).json()).items;
  const mistakeId = accStore.list('mistakes').items.find((entry) => entry.question.includes('错题一')).id;
  const migrated = listed.find((item) => item.id === 'mq-' + mistakeId);
  assert.notEqual(migrated, undefined, '旧错题已迁移为题库条目');
  assert.ok(migrated.mastery.fail >= 2, '迁移种子 fail=1 + 本次 AI 判 fail，实际 ' + migrated.mastery.fail);
});

await check('改判：AI fail → 用户改判 pass → 题库 mastery 重算（streak=1，history 记 user）', async () => {
  const res = await accAi.post(ROUTES.interviewVerdict, {
    verdict: 'pass',
    question: { questionId: 'q-replay1', question: '错题一：宏任务微任务顺序', tags: ['事件循环'], points: ['先清微任务'], source: 'jd', sourceRef: null },
    answer: '重答正确',
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.judgment.judgedBy, 'user', '改判是终局');
  assert.equal(data.mistake, undefined);
  assert.ok(data.bankQuestion.id.startsWith('mq-'), '旧会话随机 id 按题干回退命中迁移条目');
  assert.equal(data.bankQuestion.mastery.streak, 1);
  const listed = (await (await accAi.get(ROUTES.storeList + '?collection=questions')).json()).items;
  const item = listed.find((entry) => entry.id === data.bankQuestion.id);
  assert.equal(item.mastery.history[item.mastery.history.length - 1].judgedBy, 'user');
});

await check('改判反向：题库里没有的新题 → V0.22 起按题干补建条目再判定（Q3：判定不丢）', async () => {
  const res = await accAi.post(ROUTES.interviewVerdict, {
    verdict: 'fail',
    question: { questionId: 'q-x', question: '改判反向的题', tags: ['Promise'], points: ['链式'], source: 'jd', sourceRef: null },
    answer: '其实没答好',
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.judgment.verdict, 'fail');
  assert.equal(data.mistake, undefined);
  assert.notEqual(data.bankQuestion, undefined, '补建的条目随响应返回（轻量回执：id+mastery）');
  assert.equal(data.bankQuestion.mastery.fail, 1);
  const created = (await (await accAi.get(ROUTES.storeList + '?collection=questions')).json()).items.find((item) => item.text === '改判反向的题');
  assert.notEqual(created, undefined, '条目已落库');
  assert.equal(created.origin.via, 'session');
});

// ═══ 7. 容错续答：8 题答 3 题中断 → 已判题落库 → 重开继续/放弃 ═══
console.log('容错续答用例');
await check('8 题会话答 3 题模拟中断 → 3 题判定已落库 → 可继续/放弃且错题已入本', async () => {
  // 1) 出 8 题
  const gen = await (await accAi.post(ROUTES.interviewQuestions, { source: 'jd', jdText: '前端综合', count: 8 })).json();
  assert.equal(gen.questions.length, 6, 'fake 回包 6 道，无回流补足');
  const newOnes = gen.questions.filter((q) => q.isReplay === false);
  assert.equal(newOnes.length, 6, '回流已退役：全部是即时生成题');
  assert.equal(gen.bankCount, 0, '不带标签时题库复用不介入');

  // 2) 模拟客户端：建会话 → 答 3 题（每题判定后即刻 storeSave）→ 中断
  const session = {
    status: 'in-progress',
    jobTitle: '前端综合',
    source: 'jd',
    sourceInfo: { pasted: true },
    questions: gen.questions,
    transcript: [],
    startedAt: '2026-10-20T11:00:00.000Z',
  };
  for (let i = 0; i < 3; i += 1) {
    const question = gen.questions[i];
    const verdict = i === 0 ? 'pass' : 'fail';
    const judged = await (await accAi.post(ROUTES.interviewVerdict, {
      verdict: verdict,
      question: question,
      answer: '第' + (i + 1) + '题的回答',
    })).json();
    session.transcript.push({ ...question, answer: '第' + (i + 1) + '题的回答', verdict: judged.judgment });
    // 客户端行为：首次保存拿到 id，之后同 id 覆盖同一条会话记录
    const saved = await (await accAi.post(ROUTES.storeSave, { collection: 'interviews', item: session })).json();
    session.id = saved.item.id;
  }
  // 3) 中断验证：会话以 in-progress 落库，3 条判定都在
  const listed = await (await accAi.get(ROUTES.storeList + '?collection=interviews')).json();
  const wip = listed.items.find((record) => record.status === 'in-progress' && record.jobTitle === '前端综合');
  assert.notEqual(wip, undefined, 'in-progress 会话已落库');
  assert.equal(wip.transcript.length, 3, '3 题判定已随答随存');
  assert.ok(wip.transcript.every((entry) => entry.verdict !== null && entry.verdict !== undefined));
  // 旧记录（无 status）不会被误认为可续答
  await accAi.post(ROUTES.storeSave, { collection: 'interviews', item: { jobTitle: '旧版会话', transcript: [{ question: 'q', answer: 'a' }], report: { overall: 66 } } });
  const legacyListed = await (await accAi.get(ROUTES.storeList + '?collection=interviews')).json();
  const resumableRule = (record) => record !== null && typeof record === 'object'
    && record.status === 'in-progress' && Array.isArray(record.questions) && record.questions.length > 0;
  assert.equal(legacyListed.items.filter(resumableRule).length, 1, '旧记录不算可续答');

  // 4) 重开继续：客户端按 transcript 剔除已答题，剩 5 题接着答
  const answeredIds = new Set(wip.transcript.map((entry) => entry.questionId));
  const remaining = wip.questions.filter((question) => !answeredIds.has(question.questionId));
  assert.equal(remaining.length, 3, '6 题答完 3 题剩 3 题');

  // 5) 会话里每道判 fail 的题，都能在题库找到条目且 fail 计数 ≥1（出题时已沉淀）
  const bankNow = (await (await accAi.get(ROUTES.storeList + '?collection=questions')).json()).items;
  for (const entry of wip.transcript.filter((item) => item.verdict.verdict === 'fail')) {
    const hit = bankNow.find((item) => item.question === entry.question || item.id === entry.questionId);
    assert.notEqual(hit, undefined, 'fail 题应在题库：' + entry.question);
    assert.ok(hit.mastery.fail >= 1, 'fail 计数已落库：' + entry.question);
  }

  // 6) 放弃：状态 abandoned，已判题不动
  await accAi.post(ROUTES.storeSave, { collection: 'interviews', item: { ...wip, status: 'abandoned' } });
  const finalListed = await (await accAi.get(ROUTES.storeList + '?collection=interviews')).json();
  assert.equal(finalListed.items.find((record) => record.id === wip.id).status, 'abandoned');
});

// ═══ 8. 无模型降级全链路 ═══
console.log('无模型降级');
const offRoot = mkdtempSync(join(tmpdir(), 'upcv-iv2-off-'));
const offStore = createStore(offRoot);
offStore.upsert('mistakes', { source: 'manual', tags: ['闭包'], question: '无模型错题一', points: ['词法作用域'], verdict: 'fail', missedPoints: [], status: 'active', addedAt: now, solvedAt: null, history: [] });
offStore.upsert('mistakes', { source: 'manual', tags: ['事件循环'], question: '无模型错题二', points: ['宏微任务'], verdict: 'fail', missedPoints: [], status: 'active', addedAt: now, solvedAt: null, history: [] });
resetBankReadyForTest(); // 前面用例可能已置位进程内 memo，新 store 需要重新迁移/导入
const offline = await listen(buildHost(undefined, false, offStore));

await check('无模型：题库出题（标签就近）可用', async () => {
  const res = await offline.post(ROUTES.interviewQuestions, { source: 'jd', jdText: '前端', tags: ['闭包'], count: 8 });
  const data = await res.json();
  assert.equal(data.source, 'local-bank');
  assert.equal(data.questions.length, 8);
  assert.ok(data.questions[0].tags.includes('闭包'));
});

await check('无模型：练习模式采样可用（内置题库导入 + 旧错题迁移兜底）', async () => {
  const res = await offline.post(ROUTES.bankPracticeNext, { topics: ['事件循环'], level: '', resumeId: '' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.question.question.length > 0);
  assert.ok(['concept', 'mechanism', 'practice', 'scenario'].includes(data.question.kind));
  // 再来一题（模拟「下一题」）：不限题数
  const second = await (await offline.post(ROUTES.bankPracticeNext, { topics: ['事件循环'], level: '', resumeId: '' })).json();
  assert.equal(second.ok, true);
});

await check('无模型：判定降级用户自判；报告走本地规则（旧记录无 verdict 也兼容）', async () => {
  const judgeRes = await offline.post(ROUTES.interviewVerdict, { verdict: 'fail', question: { question: '无模型自判的题', tags: ['闭包'], points: [], source: 'jd' }, answer: '答' });
  assert.equal((await judgeRes.json()).judgment.judgedBy, 'user');
  const reportRes = await offline.post(ROUTES.interviewReport, {
    jobTitle: 'x',
    transcript: [
      { question: '旧题一', answer: '旧会话没有判定字段，很长的一段回答内容，覆盖背景做法与结果。' },
      { question: '旧题二', answer: '短答' },
    ],
  });
  assert.equal(reportRes.status, 200);
  const report = (await reportRes.json()).report;
  assert.equal(report.verdictDist.unjudged, 2, '旧记录全落未判定');
  assert.equal(report.weakTags.length, 0, '没有判定就没有薄弱点');
  assert.ok(report.overall >= 0 && report.overall <= 100);
});

await check('无模型：自判落题库 mastery；复盘视图能看到刚错的题', async () => {
  const judgeRes = await offline.post(ROUTES.interviewVerdict, { verdict: 'fail', question: { questionId: 'bq-frontend-engineer-1', question: '无模型自判的题', tags: ['闭包'], points: [], source: 'bank' }, answer: '答' });
  const judged = await judgeRes.json();
  assert.equal(judged.judgedBy ?? judged.judgment.judgedBy, 'user');
  assert.notEqual(judged.bankQuestion, undefined, '按 id 命中内置题库条目');
  assert.ok(judged.bankQuestion.mastery.fail >= 1);
  const review = await (await offline.get(ROUTES.bankList + '?view=review&limit=50')).json();
  assert.ok(review.items.some((item) => item.id === judged.bankQuestion.id), '复盘视图含刚错的题');
});

// ═══ 9. manifest 一致性 ═══
console.log('manifest 一致性');
await check('两份生题模板 + 题库模板 + followup/report 升级都在清单里，mistake 模板已移除', async () => {
  const ids = listPrompts().map((entry) => entry.id);
  for (const required of ['interview-questions-jd', 'interview-questions-resume', 'bank-kg', 'bank-generate']) {
    assert.ok(ids.includes(required), '缺模板 ' + required);
  }
  assert.ok(!ids.includes('interview-questions-mistake'), '错题集题源已退役，模板应已移除');
  assert.ok(!ids.includes('interview-questions'), '旧通用模板应已移除');
  const generate = listPrompts().find((entry) => entry.id === 'bank-generate');
  assert.deepEqual(generate.variables.slice().sort(), ['count', 'existing', 'note', 'topic', 'topics'].sort(), 'V0.22 取消 personal：bank-generate 不再注入简历内容');
  const followup = listPrompts().find((entry) => entry.id === 'interview-followup');
  assert.deepEqual(followup.variables.slice().sort(),
    ['asked', 'bestPractice', 'currentQuestion', 'followupsUsed', 'jobTitle', 'points', 'remaining', 'transcript'].sort());
  const jd = listPrompts().find((entry) => entry.id === 'interview-questions-jd');
  assert.deepEqual(jd.variables.slice().sort(), ['count', 'jdText', 'tags', 'topics'].sort());
  const report = listPrompts().find((entry) => entry.id === 'interview-report');
  assert.deepEqual(report.variables.slice().sort(), ['jobTitle', 'transcript'].sort());
});

await check('toGeneratedQuestion：无 source 或空题干拒绝', async () => {
  assert.equal(toGeneratedQuestion({ question: 'x' }, { source: '通用' }), null);
  assert.equal(toGeneratedQuestion({ question: '  ' }, { source: 'jd' }), null);
  const ok = toGeneratedQuestion({ question: '题干', tags: ['Promise'], points: ['p1'] }, { source: 'jd', sourceRef: null });
  assert.equal(ok.isReplay, false);
  assert.equal(ok.sourceRef, null);
});

await check('aggregateInterview：weakTags 排序为 missed 优先', async () => {
  const v = (verdict) => ({ verdict: verdict, missedPoints: [], judgedBy: 'ai', judgedAt: now });
  const agg = aggregateInterview([
    { tags: ['React 原理'], verdict: v('fail') },
    { tags: ['React 原理'], verdict: v('partial') },
    { tags: ['React 原理'], verdict: v('pass') },
    { tags: ['闭包'], verdict: v('pass') },
  ]);
  assert.equal(agg.verdictDist.fail, 1);
  assert.equal(agg.weakTags[0].tag, 'React 原理');
  assert.equal(agg.weakTags[0].missed, 2);
  assert.equal(agg.weakTags[0].total, 3);
});

// ── 清理 ──
await accAi.close();
await offline.close();
rmSync(accRoot, { recursive: true, force: true });
rmSync(offRoot, { recursive: true, force: true });
console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
