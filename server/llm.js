// DSH LLM 客户端封装
// 基于 DSH 宿主的 llm 服务（ctx.get('llm')）—— 与 dsh-novel-workbench 同一套接口：
//   llm.listProviders()                -> [{ id }] 或 { providers: [...] }
//   llm.listModels(provider)           -> [{ id }] 或 { models: [...] }
//   llm.stream({ provider, model, messages, temperature, maxTokens, signal })
//       返回的异步迭代器产出分片：{ kind|type: 'text-delta'|'text'|'reasoning-delta'|'finish'|'error'|'aborted', text? }

/** 把宿主的各种信封形状都收成数组：裸数组 / { providers } / { models }。 */
export function asList(value, key) {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object' && Array.isArray(value[key])) return value[key];
  return [];
}

/** 宿主是否提供了可流式调用的模型服务。 */
export function isStreamingService(service) {
  return service !== undefined && service !== null && typeof service.stream === 'function';
}

/** 从 provider 列表里解析出要用的 provider/model。 */
export async function resolveRoute(llm, requested) {
  const wanted = {
    provider: typeof requested?.provider === 'string' && requested.provider !== '' ? requested.provider : '',
    model: typeof requested?.model === 'string' && requested.model !== '' ? requested.model : '',
  };
  if (wanted.provider !== '' && wanted.model !== '') return { provider: wanted.provider, model: wanted.model };

  let providers = [];
  try { providers = (await llm?.listProviders?.()) ?? []; } catch { providers = []; }
  const list = asList(providers, 'providers');
  const route = wanted.provider !== ''
    ? list.find((item) => item?.id === wanted.provider) ?? { id: wanted.provider }
    : list.find((item) => typeof item?.id === 'string' && item.id !== '');
  if (route === undefined || typeof route.id !== 'string' || route.id === '') return null;
  if (wanted.model !== '') return { provider: route.id, model: wanted.model };

  let models = [];
  try {
    models = typeof llm?.listModels === 'function' ? ((await llm.listModels(route.id)) ?? []) : [];
  } catch { models = []; }
  const modelList = asList(models, 'models');
  const first = modelList.find((item) => {
    const id = typeof item === 'string' ? item : item?.id ?? item?.model;
    return typeof id === 'string' && id !== '';
  });
  const model = typeof first === 'string' ? first : first?.id ?? first?.model;
  if (typeof model !== 'string' || model === '') return null;
  return { provider: route.id, model };
}

/**
 * 抽出模型回包里的第一个 JSON 对象/数组，分级容错：
 * 代码围栏、前后解释文字、尾随逗号、全角引号、字符串内裸换行都处理。
 * 抽不出来返回 null —— 调用方据此重试，不假装成功。
 */
export function parseJsonReply(text) {
  if (typeof text !== 'string') return null;
  const fence = String.fromCharCode(96, 96, 96);
  const cleaned = text.split(fence).join('');
  const pairs = [['{', '}'], ['[', ']']];
  const candidates = [];
  for (const pair of pairs) {
    const start = cleaned.indexOf(pair[0]);
    const end = cleaned.lastIndexOf(pair[1]);
    if (start !== -1 && end > start) candidates.push({ open: pair[0], close: pair[1], start: start, end: end });
  }
  candidates.sort((a, b) => a.start - b.start);

  for (const item of candidates) {
    const parsed = safeParseJson(cleaned.slice(item.start, item.end + 1));
    if (parsed !== null) return parsed;
  }
  for (const item of candidates) {
    const slice = balancedSlice(cleaned, item.start, item.open, item.close);
    if (slice === null) continue;
    const parsed = safeParseJson(slice);
    if (parsed !== null) return parsed;
  }
  return null;
}

/** 括号配平截出从 start 起的第一个完整 JSON 片段（字符串内的括号不计数）。 */
function balancedSlice(text, start, open, close) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (quote !== null) {
      if (escaped) { escaped = false; continue; }
      if (ch === String.fromCharCode(92)) { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === String.fromCharCode(34)) { quote = ch; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/** 先直接 parse；失败再做轻度修补（全角引号 / 尾随逗号）。 */
function safeParseJson(text) {
  const direct = tryParse(text);
  if (direct !== null) return direct;
  const repaired = text
    .split(String.fromCharCode(8220)).join(String.fromCharCode(34))
    .split(String.fromCharCode(8221)).join(String.fromCharCode(34))
    .replace(/,\s*([}\]])/gu, '$1');
  return tryParse(repaired);
}

