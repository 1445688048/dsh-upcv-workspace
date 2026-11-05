/**
 * 提示词层自检：清单与模板一致、渲染结果正确、错误码可定位。
 * 运行：node tests/prompts.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPlaceholders, listPrompts, renderMessages } from '../server/prompts.js';

const nl = String.fromCharCode(10);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const promptsDir = join(root, 'prompts');
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const EXPECTED = ['interview-questions-jd', 'interview-questions-resume', 'bank-kg', 'bank-generate', 'bank-scaffold', 'bank-gap', 'bank-variant', 'resume-optimize', 'interview-report', 'jd-align', 'interview-followup', 'resume-import'];

await check('清单声明的 12 个模板都在（V3 Phase C 补齐降阶/缺口/变体三个生成模板）', async () => {
  const ids = listPrompts().map((entry) => entry.id).sort();
  assert.deepEqual(ids, EXPECTED.slice().sort());
});

await check('每个模板的 {{占位符}} 与清单声明完全一致', async () => {
  for (const entry of listPrompts()) {
    const text = readFileSync(join(promptsDir, entry.file), 'utf8');
    const used = collectPlaceholders(text).sort();
    const declared = entry.variables.slice().sort();
    assert.deepEqual(used, declared, entry.id + ' 的占位符与清单不一致');
  }
});

await check('prompts/ 里没有清单之外的 .md（防止漏声明）', async () => {
  const declaredFiles = listPrompts().map((entry) => entry.file).sort();
  const actual = readdirSync(promptsDir).filter((name) => name.endsWith('.md')).sort();
  assert.deepEqual(actual, declaredFiles);
});

await check('每个模板都渲染出 system + user 两条消息', async () => {
  const values = {
    jobTitle: '产品经理', count: 6, industry: '互联网', city: '北京', experience: '社招 3-5 年',
    name: '张三', targetJob: '产品经理', project: 'p', skills: 's', education: 'e', transcript: '第1题：q' + nl + '答：a',
    jdText: '岗位职责：负责产品设计', resumeText: '做过产品设计', asked: '1. 自我介绍', remaining: 3, targetJob: '产品经理',
  };
  for (const id of EXPECTED) {
    const messages = renderMessages(id, values);
    assert.equal(messages.length, 2, id + ' 应渲染 2 条消息');
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    for (const message of messages) {
      assert.equal(message.content[0].type, 'text');
      assert.ok(message.content[0].text.trim().length > 0, id + ' 渲染出空消息');
    }
  }
});

await check('变量真的被替换进模板（且不留 {{ }}）', async () => {
  const messages = renderMessages('interview-questions-jd', { jdText: '负责 React 前端开发', count: '9', tags: 'React 原理', topics: 'JS 语言：事件循环…' });
  const user = messages[1].content[0].text;
  assert.ok(user.includes('负责 React 前端开发'));
  assert.ok(user.includes('9'));
  assert.ok(!user.includes('{{'), '渲染后仍有未替换的占位符');
});

await check('追问模板声明了 v2 新变量并真的注入', async () => {
  const followup = listPrompts().find((entry) => entry.id === 'interview-followup');
  for (const name of ['currentQuestion', 'points', 'followupsUsed']) {
    assert.ok(followup.variables.includes(name), 'followup 缺变量 ' + name);
  }
  const messages = renderMessages('interview-followup', { currentQuestion: '什么是闭包', points: '1. 词法作用域', followupsUsed: '1' });
  assert.ok(messages[1].content[0].text.includes('什么是闭包'));
  assert.ok(messages[1].content[0].text.includes('词法作用域'));
});

await check('缺变量渲染成空串而不是抛错', async () => {
  const messages = renderMessages('resume-optimize', {});
  assert.equal(messages.length, 2);
  assert.ok(!messages[1].content[0].text.includes('{{'));
});

await check('未知模板 id 抛具名错误', async () => {
  assert.throws(() => renderMessages('不存在的模板', {}), (error) => error.code === 'template-missing' || error.name === 'PromptError');
});

await check('collectPlaceholders 去重且保持顺序', async () => {
  assert.deepEqual(collectPlaceholders('{{a}} {{b}} {{a}}'), ['a', 'b']);
  assert.deepEqual(collectPlaceholders('没有占位符'), []);
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
