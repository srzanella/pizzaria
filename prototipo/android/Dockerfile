# Ambiente para gerar o APK do app do entregador sem instalar nada no computador.
# Só o JDK e o Android SDK (sem Gradle): o script compila, empacota e assina com as ferramentas do próprio SDK.
#   docker build -t pizzaria-android-sdk android
#   (depois: node android/gerar-apk.js, que usa esta imagem)
FROM eclipse-temurin:17-jdk
RUN apt-get update && apt-get install -y --no-install-recommends unzip zip wget && rm -rf /var/lib/apt/lists/*
ENV ANDROID_HOME=/opt/android-sdk
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && wget -q https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -O /tmp/ct.zip \
 && unzip -q /tmp/ct.zip -d $ANDROID_HOME/cmdline-tools \
 && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm /tmp/ct.zip
# Licença do Android SDK aceita com autorização do dono do projeto (07/11/2026).
RUN yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null \
 && $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --install "platforms;android-35" "build-tools;35.0.0" > /dev/null \
 && rm -rf $ANDROID_HOME/.temp /root/.android/cache
WORKDIR /app
