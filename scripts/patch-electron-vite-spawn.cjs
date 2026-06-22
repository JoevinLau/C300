'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const chunksDir = path.join(root, 'node_modules', 'electron-vite', 'dist', 'chunks')

function ensureElectronBinary() {
  let electronDir

  try {
    electronDir = path.dirname(require.resolve('electron/package.json', { paths: [root] }))
  } catch {
    return
  }

  const pathFile = path.join(electronDir, 'path.txt')
  const distDir = path.join(electronDir, 'dist')

  if (fs.existsSync(pathFile) && fs.existsSync(distDir)) {
    return
  }

  console.log('[postinstall] Electron binary missing; downloading…')
  execSync('node install.js', { cwd: electronDir, stdio: 'inherit' })
}

function revertBrokenWindowsSpawnPatch() {
  if (!fs.existsSync(chunksDir)) {
    return
  }

  const patchedSpawn =
    "spawn(electronPath, [entry].concat(args), { stdio: 'inherit', ...(process.platform === 'win32' ? { shell: true } : {}) })"
  const originalSpawn =
    "spawn(electronPath, [entry].concat(args), { stdio: 'inherit' })"

  for (const name of fs.readdirSync(chunksDir)) {
    if (!name.endsWith('.js')) continue

    const file = path.join(chunksDir, name)
    const content = fs.readFileSync(file, 'utf8')

    if (!content.includes('function startElectron')) continue
    if (!content.includes(patchedSpawn)) {
      return
    }

    fs.writeFileSync(file, content.replace(patchedSpawn, originalSpawn))
    console.log(
      '[patch-electron-vite-spawn] Reverted shell:true spawn patch (breaks paths with spaces).',
    )
    return
  }
}

ensureElectronBinary()
revertBrokenWindowsSpawnPatch()
