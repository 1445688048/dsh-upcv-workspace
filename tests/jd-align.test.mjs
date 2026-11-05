/**
 * JD 对齐 + 面试追问 + 本地持久化的自检。
 * 运行：node tests/jd-align.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alignJd, nextInterviewStep } from '../server/ai.js';
import { createStore, COLLECTIONS } from '../server/store.js';

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

console.log('JD 对齐');
await check('JD 为空时拒绝（不调用模型）', async () => {
  const result = await alignJd(fakeLlm(['{}']), { jdText: '   ' });
  assert.equal(result.error, 'jd-text-required');
});

await check('正常拆解要求并逐条对齐', async () => {
  const payload = JSON.stringify({
    requirements: [
      { id: 'r1', text: '3 年以上产品经验', type: 'must', keywords: ['产品经验'] },
      { id: 'r2', text: '熟悉 SQL', type: 'must', keywords: ['SQL'] },
      { id: 'r3', text: '有 A/B 实验经验', type: 'nice', keywords: ['A/B'] },
    ],
    coverage: [
      { requirementId: 'r1', matched: true, evidence: '4 年产品经验', suggestion: '' },
      { requirementId: 'r2', matched: false, evidence: '', suggestion: '补充 SQL 使用场景' },
    ],
    keywordHits: ['产品经验'],
    keywordMisses: ['SQL', 'A/B'],
    atsScore: 62,
    summary: '硬性要求缺 SQL',
    rewriteSuggestions: ['在项目里写明用 SQL 做过什么分析'],
  });
  const result = await alignJd(fakeLlm([payload]), { jdText: '要求：3 年产品经验，熟悉 SQL', resumeText: '4 年产品经验' });
  assert.equal(result.alignment.requirements.length, 3);
  assert.equal(result.alignment.atsScore, 62);
  assert.deepEqual(result.alignment.stats, { total: 3, matched: 1, missed: 2 });
  assert.equal(result.alignment.coverage[0].matched, true);
});

await check('模型漏给的覆盖结论会补成「未命中待复核」而不是假装命中', async () => {
  const payload = JSON.stringify({
    requirements: [{ id: 'r1', text: '要求一' }, { id: 'r2', text: '要求二' }],
    coverage: [{ requirementId: 'r1', matched: true, evidence: 'e' }],
    atsScore: 50,
  });
  const result = await alignJd(fakeLlm([payload]), { jdText: 'x' });
  assert.equal(result.alignment.coverage.length, 2, '每条要求都要有覆盖结论');
  const second = result.alignment.coverage[1];
  assert.equal(second.matched, false);
  assert.match(second.suggestion, /人工复核/);
  assert.equal(result.alignment.stats.matched, 1);
});

await check('篡改 requirementId 的覆盖行会被丢弃', async () => {
  const payload = JSON.stringify({
    requirements: [{ id: 'r1', text: '要求一' }],
    coverage: [{ requirementId: 'r1', matched: true }, { requirementId: '不存在', matched: true }],
    atsScore: 80,
  });
  const result = await alignJd(fakeLlm([payload]), { jdText: 'x' });
  assert.equal(result.alignment.coverage.length, 1);
  assert.equal(result.alignment.stats.total, 1);
});

await check('ATS 分被钳制到 0-100', async () => {
  const payload = JSON.stringify({ requirements: [{ id: 'r1', text: 'a' }], coverage: [], atsScore: 250 });
  const result = await alignJd(fakeLlm([payload]), { jdText: 'x' });
  assert.equal(result.alignment.atsScore, 100);
});

await check('缺少 requirements 时带反馈重试后失败', async () => {
  const result = await alignJd(fakeLlm(['{"atsScore": 80}']), { jdText: 'x' });
  assert.equal(result.error, 'ai-unparsable');
  assert.ok(result.message);
});

console.log('面试追问');
await check('没有作答时拒绝', async () => {
  const result = await nextInterviewStep(fakeLlm(['{}']), { jobTitle: '产品经理', transcript: [{ question: 'q', answer: '  ' }] });
  assert.equal(result.error, 'no-answer');
});

await check('返回追问步骤并归一字段', async () => {
  const payload = JSON.stringify({ type: 'followup', question: '你说的提升 18% 是怎么算的？', point: '数据严谨性', hint: '说明口径', reason: '回答里的数字没有口径' });
  const result = await nextInterviewStep(fakeLlm([payload]), {
    jobTitle: '产品经理', asked: ['自我介绍'], transcript: [{ question: '自我介绍', answer: '我做过产品' }], remaining: 3,
  });
  assert.equal(result.step.type, 'followup');
  assert.match(result.step.question, /18%/);
  assert.equal(result.step.point, '数据严谨性');
});

await check('非法 type 会被重试并最终失败', async () => {
  const result = await nextInterviewStep(fakeLlm(['{"type":"unknown","question":"q"}']), {
    jobTitle: 'x', transcript: [{ question: 'q', answer: 'a' }], remaining: 1,
  });
  assert.equal(result.error, 'ai-unparsable');
});

console.log('本地持久化');
const root = mkdtempSync(join(tmpdir(), 'upcv-store-'));
const store = createStore(root);

await check('空目录读出空集合', async () => {
  const result = store.list('resumes');
  assert.deepEqual(result.items, []);
  assert.equal(result.note, 'empty');
});

await check('写入后可读回，且自动补 id 与 updatedAt', async () => {
  const saved = store.upsert('resumes', { name: '张三', targetJob: '产品经理' });
  assert.ok(saved.item.id);
  assert.ok(saved.item.updatedAt);
  const listed = store.list('resumes');
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].name, '张三');
});

await check('同 id 再写是覆盖而不是新增', async () => {
  const first = store.upsert('resumes', { name: 'A' });
  store.upsert('resumes', { id: first.item.id, name: 'B' });
  const items = store.list('resumes').items.filter((entry) => entry.id === first.item.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'B');
});

await check('删除生效，删不存在的报 not-found', async () => {
  const saved = store.upsert('jd', { targetJob: 'x' });
  assert.equal(store.remove('jd', saved.item.id).removed, true);
  assert.equal(store.remove('jd', saved.item.id).error, 'not-found');
});

await check('未知集合被拒绝（防路径穿越）', async () => {
  assert.equal(store.list('../etc/passwd').error, 'invalid-collection');
  assert.equal(store.upsert('../../evil', {}).error, 'invalid-collection');
  assert.equal(store.list('resumes').error, undefined);
});

await check('数据确实落盘为 JSON 文件', async () => {
  store.upsert('interviews', { jobTitle: '前端工程师' });
  const file = join(root, 'interviews.json');
  assert.ok(existsSync(file), '没有生成 interviews.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(parsed[0].jobTitle, '前端工程师');
});

await check('损坏的集合文件当空集合处理，不抛错', async () => {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(root, 'resumes.json'), '{ 这不是 JSON', 'utf8');
  const result = store.list('resumes');
  assert.deepEqual(result.items, []);
  assert.equal(result.note, 'corrupt');
});

await check('六个集合都在白名单里（0.19.0 起含 questions 题库）', async () => {
  assert.deepEqual([...COLLECTIONS].sort(), ['interviews', 'jd', 'jobs', 'mistakes', 'questions', 'resumes']);
});

rmSync(root, { recursive: true, force: true });
console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