function tryParse(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

/** 追加「上次输出错误」反馈段，重试不是盲目重发。 */
export function withRetryFeedback(messages, reason) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  const last = list[list.length - 1];
  const parts = Array.isArray(last?.content) ? last.content : [];
  const index = parts.findIndex((part) => part?.type === 'text' && typeof part.text === 'string');
  if (index === -1) return list;
  const content = parts.slice();
  content[index] = { ...parts[index], text: parts[index].text + '\n\n【上次输出错误，必须修正】\n' + reason + '\n请严格按要求重新输出合法 JSON。' };
  list[list.length - 1] = { ...last, content: content };
  return list;
}

/** chunk 间隙超时：这么久没有新分片就判为流挂起。 */
const STREAM_IDLE_TIMEOUT_MS = 60000;

/** 与看门狗赛跑取下一个分片。 */
async function nextWithWatchdog(iterator, idleTimeoutMs, remainingMs) {
  let timer = null;
  try {
    return await Promise.race([
      iterator.next(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({ watchdog: true }), Math.max(1, Math.min(idleTimeoutMs, remainingMs)));
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function closeIterator(iterator) {
  try {
    await Promise.race([
      Promise.resolve(iterator.return?.()),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
  } catch { /* 超时才是要带回的结论 */ }
}

/**
 * 调一次模型并把文本收全（带整体超时 + 分片间隙超时）。
 * @returns {Promise<{ text?: string, error?: string, provider?: string, model?: string, partial?: string, usage?: object }>}
 */
export async function callModel(llm, messages, options = {}) {
  if (!isStreamingService(llm)) return { error: 'ai-unavailable' };
  const route = await resolveRoute(llm, options);
  if (route === null) return { error: 'ai-no-provider' };

  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 120000;
  const idleTimeoutMs = Number(options.idleTimeoutMs) > 0 ? Number(options.idleTimeoutMs) : STREAM_IDLE_TIMEOUT_MS;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const chunks = [];
  let usage = null;
  let finishReason = '';
  let reasoningChars = 0;
  let iterator = null;

  const partialText = () => chunks.join('');

  try {
    iterator = llm.stream({
      provider: route.provider,
      model: route.model,
      messages: messages,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })[Symbol.asyncIterator]();

    while (true) {
      const next = await nextWithWatchdog(iterator, idleTimeoutMs, deadline - Date.now());
      if (next?.watchdog === true) {
        await closeIterator(iterator);
        return { error: 'ai-timeout', partial: partialText(), provider: route.provider, model: route.model };
      }
      if (next.done === true) break;
      const chunk = next.value;
      const kind = typeof chunk?.kind === 'string' && chunk.kind !== '' ? chunk.kind : chunk?.type;

      if ((kind === 'text-delta' || kind === 'text') && typeof chunk.text === 'string') {
        chunks.push(chunk.text);
        continue;
      }
      if ((kind === 'reasoning-delta' || kind === 'reasoning' || kind === 'thinking') && typeof chunk.text === 'string') {
        reasoningChars += chunk.text.length;
        continue;
      }
      if (kind === 'finish' && chunk?.reason !== null && typeof chunk?.reason === 'object') {
        if (typeof chunk.reason.kind === 'string' && chunk.reason.kind !== '') finishReason = chunk.reason.kind;
        if (finishReason === 'error') {
          return { error: 'ai-error:' + (chunk.reason.failure?.code ?? 'unknown'), provider: route.provider, model: route.model };
        }
      }
      const seen = normalizeUsage(chunk);
      if (seen !== null) usage = seen;
      if (kind === 'error') {
        return { error: 'ai-error:' + (chunk.failure?.code ?? chunk.code ?? 'unknown'), provider: route.provider, model: route.model };
      }
      if (kind === 'aborted') return { error: 'ai-aborted', provider: route.provider, model: route.model };
    }
  } catch (error) {
    return {
      error: 'ai-failed',
      message: error instanceof Error ? error.message : String(error),
      provider: route.provider,
      model: route.model,
    };
  }

  const text = partialText();
  if (text.trim() === '') {
    return {
      error: 'ai-empty',
      ...(reasoningChars > 0 ? { reasoningChars: reasoningChars } : {}),
      ...(finishReason !== '' ? { finishReason: finishReason } : {}),
      provider: route.provider,
      model: route.model,
    };
  }
  return {
    text: text,
    provider: route.provider,
    model: route.model,
    ...(finishReason !== '' ? { finishReason: finishReason } : {}),
    ...(usage === null ? {} : { usage: usage }),
  };
}

/** 宽容提取 usage 尾帧（字段名没有契约，有就记）。 */
function normalizeUsage(chunk) {
  const source = chunk?.kind === 'usage' || chunk?.type === 'usage'
    ? chunk
    : (chunk?.usage !== null && chunk?.usage !== undefined && typeof chunk.usage === 'object' ? chunk.usage : null);
  if (source === null) return null;
  const pick = (...keys) => {
    for (const key of keys) {
      const value = Number(source[key]);
      if (Number.isFinite(value) && value >= 0) return Math.round(value);
    }
    return null;
  };
  const promptTokens = pick('prompt_tokens', 'promptTokens', 'input_tokens', 'inputTokens');
  const completionTokens = pick('completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens');
  if (promptTokens === null && completionTokens === null) return null;
  return {
    ...(promptTokens === null ? {} : { promptTokens: promptTokens }),
    ...(completionTokens === null ? {} : { completionTokens: completionTokens }),
  };
}

/**
 * 调模型并解析 JSON；解析失败时按 retries 次数「带错误反馈」重试。
 * @returns {Promise<{ value?: object, error?: string, reason?: string, rawText?: string, provider?: string, model?: string, attempts?: number }>}
 */
export async function callModelJson(llm, messages, options = {}) {
  const retries = Number.isFinite(Number(options.retries)) && Number(options.retries) >= 0 ? Number(options.retries) : 1;
  let last = null;
  let reason = '';
  let pending = messages;
  let attemptOptions = options;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await callModel(llm, pending, attemptOptions);
    if (last.error !== undefined) {
      const transport = typeof last.error === 'string' && last.error.startsWith('ai-error:TRANSPORT');
      if (last.error !== 'ai-empty' && last.error !== 'ai-unparsable' && !transport) {
        return {
          error: last.error,
          ...(last.message === undefined ? {} : { message: last.message }),
          ...(last.partial === undefined ? {} : { partial: last.partial }),
          provider: last.provider,
          model: last.model,
          attempts: attempt + 1,
        };
      }
      if (last.error === 'ai-empty') {
        reason = '模型返回的内容为空。';
        attemptOptions = escalateMaxTokens(attemptOptions);
        pending = withRetryFeedback(messages, reason);
      } else if (last.error === 'ai-unparsable') {
        reason = '模型没有按要求返回合法 JSON。';
        pending = withRetryFeedback(messages, reason);
      } else {
        pending = messages;
      }
      continue;
    }
    const parsed = parseJsonReply(last.text);
    if (parsed === null) {
      last = { ...last, error: 'ai-unparsable' };
      reason = '模型没有按要求返回合法 JSON。';
      if (last.finishReason === 'max-tokens' || last.finishReason === 'length') attemptOptions = escalateMaxTokens(attemptOptions);
      pending = withRetryFeedback(messages, reason);
      continue;
    }
    if (typeof options.validate === 'function') {
      const verdict = options.validate(parsed);
      if (verdict !== null && typeof verdict === 'object' && verdict.ok === false) {
        last = { ...last, error: 'ai-unparsable' };
        reason = typeof verdict.reason === 'string' && verdict.reason !== '' ? verdict.reason : '模型回包缺少必需字段。';
        pending = withRetryFeedback(messages, reason);
        continue;
      }
    }
    return { value: parsed, provider: last.provider, model: last.model, attempts: attempt + 1 };
  }

  return {
    error: last?.error ?? 'ai-unparsable',
    ...(reason === '' ? {} : { reason: reason }),
    ...(typeof last?.text === 'string' && last.text !== '' ? { rawText: last.text.slice(0, 2000) } : {}),
    provider: last?.provider,
    model: last?.model,
    attempts: retries + 1,
  };
}

/** 空回包/截断重试时把输出预算放大一档。 */
function escalateMaxTokens(options) {
  const current = Number(options?.maxTokens);
  if (!(current > 0)) return options;
  const next = Math.min(Math.round(current * 2), 65536);
  return next === current ? options : { ...options, maxTokens: next };
}

/** 错误码 -> 给用户看的中文提示。 */
export const AI_ERROR_MESSAGES = Object.freeze({
  'ai-unavailable': '本机当前没有可调用的模型，无法生成。请到设置里确认模型可用。',
  'ai-no-provider': '没有可用的模型提供方，无法生成。',
  'ai-timeout': '模型响应超时，本次没有生成。可以重试。',
  'ai-aborted': '模型调用被中断，本次没有生成。',
  'ai-unparsable': '模型没有按要求返回 JSON，本次结果已丢弃。重试一次通常就好。',
  'ai-empty': '模型返回的内容为空，本次结果已丢弃。',
  'ai-failed': '模型调用失败，本次没有生成。',
});

export function aiMessageFor(code) {
  if (typeof code !== 'string' || code === '') return '模型调用失败。';
  if (AI_ERROR_MESSAGES[code] !== undefined) return AI_ERROR_MESSAGES[code];
  if (code.startsWith('ai-error:')) return '模型报错（' + code.slice('ai-error:'.length) + '），本次没有生成。';
  return code;
}

/** 构造 messages 里的纯文本消息。 */
export function textMessage(role, text) {
  return { role: role, content: [{ type: 'text', text: text }] };
}

/** 节点级默认超时与采样档（避免调用方每次都要传）。 */
export const NODE_PROFILES = Object.freeze({
  'interview-questions-jd': { timeoutMs: 180000, temperature: 0.7, maxTokens: 8000, retries: 1 },
  'interview-questions-resume': { timeoutMs: 180000, temperature: 0.7, maxTokens: 8000, retries: 1 },
  'resume-optimize': { timeoutMs: 180000, temperature: 0.5, maxTokens: 4000, retries: 1 },
  'match-analysis': { timeoutMs: 120000, temperature: 0.3, maxTokens: 2000, retries: 1 },
  'interview-report': { timeoutMs: 180000, temperature: 0.3, maxTokens: 3000, retries: 1 },
  // 简历导入要输出整份 JSON Resume（含富文本），是最长的结构化输出
  'resume-import': { timeoutMs: 300000, temperature: 0.1, maxTokens: 16000, retries: 1 },
  // JD 对齐要输出要求清单 + 逐条覆盖，输出较长，给足预算
  'jd-align': { timeoutMs: 240000, temperature: 0.2, maxTokens: 10000, retries: 1 },
  // 追问决策是短输出，但要低温柔稳定；v2 起推进时还要输出判定结论
  'interview-followup': { timeoutMs: 120000, temperature: 0.6, maxTokens: 2000, retries: 1 },
  // 题库（V3 Phase B）：知识点提取是短输出；按点生成覆盖深度阶梯，输出较长
  'bank-kg': { timeoutMs: 120000, temperature: 0.3, maxTokens: 2000, retries: 1 },
  'bank-generate': { timeoutMs: 180000, temperature: 0.7, maxTokens: 8000, retries: 1 },
  'bank-scaffold': { timeoutMs: 120000, temperature: 0.5, maxTokens: 3000, retries: 1 },
  'bank-gap': { timeoutMs: 120000, temperature: 0.6, maxTokens: 3000, retries: 1 },
  'bank-variant': { timeoutMs: 120000, temperature: 0.8, maxTokens: 3000, retries: 1 },
});

/** 取节点档位；未知节点给一份保守默认。 */
export function profileFor(node) {
  return NODE_PROFILES[node] ?? { timeoutMs: 120000, temperature: 0.5, maxTokens: 4000, retries: 1 };
}
