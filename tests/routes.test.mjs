/**
 * 路由层端到端自检：起一个真实 http server，按 src/server/index.js 的注册方式
 * 挂上 handlers + rejectForeign，然后用真实 fetch 走一遍，验证
 * 围栏（loopback / 自定义头 / content-type）与 JSON 回包确实成立。
 *
 * 不依赖宿主：llm 用假服务，webServer 用 node:http 顶替。
 * 运行：node tests/routes.test.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ACTION_HEADER, ROUTES, createHandlers, json } from '../server/api.js';
import { resetBankReadyForTest } from '../server/bank.js';
import { rejectForeign } from '../server/fence.js';
import { contentDisposition, findChrome, renderPdf } from '../server/pdf.js';
import { createStore } from '../server/store.js';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

// 按 server/index.js 的方式把 handlers 与围栏接起来
function buildHost(llm, available, store, options = {}) {
  const handlers = createHandlers({ llm: llm, available: available, store: store ?? null, ...options });
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const table = handlers[url.pathname];
    if (table === undefined) { json(res, 404, { ok: false, error: 'not-found' }); return; }
    const mutation = req.method !== 'GET';
    if (rejectForeign(req, res, { mutation: mutation })) return;
    const handler = table[req.method];
    if (handler === undefined) { json(res, 405, { ok: false, error: 'method-not-allowed' }); return; }
    Promise.resolve().then(() => handler(req, res)).catch((error) => {
      if (res.headersSent) { res.end(); return; }
      json(res, 500, { ok: false, error: 'internal', message: String(error) });
    });
  });
}

const storeRootShared = mkdtempSync(join(tmpdir(), 'upcv-routes-shared-'));
const questionsPayload = JSON.stringify([{ question: 'Q1', tags: ['事件循环'], points: ['宏微任务顺序', '浏览器差异'] }]);
const host = buildHost(fakeLlm([questionsPayload]), true);
// 面试 v2：出题/判定路由需要 store（回流与错题本），单独起一个带 store 的 host
const ivHost = buildHost(fakeLlm([questionsPayload]), true, createStore(storeRootShared));
await new Promise((resolve) => ivHost.listen(0, '127.0.0.1', resolve));
const ivOrigin = 'http://127.0.0.1:' + ivHost.address().port;
await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + host.address().port;

const post = (path, body, headers) => fetch(origin + path, {
  method: 'POST',
  headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
  body: JSON.stringify(body || {}),
});

await check('GET /meta 返回模型可用性与题库数', async () => {
  const res = await fetch(origin + ROUTES.meta);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.ai.available, true);
  assert.deepEqual(data.ai.providers, ['p1']);
  assert.equal(data.ai.models[0], 'm1');
  assert.ok(data.bankCount >= 6);
});

await check('GET /banks 返回题库清单', async () => {
  const res = await fetch(origin + ROUTES.banks);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.ok(data.banks.length >= 6);
  assert.ok(data.banks[0].title);
});

await check('带自定义头的 POST 正常出题（题源 JD，3.1 形状）', async () => {
  const res = await fetch(ivOrigin + ROUTES.interviewQuestions, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ source: 'jd', jdText: '要求熟悉 React 与事件循环', count: 5 }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, 'ai');
  assert.equal(data.questions[0].question, 'Q1');
  assert.equal(data.model, 'm1');
  assert.ok(data.questions[0].questionId.startsWith('q-'), 'questionId 必须是 q- 前缀');
  assert.equal(data.questions[0].isReplay, false);
  assert.deepEqual(data.questions[0].points, ['宏微任务顺序', '浏览器差异']);
});

await check('题源未选 400；错题集为空时明确 400 引导', async () => {
  const noSource = await post(ROUTES.interviewQuestions, { jobTitle: '产品经理', count: 3 }, { [ACTION_HEADER]: '1' });
  assert.equal(noSource.status, 400);
  assert.equal((await noSource.json()).error, 'source-required');
  const retiredSource = await fetch(ivOrigin + ROUTES.interviewQuestions, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ source: 'mistake', count: 8 }),
  });
  assert.equal(retiredSource.status, 400);
  assert.equal((await retiredSource.json()).error, 'source-required', '错题集题源已退役');
});

await check('缺少自定义头的 POST 被围栏挡下（403）', async () => {
  const res = await post(ROUTES.interviewQuestions, { jobTitle: '产品经理' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'forbidden-action');
});

await check('content-type 非 JSON 的变更请求被挡下', async () => {
  const res = await fetch(origin + ROUTES.jobsIngest, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', [ACTION_HEADER]: '1' },
    body: '{}',
  });
  assert.equal(res.status, 403);
});

await check('GET 请求无需自定义头', async () => {
  const res = await fetch(origin + ROUTES.banks);
  assert.equal(res.status, 200);
});

await check('未知路径返回 404', async () => {
  const res = await fetch(origin + '/api/dsh-upcv-workspace/nope');
  assert.equal(res.status, 404);
});

await check('方法不允许返回 405', async () => {
  const res = await fetch(origin + ROUTES.meta, { method: 'DELETE' });
  assert.equal(res.status, 405);
});

await check('没有模型时 POST 出题回退本地题库（按标签就近 + 3.1 形状）', async () => {
  const offline = buildHost(undefined, false, createStore(mkdtempSync(join(tmpdir(), 'upcv-routes-off-'))));
  await new Promise((resolve) => offline.listen(0, '127.0.0.1', resolve));
  const offlineOrigin = 'http://127.0.0.1:' + offline.address().port;
  try {
    const res = await fetch(offlineOrigin + ROUTES.interviewQuestions, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({ source: 'jd', jdText: '要求熟悉事件循环与 Promise', tags: ['事件循环'], count: 5 }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.source, 'local-bank');
    assert.equal(data.questions.length, 5);
    assert.ok(data.questions[0].question.length > 4);
    assert.ok(data.questions[0].tags.includes('事件循环'), '标签就近：命中的题排前');
    assert.ok(Array.isArray(data.questions[0].points) && data.questions[0].points.length > 0);
  } finally {
    await new Promise((resolve) => offline.close(resolve));
  }
});

const storeRoot = mkdtempSync(join(tmpdir(), 'upcv-routes-'));
const storeHost = buildHost(fakeLlm([questionsPayload]), true, createStore(storeRoot));
await new Promise((resolve) => storeHost.listen(0, '127.0.0.1', resolve));
const storeOrigin = 'http://127.0.0.1:' + storeHost.address().port;
const storePost = (path, body) => fetch(storeOrigin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
  body: JSON.stringify(body || {}),
});

await check('空集合返回空数组', async () => {
  const res = await fetch(storeOrigin + ROUTES.storeList + '?collection=resumes');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(data.items, []);
});

await check('保存后可读回，并落盘', async () => {
  const saved = await (await storePost(ROUTES.storeSave, { collection: 'resumes', item: { name: '张三', targetJob: '产品经理' } })).json();
  assert.equal(saved.ok, true);
  assert.ok(saved.item.id);
  const listed = await (await fetch(storeOrigin + ROUTES.storeList + '?collection=resumes')).json();
  assert.equal(listed.items.length, 1);
});

await check('未知集合返回 400', async () => {
  const res = await fetch(storeOrigin + ROUTES.storeList + '?collection=/etc/passwd');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid-collection');
});

await check('删除不存在的记录返回 404', async () => {
  const res = await storePost(ROUTES.storeDelete, { collection: 'jd', id: '不存在' });
  assert.equal(res.status, 404);
});

await check('store 缺失时明确 500 而不是静默成功', async () => {
  const res = await post(ROUTES.storeSave, { collection: 'resumes', item: {} }, { [ACTION_HEADER]: '1' });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'store-unavailable');
});

await check('JD 为空时 400', async () => {
  const res = await storePost(ROUTES.jdAlign, { jdText: '   ' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'jd-text-required');
});

await check('JD 超长时 400', async () => {
  const res = await storePost(ROUTES.jdAlign, { jdText: 'x'.repeat(60001) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'jd-too-large');
});

await check('无模型时 JD 对齐 409（不返回假结果）', async () => {
  const offline = buildHost(undefined, false, createStore(storeRoot));
  await new Promise((resolve) => offline.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + offline.address().port + ROUTES.jdAlign, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({ jdText: '要求：会 SQL' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'ai-unavailable');
  } finally {
    await new Promise((resolve) => offline.close(resolve));
  }
});

await check('JD 对齐正常返回结构化结果', async () => {
  const payload = JSON.stringify({
    requirements: [{ id: 'r1', text: '熟悉 SQL', type: 'must', keywords: ['SQL'] }],
    coverage: [{ requirementId: 'r1', matched: false, evidence: '', suggestion: '补充 SQL 经历' }],
    keywordHits: [], keywordMisses: ['SQL'], atsScore: 40, summary: '缺 SQL', rewriteSuggestions: ['写 SQL 项目'],
  });
  const alignHost = buildHost(fakeLlm([payload]), true, createStore(storeRoot));
  await new Promise((resolve) => alignHost.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + alignHost.address().port + ROUTES.jdAlign, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({ jdText: '要求：熟悉 SQL', resumeText: '做过产品' }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.alignment.atsScore, 40);
    assert.equal(data.alignment.stats.total, 1);
    assert.equal(data.alignment.coverage[0].matched, false);
  } finally {
    await new Promise((resolve) => alignHost.close(resolve));
  }
});

await check('简历导入：文本为空时 400', async () => {
  const res = await storePost(ROUTES.resumeImport, { text: '   ' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'import-text-required');
});

await check('简历导入：无模型时 409（不返回假简历）', async () => {
  const offline = buildHost(undefined, false, createStore(storeRoot));
  await new Promise((resolve) => offline.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + offline.address().port + ROUTES.resumeImport, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({ text: '张三 产品经理' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'ai-unavailable');
  } finally {
    await new Promise((resolve) => offline.close(resolve));
  }
});

await check('简历导入：正常返回可编辑的 schema 文档', async () => {
  const payload = JSON.stringify({
    basics: { name: '张三', label: '产品经理', email: 'a@b.c' },
    work: [{ name: '字节跳动', position: '产品经理', startDate: '2021-07', endDate: '', summary: '<p>做了 <strong>15%</strong> 提升</p>' }],
    education: [{ institution: '北大', area: '计算机', studyType: '本科' }],
    skills: [{ name: '产品', keywords: ['调研'] }],
  });
  const importHost = buildHost(fakeLlm([payload]), true, createStore(storeRoot));
  await new Promise((resolve) => importHost.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + importHost.address().port + ROUTES.resumeImport, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({ text: '张三 产品经理 字节跳动' }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    const resume = data.resume;
    assert.equal(resume.basics.name, '张三');
    assert.equal(resume.sections.experience.items.length, 1);
    assert.equal(resume.sections.experience.items[0].company, '字节跳动');
    assert.ok(resume.sections.experience.items[0].date.indexOf('至今') !== -1, '空 endDate 应渲染为至今');
    assert.ok(resume.metadata.template, '应带 metadata');
    assert.ok(Array.isArray(resume.sections.awards.items), '空 section 也要存在');
  } finally {
    await new Promise((resolve) => importHost.close(resolve));
  }
});

await check('简历导入：超长文本 400', async () => {
  const res = await storePost(ROUTES.resumeImport, { text: 'x'.repeat(60001) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'import-too-large');
});
console.log('导出 PDF');
await check('renderPdf：拿不到浏览器时给出明确原因', async () => {
  const r = await renderPdf('<p>x</p>', { exists: () => false });
  assert.equal(r.error, 'no-browser');
  assert.equal(typeof r.message, 'string');
});

await check('renderPdf：空 HTML 直接拒绝', async () => {
  const r = await renderPdf('   ', { exists: () => true });
  assert.equal(r.error, 'empty-html');
});

await check('renderPdf：成功路径返回真 PDF 字节', async () => {
  // 用假命令代替 Chrome：它把 PDF 写到 --print-to-pdf= 指定的路径再回调
  const run = (bin, args, opts, cb) => {
    const flag = args.find((a) => a.indexOf('--print-to-pdf=') === 0);
    const out = flag.slice('--print-to-pdf='.length);
    writeFileSync(out, Buffer.from('%PDF-1.4\n假 PDF', 'latin1'));
    setImmediate(() => cb(null));
    return { on: () => {} };
  };
  const r = await renderPdf('<p>x</p>', { exists: () => true, run });
  assert.equal(r.error, undefined, '不该报错：' + r.message);
  assert.ok(Buffer.isBuffer(r.pdf) && r.pdf.length > 0);
  assert.equal(r.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(r.ms >= 0);
});

await check('renderPdf：产出不是 PDF 时判为失败', async () => {
  const run = (bin, args, opts, cb) => {
    const flag = args.find((a) => a.indexOf('--print-to-pdf=') === 0);
    writeFileSync(flag.slice('--print-to-pdf='.length), 'not a pdf');
    setImmediate(() => cb(null));
    return { on: () => {} };
  };
  const r = await renderPdf('<p>x</p>', { exists: () => true, run });
  assert.equal(r.error, 'bad-output');
});

await check('renderPdf：命令报错时判为渲染失败', async () => {
  const run = (bin, args, opts, cb) => { setImmediate(() => cb(new Error('boom'))); return { on: () => {} }; };
  const r = await renderPdf('<p>x</p>', { exists: () => true, run });
  assert.equal(r.error, 'chrome-failed');
  assert.ok(r.message.indexOf('boom') !== -1);
});

await check('contentDisposition：中文名走 RFC 5987，且去掉危险字符', async () => {
  const value = contentDisposition('范宇坤-简历.pdf');
  assert.ok(value.indexOf('attachment;') === 0);
  assert.ok(value.indexOf('filename*=UTF-8') !== -1, '要有 UTF-8 文件名');
  assert.ok(value.indexOf(encodeURIComponent('范宇坤-简历.pdf')) !== -1);
  const nasty = contentDisposition('a\r\nb"c\\d.pdf');
  assert.ok(nasty.indexOf(String.fromCharCode(13)) === -1 && nasty.indexOf(String.fromCharCode(10)) === -1, '不能带换行');
  assert.equal((nasty.match(/"/g) || []).length, 2, '只应有包裹 ASCII 名的两个引号');
  assert.equal(contentDisposition(''), contentDisposition('resume.pdf'));
});

await check('POST /pdf/export 走真浏览器产出 application/pdf（无浏览器则跳过）', async () => {
  if (findChrome() === null) { console.log('       (跳过：本机没有 Chrome / Chromium)'); return; }
  const html = '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}.p{width:210mm;height:297mm;break-after:page;padding:20px}</style></head><body><div class="p">第一页</div><div class="p">第二页</div></body></html>';
  const res = await fetch(origin + ROUTES.pdfExport, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ html: html, filename: '范宇坤-简历.pdf' }),
  });
  assert.equal(res.status, 200, '应 200，实际 ' + res.status);
  assert.equal(String(res.headers.get('content-type')), 'application/pdf');
  assert.ok(String(res.headers.get('content-disposition')).indexOf('attachment') === 0);
  const buffer = Buffer.from(await res.arrayBuffer());
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.length > 1000, 'PDF 不该这么小：' + buffer.length);
});

await check('POST /pdf/export 空内容返回业务错误而不是 500', async () => {
  const res = await fetch(origin + ROUTES.pdfExport, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ html: '' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'pdf-html-required');
});

// ── 真实岗位检索闭环（docs/JOBS-FEED-PLAN.md 4.3：4 条路由走现有 fence）──
console.log('jobs 闭环路由');
await check('GET /jobs/feed 免自定义头，空库返回空数组', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsFeed);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.deepEqual(data.items, []);
});

await check('GET /jobs/spec 首次创建默认 spec（含 feedPath 绝对路径）', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsSpec);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.created, true);
  assert.equal(data.spec.feedPath, join(storeRoot, 'jobs-feed.jsonl'));
  assert.deepEqual(data.spec.channels.map((c) => c.id), ['shixiseng', 'liepin']);
});

await check('POST /jobs/ingest 缺 ACTION_HEADER 被围栏挡下（403）', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsIngest, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'forbidden-action');
});

await check('POST /jobs/ingest content-type 非 JSON 被挡下（403）', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsIngest, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', [ACTION_HEADER]: '1' },
    body: '{}',
  });
  assert.equal(res.status, 403);
});

await check('POST /jobs/ingest 带 ACTION_HEADER 走完整摄取链路（含轮转）', async () => {
  const row = { collectedAt: '2026-10-20T14:30:00+08:00', source: 'shixiseng', sourceUrl: 'https://www.shixiseng.com/intern/rt1', title: '前端实习', company: '某某科技', city: '深圳市', salary: '250-400元/天', tags: [], raw: {} };
  const noLink = { collectedAt: '2026-10-20T14:31:00+08:00', source: 'shixiseng', title: '没有链接' };
  writeFileSync(join(storeRoot, 'jobs-feed.jsonl'), JSON.stringify(row) + nl + JSON.stringify(noLink) + nl, 'utf8');
  const res = await storePost(ROUTES.jobsIngest, {});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.added, 1);
  assert.equal(data.dropped, 1, '无 sourceUrl 的行被丢弃并计入统计');
  const feed = await (await fetch(storeOrigin + ROUTES.jobsFeed)).json();
  assert.equal(feed.items.length, 1);
  assert.deepEqual(feed.items[0].salaryRange, { min: 5437, max: 8700, period: 'month' });
  assert.equal(existsSync(join(storeRoot, 'jobs-feed.jsonl')), false, 'feed 已轮转');
  assert.ok(readdirSync(storeRoot).some((name) => name.startsWith('jobs-feed.done-')), '轮转文件保留在同目录');
});

await check('POST /jobs/status 更新状态；非法状态 400、未知 id 404', async () => {
  const feed = await (await fetch(storeOrigin + ROUTES.jobsFeed)).json();
  const job = feed.items[0];
  const ok = await storePost(ROUTES.jobsStatus, { id: job.id, status: 'applied' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).item.status, 'applied');
  const bad = await storePost(ROUTES.jobsStatus, { id: job.id, status: 'offer' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'invalid-status');
  const missing = await storePost(ROUTES.jobsStatus, { id: 'nope', status: 'applied' });
  assert.equal(missing.status, 404);
});

await check('没有 store 时 jobs 路由明确 500 而不是静默成功', async () => {
  const feedRes = await fetch(origin + ROUTES.jobsFeed);
  assert.equal(feedRes.status, 500);
  assert.equal((await feedRes.json()).error, 'store-unavailable');
  const specRes = await fetch(origin + ROUTES.jobsSpec);
  assert.equal(specRes.status, 500);
  const ingestRes = await post(ROUTES.jobsIngest, {}, { [ACTION_HEADER]: '1' });
  assert.equal(ingestRes.status, 500);
  const statusRes = await fetch(origin + ROUTES.jobsCollectStatus);
  assert.equal(statusRes.status, 500);
  const collectRes = await post(ROUTES.jobsCollect, {}, { [ACTION_HEADER]: '1' });
  assert.equal(collectRes.status, 500);
});

// ── 内建采集器（Phase 2.5）：未安装时明确报错，不崩溃 ──
console.log('采集器路由');
await check('GET /jobs/collect/status：未安装时 installed=false、status=null', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsCollectStatus);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.installed, false);
  assert.equal(data.status, null);
});

await check('POST /jobs/collect：未安装返回 collector-not-installed（409，带 setup 引导）', async () => {
  const res = await storePost(ROUTES.jobsCollect, { keyword: '前端' });
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.error, 'collector-not-installed');
  assert.ok(/setup-collector\.mjs/.test(data.message), '未安装提示要给出 setup 命令：' + data.message);
});

// ── 会话式检索（Phase 3）：有 sessionController 时不走采集器 ──
console.log('会话式检索路由');
const sessionRoot = mkdtempSync(join(tmpdir(), 'upcv-routes-session-'));
const sessionCalls = [];
const sessionHost = buildHost(fakeLlm([questionsPayload]), true, createStore(sessionRoot), {
  sessionController: {
    create: async () => { sessionCalls.push('create'); return { sessionId: 'session-routes-1' }; },
    rename: async () => { sessionCalls.push('rename'); return {}; },
    prompt: async () => { sessionCalls.push('prompt'); return { accepted: true }; },
  },
  browser: { port: 9333, profile: '/tmp/upcv-test-profile', moduleDir: '/tmp/upcv-test-module' },
  browserOps: {
    ensureBrowser: async () => ({ running: true, port: 9333 }),
    checkSource: async () => ({ state: 'ok', note: 'test' }),
    isCdpUp: async () => true,
    openLogin: async () => ({ ok: true, url: 'https://www.shixiseng.com/user/login' }),
    closeBrowser: async () => ({ closed: true, running: false }),
  },
});
await new Promise((resolve) => sessionHost.listen(0, '127.0.0.1', resolve));
const sessionOrigin = 'http://127.0.0.1:' + sessionHost.address().port;
const sessionPost = (path, body) => fetch(sessionOrigin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
  body: JSON.stringify(body),
});

await check('POST /jobs/collect：有会话服务时开后台会话（返回 mode=session）', async () => {
  const res = await sessionPost(ROUTES.jobsCollect, { keyword: '前端' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.mode, 'session');
  assert.equal(data.sessionId, 'session-routes-1');
  assert.equal(data.status.state, 'running');
  assert.deepEqual(sessionCalls, ['create', 'rename', 'prompt']);
});

await check('GET /jobs/collect/status：会话模式 installed=true，状态可读', async () => {
  const res = await fetch(sessionOrigin + ROUTES.jobsCollectStatus);
  const data = await res.json();
  assert.equal(data.installed, true);
  assert.equal(data.status.state, 'running');
  assert.equal(data.status.mode, 'session');
});
await new Promise((resolve) => sessionHost.close(resolve));

// 有会话服务但没有浏览器管家：明确 409，不崩
const noBrowserRoot = mkdtempSync(join(tmpdir(), 'upcv-routes-nobrowser-'));
const noBrowserHost = buildHost(fakeLlm([questionsPayload]), true, createStore(noBrowserRoot), {
  sessionController: {
    create: async () => ({ sessionId: 'session-no-browser' }),
    rename: async () => ({}),
    prompt: async () => ({ accepted: true }),
  },
});
await new Promise((resolve) => noBrowserHost.listen(0, '127.0.0.1', resolve));
const noBrowserOrigin = 'http://127.0.0.1:' + noBrowserHost.address().port;
const noBrowserPost = (path, body) => fetch(noBrowserOrigin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
  body: JSON.stringify(body),
});

await check('POST /jobs/collect：有会话服务但没有浏览器管家 → browser-unavailable', async () => {
  const res = await noBrowserPost(ROUTES.jobsCollect, { keyword: '前端' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'browser-unavailable');
});

await check('GET /jobs/sources：没有浏览器管家也能列出渠道', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsSources);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.sources));
  assert.equal(data.browser.running, false);
});

await check('POST /jobs/sources/check：没有浏览器管家 → 409', async () => {
  const res = await storePost(ROUTES.jobsSourcesCheck, {});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'browser-unavailable');
});

await check('POST /jobs/sources/login：没有浏览器管家 → 409', async () => {
  const res = await storePost(ROUTES.jobsSourcesLogin, { id: 'shixiseng' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'browser-unavailable');
});
await new Promise((resolve) => noBrowserHost.close(resolve));

await check('POST /jobs/collect 缺 ACTION_HEADER 被围栏挡下（403）', async () => {
  const res = await fetch(storeOrigin + ROUTES.jobsCollect, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'forbidden-action');
});

// ── 模拟面试 v2：判定 / 改判 / 报告降级（docs/INTERVIEW-V2-PLAN.md 5.2 / 5.4）──
console.log('面试 v2 路由');
await check('POST /interview/verdict：非法判定 400、缺题干 400', async () => {
  const bad = await fetch(ivOrigin + ROUTES.interviewVerdict, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ verdict: '也许', question: { question: 'q' } }),
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'invalid-verdict');
  const noQ = await fetch(ivOrigin + ROUTES.interviewVerdict, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ verdict: 'fail', question: { question: '  ' } }),
  });
  assert.equal(noQ.status, 400);
  assert.equal((await noQ.json()).error, 'question-required');
});

await check('POST /interview/verdict：用户判 fail 只落判定（错题本已退役，题库里没有的题不建条目）', async () => {
  const res = await fetch(ivOrigin + ROUTES.interviewVerdict, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({
      verdict: 'fail',
      question: { questionId: 'q-t1', question: '什么是闭包', tags: ['js闭包'], points: ['词法作用域'], source: 'jd' },
      answer: '我的回答',
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.judgment.judgedBy, 'user');
  assert.equal(data.judgment.verdict, 'fail');
  assert.equal(data.mistake, undefined, '不再写错题本');
});

await check('POST /interview/verdict：改判 pass → 题库有的题回 bankQuestion 并重算 mastery', async () => {
  // 先看题库首页任取一题（首次访问已触发内置导入）
  const bankList = await (await fetch(ivOrigin + ROUTES.bankList + '?limit=1')).json();
  const target = bankList.items[0];
  const failRes = await fetch(ivOrigin + ROUTES.interviewVerdict, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ verdict: 'fail', question: { questionId: target.id, question: target.text, tags: target.topic, points: target.points?.essentials ?? [], source: 'bank' }, answer: '第一次答错' }),
  });
  const failData = await failRes.json();
  assert.equal(failData.judgment.verdict, 'fail');
  assert.notEqual(failData.bankQuestion, undefined, '按 id 命中题库条目');
  assert.ok(failData.bankQuestion.mastery.fail >= 1);
  const passRes = await fetch(ivOrigin + ROUTES.interviewVerdict, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ verdict: 'pass', question: { questionId: target.id, question: target.text, tags: target.topic, points: target.points?.essentials ?? [], source: 'bank' }, answer: '补全后的回答' }),
  });
  const passData = await passRes.json();
  assert.equal(passData.judgment.judgedBy, 'user', '改判是终局');
  assert.equal(passData.bankQuestion.mastery.streak, 1, 'pass 后 streak=1');
  assert.ok(passData.bankQuestion.mastery.history.length >= 2, 'fail+pass 都进 history');
  const lastTwo = passData.bankQuestion.mastery.history.slice(-2);
  assert.deepEqual(lastTwo.map((row) => row.verdict + ':' + row.judgedBy), ['fail:user', 'pass:user'], '本用例的两次判定在末尾');
});

const judgePayload = JSON.stringify({ type: 'next', question: '我们继续', verdict: 'fail', missedPoints: ['要点A', '要点B'] });
const judgeHost = buildHost(fakeLlm([judgePayload]), true, createStore(storeRootShared));
await new Promise((resolve) => judgeHost.listen(0, '127.0.0.1', resolve));
const judgeOrigin = 'http://127.0.0.1:' + judgeHost.address().port;

await check('POST /interview/next：推进时随响应给出 AI 判定并即刻入错题本', async () => {
  const res = await fetch(judgeOrigin + ROUTES.interviewNext, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({
      jobTitle: '前端工程师',
      asked: [],
      transcript: [{ question: '请解释事件循环', point: '事件循环', answer: '我答的内容' }],
      remaining: 3,
      followupsUsed: 0,
      question: { questionId: 'q-n1', question: '请解释事件循环', tags: ['事件循环'], points: ['宏微任务'], source: 'jd', sourceRef: null, isReplay: false },
    }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, 'ai');
  assert.equal(data.step.type, 'next');
  assert.equal(data.verdict.verdict, 'fail');
  assert.deepEqual(data.verdict.missedPoints, ['要点A', '要点B']);
  assert.equal(data.verdict.judgedBy, 'ai');
  assert.equal(data.mistake, undefined, 'AI 判定不再写错题本（mastery 在题库侧更新）');
});

await check('POST /interview/next：无模型时 verdict 为 null（降级用户自判）', async () => {
  const offline = buildHost(undefined, false, createStore(storeRootShared));
  await new Promise((resolve) => offline.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + offline.address().port + ROUTES.interviewNext, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({ jobTitle: 'x', transcript: [{ question: 'q', answer: 'a' }], question: {} }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.source, 'local-bank');
    assert.equal(data.verdict, null);
  } finally {
    await new Promise((resolve) => offline.close(resolve));
  }
});

await check('POST /interview/report：无作答仍 409；无模型降级本地报告（聚合薄弱点）', async () => {
  const noAnswer = await fetch(ivOrigin + ROUTES.interviewReport, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
    body: JSON.stringify({ transcript: [{ question: 'q', answer: '  ' }] }),
  });
  assert.equal(noAnswer.status, 409);
  const offline = buildHost(undefined, false, createStore(storeRootShared));
  await new Promise((resolve) => offline.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch('http://127.0.0.1:' + offline.address().port + ROUTES.interviewReport, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
      body: JSON.stringify({
        jobTitle: '前端工程师',
        transcript: [
          { question: '请解释事件循环', tags: ['事件循环'], answer: '答了一些', verdict: { verdict: 'fail', missedPoints: ['宏微任务'], judgedBy: 'ai', judgedAt: '2026-10-20T00:00:00.000Z' } },
          { question: '什么是闭包', tags: ['闭包'], answer: '答得很好', verdict: { verdict: 'pass', missedPoints: [], judgedBy: 'ai', judgedAt: '2026-10-20T00:01:00.000Z' } },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.source, 'local');
    assert.ok(data.report.overall >= 0 && data.report.overall <= 100);
    assert.equal(data.report.verdictDist.fail, 1);
    assert.equal(data.report.verdictDist.pass, 1);
    assert.equal(data.report.weakTags[0].tag, '事件循环');
  } finally {
    await new Promise((resolve) => offline.close(resolve));
  }
});
// ── 题库路由（interview V3）：/bank/list + /bank/verdict ──────────────
// ensureBankReady 的进程内 memo 可能在前面的面试路由测试里已置位，这里换新 store 必须重置
resetBankReadyForTest();
const bankRoot = mkdtempSync(join(tmpdir(), 'upcv-routes-bank-'));
const bankHost = buildHost(fakeLlm([]), true, createStore(bankRoot));
await new Promise((resolve) => bankHost.listen(0, '127.0.0.1', resolve));
const bankOrigin = 'http://127.0.0.1:' + bankHost.address().port;
const bankPost = (path, body) => fetch(bankOrigin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
  body: JSON.stringify(body || {}),
});

await check('GET /bank/list：首次访问触发内置 300 题导入 + 错题迁移', async () => {
  const res = await fetch(bankOrigin + ROUTES.bankList + '?limit=5');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.total >= 300, true, '内置题已导入');
  assert.ok(data.items.every((item) => Array.isArray(item.topic) && ['junior', 'mid', 'senior'].includes(item.level)));
});

await check('POST /bank/verdict + GET view=review：fail 判定权重上升并进复盘视图', async () => {
  const list = await (await fetch(bankOrigin + ROUTES.bankList + '?limit=1')).json();
  const target = list.items[0];
  const judged = await bankPost(ROUTES.bankVerdict, { id: target.id, action: 'verdict', verdict: 'fail', missedPoints: ['要点一'] });
  assert.equal(judged.status, 200);
  const jd = await judged.json();
  assert.equal(jd.ok, true);
  assert.ok(jd.item.mastery.fail >= 1, 'fail 计数落库');
  assert.ok(jd.item.mastery.weight > target.mastery.weight, 'fail 后权重上升');
  const review = await (await fetch(bankOrigin + ROUTES.bankList + '?view=review&limit=50')).json();
  assert.equal(review.ok, true);
  assert.ok(review.items.some((item) => item.id === target.id));
});

await check('POST /bank/verdict：pass 降权重；master 压到底；remove 隐藏；非法入参 4xx', async () => {
  const list = await (await fetch(bankOrigin + ROUTES.bankList + '?view=review&limit=1')).json();
  const target = list.items[0];
  const passData = await (await bankPost(ROUTES.bankVerdict, { id: target.id, action: 'verdict', verdict: 'pass' })).json();
  assert.equal(passData.ok, true);
  assert.equal(passData.item.mastery.pass, 1);
  const masterData = await (await bankPost(ROUTES.bankVerdict, { id: target.id, action: 'master' })).json();
  assert.ok(masterData.item.mastery.weight <= 0.06, '标掌握后权重压到下限');
  const removeRes = await bankPost(ROUTES.bankVerdict, { id: target.id, action: 'remove' });
  assert.equal(removeRes.status, 200);
  const after = await (await fetch(bankOrigin + ROUTES.bankList + '?limit=200')).json();
  assert.equal(after.items.some((item) => item.id === target.id), false, '移出的题不再出现在列表');
  const missing = await bankPost(ROUTES.bankVerdict, { id: 'no-such-id', action: 'master' });
  assert.equal(missing.status, 404);
  const badAction = await bankPost(ROUTES.bankVerdict, { id: target.id, action: 'nope' });
  assert.equal(badAction.status, 400);
});

await new Promise((resolve) => bankHost.close(resolve));
rmSync(bankRoot, { recursive: true, force: true });

// ── 题库 Phase C：判定触发器（连错降阶）端到端 ──────────────────
// 预置一道已连错 2 次的题 → 用户第 3 次判 fail → 后台自动生成台阶题
const trigRoot = mkdtempSync(join(tmpdir(), 'upcv-routes-trig-'));
const scaffoldPayload = JSON.stringify([
  { question: '台阶题：到底什么是缓存穿透（大白话版）', tags: ['缓存架构'], points: ['能解释穿透是什么'], level: 'junior', kind: 'concept', personal: false },
]);
resetBankReadyForTest(); // 前面用例可能已置位进程内 memo，新 store 需要重新导入
const trigHost = buildHost(fakeLlm([scaffoldPayload]), true, createStore(trigRoot));
await new Promise((resolve) => trigHost.listen(0, '127.0.0.1', resolve));
const trigOrigin = 'http://127.0.0.1:' + trigHost.address().port;
const trigPost = (path, body) => fetch(trigOrigin + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
  body: JSON.stringify(body || {}),
});

await check('判定触发器：第 3 次连错 → 后台队列生成台阶题并入库', async () => {
  // 先取一道题并人为制造连错 2 次的历史
  const list = await (await fetch(trigOrigin + ROUTES.bankList + '?limit=200')).json();
  const target = list.items.find((item) => item.topic.includes('缓存架构')) ?? list.items[0];
  const twoFails = {
    ...target,
    mastery: { ...target.mastery, seen: 2, fail: 2, streak: 0, history: [...(target.mastery?.history ?? []), { at: '2026-10-31T00:00:00.000Z', verdict: 'fail', hitRatio: 0, missedPoints: ['x'], judgedBy: 'ai' }, { at: '2026-10-31T01:00:00.000Z', verdict: 'fail', hitRatio: 0, missedPoints: ['y'], judgedBy: 'ai' }] },
  };
  await trigPost(ROUTES.storeSave, { collection: 'questions', item: twoFails });
  // 第 3 次判 fail（用户终局）
  const res = await trigPost(ROUTES.interviewVerdict, {
    verdict: 'fail',
    missedPoints: ['还是没答上要点'],
    question: { questionId: target.id, question: target.text, tags: target.topic, points: target.points?.essentials ?? [], source: 'bank' },
    answer: '又答错了',
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.judgment.verdict, 'fail');
  // 后台队列消化 scaffold 任务（轮询最多 ~10s）
  let status = null;
  for (let i = 0; i < 100; i += 1) {
    const s = await (await fetch(trigOrigin + ROUTES.bankStatus)).json();
    status = s.queue;
    if (status.running !== true) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(status.running, false);
  assert.equal(status.lastError, '', 'scaffold 任务成功：' + status.lastError);
  assert.ok(status.completed >= 1, '队列消化了至少一个任务');
  const after = await (await fetch(trigOrigin + ROUTES.bankList + '?topic=' + encodeURIComponent((target.topic ?? [])[0] ?? '') + '&limit=200')).json();
  const scaffoldQ = after.items.find((item) => item.origin?.via === 'scaffold');
  assert.notEqual(scaffoldQ, undefined, '台阶题已入库');
  assert.equal(scaffoldQ.kind, 'concept');
  assert.equal(scaffoldQ.level, 'junior');
  // 变体触发：连对 2 次 → hasVariant 防重复的判定路径在 bank-gen 覆盖，这里只验 streak 落库
  const passRes = await trigPost(ROUTES.interviewVerdict, { verdict: 'pass', question: { questionId: scaffoldQ.id, question: scaffoldQ.text, tags: scaffoldQ.topic, points: scaffoldQ.points?.essentials ?? [], source: 'bank' }, answer: '学会了' });
  const passData = await passRes.json();
  assert.equal(passData.bankQuestion.mastery.streak, 1);
});

await new Promise((resolve) => trigHost.close(resolve));
rmSync(trigRoot, { recursive: true, force: true });

await new Promise((resolve) => judgeHost.close(resolve));
await new Promise((resolve) => ivHost.close(resolve));
rmSync(storeRootShared, { recursive: true, force: true });
await new Promise((resolve) => storeHost.close(resolve));
rmSync(storeRoot, { recursive: true, force: true });
await new Promise((resolve) => host.close(resolve));
await check('题库标签词表 /bank/topics：聚合实际标签+题量，排除删除与 personal', async () => {
  resetBankReadyForTest();
  const root2 = mkdtempSync(join(tmpdir(), 'upcv-routes-topics-'));
  const store2 = createStore(root2);
  store2.upsert('questions', { id: 't1', status: 'active', scope: 'general', topic: ['Redis', '缓存架构'], text: 'a' });
  store2.upsert('questions', { id: 't2', status: 'active', scope: 'general', topic: ['Redis'], text: 'b' });
  store2.upsert('questions', { id: 't3', status: 'removed', scope: 'general', topic: ['被删除'], text: 'c' });
  const topicsHost = buildHost(undefined, false, store2);
  await new Promise((resolve) => topicsHost.listen(0, '127.0.0.1', resolve));
  try {
    const port2 = topicsHost.address().port;
    const res2 = await fetch('http://127.0.0.1:' + port2 + ROUTES.bankTopics);
    assert.equal(res2.status, 200, 'GET /bank/topics 200');
    const data2 = await res2.json();
    assert.equal(data2.ok, true, 'ok=true');
    const byTag = new Map(data2.topics.map((x) => [x.tag, x.count]));
    assert.equal(byTag.get('Redis'), 2, 'Redis 计数 2（内置词表无 Redis 标签）');
    assert.ok((byTag.get('缓存架构') ?? 0) >= 1, '缓存架构 ≥1（含内置导入的同组标签题）');
    assert.ok(!byTag.has('被删除'), 'removed 题不进词表');
    // personal 题不单列断言：V0.22 起 ensureBankReady 会把存量 personal 迁移为 general（路由里的过滤是防御）
    assert.ok(data2.topics.length >= 70, '含内置题库导入后的词表');
    const counts2 = data2.topics.map((x) => x.count);
    for (let i = 1; i < counts2.length; i += 1) assert.ok(counts2[i - 1] >= counts2[i], '按题量降序');
  } finally {
    await new Promise((resolve) => topicsHost.close(resolve));
  }
});

await check('简历字段保护 /store/save：编辑器回写缺 knowledgeProfile 时保留现存档案', async () => {
  const root3 = mkdtempSync(join(tmpdir(), 'upcv-routes-prot-'));
  const store3 = createStore(root3);
  store3.upsert('resumes', { id: 'r1', title: 'A', source: 'import', data: {}, knowledgeProfile: { points: [{ tag: 'Redis', note: '' }], version: 2 } });
  const protHost = buildHost(undefined, false, store3);
  await new Promise((resolve) => protHost.listen(0, '127.0.0.1', resolve));
  try {
    const port3 = protHost.address().port;
    const post3 = (payload) => fetch('http://127.0.0.1:' + port3 + ROUTES.storeSave, {
      method: 'POST', headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' }, body: JSON.stringify(payload),
    });
    // 编辑器式保存：不带 knowledgeProfile → 档案保留
    const r1 = await (await post3({ collection: 'resumes', item: { id: 'r1', title: 'A2', source: 'import', data: {} } })).json();
    assert.equal(r1.ok, true, '保存成功');
    assert.equal(r1.item.knowledgeProfile.version, 2, '缺字段时保留现存档案');
    assert.equal(r1.item.title, 'A2', '本字段正常更新');
    // 显式带 knowledgeProfile → 以新值为准（resume-finish 路径）
    const r2 = await (await post3({ collection: 'resumes', item: { id: 'r1', title: 'A2', source: 'import', data: {}, knowledgeProfile: { points: [{ tag: 'MQ', note: '' }], version: 3 } } })).json();
    assert.equal(r2.ok, true, '带档案保存成功');
    assert.equal(r2.item.knowledgeProfile.version, 3, '显式档案生效');
    assert.equal(r2.item.knowledgeProfile.points[0].tag, 'MQ', '显式档案内容生效');
    // 新建简历无现存档案 → 不凭空造
    const r3 = await (await post3({ collection: 'resumes', item: { id: 'r2', title: 'B', source: 'blank', data: {} } })).json();
    assert.equal(r3.ok, true, '新建成功');
    assert.equal(r3.item.knowledgeProfile, undefined, '无现存档案不注入');
  } finally {
    await new Promise((resolve) => protHost.close(resolve));
  }
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
