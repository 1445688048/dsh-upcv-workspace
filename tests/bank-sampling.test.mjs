/**
 * 题库自适应采样自检（docs/INTERVIEW-V3-PLAN.md §3，Phase B）：
 * 冷却/复习唤醒 / 冷启动深度阶梯 / 权重抽样分布 / 兜底逐级放松 / 枯竭检测。
 *
 * 运行：node tests/bank-sampling.test.mjs
 */
import assert from 'node:assert/strict';
import { COOLDOWN_MS, REVIVE_MS, effectiveWeight, isCooling, mulberry32, pickNext } from '../server/bank-sampling.js';
import { WEIGHT_MIN } from '../server/bank.js';

const nl = String.fromCharCode(10);
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const NOW = Date.parse('2026-11-01T00:00:00.000Z');
const q = (overrides = {}) => ({
  id: overrides.id ?? 'q-x',
  text: overrides.text ?? '题干',
  topic: overrides.topic ?? ['事件循环'],
  level: overrides.level ?? 'mid',
  kind: overrides.kind ?? 'concept',
  scope: overrides.scope ?? 'general',
  origin: { source: 'ai', via: 'jd', ...(overrides.origin ?? {}) },
  status: overrides.status ?? 'active',
  mastery: overrides.mastery ?? { seen: 0, pass: 0, partial: 0, fail: 0, streak: 0, weight: 1, lastSeenAt: 0, history: [] },
});

await check('isCooling：pass/partial 后 24h 冷却；fail 无冷却；没练过不冷却', () => {
  const passed = q({ mastery: { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 0.5, lastSeenAt: NOW - 1000, history: [{ verdict: 'pass' }] } });
  assert.equal(isCooling(passed, NOW), true, '刚 pass → 冷却');
  assert.equal(isCooling(passed, NOW + COOLDOWN_MS + 1), false, '超 24h → 冷却结束');
  const failed = q({ mastery: { seen: 1, pass: 0, partial: 0, fail: 1, streak: 0, weight: 3, lastSeenAt: NOW - 1000, history: [{ verdict: 'fail' }] } });
  assert.equal(isCooling(failed, NOW), false, '刚 fail → 无冷却，尽快重现');
  assert.equal(isCooling(q(), NOW), false, '没练过 → 不冷却');
});

await check('effectiveWeight：14 天未练且权重衰减 → 唤醒到 0.8', () => {
  const faded = q({ mastery: { seen: 5, pass: 5, partial: 0, fail: 0, streak: 5, weight: 0.05, lastSeenAt: NOW - REVIVE_MS - 1, history: [{ verdict: 'pass' }] } });
  assert.equal(effectiveWeight(faded, NOW), 0.8, '复习唤醒');
  const fresh = q({ mastery: { seen: 5, pass: 5, partial: 0, fail: 0, streak: 5, weight: 0.05, lastSeenAt: NOW - REVIVE_MS + 1000, history: [{ verdict: 'pass' }] } });
  assert.equal(effectiveWeight(fresh, NOW), 0.05, '14 天内不唤醒');
  const healthy = q({ mastery: { seen: 1, pass: 0, partial: 0, fail: 1, streak: 0, weight: 3, lastSeenAt: NOW - REVIVE_MS - 1, history: [{ verdict: 'fail' }] } });
  assert.equal(effectiveWeight(healthy, NOW), 3, '权重高于唤醒线不动');
});

await check('冷启动：topic 零历史 → 按深度阶梯从 concept 起步', () => {
  const items = [
    q({ id: 'm1', kind: 'mechanism' }),
    q({ id: 'c1', kind: 'concept' }),
    q({ id: 'c2', kind: 'concept', level: 'senior' }),
  ];
  const result = pickNext(items, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(result.pool.mode, 'cold');
  assert.equal(result.item.kind, 'concept', '阶梯第一级');
  const filtered = pickNext(items, { topics: ['事件循环'], level: 'mid', now: NOW, rng: mulberry32(1) });
  assert.equal(filtered.item.id, 'c1', '指定级别时阶梯只在该级别里取');
});

await check('有历史即走 weighted：未掌握的题显著压过已掌握的（阶梯由权重涌现）', () => {
  const items = [
    q({ id: 'c1', kind: 'concept', mastery: { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 0.5, lastSeenAt: 0, history: [{ verdict: 'pass' }] } }),
    q({ id: 'm1', kind: 'mechanism' }),
  ];
  let m1 = 0;
  let c1 = 0;
  for (let seed = 0; seed < 200; seed += 1) {
    const r = pickNext(items, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(seed) });
    if (r.item.id === 'm1') m1 += 1;
    else c1 += 1;
  }
  assert.equal(r_mode_helper(items), 'weighted', '池内有历史 → weighted 接管');
  assert.ok(m1 > c1 && m1 / (m1 + c1) > 0.55, 'weight 1:0.5 → m1 明显占优（期望约 2:1），实际 ' + m1 + ':' + c1);
});
function r_mode_helper(items) {
  return pickNext(items, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(1) }).pool.mode;
}

