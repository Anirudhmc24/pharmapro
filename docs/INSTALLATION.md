# Installation & Setup Guide

This guide will help you get PharmaPro up and running on your local machine or server.

## Prerequisites

- **Python 3.10 or higher**: [Download here](https://www.python.org/downloads/)
- **SQLite**: (Usually comes pre-installed with Python)
- **Pip**: Python package manager

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd pharmapro
```

## 2. Set Up a Virtual Environment (Recommended)

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

## 4. Configuration

PharmaPro uses a `.env` file for local environment settings. Ensure the file exists in the root directory:

**`.env`**
```text
PYTHONPATH=.
```

## 5. Initialize the Database

The database will be automatically initialized when you run the server for the first time. It creates a `data/pharmapro.db` file and seeds a default admin user.

## 6. Run the Application

You can start the backend server using the provided batch file or by running the script directly:

**Using the batch file (Windows):**
```bash
START.bat
```

**Running manually:**
```bash
python backend/main.py
```

The application will be available at: **`http://localhost:8503`**

### Default Credentials
- **Username**: `admin`
- **Password**: `admin123`

---

## Troubleshooting

- **ModuleNotFoundError: No module named 'backend'**: Ensure your `PYTHONPATH` is set correctly to the project root.
- **Port 8503 already in use**: You can change the port in `backend/main.py` if necessary.

---

## Google Drive Backup Setup (Personal Accounts)

To enable automatic backups using your personal Google storage:

1. **Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/).
   - Create a new project.
   - Enable **Google Drive API**.
2. **OAuth Consent Screen**:
   - Go to **APIs & Services > OAuth consent screen**.
   - Select **External** and click Create.
   - Enter App name (e.g., "PharmaPro") and your email.
   - In the **Test Users** section, add your own email (`anirudhmc24@gmail.com`).
3. **Credentials**:
   - Go to **APIs & Services > Credentials**.
   - Click **Create Credentials > OAuth client ID**.
   - Select **Desktop App** as the Application Type.
   - Rename the downloaded file to **`client_secrets.json`** and place it in the PharmaPro root folder.
4. **App Settings**:
   - Log in to PharmaPro and go to **Settings > Cloud Backup**.
   - Paste your **Folder ID** (from your personal Google Drive) and toggle **Enable Auto-Sync**.
5. **Initial Login**:
   - The first time you click "Trigger Manual Backup", a browser will open asking you to log in.
   - Approve the access. This will create a `token.json` file, and you won't need to log in again.
