import os
import zipfile
import datetime
from pathlib import Path
from typing import Optional

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    GOOGLE_DRIVE_AVAILABLE = True
except ImportError:
    GOOGLE_DRIVE_AVAILABLE = False

BASE_DIR = Path(__file__).parent.parent.parent
DB_PATH = BASE_DIR / "data" / "pharmapro.db"
CLIENT_SECRETS_PATH = BASE_DIR / "client_secrets.json"
TOKEN_PATH = BASE_DIR / "token.json"

SCOPES = ['https://www.googleapis.com/auth/drive.file']

class BackupManager:
    def __init__(self, folder_id: Optional[str] = None):
        self.folder_id = folder_id

    def _get_service(self):
        if not GOOGLE_DRIVE_AVAILABLE:
            print("Google Drive backup libraries are not installed in this environment.")
            return None
        creds = None
        # 1. Look for existing token
        if TOKEN_PATH.exists():
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        
        # 2. If token is invalid or missing, authenticate
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not CLIENT_SECRETS_PATH.exists():
                    print("Error: client_secrets.json missing. Follow INSTALLATION.md for OAuth setup.")
                    return None
                
                # This will open a browser window for user login
                flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRETS_PATH), SCOPES)
                creds = flow.run_local_server(port=0)
            
            # Save the credentials for next run
            with open(TOKEN_PATH, 'w') as token:
                token.write(creds.to_json())
        
        return build('drive', 'v3', credentials=creds)

    def upload_backup(self):
        service = self._get_service()
        if not service or not self.folder_id:
            print(f"Backup Error: Missing Service ({bool(service)}) or Folder ID ({self.folder_id})")
            return {"error": "Google Drive credentials or Folder ID missing"}

        # 1. Create a zip of the database
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_name = f"pharmapro_backup_{timestamp}.zip"
        zip_path = BASE_DIR / "data" / zip_name

        print(f"Starting backup: {zip_name} to folder {self.folder_id}")

        try:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                zipf.write(DB_PATH, arcname="pharmapro.db")

            # 2. Upload to Google Drive
            file_metadata = {
                'name': zip_name,
                'parents': [self.folder_id]
            }
            # We use a context manager or explicit close to avoid PermissionError on Windows
            media = MediaFileUpload(str(zip_path), mimetype='application/zip', resumable=True)
            
            try:
                file = service.files().create(
                    body=file_metadata, 
                    media_body=media, 
                    fields='id',
                    supportsAllDrives=True # Better compatibility for shared folders
                ).execute()
                print(f"Backup Successful! File ID: {file.get('id')}")
                return {"success": True, "file_id": file.get('id')}
            finally:
                # Explicitly close the media handle to unlock the file
                if hasattr(media, '_fd') and media._fd:
                    media._fd.close()

        except Exception as e:
            print(f"Backup Upload Failed: {str(e)}")
            return {"error": str(e)}
        finally:
            # 3. Cleanup local zip (now safe because handle is closed)
            if zip_path.exists():
                try:
                    os.remove(zip_path)
                except Exception as cleanup_err:
                    print(f"Cleanup Error: {cleanup_err}")

def trigger_backup_task(folder_id: str):
    """Function to be called by FastAPI BackgroundTasks"""
    manager = BackupManager(folder_id)
    result = manager.upload_backup()
    print(f"Backup result: {result}")
    return result

from backend.database import get_db

def auto_trigger_backup(background_tasks):
    """Checks if backup is enabled and triggers it in background"""
    with get_db() as conn:
        rows = conn.execute("SELECT key,value FROM shop_config WHERE key IN ('backup_enabled', 'gdrive_folder_id')").fetchall()
        cfg = {r["key"]: r["value"] for r in rows}
    
    if cfg.get("backup_enabled") == "True" and cfg.get("gdrive_folder_id"):
        background_tasks.add_task(trigger_backup_task, cfg["gdrive_folder_id"])
