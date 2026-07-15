param(
  [switch]$SkipPythonInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$previousLocation = Get-Location

try {
  Set-Location $repoRoot

  if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
    throw "The Windows installer must be built on Windows. Use the Build Windows installer GitHub Actions workflow from macOS."
  }

  $python = (Get-Command python -ErrorAction Stop).Source

  if (-not $SkipPythonInstall) {
    & $python -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "Failed to upgrade pip." }

    & $python -m pip install -r api/requirements.txt pyinstaller
    if ($LASTEXITCODE -ne 0) { throw "Failed to install FastAPI packaging dependencies." }
  }

  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $repoRoot ".playwright-browsers"
  & $python -m playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw "Failed to install the bundled Chromium browser." }

  & $python -m PyInstaller --clean --noconfirm build/c300-api.spec
  if ($LASTEXITCODE -ne 0) { throw "Failed to build the FastAPI executable." }

  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Failed to build the Electron application." }

  & pnpm exec electron-builder --win nsis --x64
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the Windows installer." }

  $installer = Get-ChildItem -Path release -Filter "*.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $installer) {
    throw "electron-builder completed without producing an installer in release/."
  }

  Write-Host "Windows installer created: $($installer.FullName)"
}
finally {
  Set-Location $previousLocation
}
