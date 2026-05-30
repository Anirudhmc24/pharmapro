package org.pharmapro;

import android.app.Activity;
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

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Custom WebChromeClient that enables camera access (getUserMedia)
 * and file upload chooser (<input type="file">) in the Android WebView.
 *
 * Key fixes:
 * - Uses FileProvider for camera intents on Android 7+ (API 24+).
 * - Configures WebView settings for getUserMedia camera/mic access.
 * - onShowFileChooser builds a chooser intent with camera + gallery.
 * - Camera permission is auto-granted for getUserMedia.
 */
public class CustomWebChromeClient extends WebChromeClient {

    public static final int FILE_CHOOSER_REQUEST_CODE = 10001;

    private static ValueCallback<Uri[]> sFilePathCallback;
    private static String sCameraPhotoPath;
    private Activity mActivity;

    public CustomWebChromeClient(Activity activity) {
        this.mActivity = activity;
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
        // Allow mixed content (http page loading camera resources)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }

    /**
     * Auto-grant camera/microphone permission requests from the web page
     * (navigator.mediaDevices.getUserMedia).
     */
    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        // Grant all requested resources (camera, microphone, etc.)
        mActivity.runOnUiThread(() -> request.grant(request.getResources()));
    }

    /**
     * Handle <input type="file"> clicks — opens system chooser with
     * camera capture AND gallery/files as options.
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
        sCameraPhotoPath = null;

        // 1. Build a camera capture intent
        Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        boolean cameraAvailable = cameraIntent.resolveActivity(mActivity.getPackageManager()) != null;

        if (cameraAvailable) {
            // Create a temp file for the camera photo
            File photoFile = null;
            try {
                String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                File storageDir = mActivity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                if (storageDir != null && !storageDir.exists()) {
                    storageDir.mkdirs();
                }
                photoFile = File.createTempFile("SCAN_" + timeStamp + "_", ".jpg", storageDir);
                sCameraPhotoPath = photoFile.getAbsolutePath();
            } catch (IOException e) {
                // Camera photo file creation failed - continue without camera option
                android.util.Log.e("PharmaPro", "Failed to create camera temp file", e);
            }

            if (photoFile != null) {
                Uri photoUri;
                // On Android 7+ (API 24+), use FileProvider to avoid FileUriExposedException
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    try {
                        photoUri = FileProvider.getUriForFile(
                            mActivity,
                            mActivity.getPackageName() + ".fileprovider",
                            photoFile
                        );
                    } catch (Exception e) {
                        // FileProvider failed — fall back to content URI via MediaStore
                        android.util.Log.e("PharmaPro", "FileProvider failed, using direct Uri", e);
                        photoUri = Uri.fromFile(photoFile);
                    }
                } else {
                    photoUri = Uri.fromFile(photoFile);
                }
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri);
                cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
        }

        // 2. Build the file/gallery chooser intent
        Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
        contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);

        // Determine MIME types from the file chooser params
        String[] acceptTypes = fileChooserParams.getAcceptTypes();
        if (acceptTypes != null && acceptTypes.length > 0 && acceptTypes[0] != null && !acceptTypes[0].isEmpty()) {
            contentSelectionIntent.setType(acceptTypes[0]);
        } else {
            contentSelectionIntent.setType("*/*");
        }

        // 3. Combine into a chooser
        Intent[] extraIntents;
        if (cameraAvailable && sCameraPhotoPath != null) {
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
            sCameraPhotoPath = null;
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
            if (data == null || data.getData() == null) {
                // No data from gallery — check if camera captured an image
                if (sCameraPhotoPath != null) {
                    File photoFile = new File(sCameraPhotoPath);
                    if (photoFile.exists() && photoFile.length() > 0) {
                        results = new Uri[]{Uri.fromFile(photoFile)};
                    }
                }
            } else {
                // User selected a file from gallery/files
                String dataString = data.getDataString();
                if (dataString != null) {
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }
        }

        sFilePathCallback.onReceiveValue(results);
        sFilePathCallback = null;
        sCameraPhotoPath = null;
    }
}
