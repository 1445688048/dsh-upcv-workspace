/**
 * 提示词文档层：从 prompts/*.md 读模板，按 _manifest.json 校验并渲染成 messages。
 *
 * 为什么外置：提示词硬编码在 ai.js 里，改一句文案就要改代码、跑测试。改成读文档后，
 * 文案是数据，代码只负责校验与渲染。
 *
 * 约定：
 * - 单个 .md 里 system 与 user 两段用单独一行 --- 分隔（没有分隔行时整篇当 user）；
 * - 占位符统一写 {{变量名}}，变量必须在 _manifest.json 的 variables 里声明；
 * - 缺文件 / 模板为空 / 模板用了未声明变量 → 抛 PromptError（带 code 与 file），不静默降级；
 * - 渲染时传入对象里缺失的变量渲染成空串，不抛错（业务侧已保证必填项）。
 *
 * 路径基于 import.meta.url 解析，与 process.cwd() 无关。
 *
 * @module dsh-upcv-workspace/prompts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 默认提示词目录：仓库根下的 prompts/（与 server/ 同级，打包时随 files[] 带上）。 */
export const DEFAULT_PROMPTS_DIR = join(HERE, '..', 'prompts');

const MANIFEST_FILE = '_manifest.json';
/** 占位符：{{name}}，name 允许字母数字与下划线。 */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
/** 一个模板最多允许多长（防止误把整本书贴进模板文件）。 */
const MAX_TEMPLATE_CHARS = 40000;
/** 分隔行：单独一行的 ---（允许两侧空白）。 */
const SEPARATOR_LINE_RE = /^[ \t]*---[ \t]*$/u;

/**
 * 具名错误：code 为稳定错误码，details.file 为提示词文件名（形如 xxx.md）。
 * - prompts-dir-missing  提示词目录或清单不存在
 * - manifest-invalid     清单不是合法 JSON 或结构不对
 * - template-missing     清单声明了模板但 .md 文件缺失
 * - template-empty       模板文件是空的
 * - template-too-large   模板文件过大
 * - placeholder-invalid  模板用了未在清单声明的变量
 */
export class PromptError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PromptError';
    this.code = code;
    this.details = details;
  }
}

/** 去掉 BOM、统一换行、去掉结尾多余空行。 */
function normalizeText(value) {
  return String(value)
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/\n+$/u, '');
}

/** 渲染时把值转成字符串；null/undefined 视为空。 */
function asValue(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

/** 从模板正文里收集用到的变量名（去重，保持出现顺序）。 */
export function collectPlaceholders(text) {
  const found = [];
  const seen = new Set();
  for (const match of String(text).matchAll(PLACEHOLDER_RE)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    found.push(match[1]);
  }
  return found;
}

/** 把模板拆成 system / user 两段；没有分隔行时整篇当 user。 */
function splitSections(text) {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => SEPARATOR_LINE_RE.test(line));
  if (index === -1) return { system: '', user: text };
  const system = lines.slice(0, index).join('\n').replace(/^\n+/u, '').replace(/\n+$/u, '');
  const user = lines.slice(index + 1).join('\n').replace(/^\n+/u, '').replace(/\n+$/u, '');
  return { system: system, user: user };
}

/**
 * 校验清单结构，返回模板条目（未排序）。
 * 结构不对一律抛 manifest-invalid。
 */
export function validateManifest(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 必须是一个 JSON 对象');
  }
  const table = raw.prompts;
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 缺少 prompts 对象');
  }
  const entries = [];
  for (const [id, entry] of Object.entries(table)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 的 "' + id + '" 必须是对象', { id: id });
    }
    const variables = entry.variables ?? [];
    if (!Array.isArray(variables)) {
      throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 的 "' + id + '".variables 必须是数组', { id: id });
    }
    const declared = [];
    for (const variable of variables) {
      const name = typeof variable === 'string' ? variable : variable?.name;
      if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(name)) {
        throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 的 "' + id + '" 声明了非法变量名：' + JSON.stringify(name), { id: id, name: name });
      }
      declared.push(name);
    }
    const duplicate = declared.filter((name, index, list) => list.indexOf(name) !== index);
    if (duplicate.length > 0) {
      throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 的 "' + id + '" 重复声明变量：' + [...new Set(duplicate)].join('、'), { id: id, names: duplicate });
    }
    entries.push({
      id: id,
      title: typeof entry.title === 'string' ? entry.title : id,
      order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : 1000,
      description: typeof entry.description === 'string' ? entry.description : '',
      variables: declared,
    });
  }
  return entries;
}

let cache = null;

