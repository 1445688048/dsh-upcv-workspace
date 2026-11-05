#!/usr/bin/env node
/**
 * Validate the workbench package against the local workbench standard
 * (https://dshdesktop.com/workbench/docs/development.md §3) before installing.
 *
 * Checks, in order:
 *   1. package.json: name/version/main/exports, `dsh.bundle.patch`,
 *      `dsh.client.platform === "web"` and `dsh.client.inject` containing
 *      `dsh-desktop-workbenches`, plus the files[] allow-list.
 *   2. cordis.patch.yml: a non-empty YAML array whose insert row names the npm
 *      package (never a path) and only adds its own entry id.
 *   3. The server entry: exports `name`, `inject`, a Schemastery `Config`, and
 *      `apply`; its routes stay under its own `/api/<id>/` prefix.
 *   4. The client entry: `window.__ModuleLoader__.load({ id })` with the npm
 *      package name, a factory, a GitHub `repository` in the registration, and
 *      no legacy `register({ id })`; `ctx.effect` for cleanup.
 *   5. The built client is in sync with client/src and parses.
 *
 * Usage: node scripts/check-workbench-package.mjs
 */

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const notes = []

const fail = (message) => problems.push(message)
const ok = (message) => notes.push(`  ok  ${message}`)

const read = (relative) => readFile(join(root, relative), 'utf8')
const readJson = async (relative) => JSON.parse(await read(relative))

const manifest = await readJson('package.json')

// --- 1. package.json -------------------------------------------------------
if (typeof manifest.name !== 'string' || manifest.name === '') fail('package.json: name is required')
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(manifest.version))) fail('package.json: version must be a full SemVer')
if (manifest.main === undefined) fail('package.json: main is required')
if (manifest.exports?.['.'] === undefined) fail('package.json: exports["."] must point at the server entry')
if (manifest.exports?.['./client'] === undefined) fail('package.json: exports["./client"] is required when dsh.client is declared')
if (manifest.dsh?.bundle?.patch === undefined) fail('package.json: dsh.bundle.patch is required or the package installs without activating a plugin layer')
else if (manifest.dsh.bundle.patch !== './cordis.patch.yml') notes.push(`  note dsh.bundle.patch = ${manifest.dsh.bundle.patch}`)
if (manifest.dsh?.client?.platform !== 'web') fail('package.json: dsh.client.platform must be "web"')
if (!Array.isArray(manifest.dsh?.client?.inject)) fail('package.json: dsh.client.inject must be an array')
else if (!manifest.dsh.client.inject.includes('dsh-desktop-workbenches')) fail('package.json: dsh.client.inject must include "dsh-desktop-workbenches"')
if (manifest.dsh?.client?.external !== undefined && manifest.dsh.client.external.includes(manifest.name)) fail('package.json: dsh.client.external must not list itself')
if (manifest.peerDependencies?.['@deepseek-ai/cordis'] === undefined) fail('package.json: @deepseek-ai/cordis belongs in peerDependencies')
if (manifest.dependencies?.['@deepseek-ai/cordis'] !== undefined) fail('package.json: @deepseek-ai/cordis must not be a runtime dependency (second host copy)')
for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
  const range = String(manifest.peerDependencies[peer])
  if (!/(?:-0|rc|alpha|beta|next)/.test(range)) notes.push(`  note peer range for ${peer} may exclude pre-release hosts: ${range}`)
}
// prompts/ 必须在 files[] 里：插件运行时按相对路径读 ./prompts/_manifest.json，
// 漏掉它会让每一次章节生成都报 prompts-dir-missing（安装本身却看起来成功）。
for (const required of ['dsh/index.js', 'lib/client.js', 'cordis.patch.yml', 'README.md', 'prompts/_manifest.json']) {
  if (!Array.isArray(manifest.files) || !manifest.files.some((entry) => entry === required || required.startsWith(`${entry.replace(/\/$/, '')}/`))) {
    fail(`package.json: files[] must include ${required}`)
  }
}
if (manifest.private !== true) notes.push('  note package.json is publishable (private is not true); this package is local-only')
ok('package.json declares the DSH bundle + web client surface')

