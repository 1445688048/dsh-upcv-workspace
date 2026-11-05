/**
 * 生成层与路由层自检：用假 llm + 假 req/res，不接触真实宿主。
 * 运行：node tests/ai.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeGeneratedQuestions, generateSourceQuestions, optimizeResume, generateInterviewReport } from '../server/ai.js';
import { generateForPoint } from '../server/bank-gen.js';
import { createHandlers, ROUTES, BASE, ACTION_HEADER } from '../server/api.js';
import { rejectForeign } from '../server/fence.js';
import { createStore } from '../server/store.js';
import { MOCK_INTERVIEW_BANKS } from '../server/mock.js';

const nl = String.fromCharCode(10);
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

/** 假 llm：按顺序吐出给定的文本回包。 */
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

/** 假 req：提供 headers / socket / 异步 body。 */
function fakeReq({ method = 'POST', host = '127.0.0.1:43129', address = '127.0.0.1', body = null, headers = {} } = {}) {
  const text = body === null ? '' : JSON.stringify(body);
  const req = {
    method: method,
    url: '/x',
    headers: Object.assign({ host: host }, headers),
    socket: { remoteAddress: address },
  };
  if (text !== '') {
    req.headers['content-type'] = req.headers['content-type'] ?? 'application/json';
    req.headers['content-length'] = String(Buffer.byteLength(text));
    req[Symbol.asyncIterator] = function () {
      let done = false;
      return { next: async () => { if (done) return { done: true, value: undefined }; done = true; return { done: false, value: Buffer.from(text) }; } };
    };
  }
  return req;
}

/** 假 res：记录状态码与 JSON。 */
function fakeRes() {
  return {
    statusCode: 0,
    payload: null,
    headersSent: false,
    writeHead(status) { this.statusCode = status; this.headersSent = true; return this; },
    end(chunk) { if (chunk !== undefined) this.payload = JSON.parse(chunk); },
  };
}

/** 调一个 handler。面试 v2 路由需要 store（回流/错题本），默认挂一个临时 store。 */
const testStore = createStore(join(tmpdir(), 'upcv-ai-test-'));
async function invoke(table, method, req, available, llm) {
  const handlers = createHandlers({ llm: llm, available: available, store: testStore });
  const res = fakeRes();
  await handlers[table][method](req, res);
  return res;
}

await check('normalizeGeneratedQuestions 丢脏数据并归一成 3.1 契约形状', async () => {
  const result = normalizeGeneratedQuestions([
    { question: '有效题目', tags: ['js事件循环', 'React性能'], points: ['要点1', '要点2'] },
    { question: '   ', tags: [] },
    null,
    { question: '缺要点的题', tags: ['Promise'] },
    { question: '只有考察点的题', tags: ['闭包'], point: '作用域' },
    { question: '未知标签原样入库', tags: ['我自定义的标签'] },
  ], { source: 'jd', sourceRef: 'job-1' });
  assert.equal(result.questions.length, 4);
  assert.equal(result.questions[0].tags[0], '事件循环', '同义折叠生效');
  assert.equal(result.questions[0].tags[1], 'React 原理', '同义折叠生效');
  assert.equal(result.questions[0].source, 'jd');
  assert.equal(result.questions[0].sourceRef, 'job-1');
  assert.equal(result.questions[0].isReplay, false);
  assert.ok(result.questions[0].questionId.startsWith('q-'), 'questionId 必须是 q- 前缀');
  assert.deepEqual(result.questions[1].points, ['能给出具体、可核对的回答'], '完全缺要点时补综合要点');
  assert.deepEqual(result.questions[2].points, ['作用域'], '有考察点时回落为单条要点');
  assert.equal(result.questions[3].tags[0], '我自定义的标签', '词表是引导不是白名单');
  assert.ok(result.problems.length > 0);
});

await check('generateSourceQuestions 未选题源时拒绝（三选一强制）', async () => {
  const result = await generateSourceQuestions(fakeLlm(['[]']), {});
  assert.equal(result.error, 'source-required');
  const badSource = await generateSourceQuestions(fakeLlm(['[]']), { source: '通用' });
  assert.equal(badSource.error, 'source-required');
});

