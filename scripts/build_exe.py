import PyInstaller.__main__
import os
import shutil
from pathlib import Path

def build():
    print("Starting PharmaPro EXE Build...")
    
    # 1. Run PyInstaller
    PyInstaller.__main__.run([
        'backend/main.py',
        '--onefile',
        '--name=PharmaPro',
        '--add-data=frontend;frontend',
        '--add-data=backend;backend',
        '--hidden-import=uvicorn.logging',
        '--hidden-import=uvicorn.loops',
        '--hidden-import=uvicorn.loops.auto',
        '--hidden-import=uvicorn.protocols',
        '--hidden-import=uvicorn.protocols.http',
        '--hidden-import=uvicorn.protocols.http.auto',
        '--hidden-import=uvicorn.protocols.websockets',
        '--hidden-import=uvicorn.protocols.websockets.auto',
        '--hidden-import=uvicorn.lifespan',
        '--hidden-import=uvicorn.lifespan.on',
        '--hidden-import=googleapiclient',
        '--hidden-import=google_auth_oauthlib',
        '--hidden-import=bcrypt',
        '--hidden-import=passlib',
        '--hidden-import=passlib.handlers',
        '--hidden-import=passlib.handlers.bcrypt',
        '--hidden-import=fpdf',
        '--hidden-import=webview',
        '--hidden-import=clr',
        '--hidden-import=pythonnet',
        '--hidden-import=backend.database',
        '--hidden-import=backend.models',
        '--hidden-import=backend.routers.auth',
        '--hidden-import=backend.routers.billing',
        '--hidden-import=backend.routers.config',
        '--hidden-import=backend.routers.customers',
        '--hidden-import=backend.routers.drugs',
        '--hidden-import=backend.routers.inventory',
        '--hidden-import=backend.routers.prescriptions',
        '--hidden-import=backend.routers.purchase_orders',
        '--hidden-import=backend.routers.reports',
        '--hidden-import=backend.routers.returns',
        '--hidden-import=backend.routers.scan',
        '--hidden-import=backend.routers.simulation',
        '--hidden-import=backend.routers.suppliers',
        '--hidden-import=backend.routers.trays',
        '--noconsole',
        '--clean'
    ])

    print("\nEXE Build Complete!")

if __name__ == "__main__":
    build()
