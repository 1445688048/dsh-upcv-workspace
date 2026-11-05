/**
 * 题库生成闭环自检（docs/INTERVIEW-V3-PLAN.md §6，Phase B）：
 * 知识点提取归一 / 增量 diff / 按点生成的入库（含 personal 作用域）/ 后台队列状态。
 *
 * 运行：node tests/bank-gen.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetBankReadyForTest } from '../server/bank.js';
import { diffKnowledgePoints, enqueueGenerate, countBetterApproachGaps, extractKnowledgePoints, generateForPoint, generateScaffold, generateGap, generateVariant, hasVariant, ingestGenerated, queueStatus, QUEUE_MAX_PENDING } from '../server/bank-gen.js';
import { applyJudgment, consecutiveFails, findBankQuestion } from '../server/bank.js';
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

const NOW = '2026-11-01T00:00:00.000Z';
const root = mkdtempSync(join(tmpdir(), 'upcv-bank-gen-'));
const store = createStore(root);
resetBankReadyForTest();

await check('diffKnowledgePoints：按 tag 找新增（简历更新增量）', () => {
  const stored = [{ tag: '事件循环', note: '旧' }, { tag: 'Promise', note: '旧' }];
  const extracted = [
    { tag: '事件循环', note: '旧' },
    { tag: 'React 原理', note: '新项目里用了' },
    { tag: '缓存架构', note: '新加的' },
  ];
  const diff = diffKnowledgePoints(extracted, stored);
  assert.deepEqual(diff.added.map((p) => p.tag), ['React 原理', '缓存架构']);
  assert.equal(diff.unchanged, 1);
  assert.equal(diff.all.length, 3);
});

await check('extractKnowledgePoints：direct/related 分层、tag 归一去重、各自截断；缺料拒绝', async () => {
  const kgPayload = JSON.stringify({
    summary: 'Java 后端候选人',
    points: [
      { tag: 'Redis', note: '缓存高频数据', source: 'direct' },
      { tag: 'redis', note: '重复项', source: 'direct' },
      { tag: '', note: '空 tag 丢弃', source: 'direct' },
      { tag: '缓存穿透击穿雪崩', note: '由 Redis 推导：高频伴考', source: 'related' },
      { tag: 'JVM 与 GC', note: 'Java 后端通用基础', source: 'related' },
      { tag: 'RabbitMQ', note: '没写 source 的旧格式按 direct 处理' },
    ],
  });
  const result = await extractKnowledgePoints(fakeLlm([kgPayload]), { resumeText: '简历内容' });
  assert.equal(result.points[0].tag, 'Redis');
  assert.equal(result.points[0].source, 'direct');
  assert.equal(result.points.filter((p) => p.source === 'direct').length, 2, 'Redis + RabbitMQ（同义去重、空 tag 丢弃）');
  assert.equal(result.points.filter((p) => p.source === 'related').length, 2);
  assert.equal(result.summary, 'Java 后端候选人');
  const noResume = await extractKnowledgePoints(fakeLlm([kgPayload]), { resumeText: '  ' });
  assert.equal(noResume.error, 'source-material-required');
});

await check('extractKnowledgePoints：回包没有可用 points → 校验失败重试后报错', async () => {
  const result = await extractKnowledgePoints(fakeLlm(['{"summary":"x","points":[]}']), { resumeText: '简历' });
  assert.equal(result.error, 'ai-unparsable');
});

await check('generateForPoint：产出带 level/kind/personal 的题；空题干丢弃', async () => {
  const payload = JSON.stringify([
    { question: '事件循环和微任务的关系是什么', tags: ['js事件循环'], points: ['宏微任务'], level: 'junior', kind: 'concept', personal: false },
    { question: '你在项目里怎么用事件循环优化过加载', tags: ['事件循环'], points: ['真实案例'], level: 'senior', kind: 'scenario', personal: true },
    { question: '  ', tags: [], points: [] },
  ]);
  const result = await generateForPoint(fakeLlm([payload]), { topic: '事件循环', count: 3 });
  assert.equal(result.questions.length, 2, '空题干丢弃');
  assert.equal(result.questions[0].tags[0], '事件循环', '同义折叠');
  assert.equal(result.questions[0].concept !== undefined, true, '带 concept 考点字段');
  const noTopic = await generateForPoint(fakeLlm([payload]), { topic: '  ' });
  assert.equal(noTopic.error, 'bank-topic-required');
});

await check('ingestGenerated：V0.22 起一律 general（personal 机制已取消）', () => {
  const questions = [
    { questionId: 'g1', question: '通用题：什么是缓存穿透', tags: ['缓存架构'], points: ['布隆过滤器'], kind: 'concept', level: 'mid', personal: false },
    { questionId: 'g2', question: '场景题：在电商项目里怎么处理缓存穿透', tags: ['缓存架构'], points: ['通用场景案例'], kind: 'scenario', level: 'senior', personal: true },
  ];
  const ingested = ingestGenerated(store, questions, { via: 'resume', resumeId: 'r-42', now: NOW });
  assert.equal(ingested.items.length, 2);
  assert.ok(ingested.items.every((item) => item.scope === 'general'), '取消 personal 后一律 general');
  const first = findBankQuestion(store, { id: ingested.items[0].id });
  assert.equal(first.origin.via, 'resume');
});

await check('enqueueGenerate：缺 topic 拒绝；任务进队列并异步消化；status 可查', async () => {
  const bad = enqueueGenerate(store, fakeLlm(['[]']), true, {});
  assert.equal(bad.error, 'bank-topic-required');
  const genPayload = JSON.stringify([
    { question: '队列补的题一：缓存击穿怎么办', tags: ['缓存架构'], points: ['互斥锁'], kind: 'practice', level: 'mid', personal: false },
  ]);
  const ok = enqueueGenerate(store, fakeLlm([genPayload]), true, { topics: ['缓存架构'], count: 1 });
  assert.equal(ok.queued, true);
  // 轮询等队列消化完（进程内异步）
  for (let i = 0; i < 50 && queueStatus().running === true; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const status = queueStatus();
  assert.equal(status.running, false);
  assert.ok(status.completed >= 1, '任务已消化');
  assert.equal(status.lastError, '');
  const added = findBankQuestion(store, { text: '队列补的题一：缓存击穿怎么办' });
  assert.notEqual(added, undefined, '队列任务生成并入库');
  assert.equal(added.origin.via, 'replenish');
  // 无模型：任务跳过不报错
  const offline = enqueueGenerate(store, fakeLlm(['[]']), false, { topics: ['闭包'], count: 1 });
  assert.equal(offline.queued, true);
  for (let i = 0; i < 50 && queueStatus().running === true; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(queueStatus().lastError, '', '无模型时静默跳过，不当错误');
});

// ═══ Phase C：连错降阶 / 缺口补题 / 考点变体 ═══
const scaffoldPayload = JSON.stringify([
  { question: '台阶题：什么是缓存穿透（最基础解释）', tags: ['缓存架构'], points: ['能用自己的话解释穿透'], level: 'junior', kind: 'concept', personal: false },
]);
const gapPayload = JSON.stringify([
  { question: '缺口题：生产环境缓存一致性的标准做法与取舍', tags: ['缓存架构'], points: ['延迟双删或订阅 binlog'], level: 'senior', kind: 'practice', personal: false },
]);
const variantPayload = JSON.stringify([
  { question: '变体题：线上缓存老是和数据库对不上，你会从哪里查起', tags: ['缓存架构'], points: ['占位'], level: 'mid', kind: 'practice', personal: false },
]);

await check('consecutiveFails：history 末尾连续 fail 计数，partial/pass 打断', () => {
  assert.equal(consecutiveFails({ history: [{ verdict: 'fail' }, { verdict: 'fail' }, { verdict: 'fail' }] }), 3);
  assert.equal(consecutiveFails({ history: [{ verdict: 'fail' }, { verdict: 'fail' }, { verdict: 'partial' }, { verdict: 'fail' }] }), 1);
  assert.equal(consecutiveFails({ history: [] }), 0);
  assert.equal(consecutiveFails(undefined), 0);
});

await check('generateScaffold/generateGap/generateVariant：enforce 兜底 + 变体要点原样保留', async () => {
  const scaffold = await generateScaffold(fakeLlm([scaffoldPayload]), {
    question: '原题：缓存与数据库一致性怎么保证',
    topic: '缓存架构',
    missedPoints: ['延迟双删'],
    existingText: [],
    count: 2,
  });
  assert.equal(scaffold.questions[0].kind, 'concept');
  assert.equal(scaffold.questions[0].level, 'junior');
  assert.equal(scaffold.questions[0].tags[0], '缓存架构');

  const gap = await generateGap(fakeLlm([gapPayload]), {
    topic: '缓存架构',
    gaps: ['订阅 binlog 异步更新'],
    existingText: [],
    count: 2,
  });
  assert.equal(gap.questions[0].kind, 'practice');
  assert.equal(gap.questions[0].level, 'senior');

  const variant = await generateVariant(fakeLlm([variantPayload]), {
    question: '原题：如何保证缓存与数据库一致性',
    topic: '缓存架构',
    points: ['先更新数据库再删缓存', '延迟双删'],
    bestPractice: ['订阅 binlog'],
    existingText: [],
  });
  assert.equal(variant.questions.length, 1);
  assert.deepEqual(variant.questions[0].points, ['先更新数据库再删缓存', '延迟双删'], '变体判定要点必须与原题一致');
  assert.deepEqual(variant.questions[0].bestPractice, ['订阅 binlog']);
  const noPoints = await generateVariant(fakeLlm([variantPayload]), { question: 'x', topic: '缓存架构', points: [] });
  assert.equal(noPoints.error, 'bank-topic-required');
});

await check('变体入库：跳过相似层（与原题同考点是刻意的），variantOf 落库', () => {
  // 原题
  const orig = ingestGenerated(store, [
    { questionId: 'o1', question: '如何保证缓存与数据库一致性', tags: ['缓存架构'], points: ['先更新数据库再删缓存'], kind: 'practice', level: 'mid', personal: false },
  ], { via: 'jd', now: NOW });
  assert.equal(orig.items.length, 1);
  const origId = orig.items[0].id;
  // 模拟练对两次 → streak 2
  let item = findBankQuestion(store, { id: origId });
  item = applyJudgment(item, { verdict: 'pass' }, { now: NOW });
  item = applyJudgment(item, { verdict: 'pass' }, { now: NOW });
  store.upsert('questions', item);
  assert.equal(consecutiveFails(item.mastery), 0);
  assert.equal(item.mastery.streak, 2);
  // 相同判分要点的相似题干：普通入库会被相似层拒收
  const blocked = ingestGenerated(store, [
    { questionId: 'v0', question: '讲讲如何保证缓存与数据库的一致性方案', tags: ['缓存架构'], points: ['先更新数据库再删缓存'], kind: 'practice', level: 'mid', personal: false },
  ], { via: 'jd', now: NOW });
  assert.equal(blocked.items.length, 0, '相似层默认拒收');
  // 变体通道：bypassSimilarity 放行 + variantOf 关联
  const variants = ingestGenerated(store, [
    { questionId: 'v1', question: '线上缓存老是和数据库对不上，你会从哪里查起', tags: ['缓存架构'], points: ['先更新数据库再删缓存'], kind: 'practice', level: 'mid', personal: false },
  ], { via: 'variant', now: NOW, bypassSimilarity: true, variantOf: origId });
  assert.equal(variants.items.length, 1);
  assert.equal(variants.items[0].variantOf, origId);
  assert.equal(hasVariant(store, origId), true);
  assert.equal(hasVariant(store, 'no-such'), false);
});

await check('缺口计数：同 topic 的 betterApproach 历史累计', () => {
  const before = countBetterApproachGaps(store, ['缓存架构']);
  const target = findBankQuestion(store, { id: origIdRef() });
  const judged = applyJudgment(target, { verdict: 'pass', betterApproach: '生产上用订阅 binlog 异步更新' }, { now: NOW });
  store.upsert('questions', judged);
  assert.equal(countBetterApproachGaps(store, ['缓存架构']), before + 1);
  assert.equal(countBetterApproachGaps(store, ['无关标签']), 0);
  function origIdRef() { return globalThis.__gapOrigId ?? (globalThis.__gapOrigId = (() => { const list = store.list('questions').items.filter((x) => x.origin?.via === 'jd' && x.scope === 'general'); return list[0].id; })()); }
});

await check('队列：scaffold/gap/variant 任务分发入库；上限 QUEUE_MAX_PENDING', async () => {
  const multi = fakeLlm([scaffoldPayload, gapPayload, variantPayload]);
  const s = enqueueGenerate(store, multi, true, { type: 'scaffold', question: '又错了一致性题', topic: '缓存架构', missedPoints: ['延迟双删'] });
  assert.equal(s.queued, true);
  // gapCount 必须比上次入队记录大才会入队（防重复触发）
  const g = enqueueGenerate(store, multi, true, { type: 'gap', topic: '缓存架构', gaps: ['看门狗续期'], gapCount: 1 });
  assert.equal(g.queued, true, 'gap 任务入队：' + JSON.stringify(g));
  const gDup = enqueueGenerate(store, multi, true, { type: 'gap', topic: '缓存架构', gaps: ['看门狗续期'], gapCount: 1 });
  assert.equal(gDup.queued, false, '同计数重复入队被拒');
  const gGrow = enqueueGenerate(store, multi, true, { type: 'gap', topic: '缓存架构', gaps: ['看门狗续期'], gapCount: 2 });
  assert.equal(gGrow.queued === true || gGrow.error === 'queue-full', true, '计数增长后可再入队（或撞上限）');
  const v = enqueueGenerate(store, multi, true, { type: 'variant', questionId: 'vq-1', question: '什么是缓存击穿', topic: '缓存架构', points: ['互斥锁'], bestPractice: [] });
  assert.equal(v.queued, true);
  for (let i = 0; i < 100 && queueStatus().running === true; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(queueStatus().running, false);
  assert.equal(queueStatus().lastError, '', '三类任务都成功：' + queueStatus().lastError);
  assert.notEqual(findBankQuestion(store, { text: '台阶题：什么是缓存穿透（最基础解释）' }), undefined, '台阶题入库 via=scaffold');
  assert.notEqual(findBankQuestion(store, { text: '缺口题：生产环境缓存一致性的标准做法与取舍' }), undefined, '缺口题入库 via=gap');
  const queuedVariant = findBankQuestion(store, { text: '变体题：线上缓存老是和数据库对不上，你会从哪里查起' });
  assert.notEqual(queuedVariant, undefined, '变体入库 via=variant');
  assert.equal(queuedVariant.variantOf, 'vq-1');
  assert.equal(queuedVariant.origin.via, 'variant');
  // 上限
  let fullError = null;
  for (let i = 0; i < QUEUE_MAX_PENDING + 3; i += 1) {
    const r = enqueueGenerate(store, multi, true, { topics: ['缓存架构'], count: 1 });
    if (r.error === 'queue-full') { fullError = r; break; }
  }
  assert.notEqual(fullError, null, '队列有上限');
});

rmSync(root, { recursive: true, force: true });
console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
