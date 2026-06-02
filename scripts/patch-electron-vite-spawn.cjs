'use strict'

const fs = require('node:fs')
const path = require('node:path')

const chunksDir = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'dist', 'chunks')

if (!fs.existsSync(chunksDir)) {
  process.exit(0)
}

const oldSpawn =
  "spawn(electronPath, [entry].concat(args), { stdio: 'inherit' })"
const newSpawn =
  "spawn(electronPath, [entry].concat(args), { stdio: 'inherit', ...(process.platform === 'win32' ? { shell: true } : {}) })"

for (const name of fs.readdirSync(chunksDir)) {
  if (!name.endsWith('.js')) continue

  const file = path.join(chunksDir, name)
  const content = fs.readFileSync(file, 'utf8')

  if (!content.includes('function startElectron')) continue
  if (content.includes(newSpawn)) {
    process.exit(0)
  }
  if (!content.includes(oldSpawn)) {
    console.warn(
      '[patch-electron-vite-spawn] startElectron spawn call changed; patch skipped.',
    )
    process.exit(0)
  }

  fs.writeFileSync(file, content.replace(oldSpawn, newSpawn))
  console.log('[patch-electron-vite-spawn] Applied Windows spawn fix.')
  process.exit(0)
}
