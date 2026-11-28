package co.kr.tripflip.preview;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.DownloadListener;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOME = "https://tripflip.co.kr/";
    private WebView web;
    private LinearLayout offline;
    private ProgressBar loading;
    private boolean failed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout layout = new FrameLayout(this);
        layout.setBackgroundColor(Color.rgb(248,250,252));
        web = new WebView(this);
        layout.addView(web, new FrameLayout.LayoutParams(-1,-1));
        loading = new ProgressBar(this);
        layout.addView(loading, new FrameLayout.LayoutParams(dp(42),dp(42),Gravity.CENTER));

        offline = new LinearLayout(this);
        offline.setOrientation(LinearLayout.VERTICAL);
        offline.setGravity(Gravity.CENTER);
        offline.setPadding(dp(24),dp(12),dp(24),dp(12));
        offline.setBackgroundColor(Color.rgb(248,250,252));
        TextView title = new TextView(this);
        title.setText("트립플립에 연결할 수 없어요");
        title.setTextColor(Color.rgb(11,38,58));
        title.setTextSize(20);
        offline.addView(title);
        TextView details = new TextView(this);
        details.setText("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
        details.setTextSize(14);
        details.setPadding(0,dp(12),0,dp(12));
        offline.addView(details);
        Button retry = new Button(this);
        retry.setText("다시 연결");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View ignored) { startPage(); }
        });
        offline.addView(retry);
        offline.setVisibility(View.GONE);
        layout.addView(offline, new FrameLayout.LayoutParams(-1,-1));
        setContentView(layout);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return req.isForMainFrame() && route(req.getUrl());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!isTripFlip(Uri.parse(url))) { view.stopLoading(); return; }
                loading.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                loading.setVisibility(View.GONE);
                if (!failed) offline.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame()) showFailure();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest req, WebResourceResponse error) {
                if (req.isForMainFrame() && error.getStatusCode() >= 400) showFailure();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean fromTap, Message result) {
                if (!fromTap) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setAllowFileAccess(false);
                popup.getSettings().setAllowContentAccess(false);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest req) {
                        if (req.isForMainFrame()) {
                            if (!route(req.getUrl())) web.loadUrl(req.getUrl().toString());
                            child.post(new Runnable() {
                                @Override public void run() { child.destroy(); }
                            });
                        }
                        return true;
                    }
                    @Override public void onPageStarted(WebView child, String url, android.graphics.Bitmap icon) {
                        // Fallback for initial loads for which shouldOverrideUrlLoading was not dispatched.
                        if (!"about:blank".equals(url)) {
                            child.stopLoading();
                            Uri uri = Uri.parse(url);
                            if (!route(uri)) web.loadUrl(url);
                            child.post(new Runnable() {
                                @Override public void run() { child.destroy(); }
                            });
                        }
                    }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                return true;
            }
        });
        web.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String agent, String disposition, String mime, long length) {
                openBrowser(Uri.parse(url));
            }
        });
        startPage();
    }

    private static boolean isTripFlip(Uri uri) {
        String host = uri.getHost();
        return "https".equalsIgnoreCase(uri.getScheme())
            && ("tripflip.co.kr".equalsIgnoreCase(host) || "www.tripflip.co.kr".equalsIgnoreCase(host))
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private boolean route(Uri uri) {
        String path = uri.getPath();
        if (isTripFlip(uri) && path != null && !path.equals("/admin")
             && !path.startsWith("/admin/") && !path.equals("/account")
             && !path.startsWith("/account/")) return false;
        openBrowser(uri);
        return true;
    }

    private void openBrowser(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException ex) { Toast.makeText(this, "링크를 열 브라우저가 없어요.", Toast.LENGTH_SHORT).show(); }
    }

    private void startPage() {
        failed = false;
        offline.setVisibility(View.GONE);
        loading.setVisibility(View.VISIBLE);
        web.loadUrl(HOME, Collections.singletonMap("Cache-Control","no-cache"));
    }
    private void showFailure() {
        failed = true;
        loading.setVisibility(View.GONE);
        offline.setVisibility(View.VISIBLE);
    }
    private int dp(int value) { return (int) (getResources().getDisplayMetrics().density * value + 0.5f); }

    @Override public void onBackPressed() {
        if (!failed && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
