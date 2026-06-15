'use strict'

const { execSync } = require('node:child_process')
const { dirname, join } = require('node:path')
const { createRequire } = require('node:module')

if (process.platform !== 'win32') {
  process.exit(0)
}

const requireFromRoot = createRequire(join(__dirname, '..', 'package.json'))

try {
  const electronDir = dirname(requireFromRoot.resolve('electron/package.json'))
  const dist = join(electronDir, 'dist').replace(/'/g, "''")
  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '${dist}' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File"`,
    { stdio: 'ignore' },
  )
} catch {
  // Unblock is best-effort; dev may still work without it.
}
