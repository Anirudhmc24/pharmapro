import os
import sys
import threading

# Add the project directory to the Python path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(ROOT_DIR)

# Import the FastAPI app
from backend.main import app

# ---------- Android-specific hooks ----------
def _android_setup():
    """Request runtime permissions and attach CustomWebChromeClient to the WebView."""
    from android.permissions import request_permissions, Permission

    def _on_permissions(permissions, results):
        """Called after the user responds to the permission dialog."""
        # Now attach the custom WebChromeClient on the UI thread
        _attach_chrome_client()

    # Request camera + storage permissions at startup
    request_permissions(
        [Permission.CAMERA,
         Permission.READ_EXTERNAL_STORAGE,
         Permission.WRITE_EXTERNAL_STORAGE],
        _on_permissions
    )

    # Register the activity-result listener for file chooser callbacks
    from android import activity as android_activity

    def _on_activity_result(request_code, result_code, intent):
        from jnius import autoclass
        Client = autoclass('org.pharmapro.CustomWebChromeClient')
        Client.handleActivityResult(request_code, result_code, intent)

    android_activity.bind(on_activity_result=_on_activity_result)


def _attach_chrome_client():
    """Set CustomWebChromeClient on the WebView (must run on UI thread)."""
    from android.runnable import run_on_ui_thread
    from jnius import autoclass

    @run_on_ui_thread
    def _set_client():
        PythonActivity = autoclass('org.kivy.android.PythonActivity')
        activity = PythonActivity.mActivity
        webView = PythonActivity.mWebView
        if webView is not None:
            Client = autoclass('org.pharmapro.CustomWebChromeClient')
            webView.setWebChromeClient(Client(activity))

    _set_client()


if __name__ == "__main__":
    import uvicorn
    # Check if running inside Android sandbox
    is_android = "ANDROID_ARGUMENT" in os.environ
    if is_android:
        # Schedule Android-specific setup in a background thread
        # so it runs after the WebView has been created by the bootstrap
        threading.Timer(2.0, _android_setup).start()
        # On Android, bind to all interfaces (0.0.0.0) on port 5000 (default p4a webview port)
        # We do not use log_config=None so we can see server startup logs in logcat
        uvicorn.run(app, host="0.0.0.0", port=5000)
    else:
        # On Desktop, run on localhost (127.0.0.1) on port 8503
        uvicorn.run(app, host="127.0.0.1", port=8503, log_config=None)
