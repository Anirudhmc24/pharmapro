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
requirements = python3==3.11, hostpython3==3.11, fastapi==0.99.1, starlette, typing-extensions, passlib, uvicorn, jinja2, pydantic==1.10.15, anyio, sniffio, idna, click, h11, python-multipart

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

# (int) Android API to use
android.api = 33

# (int) Minimum API your APK will support
android.minapi = 21

# (str) Android NDK version to use
android.ndk = 25b

# (bool) If True, then automatically accept SDK license agreements.
android.accept_sdk_license = True

[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug)
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 1
