package org.pharmapro;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Custom WebChromeClient that enables camera access (getUserMedia)
 * and file upload chooser (<input type="file">) in the Android WebView.
 *
 * Key fixes over the original:
 * - onShowFileChooser now builds a chooser intent that includes
 *   the device camera as an option alongside gallery/files.
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
        if (cameraIntent.resolveActivity(mActivity.getPackageManager()) != null) {
            // Create a temp file for the camera photo
            File photoFile = null;
            try {
                String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
                File storageDir = mActivity.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
                photoFile = File.createTempFile("SCAN_" + timeStamp + "_", ".jpg", storageDir);
                sCameraPhotoPath = "file:" + photoFile.getAbsolutePath();
            } catch (IOException e) {
                // Camera photo file creation failed - continue without camera option
            }

            if (photoFile != null) {
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, Uri.fromFile(photoFile));
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
        if (sCameraPhotoPath != null) {
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
                    results = new Uri[]{Uri.parse(sCameraPhotoPath)};
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
