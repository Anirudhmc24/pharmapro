[app]

# (str) Title of your application
title = PharmaPro

# (str) Package name
package.name = pharmapro

# (str) Package domain (needed for android packaging)
package.domain = org.pharmapro

# (str) Source code directory
source.dir = .

# (list) Source files to include
source.include_exts = py,png,jpg,jpeg,html,css,js,ico,json,db

# (list) List of directory to exclude
source.exclude_dirs = tests, bin, build, dist, .git, .pytest_cache, data_backup_before_build, Bills_For_Inward, scratch

# (str) Application versioning
version = 2.0.0

# (list) Application requirements
requirements = python3, fastapi, uvicorn, jinja2, pydantic, anyio, sniffio, idna, click, h11, python-multipart

# (str) Supported orientations
orientation = all

# (list) Permissions
android.permissions = INTERNET, WRITE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE, CAMERA

# (str) Bootstrap to use (kivy, sdl2, webview, custom)
bootstrap = webview

# (int) port number to connect to (default is 5000)
port = 8503

# (bool) Use private data directory (True) or public (False)
android.private_storage = True

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug)
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 1
