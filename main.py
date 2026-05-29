import os
import sys

# Add the project directory to the Python path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(ROOT_DIR)

# Import the FastAPI app
from backend.main import app

if __name__ == "__main__":
    import uvicorn
    # Bind to localhost (127.0.0.1) on port 8503 inside the Android Sandbox
    # Webview bootstrap will point to this port
    uvicorn.run(app, host="127.0.0.1", port=8503, log_config=None)
