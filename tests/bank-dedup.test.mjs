/**
 * 题库去重三层闸门自检（docs/INTERVIEW-V3-PLAN.md §5）：
 * 精确层（规范化哈希）/ 相似层（3-gram Jaccard + 要点重叠佐证）/ 预防层（题干供给）。
 *
 * 运行：node tests/bank-dedup.test.mjs
 */
import assert from 'node:assert/strict';
import { dedupeCheck, existingStemsForPrompt, jaccard, normalizeStem, pointsOverlap, stemHash, trigrams } from '../server/bank-dedup.js';

const nl = String.fromCharCode(10);
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

await check('normalizeStem：去空白/标点、统一小写', () => {
  assert.equal(normalizeStem('  什么是 事件循环（Event Loop）？ '), '什么是事件循环eventloop');
  assert.equal(normalizeStem('React和Vue的区别！'), 'react和vue的区别');
  assert.equal(normalizeStem(null), '');
});

await check('stemHash：同义题干哈希一致，不同题干不同', () => {
  assert.equal(stemHash('什么是 事件循环？'), stemHash('什么是事件循环'));
  assert.notEqual(stemHash('什么是事件循环'), stemHash('什么是闭包'));
});

await check('trigrams/jaccard：相同文本 1，无关文本接近 0', () => {
  assert.equal(jaccard(trigrams('Redis持久化机制'), trigrams('Redis持久化机制')), 1);
  const ratio = jaccard(trigrams('如何理解事件循环的宏任务与微任务'), trigrams('请介绍浏览器渲染流程的关键步骤'));
  assert.ok(ratio < 0.3, '无关题干相似度应很低，实际 ' + ratio.toFixed(2));
});

await check('dedupeCheck 精确层：规范化后完全相同 → 拒绝', () => {
  const existing = [{ id: 'q1', text: '什么是事件循环？', essentials: [] }];
  const verdict = dedupeCheck('什么是事件循环', existing);
  assert.equal(verdict.duplicate, true);
  assert.equal(verdict.matchId, 'q1');
});

await check('dedupeCheck 相似层：≥0.8 直接拒绝', () => {
  const existing = [{ id: 'q1', text: '请解释 Redis 的 RDB 快照持久化机制的实现原理与优缺点', essentials: ['RDB 原理'] }];
  const verdict = dedupeCheck('请解释 Redis 的 RDB 快照持久化机制的工作原理与优缺点', existing, ['RDB 原理']);
  assert.equal(verdict.duplicate, true, 'ratio=' + verdict.ratio.toFixed(2));
});

await check('dedupeCheck 相似层：疑似区间且要点高度重叠 → 拒绝', () => {
  const existing = [{ id: 'q1', text: '说说 Redis 缓存穿透的应对方案与注意点', essentials: ['布隆过滤器拦截', '空值缓存短 TTL'] }];
  const verdict = dedupeCheck('说说 Redis 缓存穿透的应对方案与注意细节', existing, ['布隆过滤器拦截', '空值缓存短 TTL']);
  assert.equal(verdict.duplicate, true, 'ratio=' + verdict.ratio.toFixed(2) + ' overlap=' + (verdict.overlap ?? NaN));
});

await check('dedupeCheck 相似层：疑似区间但要点不同 → 疑似不拒收', () => {
  const existing = [{ id: 'q1', text: '请解释 Redis 缓存击穿的互斥锁方案', essentials: ['互斥锁或者逻辑过期'] }];
  const verdict = dedupeCheck('Redis 缓存击穿的互斥锁方案是什么', existing, ['接口层参数校验']);
  assert.equal(verdict.duplicate, false, 'ratio=' + verdict.ratio.toFixed(2));
  assert.equal(verdict.suspect, true);
});

await check('dedupeCheck 相似层：无关题 → 放行', () => {
  const existing = [{ id: 'q1', text: '请解释 Redis 的持久化机制', essentials: ['RDB', 'AOF'] }];
  const verdict = dedupeCheck('CSS 里 flex 布局的主轴与交叉轴分别是什么？', existing, ['主轴方向']);
  assert.equal(verdict.duplicate, false);
  assert.equal(verdict.suspect, false);
});

await check('pointsOverlap：包含式匹配也命中，对称分母', () => {
  assert.equal(pointsOverlap(['布隆过滤器'], ['布隆过滤器拦截空值请求']), 1, '一方包含另一方算命中');
  assert.equal(pointsOverlap(['a', 'b', 'c'], ['a', 'x']), 1 / 3);
  assert.equal(pointsOverlap([], ['a']), 0);
});

await check('existingStemsForPrompt：按 topic 过滤（无标签题不进供给）+ 上限截断', () => {
  const items = [
    { text: 'Redis 题 A', topic: ['缓存架构'] },
    { text: 'JS 题 B', topic: ['事件循环'] },
    { text: 'Redis 题 C', topic: ['缓存架构'] },
    { text: '无标签题 D', topic: [] },
  ];
  assert.deepEqual(existingStemsForPrompt(items, ['缓存架构'], 10), ['Redis 题 A', 'Redis 题 C']);
  assert.equal(existingStemsForPrompt(items, [], 10).length, 4, '不限 topic 时全量供给');
  const capped = existingStemsForPrompt(Array.from({ length: 40 }, (_, i) => ({ text: '题' + i, topic: ['缓存架构'] })), ['缓存架构'], 30);
  assert.equal(capped.length, 30);
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
