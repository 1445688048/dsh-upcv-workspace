/**
 * LLM 层自检：不需要真实宿主模型，用假 llm 服务跑通
 * 分片聚合 / JSON 解析容错 / 带反馈重试 / 无模型降级。
 * 运行：node tests/llm.test.mjs
 */
import assert from 'node:assert/strict';
import { parseJsonReply, withRetryFeedback, callModel, callModelJson, isStreamingService, resolveRoute, profileFor, aiMessageFor } from '../server/llm.js';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}
async function checkAsync(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

/** 造一个假的 llm 服务：按脚本依次产出分片。 */
function fakeLlm(scripts) {
  let call = 0;
  return {
    listProviders: async () => [{ id: 'mock-provider' }],
    listModels: async () => [{ id: 'mock-model' }],
    stream: () => {
      const script = scripts[Math.min(call, scripts.length - 1)];
      call += 1;
      return (async function* () { for (const chunk of script) yield chunk; })();
    },
  };
}

const textChunks = (text) => {
  const half = Math.ceil(text.length / 2);
  return [
    { kind: 'text-delta', text: text.slice(0, half) },
    { kind: 'text-delta', text: text.slice(half) },
    { kind: 'finish', reason: { kind: 'stop' } },
  ];
};
const FENCE = String.fromCharCode(96, 96, 96);
const nl = String.fromCharCode(10);

console.log('parseJsonReply');
check('裸 JSON 对象', () => assert.deepEqual(parseJsonReply('{"a":1}'), { a: 1 }));
check('裸 JSON 数组', () => assert.deepEqual(parseJsonReply('[1,2]'), [1, 2]));
check('代码围栏', () => assert.deepEqual(parseJsonReply(FENCE + 'json' + nl + '{"a":1}' + nl + FENCE), { a: 1 }));
check('前后夹解释文字', () => assert.deepEqual(parseJsonReply('好的，结果如下：' + nl + '{"a":1}' + nl + '希望有帮助'), { a: 1 }));
check('JSON 之后还有带花括号的说明', () => assert.deepEqual(parseJsonReply('{"a":1}' + nl + '注意 {不是 JSON}'), { a: 1 }));
check('尾随逗号', () => assert.deepEqual(parseJsonReply('{"a":1,}'), { a: 1 }));
check('全角引号', () => assert.deepEqual(parseJsonReply('{“a”:1}'), { a: 1 }));
check('单元素数组不被错抽成对象', () => assert.deepEqual(parseJsonReply('[{"a":1}]'), [{ a: 1 }]));
check('非 JSON 返回 null', () => assert.equal(parseJsonReply('完全不是 JSON'), null));
check('非字符串返回 null', () => assert.equal(parseJsonReply(null), null));

console.log('withRetryFeedback');
check('追加反馈段且不改动入参', () => {
  const messages = [{ role: 'user', content: [{ type: 'text', text: '原始' }] }];
  const next = withRetryFeedback(messages, '上一个回包不是合法 JSON。');
  assert.equal(messages[0].content[0].text, '原始');
  assert.ok(next[0].content[0].text.includes('【上次输出错误，必须修正】'));
  assert.ok(next[0].content[0].text.includes('原始'));
});

console.log('基础判定');
check('识别流式服务', () => assert.equal(isStreamingService({ stream: () => {} }), true));
check('拒绝空服务', () => assert.equal(isStreamingService(undefined), false));
check('未知节点有默认档位', () => assert.ok(profileFor('不存在').timeoutMs > 0));
check('错误码有中文文案', () => assert.ok(aiMessageFor('ai-unavailable').includes('模型')));

await checkAsync('resolveRoute 自动挑第一个 provider/model', async () => {
  assert.deepEqual(await resolveRoute(fakeLlm([]), {}), { provider: 'mock-provider', model: 'mock-model' });
});
await checkAsync('callModel 聚合分片', async () => {
  const result = await callModel(fakeLlm([textChunks('你好世界')]), [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
  assert.equal(result.text, '你好世界');
  assert.equal(result.provider, 'mock-provider');
});
await checkAsync('callModel 无服务时 ai-unavailable', async () => {
  assert.equal((await callModel(undefined, [])).error, 'ai-unavailable');
});
await checkAsync('callModel 空回包报 ai-empty', async () => {
  assert.equal((await callModel(fakeLlm([[{ kind: 'finish', reason: { kind: 'stop' } }]]), [])).error, 'ai-empty');
});
await checkAsync('callModelJson 解析失败后带反馈重试成功', async () => {
  const result = await callModelJson(fakeLlm([textChunks('不是 JSON'), textChunks('{"ok":true}')]), [{ role: 'user', content: [{ type: 'text', text: 'x' }] }]);
  assert.deepEqual(result.value, { ok: true });
  assert.equal(result.attempts, 2);
});
await checkAsync('callModelJson 校验不过也重试', async () => {
  let calls = 0;
  const llm = {
    listProviders: async () => [{ id: 'p' }],
    listModels: async () => [{ id: 'm' }],
    stream: () => {
      calls += 1;
      const payload = calls === 1 ? '{"list":[]}' : '{"list":[1]}';
      return (async function* () { yield { kind: 'text-delta', text: payload }; })();
    },
  };
  const result = await callModelJson(llm, [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], {
    validate: (value) => (Array.isArray(value?.list) && value.list.length > 0 ? null : { ok: false, reason: 'list 为空' }),
  });
  assert.deepEqual(result.value, { list: [1] });
  assert.equal(result.attempts, 2);
});
await checkAsync('callModelJson 重试耗尽返回 ai-unparsable 且带原文', async () => {
  const result = await callModelJson(fakeLlm([textChunks('垃圾'), textChunks('还是垃圾')]), [{ role: 'user', content: [{ type: 'text', text: 'x' }] }]);
  assert.equal(result.error, 'ai-unparsable');
  assert.equal(result.rawText, '还是垃圾');
});
await checkAsync('reasoning 分片不污染正文', async () => {
  const result = await callModel(fakeLlm([[{ kind: 'reasoning-delta', text: '思考中' }, { kind: 'text-delta', text: '正文' }]]), []);
  assert.equal(result.text, '正文');
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
