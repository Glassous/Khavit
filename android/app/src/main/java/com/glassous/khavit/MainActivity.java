package com.glassous.khavit;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.util.Locale;

/**
 * 极简 WebView 壳（不依赖 AppCompat / Material，release 包只保留框架代码）：
 * - 页面始终实时请求线上地址，不在本地打包前端资源；
 * - 登录凭据保存在网页的 localStorage 里，WebView 的 DOM Storage 随应用数据持久化；
 * - 系统返回键优先交给网页历史（浮层/设置/管理后台/正文），否则直接退到桌面并把任务留在后台，
 *   再次进入不会重建 WebView，也就不会重新载入。
 */
public class MainActivity extends Activity {

    private static final String START_URL = "https://khavit.kamisato.top/";
    private static final String ALLOWED_HOST = "khavit.kamisato.top";
    private static final String JS_BRIDGE = "KhavitAndroid";

    private static final String KEY_LAST_URL = "last_url";
    private static final int REQUEST_FILE = 1001;
    private static final long POPUP_TTL_MS = 4_000L;

    /**
     * 返回键策略：
     * - 当前历史记录里有浮层守卫（抽屉、写信、正文、确认框等）或地址里有 panel（设置/管理后台）
     *   时返回 true，交给 WebView 历史；
     * - 其它页面（收件箱、已发送等文件夹页、登录页）返回 false，直接退到桌面。
     */
    private static final String BACK_POLICY_JS =
            "(function(){var s=window.history.state||{};" +
            "var h=(window.location.search||'')+(window.location.hash||'');" +
            "return !!(s.__khavitBackLayer || /[?&]panel=/.test(h));})()";

    /** 没有网页历史可退时，用顶栏返回键关闭深链进来的面板/正文 */
    private static final String CLOSE_TOP_OVERLAY_JS =
            "(function(){var b=document.querySelector('button[aria-label=\"返回\"]');" +
            "if(b){b.click();return true;}return false;})()";

    private FrameLayout rootView;
    private WebView webView;

    /** 网页当前是浅色还是深色，用于同步状态栏/导航栏图标明暗 */
    private boolean darkTheme;
    private boolean insetsReady;
    private float safeTopDp;
    private float safeBottomDp;
    private float safeLeftDp;
    private float safeRightDp;

    private ValueCallback<Uri[]> fileCallback;
    /** 首屏加载完成后清掉 WebView 自带的 about:blank 历史，避免返回键退到空白页 */
    private boolean initialHistoryCleared;
    /** 防止快速连按返回键时重复执行同一次返回判断 */
    private boolean handlingBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        buildWebView();
        registerBackCallback();

