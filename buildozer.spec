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
source.include_exts = py,png,jpg,jpeg,html,css,js,ico,json,db,java,xml

# (list) List of directory to exclude
source.exclude_dirs = tests, bin, build, dist, .git, .pytest_cache, data_backup_before_build, Bills_For_Inward, scratch, data, uploads

# (str) Application versioning
version = 2.0.1

# (list) Application requirements
requirements = python3, hostpython3, fastapi==0.99.1, starlette==0.27.0, typing-extensions, passlib, uvicorn, jinja2, pydantic==1.10.15, anyio, sniffio, idna, click, h11, python-multipart

# (str) Supported orientations
orientation = all

# (list) Permissions
android.permissions = INTERNET, WRITE_EXTERNAL_STORAGE, READ_EXTERNAL_STORAGE, CAMERA

# (str) Bootstrap to use (kivy, sdl2, webview, custom)
p4a.bootstrap = webview

# (int) port number to connect to (default is 5000)
p4a.port = 5000

# (str) Additional Java source folders to compile
android.add_src = java_src

# (str) Additional resource directories to include
#android.add_resources =

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

# (str) python-for-android branch to use, defaults to master
p4a.branch = v2024.01.21



[buildozer]

# (int) Log level (0 = error only, 1 = info, 2 = debug)
log_level = 2

# (int) Display warning if buildozer is run as root (0 = False, 1 = True)
warn_on_root = 1
