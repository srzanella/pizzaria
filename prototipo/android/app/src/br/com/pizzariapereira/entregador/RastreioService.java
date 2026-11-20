package br.com.pizzariapereira.entregador;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

/**
 * Serviço em primeiro plano (tipo "location") que roda durante a jornada: recebe as posições do GPS, guarda numa
 * fila e manda em lotes para /api/motoboy/posicao. Sem sinal, a fila espera e sai inteira quando a internet volta.
 * O servidor diz o intervalo (4 s com entrega na rua, 12 s sem) e avisa quando a jornada acabou.
 */
public class RastreioService extends Service implements LocationListener {
    interface Ouvinte { void evento(String ev, JSONObject dados); }

    static final String CANAL = "jornada";
    static final int NOTIF = 71;
    static volatile Ouvinte ouvinte;
    static volatile boolean rodando = false;
    static volatile JSONObject ultimaPosicao = null;
    static volatile long ultimoEnvio = 0;
    static volatile int pendentes = 0;
    static volatile int bateria = -1;

    private LocationManager lm;
    private final ArrayList<JSONObject> fila = new ArrayList<>();
    private HandlerThread fio;
    private Handler envio;
    private PowerManager.WakeLock trava;
    private String servidor = "", token = "";
    private volatile int intervalo = 4;
    private long ultimaTentativa = 0, ultimoAvisoTela = 0, ultimaNotif = 0;
    private boolean usandoFused = false;

