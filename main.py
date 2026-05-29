import os
import sys

# Add the project directory to the Python path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(ROOT_DIR)

# Import the FastAPI app
from backend.main import app

if __name__ == "__main__":
    import uvicorn
    # Check if running inside Android sandbox
    is_android = "ANDROID_ARGUMENT" in os.environ
    if is_android:
        # On Android, bind to all interfaces (0.0.0.0) on port 5000 (default p4a webview port)
        # We do not use log_config=None so we can see server startup logs in logcat
        uvicorn.run(app, host="0.0.0.0", port=5000)
    else:
        # On Desktop, run on localhost (127.0.0.1) on port 8503
        uvicorn.run(app, host="127.0.0.1", port=8503, log_config=None)
