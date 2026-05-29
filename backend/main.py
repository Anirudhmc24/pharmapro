"""
PharmaPro — main.py (slim entry point)
Imports and mounts all routers, serves frontend.
Run via: python backend/main.py  OR  START.bat
"""

import sys
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Handle paths for PyInstaller (Frozen vs Source)
if getattr(sys, 'frozen', False):
    # Running as a bundled EXE
    BASE_DIR = Path(sys._MEIPASS)
    PERSISTENT_ROOT = Path(os.path.dirname(sys.executable))
    
    # Create logs directory
    LOG_DIR = PERSISTENT_ROOT / "logs"
    LOG_DIR.mkdir(exist_ok=True)
    
    # Redirect stdout/stderr to a real log file for debugging
    log_file = open(LOG_DIR / "app.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = log_file
    sys.stderr = log_file
else:
    # Running from source
    BASE_DIR = Path(__file__).parent.parent
    PERSISTENT_ROOT = BASE_DIR

FRONT_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = PERSISTENT_ROOT / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

from backend.database import init_db
from backend.routers.auth import router as auth_router, users_router
from backend.routers.config import router as config_router
from backend.routers.drugs import router as drugs_router, batches_router
from backend.routers.trays import router as trays_router
from backend.routers.billing import router as billing_router
from backend.routers.inventory import router as inventory_router
from backend.routers.customers import router as customers_router
from backend.routers.suppliers import router as suppliers_router
from backend.routers.purchase_orders import router as po_router
from backend.routers.reports import router as reports_router
from backend.routers.scan import router as scan_router
from backend.routers.backorders import router as backorders_router
from backend.routers.returns import router as returns_router
from backend.routers.prescriptions import router as prescriptions_router
from backend.routers.cloud import router as cloud_router
from backend.routers.simulation import router as simulation_router

app = FastAPI(title="PharmaPro", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers
for r in [auth_router, users_router, config_router, drugs_router, batches_router,
          trays_router, billing_router, inventory_router, customers_router,
          suppliers_router, po_router, reports_router, scan_router,
          backorders_router, returns_router, prescriptions_router, cloud_router, simulation_router]:
    app.include_router(r)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve frontend static files
app.mount("/js", StaticFiles(directory=str(FRONT_DIR / "js")), name="js")

@app.get("/")
def serve_index():
    return FileResponse(FRONT_DIR / "index.html")

@app.get("/{path:path}")
def serve_static(path: str):
    f = FRONT_DIR / path
    if f.exists():
        return FileResponse(f)
    return FileResponse(FRONT_DIR / "index.html")


init_db()

if __name__ == "__main__":
    import uvicorn
    import webbrowser
    import threading
    import time

    def open_browser():
        time.sleep(2)  # Wait for server to start
        webbrowser.open("http://127.0.0.1:8503")

    print("\n" + "="*50)
    print("  PharmaPro v2.0 Starting…")
    print("  Open browser at: http://localhost:8503")
    print("  Default login: admin / admin123")
    print("="*50 + "\n")

    # Start browser in a separate thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    uvicorn.run(app, host="127.0.0.1", port=8503, log_config=None)