// 提示词完整性：清单里的每个 id 都要有对应的非空 .md（否则装完才在运行时炸）
try {
  const promptManifest = JSON.parse(await read('prompts/_manifest.json'))
  const entries = Object.entries(promptManifest.prompts ?? {})
  if (entries.length === 0) fail('prompts/_manifest.json: declares no prompts')
  let missing = 0
  for (const [id, entry] of entries) {
    const file = typeof entry.file === 'string' && entry.file !== '' ? entry.file : `${id}.md`
    try {
      const body = await read(`prompts/${file}`)
      if (body.trim() === '') fail(`prompts/${file}: template is empty`)
    } catch {
      missing += 1
      fail(`prompts/${file}: declared by the manifest but missing from the package`)
    }
  }
  if (missing === 0) ok(`prompts/: ${entries.length} templates present and non-empty`)
} catch (error) {
  fail(`prompts/_manifest.json: ${error instanceof Error ? error.message : String(error)}`)
}

// --- 2. cordis.patch.yml ---------------------------------------------------
const patchText = await read(manifest.dsh?.bundle?.patch ?? 'cordis.patch.yml')
const patchCode = patchText.split('\n').map((line) => line.replace(/\s+#.*$/, '')).join('\n')
const patchRows = patchCode.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
if (patchRows.length === 0) fail('cordis.patch.yml: an empty file (or comments only) fails at startup; write [] when nothing is needed')
const patchBody = patchRows.join('\n')
if (!/^-\s*insert:/m.test(patchBody)) fail('cordis.patch.yml: expected an `insert:` list')
const nameRows = [...patchBody.matchAll(/^\s*name:\s*(.+)$/gm)].map((match) => match[1].trim().replace(/^['"]|['"]$/g, ''))
if (nameRows.length === 0) fail('cordis.patch.yml: every insert row needs `name`')
for (const value of nameRows) {
  if (value !== manifest.name) fail(`cordis.patch.yml: name must be the npm package name (${manifest.name}), found ${value}`)
  if (value.startsWith('.') || value.startsWith('/')) fail(`cordis.patch.yml: name must not be a path (${value})`)
}
const ids = [...patchBody.matchAll(/^\s*-\s*id:\s*(.+)$/gm)].map((match) => match[1].trim())
if (ids.length === 0) fail('cordis.patch.yml: insert rows need an `id`')
if (ids.some((id) => id !== manifest.name)) notes.push(`  note insert id(s) ${ids.join(', ')} differ from the package name; that is allowed but keep them stable`)
if (/!!js/.test(patchBody)) {
  const js = [...patchBody.matchAll(/!!js\s+([^\n]+)/g)].map((match) => match[1].trim())
  for (const expression of js) {
    if (!/^dshHomePath\('[^']+'\)$/.test(expression)) fail(`cordis.patch.yml: unexpected !!js expression ${expression}`)
  }
}
ok(`cordis.patch.yml inserts ${ids.length} row(s) pointing at ${manifest.name}`)

// --- 3. server entry -------------------------------------------------------
const serverPath = manifest.exports?.['.'] ?? manifest.main
const serverText = await read(serverPath)
if (!/export\s+const\s+name\s*=/.test(serverText)) fail(`${serverPath}: must export const name`)
if (!/export\s+const\s+inject\s*=/.test(serverText)) fail(`${serverPath}: must export const inject`)
if (!/export\s+(?:const\s+)?Config\s*=/.test(serverText)) fail(`${serverPath}: must export a Schemastery Config`)
else if (!/@deepseek-ai\/schemastery/.test(serverText)) fail(`${serverPath}: Config must come from @deepseek-ai/schemastery`)
if (!/export\s+function\s+apply/.test(serverText)) fail(`${serverPath}: must export function apply`)
const apiTextForBase = await read('server/api.js')
const declaredBase = new RegExp("const BASE = '([^']+)'").exec(apiTextForBase)?.[1]
if (declaredBase === undefined) fail('server/api.js: expected a single route prefix constant BASE')
else if (declaredBase !== `/api/${manifest.name}`) fail(`server/api.js: routes must live under /api/${manifest.name}/, found ${declaredBase}`)
if (!serverText.includes('BASE')) notes.push('  note the server entry does not re-export BASE')
if (/desktopWorkbenchOwnership/.test(serverText) && !/await .*read\(\)/.test(serverText)) notes.push('  note desktopWorkbenchOwnership is injected but read() is never awaited')

// The handler table lives in server/api.js: every ROUTES entry must have a table
// entry, and every table entry must be reachable from ROUTES.
const apiPath = 'server/api.js'
const apiText = await read(apiPath)
const routeCount = [...apiText.matchAll(/^\s+[a-zA-Z]+: `\$\{BASE\}\/[a-z/-]+`,$/gm)].length
if (routeCount === 0) fail(`${apiPath}: no ROUTES entries found under the workbench prefix`)
if (!/export const ROUTES = \{/.test(apiText)) fail(`${apiPath}: must export the exact-route table as ROUTES`)
for (const match of apiText.matchAll(/\[(ROUTES\.[a-zA-Z]+)\]: \{/g)) {
  if (!apiText.includes(`  ${match[1].split('.')[1]}: `)) fail(`${apiPath}: handler table references an unknown route ${match[1]}`)
}
ok(`${serverPath} exports name/inject/Config/apply; ${apiPath} declares ${routeCount} exact routes under ${declaredBase}`)

// Every relative import of the entries must ship, or the tarball installs and
// then fails to load (files[] silently drops them).
const shipped = new Set()
async function collectImports(relative, seen = new Set()) {
  if (seen.has(relative)) return
  seen.add(relative)
  shipped.add(relative)
  const text = await read(relative)
  for (const match of text.matchAll(/from\s+'(\.[^']+)'/g)) {
    const resolved = relative.split('/').slice(0, -1).concat(match[1].split('/')).reduce((parts, part) => {
      if (part === '.' || part === '') return parts
      if (part === '..') return parts.slice(0, -1)
      return [...parts, part]
    }, []).join('/')
    await collectImports(resolved, seen)
  }
}
await collectImports(serverPath.replace(/^\.\//, ''))
await collectImports('server/api.js')
for (const file of shipped) {
  const covered = (manifest.files ?? []).some((entry) => entry === file
    || (entry.endsWith('/') && file.startsWith(entry))
    || (entry.endsWith('/') && file.startsWith(entry.slice(0, -1))))
  if (!covered) fail(`package.json: files[] omits ${file}, which ${serverPath} imports — the tarball would fail to load`)
}
ok(`files[] ships all ${shipped.size} server module(s) reachable from the entry`)

// --- 4. client entry -------------------------------------------------------
const clientPath = manifest.exports?.['./client']
const clientText = await read(clientPath)
const loadedId = /__ModuleLoader__\.load\(\{[\s\S]*?id:\s*'([^']+)'/.exec(clientText)?.[1]
if (loadedId === undefined) fail(`${clientPath}: must call window.__ModuleLoader__.load({ id })`)
else if (![manifest.name, `${manifest.name}/client`].includes(loadedId)) fail(`${clientPath}: loader id must be the npm package name (${loadedId} !== ${manifest.name})`)
if (!/factory:\s*\(require\)\s*=>/.test(clientText)) fail(`${clientPath}: the loader entry needs a factory: (require) => ...`)
if (!/return\s*\{\s*apply/.test(clientText)) fail(`${clientPath}: the factory must return { apply, ... }`)
if (!/inject:\s*\[\s*'desktopWorkbenches'\s*\]/.test(clientText)) fail(`${clientPath}: the returned plugin must inject ['desktopWorkbenches']`)
if (!/ctx\.desktopWorkbenches\.register\(/.test(clientText)) fail(`${clientPath}: must register the business panel through ctx.desktopWorkbenches.register`)
if (!/ctx\.effect\(\(\)\s*=>\s*ctx\.desktopWorkbenches\.register/.test(clientText)) fail(`${clientPath}: the unregister function must be handed to ctx.effect`)
/** Read `repository: <value>` from register(), following one local constant. */
function registeredRepository(source) {
  const direct = /repository:\s*'([^']+)'/.exec(source)?.[1]
  if (direct !== undefined) return direct
  const reference = /repository:\s*([A-Z_][A-Z0-9_]*)\s*,/.exec(source)?.[1]
  if (reference === undefined) return undefined
  return new RegExp(`(?:const|let|var)\\s+${reference}\\s*=\\s*'([^']+)'`).exec(source)?.[1]
}

const repository = registeredRepository(clientText)
if (repository === undefined) fail(`${clientPath}: register() must pass a GitHub repository URL`)
else if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail(`${clientPath}: repository must look like https://github.com/<owner>/<repo>, found ${repository}`)
else {
  const manifestRepo = String(manifest.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '')
  if (manifestRepo !== '' && !manifestRepo.endsWith(repository.replace('https://github.com/', ''))) {
    fail(`package.json repository (${manifestRepo}) and the registered repository (${repository}) disagree`)
  }
  ok(`client registers repository identity ${repository}`)
}
if (/register\(\{[^}]*id:\s*'/.test(clientText)) fail(`${clientPath}: new packages must not pass a legacy register({ id })`)
const clientCode = clientText
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
if (/<[A-Z][A-Za-z0-9]*[\s/>]/.test(clientCode)) notes.push('  note client source appears to contain JSX; the loader receives plain JavaScript only')
if (!/customFrame:\s*(true|false)/.test(clientText)) notes.push('  note register() does not choose a layout explicitly (customFrame); the host then uses the standard split')
ok(`${clientPath} registers the panel with the loader id ${loadedId}`)

// --- 5. build freshness ----------------------------------------------------
const build = spawnSync(process.execPath, [join(root, 'scripts', 'build-client.mjs'), '--check'], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
if (build.status !== 0) fail(`lib/client.js is stale: ${(build.stderr || build.stdout).trim()}`)
else ok('lib/client.js is in sync with client/src and parses')

// --- 6. version consistency ------------------------------------------------
// 三处版本号必须同步：package.json、客户端 WhatsNew（client/src/20-app.js 的 CLIENT_VERSION）、
// 服务端（server/api.js 的 BUILD_VERSION）。历史上发版只改其中一处，界面公告与 /meta 各说各话。
const clientSource = await read('client/src/00-shell.js')
const serverSource = await read('server/api.js')
const clientVersion = /CLIENT_VERSION = '([^']+)'/.exec(clientSource)?.[1] ?? null
const serverVersion = /BUILD_VERSION = '([^']+)'/.exec(serverSource)?.[1] ?? null
const manifestVersion = manifest.version
if (clientVersion === null) fail('client/src/00-shell.js: CLIENT_VERSION 常量缺失')
if (serverVersion === null) fail('server/api.js: BUILD_VERSION 常量缺失')
if (clientVersion !== null && serverVersion !== null && manifestVersion !== null
  && (clientVersion !== manifestVersion || serverVersion !== manifestVersion)) {
  fail(`版本号不同步：package.json=${manifestVersion}，client CLIENT_VERSION=${clientVersion}，server BUILD_VERSION=${serverVersion}`)
} else if (clientVersion !== null && serverVersion !== null) {
  ok(`version ${manifestVersion} consistent across package.json / client / server`)
}

// --- report ----------------------------------------------------------------
console.log(`check-workbench-package: ${manifest.name}@${manifest.version}`)
for (const line of notes) console.log(line)
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('\nAll required checks passed.')
