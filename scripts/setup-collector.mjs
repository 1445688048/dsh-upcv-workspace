#!/usr/bin/env node
/**
 * 把内建采集器安装到 <config.root>/collector/（Phase 2.5）。
 *
 * 为什么不在插件里装 Playwright：插件包必须零新依赖（Playwright 体积大、还要下浏览器二进制）。
 * 采集器只是 spec/feed 契约的第三个客户端，装在数据目录下按需使用即可。
 *
 * 用法：
 *   node scripts/setup-collector.mjs [--root <config.root>] [--no-install] [--no-browser]
 *
 * 默认数据根：macOS ~/Library/Application Support/dsh-desktop/harness/dsh-upcv-workspace
 *              Linux ~/.local/share/dsh-desktop/harness/dsh-upcv-workspace
 * 也可用环境变量 DSH_UPCV_ROOT 覆盖。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const valueOf = (name) => { const i = args.indexOf('--' + name); return i === -1 ? undefined : args[i + 1]; };

const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
if (home === '' && valueOf('root') === undefined && process.env.DSH_UPCV_ROOT === undefined) {
  console.error('setup-collector: 没有 HOME/USERPROFILE，无法推断数据根；请显式传 --root <config.root>。');
  process.exit(2);
}
const defaultRoot = process.platform === 'darwin'
  ? join(home, 'Library/Application Support/dsh-desktop/harness/dsh-upcv-workspace')
  : join(home, '.local/share/dsh-desktop/harness/dsh-upcv-workspace');
const root = String(valueOf('root') ?? process.env.DSH_UPCV_ROOT ?? defaultRoot).trim();
if (root === '') {
  console.error('setup-collector: 数据根为空，请显式传 --root <config.root>。');
  process.exit(2);
}
const source = join(repo, 'collector');
const target = join(root, 'collector');

if (!existsSync(join(source, 'collector.js'))) {
  console.error('setup-collector: 找不到采集器源码 ' + join(source, 'collector.js'));
  process.exit(2);
}

mkdirSync(target, { recursive: true });
for (const file of ['collector.js', 'package.json', 'README.md']) {
  const from = join(source, file);
  if (!existsSync(from) && file === 'README.md') {
    writeFileSync(join(target, file), 'dsh-upcv 采集器：node collector.js --spec ../jobs-spec.json\n', 'utf8');
    continue;
  }
  copyFileSync(from, join(target, file));
}
console.log('已复制采集器到 ' + target);
console.log('  规格文件：' + join(root, 'jobs-spec.json'));
console.log('  收件箱：  ' + join(root, 'jobs-feed.jsonl'));

if (flag('no-install')) {
  console.log('\n已跳过依赖安装（--no-install）。需要时在该目录运行：');
  console.log('  cd "' + target + '" && npm install && ./node_modules/.bin/playwright install chromium');
  process.exit(0);
}

const npm = process.env.UPCV_NPM || (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const probe = spawnSync(npm, ['--version'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error('\nsetup-collector: 找不到可用的 npm（PATH 里没有？）。文件已复制，请手动执行：');
  console.error('  cd "' + target + '" && npm install && ./node_modules/.bin/playwright install chromium');
  process.exit(1);
}

const install = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit' });
if (install.status !== 0) {
  console.error('\nsetup-collector: npm install 失败。可稍后重试：cd "' + target + '" && npm install');
  process.exit(1);
}

if (!flag('no-browser')) {
  const cli = join(target, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
  if (!existsSync(cli)) {
    console.error('setup-collector: 找不到 Playwright CLI（' + cli + '），请手动运行 npx playwright install chromium。');
    process.exit(1);
  }
  const browser = spawnSync(cli, ['install', 'chromium'], { cwd: target, stdio: 'inherit' });
  if (browser.status !== 0) {
    console.error('setup-collector: 下载 Chromium 失败。可稍后重试：cd "' + target + '" && ./node_modules/.bin/playwright install chromium');
    process.exit(1);
  }
}

console.log('\n安装完成。回到岗位页点「查询」即可（城市取 jobs-spec.json 的 defaults.city）。');
