package br.com.pizzariapereira.entregador;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * Tela do app: a página /motoboy do servidor da pizzaria dentro de um WebView, mais a ponte "PereiraNativo"
 * que liga e desliga o serviço de localização em primeiro plano (RastreioService).
 * Links para outros endereços (Maps, Waze, WhatsApp, telefone) abrem fora do app.
 */
public class MainActivity extends Activity {
    static final String PREFS = "entregador";
    private static final int PEDIDO_PERMISSAO = 7;
    private static final String INICIO = "file:///android_asset/inicio.html";

    private WebView web;
    private SharedPreferences prefs;
    private boolean querIniciar = false;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(0xFF07170D);
        web = new WebView(this);
        web.setBackgroundColor(0xFF07170D);
        raiz.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(raiz);
        getWindow().setStatusBarColor(0xFF07170D);
        getWindow().setNavigationBarColor(0xFF07170D);
        // conteúdo fora das barras do sistema (inclusive com o Android desenhando de ponta a ponta)
        raiz.setOnApplyWindowInsetsListener((v, ins) -> {
            v.setPadding(ins.getSystemWindowInsetLeft(), ins.getSystemWindowInsetTop(), ins.getSystemWindowInsetRight(), ins.getSystemWindowInsetBottom());
            return ins;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " PereiraEntregador/" + versao());
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Ponte(), "PereiraNativo");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return abreFora(r.getUrl());
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) mostraErro(String.valueOf(e.getDescription()));
            }
        });
        RastreioService.ouvinte = this::avisaPagina;
        carrega();
    }

    private String versao() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "1"; }
    }

    private void carrega() {
        String srv = prefs.getString("servidor", "");
        if (srv.isEmpty()) web.loadUrl(INICIO);
        else web.loadUrl(srv + "/motoboy");
    }

    private void mostraErro(String desc) {
        web.loadUrl(INICIO + "#erro=" + Uri.encode(desc));
    }

    /** Endereço do servidor da pizzaria: o mesmo host continua no app; o resto vai para o app certo do celular. */
    private boolean abreFora(Uri u) {
        String esquema = u.getScheme() == null ? "" : u.getScheme();
        if (esquema.equals("file")) return false;
        if (esquema.equals("http") || esquema.equals("https")) {
            Uri srv = Uri.parse(prefs.getString("servidor", "http://x"));
            if (u.getHost() != null && u.getHost().equalsIgnoreCase(srv.getHost()) && u.getPort() == srv.getPort()) return false;
        }
        try {
            Intent i = esquema.equals("intent") ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            if (u.toString().contains("waze")) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.waze"))); } catch (Exception ignorado) { /* sem loja */ }
            }
        } catch (Exception ignorado) { /* link inválido */ }
        return true;
    }

    static String limpaServidor(String url) {
        String u = url == null ? "" : url.trim();
        if (u.isEmpty()) return "";
        if (!u.matches("(?i)^https?://.*")) u = "http://" + u;
        u = u.replaceAll("/+$", "");
        if (u.toLowerCase().endsWith("/motoboy")) u = u.substring(0, u.length() - 8);
        return u.replaceAll("/+$", "");
    }

    /* ---------------- jornada: permissões e serviço ---------------- */
    private void iniciaComPermissao() {
        ArrayList<String> faltam = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            faltam.add(Manifest.permission.ACCESS_FINE_LOCATION);
            faltam.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            faltam.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!faltam.isEmpty()) {
            querIniciar = true;
            requestPermissions(faltam.toArray(new String[0]), PEDIDO_PERMISSAO);
            return;
        }
        comeca();
    }

    @Override
    public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        if (codigo != PEDIDO_PERMISSAO || !querIniciar) return;
        querIniciar = false;
        boolean fina = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean grossa = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fina && !grossa) {
            avisaPagina("permissao", json("ok", false, "msg", "Sem permissão de localização a pizzaria não acompanha a entrega. Libere em Configurações > Apps > Entregador Pereira > Permissões > Localização."));
            return;
        }
        if (!fina) avisaPagina("aviso", json("msg", "Ative a \"localização precisa\" para o cliente ver a moto no lugar certo."));
        comeca();
    }

    private void comeca() {
        String srv = prefs.getString("servidor", ""), tok = prefs.getString("token", "");
        if (srv.isEmpty() || tok.isEmpty()) {
            avisaPagina("permissao", json("ok", false, "msg", "Este celular precisa ser pareado de novo."));
            return;
        }
        RastreioService.iniciar(this, srv, tok);
        if (!isentoBateria() && !prefs.getBoolean("pediuIsencao", false)) {
            prefs.edit().putBoolean("pediuIsencao", true).apply();
            pedeIsencao();
        }
    }

    private boolean isentoBateria() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private void pedeIsencao() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignorado) { /* sem tela */ }
        }
    }

    /* ---------------- conversa com a página ---------------- */
    private static JSONObject json(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignorado) { /* nunca */ }
        return o;
    }

    void avisaPagina(String evento, JSONObject dados) {
        final String js = "window.__nativo&&window.__nativo(" + JSONObject.quote(evento) + "," + (dados == null ? "null" : dados.toString()) + ")";
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private class Ponte {
        @JavascriptInterface public String versao() { return MainActivity.this.versao(); }
        @JavascriptInterface public String aparelho() { return (Build.MANUFACTURER + " " + Build.MODEL).trim() + " · Android " + Build.VERSION.RELEASE; }
        @JavascriptInterface public String servidor() { return prefs.getString("servidor", ""); }
        @JavascriptInterface public String servidorPadrao() { String s = getString(R.string.servidor_padrao); return s.startsWith("%%") ? "" : s; }
        @JavascriptInterface public void definirServidor(String url) {
            String u = limpaServidor(url);
            if (u.isEmpty()) return;
            if (!u.equals(prefs.getString("servidor", ""))) {
                RastreioService.parar(MainActivity.this);
                prefs.edit().putString("servidor", u).putString("token", "").apply();
            }
            runOnUiThread(MainActivity.this::carrega);
        }
        @JavascriptInterface public void trocarServidor() { runOnUiThread(() -> web.loadUrl(INICIO + "#trocar")); }
        @JavascriptInterface public void guardarToken(String t) { prefs.edit().putString("token", t == null ? "" : t).apply(); }
        @JavascriptInterface public void iniciarJornada() { runOnUiThread(MainActivity.this::iniciaComPermissao); }
        @JavascriptInterface public void encerrarJornada() { runOnUiThread(() -> RastreioService.parar(MainActivity.this)); }
        @JavascriptInterface public String estado() { return RastreioService.estado(MainActivity.this).toString(); }
        @JavascriptInterface public void pedirIsencaoBateria() { runOnUiThread(MainActivity.this::pedeIsencao); }
        @JavascriptInterface public void abrirExterno(String url) { runOnUiThread(() -> abreFora(Uri.parse(url))); }
    }

    @Override
    protected void onResume() {
        super.onResume();
        avisaPagina("retomou", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true); // não fecha: a jornada continua
    }

    @Override
    protected void onDestroy() {
        if (RastreioService.ouvinte != null) RastreioService.ouvinte = null;
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
