# Electron App

Electron + React + TypeScript starter built with `electron-vite`.

## Requirements

- Node.js
- pnpm

This project is configured for `pnpm@10.33.2`.

If `pnpm` is not available, enable it with Corepack:

```sh
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

## Setup

Install dependencies:

```sh
pnpm install
```

Start the development server and Electron app:

```sh
pnpm dev
```

## Scripts

- `pnpm dev` starts the Electron main process, preload script, and Vite renderer dev server.
- `pnpm build` builds the app into `out/`.
- `pnpm preview` previews the built app.
- `pnpm typecheck` runs TypeScript without emitting files.

## Project Structure

```text
src/
  main/       Electron main process
  preload/    Preload bridge exposed to the renderer
  renderer/   React UI
  shared/     Shared TypeScript types
```

Generated output is written to `out/` and should not be committed.

## Troubleshooting

### `Error: Electron uninstall`

This means the Electron package is installed but its app binary was not downloaded. Reinstall dependencies first:

```sh
pnpm install
```

If it still fails, run Electron's installer manually:

```sh
node node_modules/.pnpm/electron@42.1.0/node_modules/electron/install.js
```

If the download cannot write to your user cache, use a project-local cache:

```sh
electron_config_cache="$PWD/node_modules/.cache/electron" node node_modules/.pnpm/electron@42.1.0/node_modules/electron/install.js
```

### `Cannot read properties of undefined (reading 'whenReady')`

This can happen when `ELECTRON_RUN_AS_NODE=1` is set in the shell environment. Clear it before starting:

```sh
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue   # PowerShell
```

### `Error: spawn EPERM` (Windows)

Windows blocked launching `electron.exe`. The project runs `scripts/predev.cjs` before `dev`/`preview` to unblock the Electron `dist` folder and patches `electron-vite` on install to spawn with `shell: true` on Windows.

If it still fails:

1. Re-apply the patch: `node scripts/patch-electron-vite-spawn.cjs`
2. Re-download Electron: `node -e "require('electron')"`
3. In **Windows Security → Virus & threat protection**, add an exclusion for this project folder (or allow `node.exe` under Controlled folder access).
4. Prefer **pnpm** (`pnpm dev`) — this repo is set up for pnpm, not npm.
5. If the project lives under **Desktop** or **Documents**, move it to a folder such as `C:\dev\C300` (Controlled folder access often blocks apps there).
