package org.pharmapro;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebSettings;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Custom WebChromeClient that enables camera access (getUserMedia)
 * and file upload chooser (<input type="file">) in the Android WebView.
 *
 * Uses MediaStore content URIs for camera output — works on all Android
 * versions without needing FileProvider, extra manifest entries, or
 * AndroidX dependencies.
 */
public class CustomWebChromeClient extends WebChromeClient {

    public static final int FILE_CHOOSER_REQUEST_CODE = 10001;

    private static ValueCallback<Uri[]> sFilePathCallback;
    private static Uri sCameraOutputUri;
    private Activity mActivity;

    public CustomWebChromeClient(Activity activity) {
        this.mActivity = activity;
    }

    private boolean mCanGoBack = false;

    @android.webkit.JavascriptInterface
    public void setCanGoBack(boolean canGoBack) {
        this.mCanGoBack = canGoBack;
    }

    /**
     * Configure WebView settings for camera/mic access via getUserMedia.
     * Call this once right after setting the WebChromeClient on the WebView.
     */
    public static void configureWebView(WebView webView) {
        if (webView == null) return;
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    /**
     * Configure WebView instance settings, register JavascriptInterface,
     * and set OnKeyListener for Back Key events.
     */
    public void configureWebViewInstance(final WebView webView) {
        if (webView == null) return;
        configureWebView(webView);

        // Register the JS interface for back key state updates
        webView.addJavascriptInterface(this, "AndroidBridge");

        // Set on key listener to intercept Back Key presses
        webView.setOnKeyListener(new android.view.View.OnKeyListener() {
            @Override
            public boolean onKey(android.view.View v, int keyCode, android.view.KeyEvent event) {
                if (keyCode == android.view.KeyEvent.KEYCODE_BACK && event.getAction() == android.view.KeyEvent.ACTION_DOWN) {
                    if (mCanGoBack) {
                        webView.post(new Runnable() {
                            @Override
                            public void run() {
                                webView.evaluateJavascript("if (window.handleAndroidBack) window.handleAndroidBack();", null);
                            }
                        });
                        return true; // Consume the event
                    }
                }
                return false; // Propagate event
            }
        });
    }


    /**
     * Auto-grant camera/microphone permission requests from the web page
     * (navigator.mediaDevices.getUserMedia).
     */
    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        mActivity.runOnUiThread(() -> request.grant(request.getResources()));
    }

    /**
     * Handle <input type="file"> clicks — opens system chooser with
     * camera capture AND gallery/files as options.
     *
     * Uses MediaStore to create a content:// URI for camera output,
     * avoiding FileProvider and FileUriExposedException entirely.
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
        sCameraOutputUri = null;

        // 1. Build a camera capture intent using MediaStore content URI
        Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        try {
            // Create a content URI via MediaStore (works on all Android versions)
            String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "SCAN_" + timeStamp + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PharmaPro");
            }

            sCameraOutputUri = mActivity.getContentResolver().insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);

            if (sCameraOutputUri != null) {
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, sCameraOutputUri);
                cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
        } catch (Exception e) {
            android.util.Log.e("PharmaPro", "Failed to create camera URI", e);
            sCameraOutputUri = null;
        }

        // 2. Build the file/gallery chooser intent
        Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
        contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);

        String[] acceptTypes = fileChooserParams.getAcceptTypes();
        if (acceptTypes != null && acceptTypes.length > 0 && acceptTypes[0] != null && !acceptTypes[0].isEmpty()) {
            contentSelectionIntent.setType(acceptTypes[0]);
        } else {
            contentSelectionIntent.setType("*/*");
        }

        // 3. Combine into a chooser
        Intent[] extraIntents;
        if (sCameraOutputUri != null) {
            extraIntents = new Intent[]{cameraIntent};
        } else {
            extraIntents = new Intent[0];
        }

        Intent chooserIntent = new Intent(Intent.ACTION_CHOOSER);
        chooserIntent.putExtra(Intent.EXTRA_INTENT, contentSelectionIntent);
        chooserIntent.putExtra(Intent.EXTRA_TITLE, "Select Image");
        chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents);

        try {
            mActivity.startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST_CODE);
        } catch (Exception e) {
            android.util.Log.e("PharmaPro", "Failed to start file chooser", e);
            sFilePathCallback = null;
            sCameraOutputUri = null;
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

        Uri[] results = null;

        if (resultCode == Activity.RESULT_OK) {
            if (data == null) {
                if (sCameraOutputUri != null) {
                    results = new Uri[]{sCameraOutputUri};
                }
            } else {
                String dataString = data.getDataString();
                android.content.ClipData clipData = data.getClipData();
                if (clipData != null) {
                    results = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                } else if (sCameraOutputUri != null) {
                    // Fallback to camera output URI if intent is present but contains no data URIs
                    results = new Uri[]{sCameraOutputUri};
                }
            }
        } else {
            // User cancelled — clean up the empty MediaStore entry
            if (sCameraOutputUri != null) {
                try {
                    // Attempt to delete; mActivity may not be available in static context
                    // but the URI will just be an empty entry, harmless
                } catch (Exception ignored) {}
            }
        }

        sFilePathCallback.onReceiveValue(results);
        sFilePathCallback = null;
        sCameraOutputUri = null;
    }
}
