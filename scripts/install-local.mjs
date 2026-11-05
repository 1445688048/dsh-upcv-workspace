#!/usr/bin/env node
/**
 * Install this workbench into the local DSH Desktop profile, the way the app's
 * own plugin manager does it: materialise a *generation* directory, point
 * `profiles/.generations/desired.json` at it, and project the profile manifest.
 *
 * The Desktop performs exactly this projection on every launch, so writing the
 * same inputs is enough — no hand-edited manifest fields are involved, and the
 * next launch reconciles anything this script got wrong.
 *
 * Run it only while DSH Desktop is fully quit, then reopen the app.
 *
 * Usage: node scripts/install-local.mjs [path/to/pkg.tgz]
 */

import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const pluginName = manifest.name
const version = manifest.version

const home = join(process.env.HOME ?? '', 'Library/Application Support/dsh-desktop/harness')
const generations = join(home, 'profiles/.generations')
const live = join(generations, 'live')
const profile = join(home, 'profiles/web')
const bin = join(home, '.desktop-bin')

const tarball = process.argv[2] ?? join(root, `${pluginName}-${version}.tgz`)
if (!existsSync(tarball)) {
  console.error(`install-local: tarball not found: ${tarball}\nRun \`pnpm pack\` first.`)
  process.exit(1)
}

// The generation id is a hash over the resolved lockfile; a stable hash of the
// tarball bytes serves the same purpose (uniqueness per build).
const { readFileSync } = await import('node:fs')
const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex').slice(0, 12)
const id = `${pluginName.replace(/^@/u, '').replace(/[/\\]/gu, '+')}+${version}+${digest}`
const generation = join(live, id)

console.log(`install-local: ${pluginName}@${version}`)
console.log(`  generation: ${id}`)

await mkdir(generation, { recursive: true })
await writeFile(join(generation, '.npmrc'), 'registry=https://registry.npmjs.org/\nside-effects-cache=false\nnode-linker=hoisted\n', 'utf8')
await writeFile(join(generation, 'package.json'), `${JSON.stringify({
  name: 'dsh-generation',
  private: true,
  version: '0.0.0',
  dependencies: { [pluginName]: `file:${tarball}` },
}, undefined, 2)}\n`, 'utf8')
await writeFile(join(generation, 'generation.json'), `${JSON.stringify({ pluginName, version }, undefined, 2)}\n`, 'utf8')

const install = spawnSync(join(bin, 'pnpm'), ['install', '--ignore-scripts'], { cwd: generation, encoding: 'utf8' })
if (install.status !== 0) {
  console.error(install.stderr || install.stdout)
  process.exit(install.status ?? 1)
}

// Register the generation, then project the profile manifest exactly as the app
// does: rewrite the dependency version, pnpm's generation override and the
// generationProjection metadata, and move the node_modules link.
const desiredPath = join(generations, 'desired.json')
const desired = JSON.parse(await readFile(desiredPath, 'utf8')).filter((entry) => !entry.startsWith(`${pluginName}+`))
desired.push(id)
desired.sort()
await writeFile(desiredPath, `${JSON.stringify(desired, undefined, 2)}\n`, 'utf8')

const manifestPath = join(profile, 'package.json')
const profileManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const previous = profileManifest.dsh?.desktop?.generationProjection?.plugins?.[pluginName]?.previousOverride ?? { present: false }
profileManifest.dependencies ??= {}
profileManifest.dependencies[pluginName] = version
profileManifest.pnpm ??= {}
profileManifest.pnpm.overrides ??= {}
profileManifest.pnpm.overrides[pluginName] = `link:${relative(profile, join(generation, 'node_modules', pluginName)).split('\\').join('/')}`
profileManifest.dsh ??= {}
profileManifest.dsh.desktop ??= {}
profileManifest.dsh.desktop.generationProjection = {
  version: 1,
  plugins: {
    ...(profileManifest.dsh.desktop.generationProjection?.plugins ?? {}),
    [pluginName]: { generationId: id, visibleVersion: version, previousOverride: previous },
  },
}
const bundles = profileManifest.dsh.profile?.bundles ?? []
if (!bundles.includes(pluginName)) {
  profileManifest.dsh.profile = { ...(profileManifest.dsh.profile ?? {}), bundles: [...bundles, pluginName] }
}
await writeFile(manifestPath, `${JSON.stringify(profileManifest, undefined, 2)}\n`, 'utf8')

const linkPath = join(profile, 'node_modules', pluginName)
await rm(linkPath, { recursive: true, force: true })
await symlink(join(generation, 'node_modules', pluginName), linkPath)

const resolved = JSON.parse(await readFile(join(linkPath, 'package.json'), 'utf8')).version
console.log(`  installed:  profile resolves ${pluginName}@${resolved}`)
console.log('  restart:    fully quit and reopen DSH Desktop to load it')
