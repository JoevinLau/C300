from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules


ROOT_DIR = Path(SPECPATH).resolve().parent
API_DIR = ROOT_DIR / "api"

datas = []
binaries = []
hiddenimports = [
    "api.db",
    "api.dev_data",
    "api.models",
    "calculation.engine",
    "calculation.method2_calculations",
    "calculation.transport_data",
]

# These libraries load plugins or implementation modules dynamically. Collect
# them explicitly so the frozen backend behaves like the development venv.
for package in (
    "mysql.connector.plugins",
    "openai",
    "tiktoken_ext",
    "uvicorn",
):
    hiddenimports.extend(collect_submodules(package))

# Playwright ships its own Node driver, while tiktoken includes compiled/data
# assets. Both must live inside the frozen backend directory.
for package in ("playwright", "tiktoken"):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas.extend(package_datas)
    binaries.extend(package_binaries)
    hiddenimports.extend(package_hiddenimports)

analysis = Analysis(
    [str(API_DIR / "main.py")],
    pathex=[str(ROOT_DIR), str(API_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=sorted(set(hiddenimports)),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="c300-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

bundle = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="c300-api",
)
