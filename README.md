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

This can happen when `ELECTRON_RUN_AS_NODE=1` is set in the shell environment. The project's `dev` and `preview` scripts clear that variable automatically.