        String initialUrl = START_URL;
        if (savedInstanceState != null) {
            String saved = savedInstanceState.getString(KEY_LAST_URL);
            if (saved != null && isTrustedUrl(saved)) initialUrl = saved;
        }
        webView.loadUrl(initialUrl);
    }

    @SuppressWarnings("deprecation")
    private void configureWindow() {
        Window window = getWindow();
        // 内容铺到状态栏与导航栏下面，但系统栏保持可见（不是全屏/沉浸模式）
        window.setDecorFitsSystemWindows(false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.setStatusBarContrastEnforced(false);
        window.setNavigationBarContrastEnforced(false);

        // 刘海/挖孔区域也允许内容进入，左右安全距离由注入的 CSS 变量让出
        WindowManager.LayoutParams attrs = window.getAttributes();
        attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        window.setAttributes(attrs);

        darkTheme = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applySystemBarIcons() {
        // 必须在 setContentView 之后调用：PhoneWindow.getInsetsController() 需要已创建的 DecorView
        View decor = getWindow().getDecorView();
        WindowInsetsController controller = decor.getWindowInsetsController();
        if (controller == null) return;
        int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        controller.setSystemBarsAppearance(darkTheme ? 0 : mask, mask);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void buildWebView() {
        rootView = new FrameLayout(this);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(getColor(R.color.canvas));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setWebViewClient(new ShellWebViewClient());
        webView.setWebChromeClient(new ShellChromeClient());

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // 登录状态在 localStorage（见前端 utils/storage.ts），必须保留 DOM Storage
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new ShellBridge(), JS_BRIDGE);
        rootView.addView(webView);
        rootView.setOnApplyWindowInsetsListener((view, insets) -> {
            applyInsets(insets);
            return insets;
        });
        setContentView(rootView);
        applySystemBarIcons();

        // 仅 Debug 包开启 WebView 调试，方便现场检查注入的安全区变量
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Cookie 只用于服务端可能下发的会话；网页自身的登录凭据在 localStorage
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        rootView.requestApplyInsets();
    }

    /**
     * 把 Android 系统栏安全距离换算成 CSS 像素写进网页。
     * 前端在浏览器里回退到 env(safe-area-inset-*)；只有这个壳会提供 --android-safe-*。
     */
    private void applyInsets(WindowInsets insets) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;

        Insets bars = insets.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        Insets gestures = insets.getInsets(
                WindowInsets.Type.systemGestures() | WindowInsets.Type.mandatorySystemGestures());
        Insets ime = insets.getInsets(WindowInsets.Type.ime());
        boolean imeVisible = insets.isVisible(WindowInsets.Type.ime()) && ime.bottom > 0;

        safeTopDp = bars.top / density;
        safeLeftDp = bars.left / density;
        safeRightDp = bars.right / density;
        // 键盘弹出时网页视口会整体缩到键盘上方，此时不再叠加导航栏安全距离
        safeBottomDp = imeVisible ? 0f : Math.max(bars.bottom, gestures.bottom) / density;
        insetsReady = true;

        int imeBottomPx = imeVisible ? ime.bottom : 0;
        if (rootView.getPaddingBottom() != imeBottomPx) {
            rootView.setPadding(0, 0, 0, imeBottomPx);
        }

        injectSafeInsets();
    }

    private void injectSafeInsets() {
        if (!insetsReady || webView == null) return;
        String script = "(function(){var r=document.documentElement;if(!r)return;var s=r.style;" +
                "s.setProperty('--android-safe-top','" + cssPx(safeTopDp) + "px');" +
                "s.setProperty('--android-safe-bottom','" + cssPx(safeBottomDp) + "px');" +
                "s.setProperty('--android-safe-left','" + cssPx(safeLeftDp) + "px');" +
                "s.setProperty('--android-safe-right','" + cssPx(safeRightDp) + "px');" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private String cssPx(float value) {
        return String.format(Locale.US, "%.2f", value);
    }

    /**
     * 网页自己会按「浅色 / 深色 / 跟随系统」切换 <html class="dark">，
     * 这里只观察 class 变化并把结果回传给原生，用来同步系统栏图标颜色。
     */
    private void injectThemeReporter() {
        if (webView == null) return;
        String script = "(function(){var r=document.documentElement;" +
                "if(!r||window.__khavitThemeBound)return;window.__khavitThemeBound=true;" +
                "var report=function(){try{if(window." + JS_BRIDGE + "&&window." + JS_BRIDGE +
                ".setDarkMode){window." + JS_BRIDGE +
                ".setDarkMode(!!r.classList.contains('dark'));}}catch(e){}};" +
                "report();" +
                "try{new MutationObserver(report).observe(r,{attributes:true,attributeFilter:['class']});}catch(e){}" +
                "try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',report);}catch(e){}" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private class ShellWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            injectSafeInsets();
            injectThemeReporter();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            injectSafeInsets();
            injectThemeReporter();

            // 新建 WebView 默认先停在 about:blank，首屏完成后清一次历史，
            // 否则「第一个页面」也会被当成可后退，返回键可能退到空白页
            if (!initialHistoryCleared) {
                initialHistoryCleared = true;
                view.clearHistory();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl());
        }
    }

    /** 本站留在壳内，其余链接交给系统浏览器/对应应用 */
    private boolean handleNavigation(Uri uri) {
        String scheme = uri.getScheme();
        scheme = scheme == null ? "" : scheme.toLowerCase(Locale.ROOT);
        if ("http".equals(scheme) || "https".equals(scheme)) {
            if (ALLOWED_HOST.equals(uri.getHost())) return false;
            return openExternal(uri);
        }
        if ("about".equals(scheme)) return false;
        return openExternal(uri);
    }

    private boolean openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
            return true;
        }
    }

    private class ShellChromeClient extends WebChromeClient {
        @SuppressWarnings("deprecation")
        @Override
        public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams) {
            // 新请求到来时先把上一次的回调取消，避免选择结果错位
            cancelFileCallback();
            fileCallback = filePathCallback;

            try {
                startActivityForResult(fileChooserParams.createIntent(), REQUEST_FILE);
                return true;
            } catch (ActivityNotFoundException error) {
                fileCallback = null;
                filePathCallback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, R.string.no_file_picker, Toast.LENGTH_SHORT).show();
                return false;
            }
        }

        /**
         * 邮件正文里的 target="_blank" 链接会创建新窗口。
         * 这里用一个不可见的临时 WebView 接住首个地址，然后交给系统浏览器。
         */
        @Override
        public boolean onCreateWindow(
                WebView view,
                boolean isDialog,
                boolean isUserGesture,
                Message resultMsg) {
            Object obj = resultMsg.obj;
            if (!(obj instanceof WebView.WebViewTransport)) return false;
            final WebView.WebViewTransport transport = (WebView.WebViewTransport) obj;

            final WebView popup = new WebView(MainActivity.this);
            popup.getSettings().setJavaScriptEnabled(true);
            popup.getSettings().setDomStorageEnabled(true);
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    openExternal(request.getUrl());
                    releasePopup(v);
                    return true;
                }
            });

            transport.setWebView(popup);

            FrameLayout holder = new FrameLayout(MainActivity.this);
            holder.setAlpha(0f);
            holder.addView(popup, new FrameLayout.LayoutParams(1, 1));
            rootView.addView(holder, new FrameLayout.LayoutParams(1, 1));
            resultMsg.sendToTarget();
            popup.postDelayed(() -> releasePopup(popup), POPUP_TTL_MS);
            return true;
        }
    }

    private void cancelFileCallback() {
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_FILE) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            if (callback == null) return;

            Uri[] uris = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    uris = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        uris[i] = clip.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                }
            }
            callback.onReceiveValue(uris);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void releasePopup(WebView view) {
        ViewParent parent = view.getParent();
        if (!(parent instanceof ViewGroup)) return;
        ViewGroup holder = (ViewGroup) parent;
        holder.removeView(view);
        ViewParent holderParent = holder.getParent();
        if (holderParent instanceof ViewGroup) {
            ((ViewGroup) holderParent).removeView(holder);
        }
        view.stopLoading();
        view.destroy();
    }

    private class ShellBridge {
        @JavascriptInterface
        public void setDarkMode(boolean dark) {
            runOnUiThread(() -> {
                if (!isTrustedPage()) return;
                if (darkTheme == dark) return;
                darkTheme = dark;
                applySystemBarIcons();
            });
        }
    }

    private boolean isTrustedPage() {
        return webView != null && isTrustedUrl(webView.getUrl());
    }

    private boolean isTrustedUrl(String url) {
        if (url == null) return false;
        return ALLOWED_HOST.equals(Uri.parse(url).getHost());
    }

    private void registerBackCallback() {
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
    }

    /**
     * 手机返回键：
     * - 浮层/面板在场：先退 WebView 历史（正好会触发前端的 popstate 关闭浮层/面板）；
     * - 已经在收件箱等文件夹页：直接退到桌面，任务留在后台，重进不重建 WebView。
     */
    private void handleBack() {
        if (handlingBack) return;
        WebView current = webView;
        if (current == null || !initialHistoryCleared) {
            moveToBackground();
            return;
        }

        handlingBack = true;
        current.evaluateJavascript(BACK_POLICY_JS, value -> {
            boolean useHistory = "true".equals(value);
            if (!useHistory) {
                handlingBack = false;
                moveToBackground();
                return;
            }
            if (current.canGoBack()) {
                handlingBack = false;
                current.goBack();
                return;
            }
            // 深链/刷新进入面板或正文时没有上一层历史，直接点网页自己的返回键
            current.evaluateJavascript(CLOSE_TOP_OVERLAY_JS, closed -> {
                handlingBack = false;
                if (!"true".equals(closed)) moveToBackground();
            });
        });
    }

    private void moveToBackground() {
        // 关键：用 moveTaskToBack 而不是 finish，Activity/WebView 保留在后台，重进不会重新载入
        if (!moveTaskToBack(true)) finish();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (webView != null) webView.requestApplyInsets();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        // 进程被杀后至少回到原页面，而不是首页；登录状态仍由 localStorage 恢复
        if (webView != null && webView.getUrl() != null) {
            outState.putString(KEY_LAST_URL, webView.getUrl());
        }
    }

    @Override
    protected void onDestroy() {
        cancelFileCallback();
        if (webView != null) {
            ViewParent parent = webView.getParent();
            if (parent instanceof ViewGroup) {
                ((ViewGroup) parent).removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
