'use strict'

const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

if (process.platform === 'win32') {
  console.log('Preparing Windows Electron runtime...')
  const predev = spawnSync(process.execPath, [join(__dirname, 'predev.cjs')], {
    stdio: 'inherit',
    env: process.env,
  })

  if (predev.status !== 0) {
    process.exit(predev.status ?? 1)
  }
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

console.log('Starting Electron/Vite dev server...')
const dev = spawnSync('electron-vite', {
  stdio: 'inherit',
  cwd: join(__dirname, '..'),
  env,
  shell: true,
})

if (dev.error) {
  console.error(`Failed to start Electron/Vite: ${dev.error.message}`)
}
if (dev.status !== 0) {
  console.error(`Electron/Vite exited with code ${dev.status ?? 'unknown'}.`)
}

process.exit(dev.status ?? 1)
