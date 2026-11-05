#!/usr/bin/env node
/**
 * 把 client/src/*.js 按文件名顺序拼成 lib/client.js。
 *
 * 两步：
 *   1. 从 server/resume-schema.js 生成 client/src/05-schema.js（去掉 export 关键字）。
 *      简历数据模型必须两端一致，靠生成而不是手抄两份来保证不漂移。
 *   2. 按文件名排序拼接，并对产物跑 node --check——语法错误在构建期暴露。
 *
 * 用法：node scripts/build-client.mjs [--check]
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const srcDir = join(root, 'client', 'src')
const outFile = join(root, 'lib', 'client.js')
const schemaSource = join(root, 'server', 'resume-schema.js')
const schemaTarget = join(srcDir, '05-schema.js')

// --- 第 1 步：生成客户端 schema 副本 -------------------------------------
const schemaText = await readFile(schemaSource, "utf8")
const schemaHeader = [
  "/**",
   " * dsh-upcv-workspace — client half, part 0.5: 简历数据模型（构建生成，不要手改）。",
   " *",
   " * 源文件：server/resume-schema.js。改那边，然后重新构建。",
   " */",
   "",
].join(String.fromCharCode(10))
const schemaClient = schemaHeader + schemaText.replace(/^export /gm, "")

// --- 第 2 步：拼成 lib/client.js ------------------------------------------
const FILES = (await readdir(srcDir)).filter((name) => name.endsWith(".js")).sort()
if (FILES.length === 0) {
  console.error("build-client: no sources found in " + srcDir)
  process.exit(1)
}

const parts = []
for (const name of FILES) {
  const text = name === "05-schema.js" ? schemaClient : await readFile(join(srcDir, name), "utf8")
  parts.push("/* ---- client/src/" + name + " ---- */" + String.fromCharCode(10) + text.trimEnd() + String.fromCharCode(10))
}

const banner = [
  "/**",
   " * dsh-upcv-workspace — client half (generated).",
   " *",
   " * Hand-written bundle for the DSH client module loader; no bundler, no JSX.",
   " * Source of truth: client/src/*.js — edit those, then run build.",
   " */",
   "",
].join(String.fromCharCode(10))
const output = banner + parts.join(String.fromCharCode(10)) + String.fromCharCode(10)

const checkOnly = process.argv.includes("--check")
if (checkOnly) {
  const existing = await readFile(outFile, "utf8").catch(() => null)
  const existingSchema = await readFile(schemaTarget, "utf8").catch(() => null)
  if (existing !== output || existingSchema !== schemaClient) {
    console.error("build-client: lib/client.js 或 client/src/05-schema.js 与源不一致——请运行构建")
    process.exit(1)
  }
  console.log("build-client: 产物与源一致（" + FILES.length + " 个分片）")
} else {
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(schemaTarget, schemaClient, "utf8")
  await writeFile(outFile, output, "utf8")
  console.log("build-client: 写出 05-schema.js + lib/client.js（" + FILES.length + " 个分片，" + Buffer.byteLength(output) + " 字节）")
}

// 本机 node 不在 PATH：进程本身可能是 Electron，显式带上以 Node 模式运行的开关
const syntax = spawnSync(process.execPath, ["--check", outFile], { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } })
if (syntax.status !== 0) {
  console.error(syntax.stderr || syntax.stdout)
  process.exit(1)
}
