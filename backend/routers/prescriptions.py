"""
PharmaPro — routers/prescriptions.py
Prescription image uploads and linking to bills
"""

import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File
from backend.database import get_db

router = APIRouter(prefix="/api/prescriptions", tags=["prescriptions"])

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/upload")
async def upload_prescription(file: UploadFile = File(...)):
    import shutil
    import uuid
    # Keep original extension
    ext = os.path.splitext(file.filename)[1]
    safe_name = f"{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / safe_name
    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"ok": True, "image_path": f"/uploads/{safe_name}"}