await check('generateSourceQuestions 题源缺料时报错', async () => {
  const noJd = await generateSourceQuestions(fakeLlm(['[]']), { source: 'jd', jdText: '   ' });
  assert.equal(noJd.error, 'source-material-required');
  const noResume = await generateSourceQuestions(fakeLlm(['[]']), { source: 'resume' });
  assert.equal(noResume.error, 'source-material-required');
  const unknownSource = await generateSourceQuestions(fakeLlm(['[]']), { source: 'mistake' });
  assert.equal(unknownSource.error, 'source-required', '错题集题源已退役，非法题源直接拒绝');
});

await check('generateSourceQuestions 正常产出并归一（JD 源）', async () => {
  const payload = JSON.stringify([
    { question: 'Q1', tags: ['js事件循环'], points: ['宏微任务', '浏览器差异'] },
    { question: 'Q2', tags: ['Promise'], points: ['链式调用'] },
  ]);
  const result = await generateSourceQuestions(fakeLlm([payload]), { source: 'jd', jdText: '要求熟悉前端', tags: ['事件循环'], count: 2 });
  assert.equal(result.questions.length, 2);
  assert.equal(result.questions[0].source, 'jd');
  assert.ok(result.questions[0].questionId.startsWith('q-'));
  assert.deepEqual(result.questions[0].tags, ['事件循环']);
  assert.equal(result.provider, 'p1');
});

await check('generateForPoint 渲染了知识点/已有题干供给（bank-generate）', async () => {
  let seen = '';
  const spyLlm = {
    listProviders: async () => [{ id: 'p1' }],
    listModels: async () => [{ id: 'm1' }],
    stream: ({ messages }) => {
      seen = JSON.stringify(messages);
      return (async function* () { yield { kind: 'text-delta', text: '[]' }; yield { kind: 'finish', reason: { kind: 'stop' } }; })();
    },
  };
  const result = await generateForPoint(spyLlm, {
    topic: '缓存架构',
    note: '项目里用 Redis 做缓存',
    existingText: ['什么是缓存穿透'],
    count: 4,
  });
  // 回包 [] 会被 questionArrayValidator 拒绝 → ai-unparsable
  assert.equal(result.error, 'ai-unparsable');
  assert.ok(seen.includes('缓存架构'), '知识点要进 prompt');
  assert.ok(seen.includes('什么是缓存穿透'), '已有题干供给要进 prompt（去重预防层）');
  assert.ok(seen.includes('Redis 做缓存'), '出处上下文要进 prompt');
});

await check('generateSourceQuestions 回包不是数组时重试后失败', async () => {
  const result = await generateSourceQuestions(fakeLlm(['{"foo":1}']), { source: 'jd', jdText: '要求熟悉前端' });
  assert.equal(result.error, 'ai-unparsable');
  assert.ok(result.message);
});

await check('optimizeResume 回包没有姓名与经历时失败（不假装成功）', async () => {
  const result = await optimizeResume(fakeLlm(['{"basics":{"email":"a@b.c"}}']), { targetJob: '产品经理' });
  assert.equal(result.error, 'ai-unparsable');
});

await check('optimizeResume 产出的是可编辑 schema 文档', async () => {
  const payload = JSON.stringify({
    basics: { name: '张三', label: '产品经理', summary: '五年经验' },
    work: [{ name: '字节', position: 'PM', startDate: '2021-07', endDate: '2024-01', summary: '<p>做了 <strong>15%</strong> 提升</p>' }],
  });
  const result = await optimizeResume(fakeLlm([payload]), { targetJob: '产品经理', name: '张三' });
  assert.equal(result.resume.basics.name, '张三');
  assert.equal(result.resume.sections.experience.items.length, 1);
  assert.equal(result.resume.sections.experience.items[0].company, '字节');
  assert.ok(result.resume.sections.experience.items[0].date.indexOf('2021.07') !== -1, '日期应格式化为 2021.07');
  assert.ok(result.resume.metadata.template, '应带上排版 metadata');
});

await check('generateInterviewReport 无作答时拒绝', async () => {
  const result = await generateInterviewReport(fakeLlm(['{}']), { jobTitle: 'x', transcript: [{ question: 'q', answer: '   ' }] });
  assert.equal(result.error, 'no-answer');
});

await check('generateInterviewReport 分数被钳制到 0-100', async () => {
  const payload = JSON.stringify({ overall: 120, communication: -5, professionalism: 70, logic: 65.6, strengths: ['s'], suggestions: ['g'], perQuestion: [{ index: 1, comment: 'c' }] });
  const result = await generateInterviewReport(fakeLlm([payload]), { jobTitle: '前端', transcript: [{ question: 'q', answer: 'a' }] });
  assert.equal(result.report.overall, 100);
  assert.equal(result.report.communication, 0);
  assert.equal(result.report.logic, 66);
  assert.equal(result.report.perQuestion[0].comment, 'c');
});

