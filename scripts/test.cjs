'use strict'

const { existsSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = resolve(__dirname, '..')

function collectTests(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return collectTests(entryPath, suffix)
    return entry.isFile() && entry.name.endsWith(suffix) ? [entryPath] : []
  })
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function resolvePython() {
  const binDirectory = process.platform === 'win32' ? 'Scripts' : 'bin'
  const pythonName = process.platform === 'win32' ? 'python.exe' : 'python'
  const candidates = [
    process.env.PYTHON && { command: process.env.PYTHON, prefixArgs: [] },
    {
      command: join(projectRoot, '.venv-api', binDirectory, pythonName),
      prefixArgs: [],
    },
    {
      command: join(projectRoot, 'api', 'venv', binDirectory, pythonName),
      prefixArgs: [],
    },
    {
      command: join(projectRoot, '.venv', binDirectory, pythonName),
      prefixArgs: [],
    },
    process.platform === 'win32'
      ? { command: 'python', prefixArgs: [] }
      : { command: 'python3', prefixArgs: [] },
    process.platform === 'win32'
      ? { command: 'py', prefixArgs: ['-3'] }
      : { command: 'python', prefixArgs: [] },
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate.command.includes('/') || candidate.command.includes('\\')) {
      if (!existsSync(candidate.command)) continue
    }
    const check = spawnSync(
      candidate.command,
      [...candidate.prefixArgs, '--version'],
      { cwd: projectRoot, stdio: 'ignore' },
    )
    if (check.status === 0) return candidate
  }

  throw new Error(
    'No usable Python interpreter was found. Set PYTHON or create .venv-api.',
  )
}

const nodeTests = collectTests(join(projectRoot, 'src'), '.test.mts').sort()
if (nodeTests.length === 0) throw new Error('No Node test files were found.')
run(process.execPath, ['--test', ...nodeTests])

const python = resolvePython()
run(python.command, [
  ...python.prefixArgs,
  '-m',
  'unittest',
  'discover',
  '-s',
  'api',
  '-p',
  'test_*.py',
  '-v',
])
