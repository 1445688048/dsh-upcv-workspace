/**
 * 用本机 Chromium 内核把简历 HTML 打印成真 PDF。
 *
 * 为什么不用 Electron：插件服务端拿不到 electron 模块（探测结论），
 * 宿主也没有暴露 printToPDF。Chromium 自带的 --headless --print-to-pdf 是
 * 唯一既零依赖、又能保证「打印结果 = 预览渲染」的路：同一个引擎、同一份 HTML/CSS。
 *
 * @module dsh-upcv-workspace/pdf
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 常见安装位置（macOS 优先，其次 Linux）。 */
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

/** 找浏览器：优先用户配置，其次常见路径。找不到返回 null（不猜、不下载）。 */
export function findChrome(configured, exists = existsSync) {
  if (typeof configured === 'string' && configured.trim() !== '' && exists(configured)) return configured;
  for (const candidate of CHROME_CANDIDATES) { if (exists(candidate)) return candidate; }
  return null;
}

/**
 * 把 HTML 渲染成 PDF。
 *
 * @param {string} html 完整 HTML（与预览同构）
 * @param {{ chromePath?: string, timeoutMs?: number, run?: Function, exists?: Function }} options
 *        run/exists 仅供测试注入。
 * @returns {Promise<{ pdf?: Buffer, ms?: number, engine?: string, error?: string, message?: string }>}
 */
export function renderPdf(html, options = {}) {
  const exists = options.exists === undefined ? existsSync : options.exists;
  const chrome = findChrome(options.chromePath, exists);
  if (chrome === null) return Promise.resolve({ error: 'no-browser', message: '本机没有找到 Chrome / Chromium，无法生成 PDF。' });
  if (typeof html !== 'string' || html.trim() === '') return Promise.resolve({ error: 'empty-html', message: '没有可导出的内容。' });
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 45000;
  const run = options.run === undefined ? execFile : options.run;
  let workDir = null;
  try { workDir = mkdtempSync(join(tmpdir(), 'dsh-upcv-pdf-')); }
  catch (err) { return Promise.resolve({ error: 'temp-failed', message: '无法创建临时目录。' }); }
  const htmlPath = join(workDir, 'resume.html');
  const pdfPath = join(workDir, 'resume.pdf');
  const profileDir = join(workDir, 'profile');
  try { writeFileSync(htmlPath, html, 'utf8'); }
  catch (err) { rmSync(workDir, { recursive: true, force: true }); return Promise.resolve({ error: 'temp-failed', message: '写入临时文件失败。' }); }
  // 参数用数组交给 execFile，不经过 shell：简历内容不会变成命令。
  const args = [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--no-pdf-header-footer',
    '--user-data-dir=' + profileDir,
    '--print-to-pdf=' + pdfPath,
    'file://' + htmlPath,
  ];
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { rmSync(workDir, { recursive: true, force: true }); } catch (err) { /* 忽略 */ }
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ error: 'timeout', message: '生成 PDF 超时，请重试。' });
    }, timeoutMs);
    const callback = (err) => {
      clearTimeout(timer);
      if (err !== null && err !== undefined) {
        finish({ error: 'chrome-failed', message: '浏览器渲染失败：' + String(err && err.message).slice(0, 160) });
        return;
      }
      let buffer = null;
      try { buffer = readFileSync(pdfPath); }
      catch (err2) { finish({ error: 'no-output', message: '浏览器没有产出 PDF 文件。' }); return; }
      if (buffer.length === 0 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        finish({ error: 'bad-output', message: '产出不是有效 PDF。' });
        return;
      }
      finish({ pdf: buffer, ms: Date.now() - started, engine: chrome });
    };
    const child = run(chrome, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, callback);
    if (child !== null && child !== undefined && typeof child.on === 'function') {
      child.on('error', (err) => { clearTimeout(timer); finish({ error: 'spawn-failed', message: '无法启动浏览器：' + String(err && err.message).slice(0, 160) }); });
    }
  });
}

/** 生成 Content-Disposition：ASCII 兜底 + RFC 5987 的 UTF-8 文件名。 */
export function contentDisposition(fileName) {
  const raw = String(fileName == null ? '' : fileName).trim() === '' ? 'resume.pdf' : String(fileName).trim();
  // 去掉会破坏响应头或路径的字符（换行、引号、反斜杠），并限制长度
  const safe = raw
    .split(String.fromCharCode(13)).join('')
    .split(String.fromCharCode(10)).join('')
    .split(String.fromCharCode(34)).join('')
    .split(String.fromCharCode(92)).join('')
    .slice(0, 80);
  const ascii = safe.replace(/[^ -~]/g, '_') === '' ? 'resume.pdf' : safe.replace(/[^ -~]/g, '_');
  const apostrophes = String.fromCharCode(39) + String.fromCharCode(39);
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8' + apostrophes + encodeURIComponent(safe);
}
