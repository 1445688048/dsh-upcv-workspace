#!/usr/bin/env node
/**
 * 客户端产物加载自检：用最小 stub 在 Node 里把 lib/client.js 的模块工厂跑一遍。
 *
 * 为什么存在：`node --check` 只查语法，抓不住「引用了已删除的函数」这类
 * 加载期错误（V0.23 真实事故：调试出口引用了已退役的 MistakesPage，模块
 * 一加载就 ReferenceError，宿主整块启动失败）；而 panel-render 自检依赖
 * DSH Desktop 自带的 react/jsdom，在开发机上恒 SKIP。这个检查不渲染任何
 * 组件，只要求模块顶层可执行——所有函数定义、类声明和调试出口求值都要
 * 能通过，恰好补上那个盲区。
 *
 * 运行：node scripts/check-client-boot.mjs（构建后调用）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

// 最小 React 种子：只需支持顶层求值（类继承 + 函数定义），不渲染任何东西。
class StubComponent {}
const stubReact = {
  __esModule: true,
  default: null,
  Component: StubComponent,
  createElement: () => null,
  Fragment: 'Fragment',
  useState: () => [undefined, () => {}],
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: () => ({ current: null }),
};

let loaded = null;
const stubWindow = {
  __ModuleLoader__: {
    load: (mod) => { loaded = mod.factory(() => stubReact); },
  },
};

let failed = false;
try {
  new Function('window', 'globalThis', bundle)(stubWindow, globalThis);
} catch (error) {
  failed = true;
  console.error('  FAIL 客户端模块顶层执行失败：' + (error instanceof Error ? error.message : String(error)));
  const stack = error instanceof Error ? error.stack : '';
  const line = String(stack).split('\n').find((l) => l.includes('<anonymous>:'));
  if (line !== undefined) console.error('       位置：' + line.trim());
  process.exit(1);
}
if (loaded === null || typeof loaded !== 'object' || loaded === null) {
  console.error('  FAIL 模块工厂没有返回 { apply, inject }（__ModuleLoader__.load 未被调用或 factory 返回异常）。');
  process.exit(1);
}
if (typeof loaded.apply !== 'function') {
  console.error('  FAIL factory 返回值缺少 apply()。');
  process.exit(1);
}
console.log('  ok   客户端模块顶层执行通过（' + bundle.length + ' 字节，apply/inject 齐全）');
