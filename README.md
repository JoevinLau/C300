# C300

Desktop app for **carbon emissions estimation** from supplier and portfolio spend. The UI is an Electron + React client; calculations run in a local **FastAPI** service backed by **MySQL** (with built-in dev fallbacks when the database is unavailable).

## What it does

- **Home hub** — Overview of calculation modules and sample NAICS mappings.
- **NAICS mapping** (`#naics-mapping`) — Placeholder workflow for mapping companies and spend categories to NAICS sectors (UI scaffold).
- **USEEIO / Method 1** (`#method-1`) — Split invoice spend across raw material, fabrication, and surface treatment; convert SGD → 2022 USD using FX and inflation; apply USEEIO kgCO₂e/USD factors per NAICS code.
- **Method 2 & 3** — Listed on the home screen; not implemented yet.

Method 1 calls `POST /calculate` on the API. In Electron, requests go through the main process (`calculator:calculate` IPC) to avoid renderer CORS issues; the renderer can also call the API directly when running outside Electron.

## Architecture

```text
┌─────────────────┐     IPC (Electron)      ┌──────────────────┐
│  React renderer │ ────────────────────► │  Electron main   │
│  (Vite :5173)   │     fetch (browser)   │  api-client.ts   │
└────────┬────────┘                       └────────┬─────────┘
         │                                         │
         └─────────────────┬───────────────────────┘
                           │ HTTP :8000
                           ▼
                  ┌─────────────────┐
                  │  FastAPI (api/) │
                  │  calculator.py  │
                  └────────┬────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     MySQL (carbon_emission_db)   api/dev_data.py
     USEEIO + FX tables           (fallback catalog)
```

## Requirements

- **Node.js** and **pnpm** (`pnpm@10.33.2` via `packageManager` in `package.json`)
- **Python 3.10+** for the API
- **MySQL** (optional) — `Exchange_Inflation_Table` and `USEEIO_Factors_Table` in `carbon_emission_db`. If MySQL is down or misconfigured, the API uses `api/dev_data.py`.

Enable pnpm with Corepack if needed:

```sh
corepack enable
corepack prepare pnpm@10.33.2 --activate
```

## Setup

### Frontend (Electron + React)

```sh
pnpm install
```

### Backend (FastAPI)

From the repo root:

```sh
cd api
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Configure MySQL in `api/db.py` (`host`, `user`, `password`, `database`). The app expects database name `carbon_emission_db` with tables used by `api/service.py`.

## Development

Run the API and the Electron app in **two terminals**.

**Terminal 1 — API** (listens on `http://127.0.0.1:8000`):

```sh
cd api
source venv/bin/activate          # Windows: venv\Scripts\activate
python main.py
```

**Terminal 2 — desktop UI**:

```sh
pnpm dev
```

Open **USEEIO** from the home screen (or navigate to `#method-1`). Health check: `GET http://127.0.0.1:8000/` → `{"message":"API is running!"}`.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/naics` | NAICS codes, descriptions, optional kgCO₂e/USD |
| `POST` | `/calculate` | Run Method 1 emissions calculation |

`POST /calculate` body (summary): `invoice_id`, `year` (2020–2030), `total_amount_sgd`, `allocation` (three percentages summing to 100), `naics` (three 6-digit codes for raw material, fabrication, surface treatment). Shared TypeScript types live in `src/shared/calculator-types.ts`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite renderer + Electron (runs `scripts/predev.cjs` first) |
| `pnpm build` | Production build to `out/` |
| `pnpm preview` | Preview the built app |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |

## Project structure

```text
api/
  main.py           FastAPI app and routes
  service.py        MySQL access + dev_data fallback
  calculator.py     SGD → USD 2022 and emissions math
  db.py             MySQL connection settings
  dev_data.py       Fallback NAICS / FX when DB is unavailable
  requirements.txt

src/
  main/             Electron main process + API client
  preload/          contextBridge → window.electronAPI
  renderer/         React UI (pages, components, Tailwind)
  shared/           calculator-types, naics-catalog, electron-api

scripts/            predev and electron-vite spawn patch (Windows)
out/                Build output (gitignored)
```

UI stack: React 19, Tailwind CSS 4, Radix UI primitives under `src/renderer/components/ui/`.

## Troubleshooting

### API errors / “port 8000”

Ensure the FastAPI process is running before using Method 1. The renderer and main process both target `http://127.0.0.1:8000`.

### MySQL connection

If calculations fail with missing FX or NAICS data, check `api/db.py` and that MySQL is running. With no DB, only years and NAICS codes present in `dev_data.py` work.

### `Error: Electron uninstall`

Electron’s binary was not downloaded. Reinstall dependencies:

```sh
pnpm install
```

If it still fails, run the installer manually (adjust the version folder to match `package.json` / lockfile, e.g. `42.3.1`):

```sh
node node_modules/.pnpm/electron@42.3.1/node_modules/electron/install.js
```

Project-local cache if the user cache is not writable:

```sh
electron_config_cache="$PWD/node_modules/.cache/electron" node node_modules/.pnpm/electron@42.3.1/node_modules/electron/install.js
```

### `Cannot read properties of undefined (reading 'whenReady')`

`ELECTRON_RUN_AS_NODE=1` in the environment can break Electron startup. Unset it before `pnpm dev`.

```sh
unset ELECTRON_RUN_AS_NODE          # macOS / Linux
```

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

### `Error: spawn EPERM` (Windows)

Windows may block `electron.exe`. This repo runs `scripts/predev.cjs` before `dev`/`preview` and patches `electron-vite` on install for `shell: true` on Windows.

If it still fails:

1. Re-apply the patch: `node scripts/patch-electron-vite-spawn.cjs`
2. Re-download Electron: `node -e "require('electron')"`
3. Add a Windows Security exclusion for the project folder (or allow `node.exe` under Controlled folder access).
4. Use **pnpm** (`pnpm dev`), not npm.
5. If the project is under Desktop or Documents, try a path like `C:\dev\C300`.
