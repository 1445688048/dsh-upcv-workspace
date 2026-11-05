/**
 * 真实岗位检索闭环自检（全部离线）：归一化 / 摄取去重 / feed 轮转 / spec 契约 / 状态 / 容量。
 *
 * 契约字段定义见 docs/JOBS-FEED-PLAN.md 第 3 节，字段名不得自行变更。
 * 运行：node tests/jobs.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLLECTIONS, createStore } from '../server/store.js';
import { defaultSpec, ensureSpec, ingestFeed, loadJobs, normalizeCity, normalizeSalary, updateJobStatus } from '../server/jobs.js';

const nl = String.fromCharCode(10);

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const tempRoot = () => mkdtempSync(join(tmpdir(), 'upcv-jobs-'));
const writeFeed = (root, rows) => writeFileSync(join(root, 'jobs-feed.jsonl'), rows.map((row) => JSON.stringify(row)).join(nl) + nl, 'utf8');
const feedRow = (over) => Object.assign({
  collectedAt: '2026-10-20T14:30:00+08:00',
  source: 'shixiseng',
  sourceUrl: 'https://www.shixiseng.com/intern/a1',
  title: '前端实习',
  company: '某某科技',
  city: '深圳',
  salary: '250-400元/天',
  tags: ['Vue'],
  raw: {},
}, over);

console.log('normalizeSalary（4.2 全部分支）');
await check('K 月薪区间', async () => {
  assert.deepEqual(normalizeSalary('15-25K'), { min: 15000, max: 25000, period: 'month' });
  assert.deepEqual(normalizeSalary('15K-25K'), { min: 15000, max: 25000, period: 'month' });
});
await check('万（月）区间支持小数', async () => {
  assert.deepEqual(normalizeSalary('1.5-2万'), { min: 15000, max: 20000, period: 'month' });
});
await check('年薪除以 12 折月', async () => {
  assert.deepEqual(normalizeSalary('15-25万/年'), { min: 12500, max: 20833, period: 'month' });
});
await check('日薪按 21.75 个计薪工作日折月（验收例 5437–8700）', async () => {
  assert.deepEqual(normalizeSalary('250-400元/天'), { min: 5437, max: 8700, period: 'month' });
});
await check('两侧单位不同（8千-1.2万）', async () => {
  assert.deepEqual(normalizeSalary('8千-1.2万'), { min: 8000, max: 12000, period: 'month' });
});
await check('面议 / 乱串 / 裸小数字 / 空值 → null（保留原文，不猜）', async () => {
  assert.equal(normalizeSalary('面议'), null);
  assert.equal(normalizeSalary('待遇从优，五险一金'), null);
  assert.equal(normalizeSalary('3-5年'), null);
  assert.equal(normalizeSalary(''), null);
  assert.equal(normalizeSalary(null), null);
  assert.equal(normalizeSalary(undefined), null);
});

console.log('normalizeCity');
await check('去「市」、取主城市段、查别名', async () => {
  assert.equal(normalizeCity('深圳市'), '深圳');
  assert.equal(normalizeCity('深圳-南山区'), '深圳');
  assert.equal(normalizeCity('深圳·南山'), '深圳');
  assert.equal(normalizeCity('sz'), '深圳');
  assert.equal(normalizeCity('广州'), '广州');
  assert.equal(normalizeCity(''), '');
  assert.equal(normalizeCity(null), '');
});

console.log('ingestFeed');
await check('摄取入库：补 salaryRange/cityNorm/status，按 collectedAt 倒序读出', async () => {
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({}), feedRow({ sourceUrl: 'https://www.shixiseng.com/intern/a2', title: '后端实习', salary: '15-25K', collectedAt: '2026-10-19T09:00:00+08:00' })]);
    const stats = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(stats.added, 2);
    assert.equal(stats.duplicates, 0);
    assert.equal(stats.dropped, 0);
    assert.equal(stats.badLines, 0);
    assert.equal(stats.lastCollectedAt, '2026-10-20T06:30:00.000Z', 'lastCollectedAt 应为最大的 collectedAt（UTC 形式）');
    const { items } = loadJobs(root);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, '前端实习', '倒序：新的在前');
    const first = items[0];
    assert.deepEqual(first.salaryRange, { min: 5437, max: 8700, period: 'month' });
    assert.equal(first.cityNorm, '深圳');
    assert.equal(first.status, 'new');
    assert.equal(first.statusAt, null);
    assert.ok(typeof first.id === 'string' && first.id !== '', 'id 应为非空字符串');
    assert.deepEqual(first.tags, ['Vue']);
    assert.deepEqual(first.raw, {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('无 sourceUrl 的行丢弃并报告（数据诚实）', async () => {
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({}), feedRow({ sourceUrl: '', title: '没有链接的岗位' }), feedRow({ sourceUrl: null })]);
    const stats = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(stats.added, 1);
    assert.equal(stats.dropped, 2);
    assert.equal(loadJobs(root).items.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('坏行容忍：坏 JSON / 非对象 / 末尾残行只计数跳过', async () => {
  const root = tempRoot();
  try {
    const rows = [JSON.stringify(feedRow({})), '{"collectedAt":"2026-10-20T10:00:00+08:00","source":"shixiseng"', '[1,2,3]', JSON.stringify(feedRow({ sourceUrl: 'https://www.shixiseng.com/intern/b2', title: '后端实习' })), '   '];
    writeFileSync(join(root, 'jobs-feed.jsonl'), rows.join(nl) + nl, 'utf8');
    const stats = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(stats.added, 2);
    assert.equal(stats.badLines, 2, '坏 JSON 与非对象行各计一次；空行不算');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('主键去重：sourceUrl trim 后精确匹配（与库内、与同批）', async () => {
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({}), feedRow({ sourceUrl: '  https://www.shixiseng.com/intern/a1  ' })]);
    const first = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(first.added, 1);
    assert.equal(first.duplicates, 1, '同批重复');
    writeFeed(root, [feedRow({})]);
    const second = ingestFeed({ root: root, now: '2026-10-20T16:00:00+08:00' });
    assert.equal(second.added, 0);
    assert.equal(second.duplicates, 1, '与库内重复（二次摄取不重复）');
    assert.equal(loadJobs(root).items.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('回落去重：公司+职位+城市归一化命中只记 duplicates，不覆盖原条目', async () => {
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({})]);
    assert.equal(ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' }).added, 1);
    // 不同 sourceUrl，但 公司+职位+城市 归一化后相同（去空格、括号备注、全半角、去「市」）
    writeFeed(root, [feedRow({
      sourceUrl: 'https://www.shixiseng.com/intern/other',
      title: '前端 实习（周六双休）',
      company: ' 某某科技（大厂） ',
      city: '深圳市',
    })]);
    const stats = ingestFeed({ root: root, now: '2026-10-20T16:00:00+08:00' });
    assert.equal(stats.added, 0);
    assert.equal(stats.duplicates, 1);
    const { items } = loadJobs(root);
    assert.equal(items.length, 1, '回落命中不新增、也不覆盖原条目');
    assert.equal(items[0].sourceUrl, 'https://www.shixiseng.com/intern/a1');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('缺 collectedAt 用当前时间补并记 warning', async () => {
  const root = tempRoot();
  try {
    const row = feedRow({});
    delete row.collectedAt;
    writeFeed(root, [row]);
    const stats = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(stats.added, 1);
    assert.equal(stats.warnings.length, 1);
    const { items } = loadJobs(root);
    assert.equal(items[0].collectedAt, '2026-10-20T15:00:00+08:00');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('feed 轮转：改名为 jobs-feed.done-<时间戳>.jsonl 保留同目录', async () => {
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({})]);
    assert.equal(ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' }).added, 1);
    assert.equal(existsSync(join(root, 'jobs-feed.jsonl')), false, '原收件箱文件已轮转走');
    const kept = readdirSync(root).filter((name) => /^jobs-feed\.done-.+\.jsonl$/.test(name));
    assert.equal(kept.length, 1);
    const rotated = JSON.parse(readFileSync(join(root, kept[0]), 'utf8').split(nl)[0]);
    assert.equal(rotated.sourceUrl, 'https://www.shixiseng.com/intern/a1', '轮转文件保留原始行');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('收件箱不存在时返回零统计，不报错、不建文件', async () => {
  const root = tempRoot();
  try {
    const stats = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(stats.added, 0);
    assert.ok(stats.warnings.length >= 1);
    assert.equal(existsSync(join(root, 'jobs.json')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log('容量上限（3.3：500 条，最旧 new 优先删，applied/dismissed 不自动删）');
await check('超出 500 只裁剪最旧的 new 条目', async () => {
  const root = tempRoot();
  try {
    // 502 条存量：时间戳全不相同，最旧 5 条（i=0..4）标为 applied（受保护），其余 new
    const stock = [];
    for (let i = 0; i < 502; i += 1) {
      stock.push({
        id: 'stock-' + i,
        collectedAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
        source: 'shixiseng', sourceUrl: 'https://www.shixiseng.com/intern/s' + i,
        title: '岗位' + i, company: '公司', city: '深圳', cityNorm: '深圳',
        salary: '', salaryRange: null, tags: [], status: i < 5 ? 'applied' : 'new', statusAt: null, raw: {},
      });
    }
    writeFileSync(join(root, 'jobs.json'), JSON.stringify(stock), 'utf8');
    writeFeed(root, [feedRow({ sourceUrl: 'https://www.shixiseng.com/intern/fresh' })]);
    const stats = ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    assert.equal(stats.added, 1);
    assert.equal(stats.trimmed, 3, '503 > 500 → 裁 3 条最旧 new（5 条最旧是 applied，受保护）');
    const { items } = loadJobs(root);
    assert.equal(items.length, 500);
    assert.equal(items.filter((job) => job.status === 'applied').length, 5, 'applied 一条都不能少');
    for (const gone of [5, 6, 7]) {
      assert.equal(items.some((job) => job.id === 'stock-' + gone), false, '被裁的是最旧的 new（stock-' + gone + '）');
    }
    assert.equal(items.some((job) => job.id === 'stock-8'), true, '更晚的 new 保留');
    assert.equal(items.some((job) => job.id === 'stock-501'), true, '最新的保留');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log('ensureSpec（契约①：坏 JSON 不重写）');
await check('首次创建默认 spec（feedPath 绝对路径，v1 不含 BOSS）', async () => {
  const root = tempRoot();
  try {
    const result = ensureSpec(root);
    assert.equal(result.created, true);
    const file = join(root, 'jobs-spec.json');
    assert.equal(existsSync(file), true);
    const spec = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(spec, defaultSpec(root), '落盘内容与 defaultSpec 一致');
    assert.equal(spec.feedPath, join(root, 'jobs-feed.jsonl'));
    assert.deepEqual(spec.defaults, { city: '深圳', keywords: ['前端'] });
    assert.deepEqual(spec.channels.map((channel) => channel.id), ['shixiseng', 'liepin']);
    assert.equal(spec.channels.some((channel) => /boss/i.test(channel.id)), false, 'BOSS 不进 v1 渠道');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('已存在则绝不覆盖（用户手工数据优先）', async () => {
  const root = tempRoot();
  try {
    ensureSpec(root);
    const file = join(root, 'jobs-spec.json');
    writeFileSync(file, JSON.stringify({ version: 1, defaults: { city: '广州', keywords: ['测试'] }, channels: [] }), 'utf8');
    const result = ensureSpec(root);
    assert.equal(result.created, false);
    assert.equal(result.spec.defaults.city, '广州', '手工内容原样返回');
    assert.ok(readFileSync(file, 'utf8').includes('广州'), '文件未被重写');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('坏 JSON 保留原文件并返回错误，不自动重写', async () => {
  const root = tempRoot();
  try {
    const file = join(root, 'jobs-spec.json');
    writeFileSync(file, '{ broken json!!', 'utf8');
    const result = ensureSpec(root);
    assert.equal(result.error, 'spec-invalid');
    assert.equal(readFileSync(file, 'utf8'), '{ broken json!!', '原文件一字不改');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log('状态与岗位库');
await check('状态更新持久化（status + statusAt），非法状态与未知 id 报错', async () => {
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({})]);
    ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    const job = loadJobs(root).items[0];
    const result = updateJobStatus(root, job.id, 'applied', '2026-10-20T16:00:00+08:00');
    assert.equal(result.error, undefined);
    const reloaded = loadJobs(root).items.find((item) => item.id === job.id);
    assert.equal(reloaded.status, 'applied');
    assert.equal(reloaded.statusAt, '2026-10-20T16:00:00+08:00');
    assert.equal(updateJobStatus(root, job.id, 'offer', '2026-10-20T16:00:00+08:00').error, 'invalid-status');
    assert.equal(updateJobStatus(root, '不存在', 'applied', 'x').error, 'not-found');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check('jobs 进了 store 白名单，通用 /store 通道可读', async () => {
  assert.ok(COLLECTIONS.includes('jobs'));
  const root = tempRoot();
  try {
    writeFeed(root, [feedRow({})]);
    ingestFeed({ root: root, now: '2026-10-20T15:00:00+08:00' });
    const listed = createStore(root).list('jobs');
    assert.equal(listed.note, 'ok');
    assert.equal(listed.items.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
