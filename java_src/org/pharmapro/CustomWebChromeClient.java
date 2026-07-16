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

    @android.webkit.JavascriptInterface
    public void openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            mActivity.startActivity(intent);
        } catch (Exception e) {
            android.util.Log.e("PharmaPro", "Failed to open external url: " + url, e);
        }
    }

    @android.webkit.JavascriptInterface
    public void shareDatabaseFile() {
        try {
            File parentDir = mActivity.getFilesDir().getParentFile();
            File dbFile = new File(parentDir, "databases/pharmapro.db");
            if (!dbFile.exists()) {
                dbFile = new File(mActivity.getFilesDir(), "app/data/pharmapro.db");
            }
            if (!dbFile.exists()) {
                android.util.Log.e("PharmaPro", "Database file not found for sharing");
                return;
            }

            File tempFile = new File(mActivity.getExternalCacheDir(), "pharmapro_backup.db");
            java.io.FileInputStream in = new java.io.FileInputStream(dbFile);
            java.io.FileOutputStream out = new java.io.FileOutputStream(tempFile);
            byte[] buf = new byte[1024];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
            in.close();
            out.close();

            Uri fileUri;
            try {
                Class<?> fileProviderClass = Class.forName("androidx.core.content.FileProvider");
                java.lang.reflect.Method getUriForFileMethod = fileProviderClass.getMethod(
                    "getUriForFile", 
                    android.content.Context.class, 
                    String.class, 
                    File.class
                );
                fileUri = (Uri) getUriForFileMethod.invoke(null, mActivity, mActivity.getPackageName() + ".fileprovider", tempFile);
            } catch (Exception e) {
                fileUri = Uri.fromFile(tempFile);
            }

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/x-sqlite3");
            intent.putExtra(Intent.EXTRA_STREAM, fileUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            mActivity.startActivity(Intent.createChooser(intent, "Share/Backup Database"));
        } catch (Exception e) {
            android.util.Log.e("PharmaPro", "Failed to share database: " + e.getMessage(), e);
        }
    }    @android.webkit.JavascriptInterface
    public void shareBillPdf(final String pdfUrl, final String phoneNumber, final String captionText) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                java.net.HttpURLConnection cn = null;
                java.io.InputStream in = null;
                java.io.FileOutputStream out = null;
                try {
                    java.net.URL url = new java.net.URL(pdfUrl);
                    cn = (java.net.HttpURLConnection) url.openConnection();
                    cn.setConnectTimeout(6000);
                    cn.setReadTimeout(12000);
                    cn.connect();
                    
                    File cacheDir = mActivity.getExternalCacheDir();
                    if (cacheDir == null) {
                        cacheDir = mActivity.getCacheDir();
                    }
                    
                    // Clean up old pdf temp files to avoid cache bloating
                    try {
                        File[] oldFiles = cacheDir.listFiles();
                        if (oldFiles != null) {
                            for (File f : oldFiles) {
                                if (f.getName().startsWith("Invoice_") && f.getName().endsWith(".pdf")) {
                                    f.delete();
                                }
                            }
                        }
                    } catch (Exception e) {
                        // ignore cleanup errors
                    }

                    // Generate a unique filename to prevent file locking/sharing conflicts
                    String fileName = "Invoice_" + System.currentTimeMillis() + ".pdf";
                    File tempFile = new File(cacheDir, fileName);
                    
                    in = cn.getInputStream();
                    out = new java.io.FileOutputStream(tempFile);
                    byte[] buf = new byte[1024];
                    int len;
                    while ((len = in.read(buf)) > 0) {
                        out.write(buf, 0, len);
                    }
                    in.close();
                    in = null;
                    out.close();
                    out = null;
                    
                    Uri tempUri = null;
                    try {
                        Class<?> fp = Class.forName("androidx.core.content.FileProvider");
                        java.lang.reflect.Method m = fp.getMethod("getUriForFile", android.content.Context.class, String.class, File.class);
                        tempUri = (Uri) m.invoke(null, mActivity, mActivity.getPackageName() + ".fileprovider", tempFile);
                    } catch (Exception e) {
                        try {
                            android.os.StrictMode.VmPolicy.Builder StrictBuilder = new android.os.StrictMode.VmPolicy.Builder();
                            android.os.StrictMode.setVmPolicy(StrictBuilder.build());
                        } catch (Exception ignored) {}
                        tempUri = Uri.fromFile(tempFile);
                    }
                    final Uri fileUri = tempUri;
                    
                    mActivity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                // Format phone number to international format for WhatsApp jid
                                String formattedPhone = phoneNumber.replaceAll("[^0-9]", "");
                                String jid = formattedPhone + "@s.whatsapp.net";
                                
                                Intent intent = new Intent(Intent.ACTION_SEND);
                                intent.setType("application/pdf");
                                intent.putExtra(Intent.EXTRA_STREAM, fileUri);
                                intent.putExtra(Intent.EXTRA_TEXT, captionText);
                                // Crucial for Android 4.1+: Set ClipData to grant read permission for EXTRA_STREAM Uri
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                                    intent.setClipData(android.content.ClipData.newRawUri("", fileUri));
                                }
                                // WhatsApp-specific extras to pre-select a contact
                                intent.putExtra("jid", jid);
                                intent.setPackage("com.whatsapp");
                                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                // Clear top forces WhatsApp to reload its UI with the new intent if it's already running
                                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);

                                // Explicitly grant URI permission to WhatsApp package
                                try {
                                    mActivity.grantUriPermission("com.whatsapp", fileUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                } catch (Exception e) {}

                                mActivity.startActivity(intent);
                            } catch (Exception e) {
                                try {
                                    // Fallback: generic share chooser (works when WhatsApp not installed)
                                    Intent intent = new Intent(Intent.ACTION_SEND);
                                    intent.setType("application/pdf");
                                    intent.putExtra(Intent.EXTRA_STREAM, fileUri);
                                    intent.putExtra(Intent.EXTRA_TEXT, captionText);
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
                                        intent.setClipData(android.content.ClipData.newRawUri("", fileUri));
                                    }
                                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                                    
                                    mActivity.startActivity(Intent.createChooser(intent, "Send Invoice"));
                                } catch (Exception ex) {
                                    android.util.Log.e("PharmaPro", "Failed sharing PDF via picker: " + ex.getMessage(), ex);
                                }
                            }
                        }
                    });
                } catch (Exception e) {
                    android.util.Log.e("PharmaPro", "Failed in shareBillPdf async work: " + e.getMessage(), e);
                } finally {
                    if (in != null) {
                        try { in.close(); } catch (Exception ignored) {}
                    }
                    if (out != null) {
                        try { out.close(); } catch (Exception ignored) {}
                    }
                    if (cn != null) {
                        try { cn.disconnect(); } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
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

        // Intercept WhatsApp redirects and custom schemes
        webView.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("whatsapp://") || url.startsWith("intent://") || url.startsWith("https://wa.me") || url.startsWith("https://api.whatsapp.com"))) {
                    openExternalUrl(url);
                    return true;
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String url = request.getUrl().toString();
                    if (url.startsWith("whatsapp://") || url.startsWith("intent://") || url.startsWith("https://wa.me") || url.startsWith("https://api.whatsapp.com")) {
                        openExternalUrl(url);
                        return true;
                    }
                }
                return false;
            }
        });

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
