#!/bin/sh
# Roda NO SERVIDOR, chamado pelo "node servidor/servidor.js publicar": troca a versão e sobe tudo.
# O pacote chega desempacotado em /opt/pizzaria/.novo. A versão que estava no ar fica em .anterior (para o "voltar").
set -eu
cd /opt/pizzaria
N=.novo
[ -d "$N/app" ] || { echo "Pacote incompleto (sem app/)."; exit 1; }

# cópia do banco antes de trocar a versão (se já estiver no ar): o melhor ponto de volta se algo der errado
if [ -f docker-compose.yml ] && docker compose ps --status running -q backup 2>/dev/null | grep -q .; then
  echo "Cópia do banco antes de trocar a versão…"
  docker compose exec -T backup sh -c 'f=/backups/pizzaria-$(TZ="<-03>3" date +%Y-%m-%d_%H%M)-antes.dump; pg_dump -Fc -f "$f" && pg_restore --list "$f" >/dev/null && echo "  ok: $(basename "$f")"' || echo "  (não deu para copiar agora; seguindo)"
fi

if [ -d app ]; then
  rm -rf .anterior && mkdir .anterior && mv app .anterior/app
  for f in docker-compose.yml Caddyfile backup.sh; do [ -f "$f" ] && cp "$f" .anterior/; done
fi
mv "$N/app" app
for f in docker-compose.yml Caddyfile backup.sh atualiza.sh; do mv "$N/$f" "$f"; done
if [ -f "$N/.env" ]; then mv "$N/.env" .env; fi
chmod 600 .env
mkdir -p backups dados-ibge
if [ -d "$N/dados-ibge" ]; then for z in "$N"/dados-ibge/*; do [ -f "$z" ] && mv "$z" dados-ibge/; done; fi
rm -rf "$N"

echo "Montando e subindo (na primeira vez baixa as imagens; leva alguns minutos)…"
docker compose up -d --build --remove-orphans

saudavel() { [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q site)" 2>/dev/null)" = healthy ]; }
i=0
until saudavel; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then echo "O site não ficou saudável em 3 minutos. Últimas linhas do log:"; docker compose logs --tail 60 site; exit 1; fi
  sleep 2
done
echo "Site no ar (saudável)."

# base de endereços do IBGE (ponto do mapa pelo número): importa na primeira vez
n=$(docker compose exec -T banco psql -U pizzaria -d pizzaria -tAc "SELECT count(*) FROM cidades_ibge" 2>/dev/null | tr -dc 0-9)
if [ "${n:-0}" = 0 ]; then
  importou=0
  for z in dados-ibge/*.zip; do
    [ -f "$z" ] || continue
    echo "Importando a base de endereços do IBGE ($(basename "$z"))…"
    docker compose exec -T site node importa-ibge.js "/app/$z" && importou=1
  done
  if [ "$importou" = 1 ]; then
    docker compose restart site >/dev/null
    i=0; until saudavel || [ "$i" -gt 60 ]; do i=$((i + 1)); sleep 2; done
    echo "Site reiniciado com a base de endereços (o local da pizzaria sai dela)."
  fi
fi

docker image prune -f >/dev/null 2>&1 || true
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
