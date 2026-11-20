#!/bin/sh
# Gera o APK do app do entregador sem Gradle: aapt2 (recursos) → javac → d8 (dex) → zipalign → apksigner.
# Roda dentro da imagem pizzaria-android-sdk (Dockerfile ao lado), com esta pasta montada em /app.
# Variáveis: SERVIDOR (endereço padrão da pizzaria), VERSAO_CODIGO, VERSAO_NOME, ASSINATURA_SENHA.
set -eu
SDK=/opt/android-sdk
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-35/android.jar
OUT=/app/saida
TMP=/tmp/apk
rm -rf "$TMP" && mkdir -p "$TMP/gen" "$TMP/obj" "$TMP/dex" "$OUT"
cp -r /app/app/res "$TMP/res"
sed -i "s|%%SERVIDOR%%|${SERVIDOR}|" "$TMP/res/values/strings.xml"

echo "1/5 recursos"
"$BT/aapt2" compile --dir "$TMP/res" -o "$TMP/res.zip"
"$BT/aapt2" link -o "$TMP/base.apk" -I "$JAR" --manifest /app/app/AndroidManifest.xml -A /app/app/assets --java "$TMP/gen" \
  --min-sdk-version 26 --target-sdk-version 34 --version-code "$VERSAO_CODIGO" --version-name "$VERSAO_NOME" --auto-add-overlay "$TMP/res.zip"

echo "2/5 Java"
javac --release 11 -encoding UTF-8 -nowarn -classpath "$JAR" -d "$TMP/obj" $(find /app/app/src "$TMP/gen" -name '*.java')

echo "3/5 dex"
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$TMP/dex" $(find "$TMP/obj" -name '*.class')

echo "4/5 pacote"
cp "$TMP/base.apk" "$TMP/sem-assinatura.apk"
(cd "$TMP/dex" && zip -q "$TMP/sem-assinatura.apk" classes.dex)
"$BT/zipalign" -p -f 4 "$TMP/sem-assinatura.apk" "$TMP/alinhado.apk"

echo "5/5 assinatura"
KS=/app/assinatura/entregador.jks
if [ ! -f "$KS" ]; then
  mkdir -p /app/assinatura
  keytool -genkeypair -keystore "$KS" -alias entregador -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass:env ASSINATURA_SENHA -keypass:env ASSINATURA_SENHA -dname "CN=Pizzaria Pereira, O=Pizzaria Pereira, C=BR" >/dev/null 2>&1
  echo "   chave de assinatura criada em android/assinatura (guarde: sem ela o app não atualiza nos celulares)"
fi
"$BT/apksigner" sign --ks "$KS" --ks-key-alias entregador --ks-pass env:ASSINATURA_SENHA --key-pass env:ASSINATURA_SENHA --out "$OUT/entregador.apk" "$TMP/alinhado.apk"
"$BT/apksigner" verify "$OUT/entregador.apk"
"$BT/aapt2" dump badging "$OUT/entregador.apk" | grep -E "^(package|sdkVersion|targetSdkVersion|application-label|uses-permission: name='android.permission.(ACCESS_FINE|FOREGROUND_SERVICE_LOCATION))" || true
ls -l "$OUT/entregador.apk" | awk '{print "   " $5 " bytes"}'
