# C300

Desktop app for **carbon emissions estimation** from supplier and portfolio spend. The UI is an Electron + React workbench; calculations run in a local **FastAPI** service backed by authoritative reference data in **MySQL**. Reference-data failures stop calculations instead of silently substituting development constants.

## What it does

- **Home hub** — Workflow selection dashboard for NAICS mapping, USEEIO / Method 1, Method 2, and Method 3.
- **NAICS mapping** (`#naics-mapping`) — UI workflow for preparing company, supplier, or spend-category records with NAICS codes before running emissions calculations.
- **USEEIO / Method 1** (`#method-1`) — Workbench for invoice-level spend allocation. Split spend across raw material, fabrication, and surface treatment; convert SGD → 2022 USD using FX and inflation; apply USEEIO kgCO₂e/USD factors per NAICS code.
- **Method 2** (`#method-2`) — Hybrid emissions prototype with a supplier-document RAG assistant. Upload PDF or XLSX evidence, ask grounded questions, and inspect the retrieved source excerpts behind each answer.
- **Method 3** — Listed on the home screen; not implemented yet.

In Electron, local API requests go through the preload bridge and main process to avoid packaged-renderer CORS issues. This includes Method 1, Method 2, transport, NAICS, and RAG document requests. The renderer uses direct HTTP only when running outside Electron.

## UI overview

The renderer is organized as a workflow dashboard:

- **Workflow cards** on the home screen route users into each calculation path.
- **NAICS mapping card** includes a short preview of the mapping workflow: upload or review spend records, search NAICS sectors, and prepare mapped records for calculation methods.
- **NAICS mapping page** has a dark context rail, upload/search actions, a sample mapping table, and a suggested flow panel.
- **Method 1 page** uses a workbench layout with a left workflow rail, central invoice/allocation form, and right-side results/process panels.
- **Method 2 page** combines fixed prototype calculation data with a persistent supplier-document index, document upload/status controls, grounded chat answers, and expandable citations.
- **History modal** stores the latest five Method 1 calculations in renderer state for quick review during the current session.

## Architecture

```text
┌─────────────────┐     IPC (Electron)      ┌──────────────────┐
│  React renderer │ ────────────────────► │  Electron main   │
│  (Vite :5173)   │  fetch (browser only) │  api-client.ts   │
└────────┬────────┘                       └────────┬─────────┘
         │                                         │
         └─────────────────┬───────────────────────┘
                           │ HTTP :8000
                           ▼
                  ┌───────────────────┐
                  │  FastAPI (api/)   │
                  │ calculator + RAG  │
                  └─────────┬─────────┘
                           │
          ┌────────────────┼─────────────────┐
          ▼                ▼                 ▼
       MySQL          Local JSON        OpenAI API
 calculation data    vector index        embeddings + answer
```

### Method 2 RAG flow

```text
PDF / XLSX upload
        │
        ▼
extract text and rows → chunk with source metadata → OpenAI embeddings
        │
        ▼
workspace-scoped JSON vector index in Electron userData
        │
        ▼
user question → top matching chunks → grounded answer + citations
```

Each indexed chunk keeps its document ID, filename, file type, page or sheet/row location, content hash, and chunk index. Re-uploading identical content is deduplicated; re-uploading a changed file with the same name replaces its previous index entries.

The vector database is local, but document text is sent to OpenAI to create embeddings, and retrieved excerpts are sent to OpenAI when generating an answer.

## Requirements

- **Node.js** and **pnpm** (`pnpm@10.33.2` via `packageManager` in `package.json`)
- **Python 3.10+** for the API
- **MySQL** — required for authoritative FX, inflation, NAICS, machine, grid, and transport reference data. If it is unavailable, affected calculations return an error.
- **OpenAI API key** for Method 2 document indexing and grounded answers.

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

Create `.env` in the project root:

```dotenv
AI_KEY=your_openai_api_key_here
# OPENAI_API_KEY can be used instead of AI_KEY.

# Required for calculation workflows. Missing reference data fails closed.
DB_HOST=your_db_host
DB_PORT=4000
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=carbon_emission_db
# Optional; defaults to 3 for fast desktop startup.
DB_POOL_SIZE=3

# Optional licensed provider. Without these, transport requires explicit
# per-request consent before a clearly marked local estimate is produced.
ECOTRANSIT_API_URL=https://your-licensed-endpoint.example/calculate
ECOTRANSIT_API_TOKEN=your_token

RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CHAT_MODEL=gpt-4.1-mini
RAG_TOP_K=6
RAG_SCORE_THRESHOLD=0.25
```

The model and retrieval settings are optional and use the values shown above by default. EcoTransit credentials are also optional, but a local transport estimate is used only when the user explicitly enables it for that request; estimated results are marked in the UI and saved history.

## Development

Run the desktop app:

```sh
pnpm dev
```

Electron starts the FastAPI process on `http://127.0.0.1:8000` and stores RAG data under its platform-specific `userData/rag-data` directory. It uses the project virtual environment when present (`api/venv/Scripts/python.exe` on Windows or `api/venv/bin/python` on macOS/Linux), then falls back to the system Python executable.

To run the API manually for backend development:

```sh
cd api
source venv/bin/activate          # Windows: venv\Scripts\activate
python main.py
```

### Windows installer

The Windows distribution bundles the Electron application, a frozen FastAPI
backend, and the Chromium runtime used for EcoTransit. Recipients do not need
Node.js or Python installed. Generated installers are build artifacts and are
not committed to the repository.