/** 真正读盘 + 校验，结果缓存；任何静态问题在这里抛 PromptError。 */
function loadRegistry() {
  if (cache !== null) return cache;
  const dir = DEFAULT_PROMPTS_DIR;
  let manifestText;
  try {
    manifestText = readFileSync(join(dir, MANIFEST_FILE), 'utf8');
  } catch (error) {
    throw new PromptError('prompts-dir-missing', '找不到提示词目录或清单：' + dir + '/' + MANIFEST_FILE, { dir: dir, cause: error.message });
  }
  let rawManifest;
  try {
    rawManifest = JSON.parse(manifestText);
  } catch (error) {
    throw new PromptError('manifest-invalid', MANIFEST_FILE + ' 不是合法 JSON：' + error.message, { dir: dir });
  }
  const entries = validateManifest(rawManifest);
  let present;
  try {
    present = new Set(readdirSync(dir));
  } catch (error) {
    throw new PromptError('prompts-dir-missing', '读不到提示词目录：' + dir, { dir: dir, cause: error.message });
  }
  const prompts = new Map();
  for (const entry of entries) {
    const fileName = entry.id + '.md';
    if (!present.has(fileName)) {
      throw new PromptError('template-missing', '提示词缺少文件：prompts/' + fileName + '（清单里声明了 "' + entry.id + '"）', { id: entry.id, file: fileName });
    }
    const text = normalizeText(readFileSync(join(dir, fileName), 'utf8'));
    if (text.trim() === '') {
      throw new PromptError('template-empty', '提示词模板是空的：prompts/' + fileName, { id: entry.id, file: fileName });
    }
    if (text.length > MAX_TEMPLATE_CHARS) {
      throw new PromptError('template-too-large', '提示词模板过大（' + text.length + ' 字符，上限 ' + MAX_TEMPLATE_CHARS + '）：prompts/' + fileName, { id: entry.id, file: fileName });
    }
    const declared = new Set(entry.variables);
    const undeclared = collectPlaceholders(text).filter((name) => !declared.has(name));
    if (undeclared.length > 0) {
      throw new PromptError('placeholder-invalid', '提示词 prompts/' + fileName + ' 用了未在 ' + MANIFEST_FILE + ' 声明的变量：' + undeclared.join('、'), { id: entry.id, file: fileName, names: undeclared });
    }
    prompts.set(entry.id, {
      id: entry.id,
      title: entry.title,
      order: entry.order,
      description: entry.description,
      variables: entry.variables,
      file: fileName,
      text: text,
      sections: splitSections(text),
    });
  }
  cache = { dir: dir, prompts: prompts };
  return cache;
}

/**
 * 惰性加载并缓存整个提示词目录。返回 { dir, prompts: Map<id, entry> }。
 * 校验失败抛 PromptError，不静默降级。
 */
export function loadPrompts() {
  return loadRegistry();
}

/** 清空缓存；下次渲染时重新读盘。改过 .md 或排查问题时调用。 */
export function invalidate() {
  cache = null;
}

/** 列出清单里的模板元信息（变量名等），供检查器/自检使用。 */
export function listPrompts() {
  const registry = loadRegistry();
  return [...registry.prompts.values()]
    .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      order: entry.order,
      description: entry.description,
      variables: entry.variables.slice(),
      file: entry.file,
    }));
}

/**
 * 渲染一个模板为 messages 数组，形状与 ai.js 喂给 callModelJson 的完全一致：
 * [{ role: 'system', content: [{ type: 'text', text }] }, { role: 'user', content: [{ type: 'text', text }] }]
 *
 * 传入对象里缺失的变量渲染成空串，不抛错；静态校验问题抛 PromptError。
 */
export function renderMessages(id, values = {}) {
  const registry = loadRegistry();
  const entry = registry.prompts.get(id);
  if (entry === undefined) {
    throw new PromptError('template-missing', '没有这个提示词模板：' + id, { id: id });
  }
  const render = (text) => text.replace(PLACEHOLDER_RE, (whole, name) => asValue(values[name]));
  const messages = [];
  if (entry.sections.system.trim() !== '') {
    messages.push({ role: 'system', content: [{ type: 'text', text: render(entry.sections.system) }] });
  }
  if (entry.sections.user.trim() !== '') {
    messages.push({ role: 'user', content: [{ type: 'text', text: render(entry.sections.user) }] });
  }
  return messages;
}

/** 把 PromptError 转成给界面看的中文一句话；非 PromptError 返回 null。 */
export function promptErrorMessage(error) {
  if (!(error instanceof PromptError)) return null;
  const file = error.details?.file;
  switch (error.code) {
    case 'prompts-dir-missing':
      return '提示词目录缺失：' + (error.details?.dir ?? 'prompts') + '（插件包不完整？）';
    case 'manifest-invalid':
      return '提示词清单格式错误：' + error.message;
    case 'template-missing':
      return file === undefined ? '提示词模板不存在：' + String(error.details?.id ?? '') : '提示词缺少文件：prompts/' + file;
    case 'template-empty':
      return '提示词文件是空的：prompts/' + file;
    case 'template-too-large':
      return '提示词文件过大：prompts/' + file;
    case 'placeholder-invalid':
      return '提示词 prompts/' + file + ' 用了未声明的变量：' + (error.details?.names ?? []).join('、');
    default:
      return error.message;
  }
}