console.log('路由层');
await check('meta 暴露模型可用性与题库数量', async () => {
  const res = await invoke(ROUTES.meta, 'GET', fakeReq({ method: 'GET' }), true, fakeLlm(['x']));
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ai.available, true);
  assert.deepEqual(res.payload.ai.providers, ['p1']);
  assert.equal(res.payload.bankCount, MOCK_INTERVIEW_BANKS.length);
});

await check('没有模型时面试题回退本地题库并标记来源（3.1 形状）', async () => {
  const res = await invoke(ROUTES.interviewQuestions, 'POST', fakeReq({ body: { source: 'jd', jdText: '要求熟悉前端', count: 5 } }), false, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'local-bank');
  assert.equal(res.payload.questions.length, 5, '题数下限 5（计划规定 5-15 可调）');
  assert.ok(res.payload.notice);
  const first = res.payload.questions[0];
  assert.ok(first.questionId.startsWith('bq-'), '内置题库兜底题用稳定 id（bq-<bankId>-<题号>，判定可落对题库条目）');
  assert.equal(first.isReplay, false);
  assert.ok(Array.isArray(first.points) && first.points.length > 0, '题库兜底也要带判定要点');
});

await check('简历路由缺少目标岗位时 400', async () => {
  const res = await invoke(ROUTES.resumeOptimize, 'POST', fakeReq({ body: {} }), true, fakeLlm(['{}']));
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'target-job-required');
});

await check('模型解析失败时路由返回 502 而不是 200', async () => {
  const res = await invoke(ROUTES.interviewQuestions, 'POST', fakeReq({ body: { source: 'jd', jdText: '要求熟悉前端' } }), true, fakeLlm(['{"foo":1}']));
  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.error, 'ai-unparsable');
});

await check('题源未选时 400（未选不出题）', async () => {
  const res = await invoke(ROUTES.interviewQuestions, 'POST', fakeReq({ body: { jobTitle: '产品经理', count: 3 } }), true, fakeLlm(['[]']));
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'source-required');
});

console.log('信任围栏');
await check('非 loopback 地址被拒绝', async () => {
  const res = fakeRes();
  const blocked = rejectForeign(fakeReq({ address: '10.0.0.5', headers: { [ACTION_HEADER]: '1' } }), res, { mutation: true });
  assert.equal(blocked, true);
  assert.equal(res.statusCode, 403);
});

await check('变更请求缺少自定义头被拒绝', async () => {
  const res = fakeRes();
  const blocked = rejectForeign(fakeReq({ body: { a: 1 } }), res, { mutation: true });
  assert.equal(blocked, true);
  assert.equal(res.payload.error, 'forbidden-action');
});

await check('GET 只读请求不需要自定义头', async () => {
  const res = fakeRes();
  assert.equal(rejectForeign(fakeReq({ method: 'GET' }), res, { mutation: false }), false);
});

await check('带自定义头与 JSON 的 POST 放行', async () => {
  const res = fakeRes();
  const req = fakeReq({ body: { a: 1 }, headers: { [ACTION_HEADER]: '1' } });
  assert.equal(rejectForeign(req, res, { mutation: true }), false);
});

await check('不允许的方法被拒绝', async () => {
  const res = fakeRes();
  assert.equal(rejectForeign(fakeReq({ method: 'DELETE' }), res, { mutation: true }), true);
  assert.equal(res.statusCode, 405);
});

console.log('本地题库');

await check('每个题库至少 50 题且字段完整', async () => {
  for (const bank of MOCK_INTERVIEW_BANKS) {
    assert.ok(bank.questions.length >= 50, bank.id + ' 只有 ' + bank.questions.length + ' 题');
    const ids = new Set();
    for (const q of bank.questions) {
      assert.ok(q.question && q.question.length > 4, bank.id + ' 题干过短');
      assert.ok(['behavioral', 'technical', 'case'].includes(q.category), bank.id + ' 分类非法: ' + q.category);
      assert.ok(!ids.has(q.id), bank.id + ' 题目 id 重复: ' + q.id);
      ids.add(q.id);
    }
    assert.equal(bank.questionCount, bank.questions.length, bank.id + ' questionCount 与实际题数不一致');
  }
});

rmSync(testStore.root, { recursive: true, force: true });
console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