await check('热启动：fail 高权重题稳定压过 pass 低权重题（seeded 分布）', () => {
  const failQ = q({ id: 'fail', mastery: { seen: 1, pass: 0, partial: 0, fail: 1, streak: 0, weight: 3, lastSeenAt: 0, history: [{ verdict: 'fail' }] } });
  const passQ = q({ id: 'pass', mastery: { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 0.5, lastSeenAt: 0, history: [{ verdict: 'pass' }] } });
  const items = [passQ, failQ];
  let failPicks = 0;
  for (let seed = 0; seed < 200; seed += 1) {
    const r = pickNext(items, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(seed) });
    if (r.item.id === 'fail') failPicks += 1;
  }
  assert.ok(failPicks > 160, 'weight 3:0.5 → fail 被抽中应超 80%，实际 ' + (failPicks / 2) + '%');
});

await check('热启动：冷却中的题不被抽中（fail 题例外）', () => {
  const cooling = q({ id: 'cool', mastery: { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 8, lastSeenAt: NOW - 1000, history: [{ verdict: 'pass' }] } });
  const fresh = q({ id: 'fresh' });
  const r = pickNext([cooling, fresh], { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(5) });
  assert.equal(r.item.id, 'fresh', '高权重的冷却题不出现');
  assert.equal(r.pool.relaxed, 'none');
});

await check('兜底放松：全在冷却 → relaxed=cooldown 仍出题', () => {
  const cooling = q({ id: 'c1', mastery: { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 1, lastSeenAt: NOW - 1000, history: [{ verdict: 'pass' }] } });
  const r = pickNext([cooling], { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(3) });
  assert.notEqual(r.item, null);
  assert.equal(r.pool.relaxed, 'cooldown');
});

await check('兜底放松：级别无题（有历史池）→ cross-level（relaxed=level）', () => {
  const senior = q({ id: 's1', level: 'senior', mastery: { seen: 1, pass: 0, partial: 0, fail: 1, streak: 0, weight: 3, lastSeenAt: 0, history: [{ verdict: 'fail' }] } });
  const r = pickNext([senior], { topics: ['事件循环'], level: 'junior', now: NOW, rng: mulberry32(3) });
  assert.equal(r.item.id, 's1');
  assert.equal(r.pool.relaxed, 'level');
});
await check('冷启动下级别缺题：阶梯直接给出唯一新题（新题不受级别挡）', () => {
  const senior = q({ id: 's1', level: 'senior' });
  const r = pickNext([senior], { topics: ['事件循环'], level: 'junior', now: NOW, rng: mulberry32(3) });
  assert.equal(r.item.id, 's1', '零历史池的冷启动不看级别');
  assert.equal(r.pool.mode, 'cold');
});

await check('scope：personal 题只对同简历可见，任何放松级别都不外流', () => {
  const personal = q({ id: 'p1', scope: 'personal', origin: { source: 'ai', via: 'resume', resumeId: 'r1' } });
  const r = pickNext([personal], { topics: [], level: '', resumeId: 'r2', now: NOW, rng: mulberry32(3) });
  assert.equal(r.item, null, '别人的 personal 题抽不到');
  assert.equal(r.pool.depleted, true);
  const own = pickNext([personal], { topics: [], level: '', resumeId: 'r1', now: NOW, rng: mulberry32(3) });
  assert.equal(own.item.id, 'p1', '同一份简历可以抽到');
});

