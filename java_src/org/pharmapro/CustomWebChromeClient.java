package org.pharmapro;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/**
 * Custom WebChromeClient that enables camera access (getUserMedia)
 * and file upload chooser (<input type="file">) in the Android WebView.
 */
public class CustomWebChromeClient extends WebChromeClient {

    public static final int FILE_CHOOSER_REQUEST_CODE = 10001;

    private static ValueCallback<Uri[]> sFilePathCallback;
    private Activity mActivity;

    public CustomWebChromeClient(Activity activity) {
        this.mActivity = activity;
    }

    /**
     * Auto-grant camera/microphone permission requests from the web page
     * (navigator.mediaDevices.getUserMedia).
     */
    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        // Grant all requested resources (camera, microphone, etc.)
        request.grant(request.getResources());
    }

    /**
     * Handle <input type="file"> clicks — opens system file chooser
     * with camera capture option.
     */
    @Override
    public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams) {

        // Cancel any existing callback
        if (sFilePathCallback != null) {
            sFilePathCallback.onReceiveValue(null);
        }
        sFilePathCallback = filePathCallback;

        // Use the system default intent from fileChooserParams
        Intent intent = fileChooserParams.createIntent();
        try {
            mActivity.startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
        } catch (Exception e) {
            sFilePathCallback = null;
            return false;
        }
        return true;
    }

    /**
     * Static helper — called from Python via PyJNIus when onActivityResult fires.
     * Resolves the pending file chooser callback.
     */
    public static void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_CHOOSER_REQUEST_CODE || sFilePathCallback == null) {
            return;
        }
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        sFilePathCallback.onReceiveValue(results);
        sFilePathCallback = null;
    }
}
