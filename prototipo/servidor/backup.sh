#!/bin/sh
# Cópia de segurança do banco (roda no serviço "backup" do docker-compose de produção).
# Todo dia às BACKUP_HORA (padrão 4h, horário de Brasília) grava /backups/pizzaria-AAAA-MM-DD_HHMM.dump
# (pasta backups/ no servidor) e apaga as com mais de BACKUP_DIAS dias (padrão 14).
# Na primeira subida, ou se a última cópia tiver mais de um dia, já faz uma na hora.
# Cada cópia é conferida (pg_restore --list) antes de valer. Restaurar: veja SERVIDOR.md.
DIAS=${BACKUP_DIAS:-14}
HORA=${BACKUP_HORA:-4}
export TZ='<-03>3'   # Brasília (sem horário de verão desde 2019)

copia() {
  arq="/backups/pizzaria-$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump -Fc -f "$arq.parcial" && pg_restore --list "$arq.parcial" > /dev/null; then
    mv "$arq.parcial" "$arq"
    echo "$(date '+%d/%m %H:%M') cópia ok: $(basename "$arq") ($(du -h "$arq" | cut -f1))"
  else
    rm -f "$arq.parcial"
    echo "$(date '+%d/%m %H:%M') A CÓPIA FALHOU (veja as mensagens acima)" >&2
  fi
  find /backups -name 'pizzaria-*.dump' -mtime +"$DIAS" -delete
}

mkdir -p /backups
[ -n "$(find /backups -name 'pizzaria-*.dump' -mtime -1 2>/dev/null | head -1)" ] || copia
while :; do
  agora=$(date +%s)
  seg=$(( (agora - 3 * 3600) % 86400 ))            # segundos desde a meia-noite em Brasília
  falta=$(( (HORA * 3600 - seg + 86400) % 86400 ))
  [ "$falta" -lt 60 ] && falta=$(( falta + 86400 ))
  sleep "$falta"
  copia
done