await check('枯竭检测：候选 < 3 或全部权重到底 → depleted（但仍出一题）', () => {
  const two = [q({ id: 'a' }), q({ id: 'b' })];
  const r1 = pickNext(two, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(r1.pool.depleted, true, '候选 2 < 3');
  assert.notEqual(r1.item, null, '枯竭也照常出题，调用方异步补');
  const faded = [q({ id: 'a', mastery: { seen: 2, pass: 2, partial: 0, fail: 0, streak: 2, weight: WEIGHT_MIN, lastSeenAt: 0, history: [{ verdict: 'pass' }, { verdict: 'pass' }] } })];
  const r2 = pickNext(faded, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(r2.pool.depleted, true, '唯一候选权重已衰减到底');
});

await check('空库 / removed 题过滤', () => {
  const r = pickNext([], { topics: [], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(r.item, null);
  assert.equal(r.pool.depleted, true);
  const removed = q({ id: 'x', status: 'removed' });
  const r2 = pickNext([removed], { topics: [], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(r2.item, null);
});

await check('防背答案换发：streak≥2 的题被抽中时改发它的变体', () => {
  const original = q({
    id: 'orig',
    mastery: { seen: 2, pass: 2, partial: 0, fail: 0, streak: 2, weight: 8, lastSeenAt: 0, history: [{ verdict: 'pass' }, { verdict: 'pass' }] },
  });
  const variant = q({
    id: 'variant-1',
    text: '变体题干',
    origin: {},
    mastery: { seen: 0, pass: 0, partial: 0, fail: 0, streak: 0, weight: 0.05, lastSeenAt: 0, history: [] },
  });
  variant.variantOf = 'orig';
  const items = [original, variant];
  // streak≥2：无论权重，抽到 orig 时必须换发 variant
  for (let seed = 0; seed < 30; seed += 1) {
    const r = pickNext(items, { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(seed) });
    assert.equal(r.item.id, 'variant-1', 'seed ' + seed + ' 应换发变体');
    assert.equal(r.pool.variantSwapped, true);
  }
  // streak<2：不换发
  const rookie = q({ id: 'rookie', mastery: { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 8, lastSeenAt: 0, history: [{ verdict: 'pass' }] } });
  const r2 = pickNext([rookie, variant], { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(r2.item.id, 'rookie', '没进背题风险区不换发');
  assert.equal(r2.pool.variantSwapped, false);
  // 变体在冷却 → 不换发（宁可给原题）
  const coolingVariant = q({ id: 'variant-2', text: '冷却中的变体' });
  coolingVariant.variantOf = 'orig';
  coolingVariant.mastery = { seen: 1, pass: 1, partial: 0, fail: 0, streak: 1, weight: 1, lastSeenAt: NOW - 1000, history: [{ verdict: 'pass' }] };
  const r3 = pickNext([original, coolingVariant], { topics: ['事件循环'], level: '', now: NOW, rng: mulberry32(1) });
  assert.equal(r3.item.id, 'orig', '变体冷却时回退原题');
  assert.equal(r3.pool.variantSwapped, false);
});

await check('面试模式定向采样：kinds 深度带 + excludeIds 排除已答', () => {
  const items = [
    q({ id: 'c1', kind: 'concept' }),
    q({ id: 'm1', kind: 'mechanism' }),
    q({ id: 'p1', kind: 'practice' }),
    q({ id: 'c2', kind: 'concept', text: '另一道概念题' }),
  ];
  // 深度带：kinds=['mechanism'] 只出 mechanism 题
  for (let seed = 0; seed < 20; seed += 1) {
    const r = pickNext(items, { topics: ['事件循环'], kinds: ['mechanism'], now: NOW, rng: mulberry32(seed) });
    assert.equal(r.item.kind, 'mechanism', 'seed ' + seed + ' 深度带生效');
  }
  // 带内没题：自动放宽（concept 带外兜底）
  const relaxed = pickNext([q({ id: 'sc1', kind: 'scenario' })], { topics: ['事件循环'], kinds: ['concept'], now: NOW, rng: mulberry32(1) });
  assert.notEqual(relaxed.item, null, '带内无题时放宽出题，不卡住面试');
  // 排除已答：唯一候选被排除 → 空手而回（调用方换点/补题）
  const r2 = pickNext([q({ id: 'only' })], { topics: ['事件循环'], excludeIds: ['only'], now: NOW, rng: mulberry32(1) });
  assert.equal(r2.item, null, '已答题不再出现');
  const r3 = pickNext(items, { topics: ['事件循环'], excludeIds: ['c1', 'c2', 'p1'], now: NOW, rng: mulberry32(1) });
  assert.equal(r3.item.id, 'm1', '排除后剩余候选正常采样');
});

await check('级别带 levels：数组过滤（带内命中、带外排除）', () => {
  const items = [q({ id: 'j1', level: 'junior' }), q({ id: 'm1', level: 'mid' }), q({ id: 's1', level: 'senior' })];
  for (let seed = 0; seed < 20; seed += 1) {
    const r = pickNext(items, { topics: ['事件循环'], levels: ['junior', 'mid'], now: NOW, rng: mulberry32(seed) });
    assert.ok(r.item.level === 'junior' || r.item.level === 'mid', 'seed ' + seed + ' 只出带内级别');
  }
});

await check('级别带 levels：空数组 = 不限（senior 也可出）', () => {
  const items = [q({ id: 's1', level: 'senior' })];
  const r = pickNext(items, { topics: ['事件循环'], levels: [], now: NOW, rng: mulberry32(1) });
  assert.equal(r.item.id, 's1', '空级别带不设限');
});

await check('级别带：旧 level 单值仍兼容（levels 缺省时回退）', () => {
  const items = [q({ id: 'm1', level: 'mid', mastery: { seen: 1, pass: 0, partial: 0, fail: 1, streak: 0, weight: 3, lastSeenAt: 0, history: [{ verdict: 'fail' }] } })];
  const r = pickNext(items, { topics: ['事件循环'], level: 'mid', now: NOW, rng: mulberry32(1) });
  assert.equal(r.item.id, 'm1', '旧参数继续工作');
  const miss = pickNext(items, { topics: ['事件循环'], level: 'senior', now: NOW, rng: mulberry32(1) });
  assert.notEqual(miss.item, null, '带内无题走 cross-level 放宽');
  assert.equal(miss.pool.relaxed, 'level', '放宽级别记录在 pool');
});

await check('级别带 levels：levels 与 level 同送时 levels 优先', () => {
  const items = [q({ id: 'j1', level: 'junior' }), q({ id: 's1', level: 'senior' })];
  for (let seed = 0; seed < 20; seed += 1) {
    const r = pickNext(items, { topics: ['事件循环'], levels: ['junior'], level: 'senior', now: NOW, rng: mulberry32(seed) });
    assert.equal(r.item.level, 'junior', 'seed ' + seed + ' levels 优先于 level');
  }
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
