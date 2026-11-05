/**
 * 题库系统自检（docs/INTERVIEW-V3-PLAN.md §2 §3 §9 Phase A）：
 * store 白名单与容量 / 记录归一 / 权重公式 / mastery 更新 / 存量迁移幂等 /
 * 内置 300 题导入 / 入库去重接线 / 筛选列表。
 *
 * 运行：node tests/bank-store.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLLECTIONS, createStore } from '../server/store.js';
import {
  applyJudgment, buildBankRecord, ensureBankReady, findBankQuestion, hitRatioOf,
  importBuiltinBank, ingestQuestions, listQuestions, markMastered,
  migrateMistakes, migratePersonalToGeneral, nextMastery, normalizePoints, resetBankReadyForTest,
  weightMultiplier, WEIGHT_MAX, WEIGHT_MIN,
} from '../server/bank.js';
import { MOCK_INTERVIEW_BANKS } from '../server/mock.js';

const nl = String.fromCharCode(10);
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const root = mkdtempSync(join(tmpdir(), 'upcv-bank-'));
const store = createStore(root);
const NOW = '2026-11-01T00:00:00.000Z';
resetBankReadyForTest();

await check('questions 在 store 白名单里', () => {
  assert.ok(COLLECTIONS.includes('questions'));
  assert.equal(store.list('questions').note, 'empty');
});

await check('normalizePoints：旧扁平数组视为 essentials，两层各自截断', () => {
  assert.deepEqual(normalizePoints(['a', 'b']), { essentials: ['a', 'b'], bestPractice: [] });
  const two = normalizePoints({ essentials: ['a', 'b', 'c', 'd', 'e'], bestPractice: ['x', 'y', 'z'] });
  assert.equal(two.essentials.length, 4);
  assert.equal(two.bestPractice.length, 2);
});

await check('buildBankRecord：默认值与 personal 作用域约束', () => {
  const base = buildBankRecord({ text: '题干', points: ['要点'], tags: ['事件循环', 'react 性能'] }, { now: NOW });
  assert.equal(base.level, 'mid');
  assert.equal(base.kind, 'concept');
  assert.equal(base.scope, 'general');
  assert.equal(base.status, 'active');
  assert.deepEqual(base.topic, ['事件循环', 'React 原理'], 'react 性能 折叠到规范标签');
  assert.equal(base.origin.via, 'session');
  // V0.22 取消 personal：新入库一律 general
  const legacyInput = buildBankRecord({ text: '题干', scope: 'personal', origin: { resumeId: 'r1', via: 'resume' } }, { now: NOW });
  assert.equal(legacyInput.scope, 'general', 'V0.22 起不再产出 personal 题');
  assert.equal(buildBankRecord({ text: '  ' }, { now: NOW }), null);
});

await check('weightMultiplier：pass ×0.5 / fail ×3 / partial 按命中率平滑', () => {
  assert.equal(weightMultiplier('pass', 1), 0.5);
  assert.equal(weightMultiplier('fail', 0), 3);
  assert.equal(weightMultiplier('partial', 0.8), 1.4);
  assert.equal(weightMultiplier('partial', 0.5), 2);
  assert.equal(weightMultiplier('partial', undefined), 2, '旧判定无命中率时按 0.5（与旧语义一致）');
});

await check('hitRatioOf：显式 ratio 优先；missedPoints 对照要点反推；verdict 兜底', () => {
  assert.equal(hitRatioOf({ hitRatio: 0.7 }, { essentials: ['a', 'b'] }), 0.7);
  const r = hitRatioOf({ missedPoints: ['要点二'] }, { essentials: ['要点一', '要点二'] });
  assert.equal(r, 0.5);
  assert.equal(hitRatioOf({ verdict: 'pass' }, []), 1);
  assert.equal(hitRatioOf({ verdict: 'partial' }, []), 0.5);
});

await check('nextMastery：计数器、streak 规则、weight 夹取、history 截断', () => {
  let m = nextMastery(undefined, { verdict: 'fail', missedPoints: ['x'] }, { now: NOW });
  assert.deepEqual([m.seen, m.fail, m.streak, m.weight], [1, 1, 0, 3]);
  m = nextMastery(m, { verdict: 'fail' }, { now: NOW });
  assert.equal(m.weight, WEIGHT_MAX, '连续 fail 乘到上限 8');
  m = nextMastery(m, { verdict: 'pass' }, { now: NOW });
  assert.deepEqual([m.pass, m.streak, m.weight], [1, 1, 4]);
  m = nextMastery(m, { verdict: 'partial', hitRatio: 0.9 }, { now: NOW });
  assert.equal(m.streak, 1, 'partial 不清 streak');
  m = nextMastery(m, { verdict: 'fail' }, { now: NOW });
  assert.equal(m.streak, 0, 'fail 清 streak');
  for (let i = 0; i < 8; i += 1) m = nextMastery(m, { verdict: 'pass' }, { now: NOW });
  assert.equal(m.weight, WEIGHT_MIN, '连续 pass 衰减到下限 0.05');
  assert.equal(m.history.length, 5, 'history 截断到 5 条');
});

await check('migrateMistakes：fail 高权重起步；幂等；removed 不迁移', () => {
  store.upsert('mistakes', { id: 'm1', question: '什么是事件循环', tags: ['事件循环'], points: ['宏任务', '微任务'], verdict: 'fail', status: 'active', addedAt: NOW, history: [{ verdict: 'fail', judgedBy: 'ai', at: NOW }] });
  store.upsert('mistakes', { id: 'm2', question: '什么是闭包', tags: ['闭包'], points: [], verdict: 'pass', status: 'solved', addedAt: NOW });
  store.upsert('mistakes', { id: 'm3', question: '已移出的题', tags: [], points: [], verdict: 'fail', status: 'removed', addedAt: NOW });
  const first = migrateMistakes(store, { now: NOW });
  assert.equal(first.migrated, 2);
  const m1 = findBankQuestion(store, { id: 'mq-m1' });
  assert.equal(m1.mastery.weight, 3);
  assert.equal(m1.mastery.fail, 1);
  assert.equal(m1.kind, 'practice');
  assert.equal(m1.points.essentials.length, 2);
  assert.equal(findBankQuestion(store, { id: 'mq-m2' }).mastery.weight, 0.5, '旧 solved 题按已掌握一次起步');
  assert.equal(findBankQuestion(store, { id: 'mq-m3' }), undefined, 'removed 错题不迁移');
  // 迁移后练了一道再重跑迁移：绝不覆盖已有 mastery
  applyJudgment(findBankQuestion(store, { id: 'mq-m1' }), { verdict: 'pass' }, { now: NOW });
  store.upsert('questions', applyJudgment(findBankQuestion(store, { id: 'mq-m1' }), { verdict: 'pass' }, { now: NOW }));
  const second = migrateMistakes(store, { now: NOW });
  assert.equal(second.migrated, 0, '幂等：已存在的 mq-id 跳过');
  const preserved = findBankQuestion(store, { id: 'mq-m1' });
  assert.equal(preserved.mastery.pass, 1, '重跑迁移不覆盖答题积累（仍是练习后的状态）');
  assert.equal(preserved.mastery.streak, 1);
});

await check('importBuiltinBank：300 题导入、meta 标注生效、幂等', () => {
  const result = importBuiltinBank(store, { now: NOW });
  assert.equal(result.imported, 300);
  const second = importBuiltinBank(store, { now: NOW });
  assert.equal(second.imported, 0, '幂等：重跑不重复导入');
  const total = store.list('questions').items.length;
  assert.equal(total, 302, '300 内置 + 2 迁移错题');
  const sample = findBankQuestion(store, { id: 'bq-product-manager-18' });
  assert.ok(['junior', 'mid', 'senior'].includes(sample.level), 'meta 标注了级别');
  assert.ok(['concept', 'mechanism', 'practice', 'scenario'].includes(sample.kind), 'meta 标注了题型');
  const withBp = findBankQuestion(store, { id: 'bq-backend-engineer-31' });
  assert.ok(withBp.points.bestPractice.length > 0, 'bp 下标拆出了进阶要点');
  assert.ok(withBp.points.essentials.length > 0);
  // 每个题库题数一致（分页聚合全部条目再统计）
  const bankCount = new Map();
  for (let offset = 0; offset < 400; offset += 200) {
    for (const item of listQuestions(store, { offset: offset, limit: 200 }).items) {
      const bankId = item.origin?.bankId;
      if (bankId !== undefined) bankCount.set(bankId, (bankCount.get(bankId) ?? 0) + 1);
    }
  }
  for (const bank of MOCK_INTERVIEW_BANKS) {
    assert.equal(bankCount.get(bank.id), bank.questionCount, bank.id + ' 题数一致');
  }
});

await check('migratePersonalToGeneral：存量 personal 题一次性转 general（幂等）', () => {
  store.upsert('questions', { id: 'legacy-p1', text: '旧个人题', scope: 'personal', origin: { source: 'ai', via: 'resume', resumeId: 'r-gone' }, status: 'active', createdAt: NOW });
  const first = migratePersonalToGeneral(store);
  assert.equal(first.migrated, 1);
  const migrated = findBankQuestion(store, { id: 'legacy-p1' });
  assert.equal(migrated.scope, 'general');
  assert.equal(migrated.origin.resumeId, 'r-gone', 'resumeId 保留作溯源');
  const second = migratePersonalToGeneral(store);
  assert.equal(second.migrated, 0, '幂等：没有 personal 题时零操作');
});

await check('ensureBankReady：进程内只跑一次，返回汇总', () => {
  resetBankReadyForTest();
  const result = ensureBankReady(store, { now: NOW });
  assert.deepEqual(result, { migrated: 0, imported: 0 }, '已迁移/导入过，本次为 0');
  assert.deepEqual(ensureBankReady(store, { now: NOW }), { skipped: true });
});

await check('ingestQuestions：新题入库 + idMap；精确重复 → matched 映射', () => {
  const generated = [
    { questionId: 'gen-1', question: '浏览器渲染关键路径里，CSS 与 JS 分别如何阻塞渲染？', tags: ['浏览器渲染'], points: ['CSS 阻塞首次渲染', 'JS 阻塞 DOM 解析'], level: 'mid', kind: 'mechanism' },
    { questionId: 'gen-2', question: '什么是事件循环？', tags: ['事件循环'], points: ['宏任务'] },
    { questionId: 'gen-3', question: '请解释 React Fiber 的时间切片原理', tags: ['React 原理'], points: ['时间切片'], bestPractice: ['并发模式的局限'] },
  ];
  const result = ingestQuestions(store, generated, { via: 'jd', now: NOW });
  assert.equal(result.items.length, 2, 'gen-2 与迁移错题同题干被拒收');
  assert.ok(result.items.every((item) => item.text.length > 0));
  assert.equal(result.items[0].origin.via, 'jd');
  assert.equal(result.items[1].points.bestPractice.length, 1, 'gen-3 的进阶要点入库');
  const map = new Map(result.idMap.map((entry) => [entry.from, entry.to]));
  assert.equal(map.get('gen-1') !== undefined, true, '新题映射到题库 id');
  assert.equal(map.get('gen-2'), 'mq-m1', '与迁移错题同题干 → 映射到已有条目');
  assert.equal(result.skipped.find((entry) => entry.from === 'gen-2')?.reason.includes('完全相同'), true);
  // 再来一道与 gen-1 高度相似的：跳过并 matched
  const again = ingestQuestions(store, [{ questionId: 'gen-4', question: '浏览器渲染关键路径中，CSS 与 JS 分别怎样阻塞渲染？', tags: ['浏览器渲染'], points: ['CSS 阻塞首次渲染', 'JS 阻塞 DOM 解析'] }], { via: 'jd', now: NOW });
  assert.equal(again.items.length, 0, '高度相似被拒');
  assert.equal(again.idMap[0].to, map.get('gen-1'), '映射到原条目');
  // 疑似区间（相似度 0.45-0.8）且要点不同 → 入库但带 suspectDuplicate 标记（独立 store 保证确定性）
  const isoRoot = mkdtempSync(join(tmpdir(), 'upcv-bank-suspect-'));
  const isoStore = createStore(isoRoot);
  ingestQuestions(isoStore, [{ questionId: 'a-1', question: '浏览器渲染关键路径里，CSS 与 JS 分别如何阻塞渲染？', tags: ['浏览器渲染'], points: ['CSS 阻塞首次渲染'] }], { via: 'jd', now: NOW });
  const suspect = ingestQuestions(isoStore, [{ questionId: 'a-2', question: '浏览器渲染关键路径中，CSS 与 JS 分别是怎样阻塞渲染的？', tags: ['浏览器渲染'], points: ['渲染阻塞发生的时机'] }], { via: 'jd', now: NOW });
  assert.equal(suspect.items.length, 1, '疑似重复不在拒收区，照常入库');
  assert.equal(suspect.items[0].suspectDuplicate, true, '入库时带疑似标记');
  rmSync(isoRoot, { recursive: true, force: true });
});

await check('findBankQuestion：按 id 命中；旧会话随机 id 时按题干回退', () => {
  const hit = findBankQuestion(store, { id: 'bq-product-manager-1' });
  assert.equal(hit.origin.source, 'builtin');
  const byStem = findBankQuestion(store, { id: 'q-not-exist', text: '什么是事件循环' });
  assert.equal(byStem.id, 'mq-m1');
  assert.equal(findBankQuestion(store, { id: '', text: '' }), undefined);
});

await check('listQuestions：筛选（topic/level/kind/q）与 view（review/mastered）', () => {
  const all = listQuestions(store, { limit: 200 });
  assert.equal(all.total > 300, true);
  const byLevel = listQuestions(store, { level: 'senior', limit: 200 });
  assert.ok(byLevel.items.every((item) => item.level === 'senior'));
  assert.ok(byLevel.total > 0, 'meta 里存在 senior 题');
  const byTopic = listQuestions(store, { topic: ['缓存架构'], limit: 200 });
  assert.ok(byTopic.items.every((item) => item.topic.includes('缓存架构')));
  const byQ = listQuestions(store, { q: '事件循环', limit: 200 });
  assert.ok(byQ.items.every((item) => item.text.includes('事件循环')));
  // 练错一道 → review 视图能看到
  const target = findBankQuestion(store, { id: 'bq-product-manager-1' });
  const judged = applyJudgment(target, { verdict: 'fail', missedPoints: ['x'] }, { now: NOW });
  store.upsert('questions', judged);
  const review = listQuestions(store, { view: 'review', limit: 200 });
  assert.ok(review.items.some((item) => item.id === 'bq-product-manager-1'));
  const mastered = listQuestions(store, { view: 'mastered', limit: 200 });
  assert.ok(mastered.items.every((item) => (item.mastery?.weight ?? 1) <= WEIGHT_MIN + 0.01));
  // 分页
  const page = listQuestions(store, { offset: 0, limit: 10 });
  assert.equal(page.items.length, 10);
});

await check('markMastered：weight 压到下限，计数器不动', () => {
  const target = findBankQuestion(store, { id: 'bq-product-manager-1' });
  const mastered = markMastered(target);
  assert.equal(mastered.mastery.weight, WEIGHT_MIN);
  assert.equal(mastered.mastery.fail, target.mastery.fail);
});

await check('store 容量：questions 集合 2000 上限（CAPS 覆盖默认 100）', () => {
  const capRoot = mkdtempSync(join(tmpdir(), 'upcv-bank-cap-'));
  const capStore = createStore(capRoot);
  const many = Array.from({ length: 2010 }, (_, i) => ({ id: 'cap-' + i, text: '题 ' + i }));
  const result = capStore.upsertMany('questions', many);
  assert.equal(result.count, 2000);
  assert.equal(capStore.list('questions').items.length, 2000);
  rmSync(capRoot, { recursive: true, force: true });
});

rmSync(root, { recursive: true, force: true });
console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