    static void iniciar(Context c, String servidor, String token) {
        c.getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).edit().putBoolean("ativo", true).apply();
        Intent i = new Intent(c, RastreioService.class).setAction("INICIAR").putExtra("servidor", servidor).putExtra("token", token);
        c.startForegroundService(i);
    }

    static void parar(Context c) {
        c.getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).edit().putBoolean("ativo", false).apply();
        c.stopService(new Intent(c, RastreioService.class));
    }

    static JSONObject estado(Context c) {
        JSONObject o = new JSONObject();
        try {
            o.put("rastreando", rodando);
            o.put("ultimaPosicao", ultimaPosicao == null ? JSONObject.NULL : ultimaPosicao);
            o.put("ultimoEnvio", ultimoEnvio == 0 ? JSONObject.NULL : ultimoEnvio);
            o.put("pendentes", pendentes);
            o.put("bateria", bateria >= 0 ? bateria : JSONObject.NULL);
            o.put("permissao", c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
            PowerManager pm = (PowerManager) c.getSystemService(POWER_SERVICE);
            o.put("otimizacaoBateria", pm != null && !pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        } catch (Exception ignorado) { /* nunca */ }
        return o;
    }

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        SharedPreferences p = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        if (i != null && "ENCERRAR".equals(i.getAction())) {
            // botão "Encerrar jornada" da notificação: avisa o servidor e para
            final String srv = p.getString("servidor", ""), tok = p.getString("token", "");
            p.edit().putBoolean("ativo", false).apply();
            new Thread(() -> { post(srv + "/api/motoboy/jornada", tok, "{\"acao\":\"encerrar\"}"); avisa("parou", null); }).start();
            paraTudo();
            return START_NOT_STICKY;
        }
        if (i != null && i.hasExtra("servidor")) {
            servidor = i.getStringExtra("servidor");
            token = i.getStringExtra("token");
        } else {
            // o Android recriou o serviço sozinho (START_STICKY): retoma se a jornada ainda estava aberta
            servidor = p.getString("servidor", "");
            token = p.getString("token", "");
            if (!p.getBoolean("ativo", false) || servidor.isEmpty() || token.isEmpty()) { stopSelf(); return START_NOT_STICKY; }
        }
        try {
            Notification n = notificacao("Iniciando o GPS…");
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIF, n);
        } catch (Exception e) {
            // Android 14+: sem permissão de localização ou iniciado com o app em segundo plano
            p.edit().putBoolean("ativo", false).apply();
            avisa("parou", null);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!rodando) comeca();
        return START_STICKY;
    }

    private void comeca() {
        rodando = true;
        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        fio = new HandlerThread("envio-posicoes");
        fio.start();
        envio = new Handler(fio.getLooper());
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "entregador:jornada");
            trava.setReferenceCounted(false);
            trava.acquire(14 * 3600 * 1000L);
        }
        pedeAtualizacoes();
        envio.postDelayed(tic, 1500);
        avisaTela(true);
    }

    private void pedeAtualizacoes() {
        if (lm == null) return;
        try {
            lm.removeUpdates(this);
            long ms = intervalo * 1000L;
            usandoFused = false;
            if (Build.VERSION.SDK_INT >= 31 && lm.hasProvider(LocationManager.FUSED_PROVIDER)) {
                try { lm.requestLocationUpdates(LocationManager.FUSED_PROVIDER, ms, 0f, this, Looper.getMainLooper()); usandoFused = true; } catch (IllegalArgumentException ignorado) { /* sem fused */ }
            }
            if (!usandoFused) {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, ms, 0f, this, Looper.getMainLooper());
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, ms * 2, 0f, this, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            JSONObject d = new JSONObject();
            try { d.put("ok", false); d.put("msg", "O app perdeu a permissão de localização."); } catch (Exception ignorado) { /* nunca */ }
            avisa("permissao", d);
        }
    }

    private Location ultimaGps = null;

    @Override
    public void onLocationChanged(Location l) {
        // com GPS e rede ao mesmo tempo: a posição da rede só vale se o GPS estiver mudo há 20 s
        if (!usandoFused) {
            if (LocationManager.GPS_PROVIDER.equals(l.getProvider())) ultimaGps = l;
            else if (ultimaGps != null && l.getTime() - ultimaGps.getTime() < 20000) return;
        }
        JSONObject pt = new JSONObject();
        try {
            pt.put("t", l.getTime() > 0 ? l.getTime() : System.currentTimeMillis());
            pt.put("lat", l.getLatitude());
            pt.put("lng", l.getLongitude());
            if (l.hasAccuracy()) pt.put("precisao", l.getAccuracy());
            if (l.hasSpeed()) pt.put("velocidade", l.getSpeed());
            if (l.hasBearing()) pt.put("rumo", l.getBearing());
        } catch (Exception ignorado) { return; }
        synchronized (fila) {
            fila.add(pt);
            while (fila.size() > 1500) fila.remove(0);
            pendentes = fila.size();
        }
        ultimaPosicao = pt;
        avisaTela(false);
    }

    @Override public void onProviderEnabled(String p) { pedeAtualizacoes(); }
    @Override public void onProviderDisabled(String p) { avisaTela(true); }
    @Override public void onStatusChanged(String p, int s, Bundle b) { /* API antiga */ }

    private final Runnable tic = new Runnable() {
        @Override
        public void run() {
            if (!rodando) return;
            long agora = System.currentTimeMillis();
            boolean temFila;
            synchronized (fila) { temFila = !fila.isEmpty(); }
            if ((temFila && agora - ultimaTentativa >= intervalo * 1000L) || agora - ultimaTentativa > 30000) envia();
            if (envio != null) envio.postDelayed(this, 1000);
        }
    };

    private void envia() {
        ultimaTentativa = System.currentTimeMillis();
        ArrayList<JSONObject> lote;
        synchronized (fila) { lote = new ArrayList<>(fila.subList(0, Math.min(300, fila.size()))); }
        try {
            JSONObject corpo = new JSONObject();
            corpo.put("pontos", new JSONArray(lote));
            corpo.put("bateria", leBateria());
            corpo.put("nativo", true);
            Object[] r = post(servidor + "/api/motoboy/posicao", token, corpo.toString());
            int st = (Integer) r[0];
            if (st == 200) {
                synchronized (fila) { fila.subList(0, Math.min(lote.size(), fila.size())).clear(); pendentes = fila.size(); }
                ultimoEnvio = System.currentTimeMillis();
                JSONObject resp = new JSONObject((String) r[1]);
                if (!resp.optBoolean("jornada", true)) { paraPeloServidor(); return; }
                int iv = resp.optInt("intervalo", intervalo);
                if (iv != intervalo && iv >= 2 && iv <= 60) { intervalo = iv; new Handler(Looper.getMainLooper()).post(this::pedeAtualizacoes); }
                if (ultimoEnvio - ultimaNotif > 30000) {
                    ultimaNotif = ultimoEnvio;
                    NotificationManager nm = getSystemService(NotificationManager.class);
                    if (nm != null) nm.notify(NOTIF, notificacao("Localização enviada às " + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date())));
                }
            } else if (st == 401) {
                getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).edit().putString("token", "").apply();
                paraPeloServidor();
                return;
            }
        } catch (Exception ignorado) { /* sem internet: a fila espera */ }
        avisaTela(true);
    }

    private void paraPeloServidor() {
        getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE).edit().putBoolean("ativo", false).apply();
        avisa("parou", null);
        new Handler(Looper.getMainLooper()).post(() -> { paraTudo(); });
    }

    /** POST com o token do aparelho; devolve {status, corpo}. */
    static Object[] post(String url, String token, String json) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("Authorization", "Bearer " + token);
            OutputStream o = c.getOutputStream();
            o.write(json.getBytes("UTF-8"));
            o.close();
            int st = c.getResponseCode();
            InputStream in = st < 400 ? c.getInputStream() : c.getErrorStream();
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            if (in != null) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close(); }
            return new Object[] { st, b.toString("UTF-8") };
        } catch (Exception e) {
            return new Object[] { -1, "" };
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private int leBateria() {
        BatteryManager bm = getSystemService(BatteryManager.class);
        bateria = bm == null ? -1 : bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        return bateria;
    }

    private void avisaTela(boolean sempre) {
        long agora = System.currentTimeMillis();
        if (!sempre && agora - ultimoAvisoTela < 1000) return;
        ultimoAvisoTela = agora;
        avisa("estado", estado(this));
    }

    private static void avisa(String ev, JSONObject d) {
        Ouvinte o = ouvinte;
        if (o != null) o.evento(ev, d);
    }

    private Notification notificacao(String texto) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Jornada de entrega", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Fica visível enquanto a jornada está aberta e a localização está sendo enviada para a pizzaria.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        PendingIntent abrir = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent encerrar = PendingIntent.getService(this, 1, new Intent(this, RastreioService.class).setAction("ENCERRAR"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = new Notification.Builder(this, CANAL)
                .setSmallIcon(R.drawable.ic_notificacao)
                .setContentTitle("Jornada ativa · localização ligada")
                .setContentText(texto)
                .setOngoing(true)
                .setShowWhen(false)
                .setColor(0xFF0F4D23)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setContentIntent(abrir)
                .addAction(new Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_notificacao), "Encerrar jornada", encerrar).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void paraTudo() {
        rodando = false;
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignorado) { /* já parado */ }
        if (envio != null) { envio.removeCallbacksAndMessages(null); envio = null; }
        if (fio != null) { fio.quitSafely(); fio = null; }
        if (trava != null && trava.isHeld()) trava.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (rodando) paraTudo();
        avisa("estado", estado(this));
        super.onDestroy();
    }
}
