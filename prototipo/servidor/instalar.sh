#!/usr/bin/env bash
# Prepara um servidor Ubuntu ou Debian NOVO para o site da Pizzaria Pereira. Roda uma vez, como root.
# O jeito fácil é pelo seu computador:  node servidor/servidor.js instalar root@IP-DO-SERVIDOR
#
#   bash instalar.sh [usuario] [--so-chave]
#     usuario     quem publica o site (padrão: pizzaria). Entra com a mesma chave SSH do root, sem senha.
#     --so-chave  também desliga o login por senha no SSH (só depois de confirmar que a chave funciona)
#
# Faz: atualiza o sistema, fuso de Brasília, Docker (repositório oficial), logs com tamanho limitado, usuário de
# publicação, firewall (só SSH, 80 e 443), atualizações de segurança automáticas, fail2ban e swap de 2 GB se a
# memória for pouca. Pode rodar de novo sem estragar nada.
set -euo pipefail
USUARIO=pizzaria
SO_CHAVE=0
for a in "$@"; do
  case "$a" in
    --so-chave) SO_CHAVE=1 ;;
    -*) echo "Opção desconhecida: $a"; exit 1 ;;
    *) USUARIO="$a" ;;
  esac
done
[[ "$USUARIO" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]] || { echo "Nome de usuário inválido: $USUARIO"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Rode como root (ou com sudo)."; exit 1; }
. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) echo "Este script é para Ubuntu ou Debian (este é: ${ID:-desconhecido})."; exit 1 ;; esac
export DEBIAN_FRONTEND=noninteractive
passo() { printf '\n==> %s\n' "$*"; }

passo "Atualizando o sistema (pode levar alguns minutos)"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
apt-get install -y -q ca-certificates curl ufw fail2ban unattended-upgrades

passo "Fuso horário de Brasília"
timedatectl set-timezone America/Sao_Paulo 2>/dev/null || ln -sf /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime

passo "Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker já instalado: $(docker --version)"
fi
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' > /etc/docker/daemon.json
fi
systemctl enable docker >/dev/null 2>&1 || true
systemctl restart docker

passo "Usuário de publicação: $USUARIO"
if ! id "$USUARIO" >/dev/null 2>&1; then useradd -m -s /bin/bash "$USUARIO"; fi
usermod -p '*' "$USUARIO"          # sem senha (entra só pela chave), mas não bloqueado
usermod -aG docker "$USUARIO"
CHAVES=/root/.ssh/authorized_keys
if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != root ]; then CHAVES="$(getent passwd "$SUDO_USER" | cut -d: -f6)/.ssh/authorized_keys"; fi
CASA="$(getent passwd "$USUARIO" | cut -d: -f6)"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "$CASA/.ssh"
if [ -s "$CHAVES" ]; then
  install -m 600 -o "$USUARIO" -g "$USUARIO" "$CHAVES" "$CASA/.ssh/authorized_keys"
  echo "Chaves SSH copiadas de $CHAVES."
else
  echo "AVISO: não achei chaves em $CHAVES. Copie a sua chave pública para $CASA/.ssh/authorized_keys."
fi
install -d -m 750 -o "$USUARIO" -g "$USUARIO" /opt/pizzaria

passo "Firewall: só SSH, 80 e 443"
SSH_PORTA="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"
SSH_PORTA="${SSH_PORTA:-22}"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORTA"/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable
echo "Abertas: $SSH_PORTA (SSH), 80 e 443."

passo "Atualizações de segurança automáticas e fail2ban"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true

passo "Memória de troca"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ] && [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 4000000 ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap de 2 GB criado."
else
  echo "Não precisa."
fi

if [ "$SO_CHAVE" = 1 ]; then
  passo "SSH só com chave"
  if [ -s "$CASA/.ssh/authorized_keys" ]; then
    printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-pizzaria.conf
    sshd -t && { systemctl reload ssh 2>/dev/null || systemctl reload sshd; }
    echo "Login por senha desligado."
  else
    echo "Pulei: o usuário $USUARIO não tem chave. Desligar a senha agora trancaria você para fora."
  fi
fi

passo "Pronto"
echo "$(docker --version), $(docker compose version | head -1). Publique com: node servidor/servidor.js publicar $USUARIO@<IP>"