#### Download a prebuilt installer

1. Open the
   [Build Windows installer workflow](https://github.com/JoevinLau/C300/actions/workflows/build-windows-installer.yml).
2. Select the latest successful run on `main`.
3. In the **Artifacts** section, download `C300-Windows-Installer`.
4. Extract the downloaded ZIP file to obtain
   `C300-CarbonSpend-Setup-<version>.exe`.
5. Send the extracted `.exe` to the recipient. They can double-click it and
   follow the installation wizard.

Workflow artifacts are retained for 14 days. Run the workflow again when the
artifact has expired or when a new installer is required.

#### Build locally

Build on a Windows machine from the repository root:

```powershell
pnpm install
pnpm package:win
```

The installer is written to:

```text
release/C300-CarbonSpend-Setup-<version>.exe
```

PyInstaller must create the bundled backend on Windows, so macOS and Linux
users should use the GitHub Actions workflow instead of building locally. The
workflow builds the installer, launches the frozen FastAPI backend, verifies
its health endpoint, and uploads the installer only when those checks pass.

The installer is unsigned by default. Windows may show a SmartScreen warning
until a trusted code-signing certificate is configured. Only choose **More
info** and **Run anyway** when the installer came from a trusted build or
sender.

Open **Method 2** from the home screen, upload one or more PDF/XLSX supplier documents, wait for indexing to finish, and then ask questions in the assistant. Health check: `GET http://127.0.0.1:8000/` → `{"message":"API is running!"}`.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/naics` | NAICS codes, descriptions, optional kgCO₂e/USD |
| `POST` | `/calculate` | Run Method 1 emissions calculation |
| `POST` | `/rag/documents` | Index PDF/XLSX files for a `workspace_id` |
| `GET` | `/rag/documents?workspace_id=...` | List indexed workspace documents |
| `DELETE` | `/rag/documents/{document_id}?workspace_id=...` | Delete a document and its vectors |
| `POST` | `/method2-chat` | Retrieve supplier evidence and return a grounded answer with citations |

`POST /calculate` body (summary): `invoice_id`, `year` (2022–2026), `total_amount_sgd`, `allocation` (three percentages summing to 100), `naics` (three 6-digit codes for raw material, fabrication, surface treatment). Shared TypeScript types live in `src/shared/calculator-types.ts`.

`POST /rag/documents` is multipart form data with `workspace_id` and one or more `files` fields. Supported file types are PDF and XLSX.

`POST /method2-chat` accepts JSON:

```json
{
  "workspace_id": "method2-demo",
  "message": "What product carbon footprint does the supplier report?",
  "calculation_context": {},
  "messages": []
}
```

The response contains `reply`, `grounded`, and `citations`. Each citation includes its document ID, filename, page or spreadsheet row location, excerpt, and relevance score. When retrieval finds no sufficiently relevant evidence, the endpoint returns `grounded: false` without calling the answer model.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite renderer + Electron (runs `scripts/predev.cjs` first) |
| `pnpm build` | Production build to `out/` |
| `pnpm package:win` | Build the self-contained Windows installer (Windows only) |
| `pnpm preview` | Preview the built app |
| `pnpm test` | Run all Node and Python tests |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |

`pnpm test` discovers `src/**/*.test.mts` and `api/test_*.py`. The EcoTransit
browser probes are intentionally manual and live in `scripts/manual-ecotransit-*.py`.
Run one only when testing the external calculator itself:

```sh
python3 scripts/manual-ecotransit-smoke.py
```

## Project structure

```text
api/
  main.py           FastAPI app and routes
  service.py        Authoritative MySQL reference-data access
  calculator.py     SGD → USD 2022 and emissions math
  rag_service.py    Extraction, chunking, embeddings, local vector persistence, retrieval
  db.py             MySQL connection settings
  dev_data.py       Supported-year constants and development fixtures
  test_calculation.py  Calculation and fallback-policy tests
  test_rag.py       RAG service and API tests
  requirements.txt

src/
  main/             Electron main process + API client
  preload/          contextBridge → window.electronAPI
  renderer/         React UI workbench (pages, components, Tailwind)
  shared/           calculator-types, naics-catalog, electron-api

scripts/            test runner, manual probes, predev, and Windows tooling
out/                Build output (gitignored)
```

UI stack: React 19, Tailwind CSS 4, Lucide icons, and Radix UI primitives under `src/renderer/components/ui/`.

## Troubleshooting

### API errors / “port 8000”

Ensure the FastAPI process is running before using Method 1 or Method 2. `pnpm dev` normally starts it automatically. If it does not start, confirm the Python environment from Setup has all packages in `api/requirements.txt`.

### Method 2 indexing or chat errors

- Confirm `.env` contains `AI_KEY` or `OPENAI_API_KEY`, then restart the API.
- Only PDF and XLSX files are supported.
- Scanned PDFs without extractable text require OCR before upload.
- Adjust `RAG_SCORE_THRESHOLD` if relevant content is consistently rejected or weak content is being retrieved.
- Removing a document in the UI deletes its vectors from the current workspace.

### MySQL connection

If calculations fail with missing FX, NAICS, machine, or grid data, check `api/db.py`, confirm MySQL is running, and verify the reference tables are seeded. The API deliberately does not replace unavailable authoritative data with development constants.

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
