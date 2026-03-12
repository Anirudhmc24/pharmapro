# PharmaPro v2 — Cloud Deployment Guide

## Access Model

| Role       | How they get in                                      |
|------------|------------------------------------------------------|
| Super Admin | You — hardcoded in env variables                   |
| Shop Owner  | Registers → you approve → they get full POS access |

---

## Recommended: Deploy on Render.com (FREE tier available)

### Step 1 — Push to GitHub
1. Create a free account at github.com
2. Create a new repository called `pharmapro`
3. Upload all these files to that repo

### Step 2 — Deploy on Render
1. Go to render.com → Sign up free
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Set these settings:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python backend/main.py`
   - **Instance:** Free

5. Add Environment Variables:
   ```
   ADMIN_EMAIL     = your@email.com
   ADMIN_PASSWORD  = YourStrongPassword123!
   JWT_SECRET      = (click "Generate" for a random value)
   GEMINI_API_KEY  = AIzaSy... (optional, for scanning)
   PORT            = 8503
   ```

6. Click "Create Web Service" → Render will build and deploy
7. Your app will be live at: `https://pharmapro.onrender.com` (or similar)

---

## Alternative: Railway.app

1. Go to railway.app → New Project → Deploy from GitHub
2. Add the same environment variables above
3. Railway auto-detects the Procfile and starts the app

---

## Alternative: VPS (DigitalOcean, Linode, Hetzner)

```bash
# On your server (Ubuntu)
git clone https://github.com/you/pharmapro.git
cd pharmapro
pip install -r requirements.txt

# Set env variables
export ADMIN_EMAIL="admin@yourshop.com"
export ADMIN_PASSWORD="StrongPassword123!"
export JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
export GEMINI_API_KEY="AIzaSy..."

# Run with auto-restart (using systemd or screen)
python backend/main.py
```

For production on VPS, use nginx as reverse proxy + systemd for auto-restart.

---

## After Deployment

### Your admin login
- Go to `https://your-app.onrender.com`
- Sign in with the ADMIN_EMAIL and ADMIN_PASSWORD you set
- You see the **Admin Console** — not the pharmacy app

### Onboarding a shop owner
1. They go to your URL and click "Register"
2. They fill in shop name, email, password
3. You see them appear in **Pending Approval** in your admin console
4. You click **Approve** (and optionally set an access expiry date)
5. They can now sign in and see the full PharmaPro app

### Revoking access
- Click **Suspend** to immediately block login
- Or set an **Access Expiry** date — they get blocked automatically after that date
- You can **Reactivate** any time

### Resetting a password
- Admin Console → Shop Owners → Edit → Reset Password

---

## Security Notes

- JWT tokens expire after 12 hours (users re-login daily)
- Passwords are SHA-256 hashed (no plain text stored)
- All API routes require a valid token
- Each shop owner sees ONLY their own data — completely isolated
- Login attempts are logged (IP, time, success/failure)

---

## Data Backup

SQLite database is stored in `data/pharmapro.db`.
On Render free tier, disk resets on redeploy — use a persistent disk add-on or
move to PostgreSQL for production. For VPS, set up a daily cron backup:

```bash
# Cron backup (add to crontab -e)
0 2 * * * cp /path/to/pharmapro/data/pharmapro.db /backups/pharmapro-$(date +%Y%m%d).db
```

---

## File Structure

```
PharmaPro/
├── backend/
│   └── main.py         ← FastAPI server, all routes, auth, admin
├── frontend/
│   └── index.html      ← Full app (login + admin + POS in one file)
├── data/
│   └── pharmapro.db    ← Auto-created SQLite database
├── requirements.txt
├── render.yaml         ← Render.com config
└── Procfile            ← Railway/Heroku config
```
