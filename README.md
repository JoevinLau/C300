# C300

C300 is an Electron desktop app for estimating carbon emissions from supplier
and portfolio spend. React provides the UI, FastAPI runs calculations locally,
and MySQL supplies authoritative reference data. Calculations fail closed when
required reference data is unavailable.

## Workflows

| Workflow | Status | Purpose |
|---|---|---|
| NAICS mapping | Available | Map suppliers, companies, and spend categories to NAICS codes. |
| USEEIO / Method 1 | Available | Allocate invoice spend and apply NAICS emission factors. |
| Method 2 | Available | Combine activity data with supplier-document evidence and grounded RAG chat. |
| Method 3 | Available | Normalise invoice spend to 2025 SGD and apply country-specific Open CEDA purchaser-price factors. |

Calculation history is stored locally in SQLite. Method 2 documents are kept in
assessment-scoped, versioned local indexes with atomic writes and backup
recovery.

> Method 2 sends extracted document text to OpenAI for embeddings. Retrieved
> excerpts are also sent when generating grounded answers.

## Architecture

```text
React renderer
      │ Electron IPC
      ▼
Electron main process ── HTTP on loopback ──► FastAPI
                                               ├─ MySQL reference data
                                               ├─ OpenAI APIs
                                               └─ Local RAG index
```

Electron owns the FastAPI process, selects an available loopback port, and
routes renderer requests through a restricted IPC bridge. The home screen opens
while the backend warms up.

## Requirements

- Node.js 22+
- pnpm 10.33.2
- Python 3.10+
- MySQL with the required reference tables
- An OpenAI API key for RAG and AI-assisted NAICS features

## Quick start

Install frontend dependencies:

```sh
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install
```

Create the API environment:

```sh
python3 -m venv .venv-api
source .venv-api/bin/activate
python -m pip install -r api/requirements.txt
```

On Windows, activate it with `api\venv\Scripts\Activate.ps1`.

Create `.env` in the repository root:

```dotenv
DB_HOST=your_db_host
DB_PORT=4000
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=carbon_emission_db

AI_KEY=your_openai_api_key
# OPENAI_API_KEY is also accepted.
```

Optional settings:

```dotenv
DB_POOL_SIZE=3
ECOTRANSIT_API_URL=https://your-licensed-endpoint.example/calculate
ECOTRANSIT_API_TOKEN=your_token
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CHAT_MODEL=gpt-4.1-mini
RAG_TOP_K=6
RAG_SCORE_THRESHOLD=0.25
```

Start the desktop app:

```sh
pnpm dev
```

`bun run dev` can also invoke the development script, but dependency installs
and CI use the pinned pnpm version.

Electron starts FastAPI automatically. RAG data and calculation history are
stored under Electron's platform-specific `userData` directory.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Vite, Electron, and the managed FastAPI backend. |
| `pnpm test` | Run Node and Python tests. |
| `pnpm typecheck` | Run TypeScript checks. |
| `pnpm build` | Build the production app into `out/`. |
| `pnpm preview` | Preview the production build. |
| `pnpm package:win` | Build the Windows installer on Windows. |

Run FastAPI by itself when working only on the backend:

```sh
source .venv-api/bin/activate
python api/main.py
```

The manual backend defaults to `http://127.0.0.1:8000`. Useful endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Process liveness. |
| `GET` | `/health/ready` | Database and RAG-storage readiness. |
| `GET` | `/naics` | NAICS reference options. |
| `POST` | `/calculate` | Method 1 calculation. |
| `GET` | `/method2/machines` | Method 2 machine reference data. |
| `POST` | `/method2/calculate` | Method 2 calculation. |
| `GET` | `/method3/reference-data` | Active Open CEDA countries, sectors, dataset, and purchase types. |
| `GET` | `/method3/basis` | Read-only factor and annual-average price-index basis for a selection. |
| `POST` | `/method3/calculate` | Method 3 Open CEDA spend-based calculation. |
| `POST/GET/DELETE` | `/rag/documents` | Manage workspace documents. |
| `POST` | `/method2-chat` | Grounded retrieval and answer generation. |
| `POST` | `/ecotransit` | Transport calculation. |

Interactive API documentation is available at `/docs` while FastAPI is
running.

## Method 3 reference data

Method 3 uses the active Open CEDA dataset in 2025 SGD purchaser prices. Invoice
spend is normalised with the selected SingStat monthly manufactured-goods index
and the arithmetic average of all 12 months in the 2025 reference year.

Apply the additive Method 3 schema migration:

```powershell
python scripts/apply_method3_schema.py
```

Validate and import Open CEDA 2025. The importer validates workbook sheets and
source fields, retains dataset versions, and activates a version only after the
complete country-sector factor import succeeds:

```powershell
python scripts/import_open_ceda.py --workbook "DB/Open CEDA 2025.xlsx" --dry-run
python scripts/import_open_ceda.py --workbook "DB/Open CEDA 2025.xlsx"
```

Synchronise the Import Price Index and Domestic Supply Price Index monthly
Manufactured Goods series from the official SingStat API:

```powershell
python scripts/sync_singstat_price_indices.py --dry-run
python scripts/sync_singstat_price_indices.py
```

The imported Open CEDA dataset retains the required `CEDA by Watershed`
attribution and source license metadata. Calculation history stores the exact
factor, purchase-month index, and 2025 annual-average reference index snapshots
needed to reproduce an earlier result.

## Windows installer

The Windows package includes Electron, the frozen FastAPI backend, and the
Chromium runtime used by EcoTransit. Recipients do not need Node.js or Python.

To download a build:

1. Open the [Build Windows installer workflow](https://github.com/JoevinLau/C300/actions/workflows/build-windows-installer.yml).
2. Run it manually or select a successful tagged build.
3. Download the `C300-Windows-Installer` artifact and extract the installer.

Artifacts are retained for 14 days. To build locally on Windows:

```powershell
pnpm install
pnpm package:win
```

The installer is written to `release/C300-CarbonSpend-Setup-<version>.exe`.
Build on Windows or use GitHub Actions; PyInstaller cannot produce the Windows
backend from macOS or Linux. Installers are unsigned unless code signing is
configured.

## Project layout

```text
api/                    FastAPI routes, services, repositories, and RAG
calculation/            Production calculation engine and reference helpers
calculation/prototypes/ Archived spreadsheet-based experiments and sample data
src/main/               Electron lifecycle, backend supervision, and IPC
src/preload/            Restricted renderer bridge
src/renderer/features/  React workflows grouped by business capability
src/renderer/components/ Shared application shell and UI primitives
src/shared/             Shared TypeScript contracts
scripts/                Test, development, and packaging scripts
build/                  PyInstaller and installer configuration
```

## Troubleshooting

### Backend or calculation unavailable

- Wait for `FastAPI is ready` in the development terminal.
- Confirm `.venv-api` exists and contains every package in
  `api/requirements.txt`.
- Verify the database variables and required reference tables. The app does not
  substitute development constants when authoritative data is unavailable.

### Method 2 indexing or chat fails

- Confirm `AI_KEY` or `OPENAI_API_KEY` is set, then restart the app.
- Upload PDF, XLS, or XLSX files. Scanned PDFs require OCR first.
- Increase or decrease `RAG_SCORE_THRESHOLD` only when retrieval is consistently
  too strict or too permissive.

### Electron binary is missing

Run `pnpm install` again. If the project is on Windows and reports `spawn EPERM`,
use a trusted local path such as `C:\dev\C300` and allow the project in Windows
Security.
