# Site da Pizzaria Pereira com pedidos e gestão (Node 22 + PostgreSQL). Gere o dist antes: node build.js
# O banco é o serviço "banco" do docker-compose (DATABASE_URL). /app/dados só guarda o SQLite antigo, para a importação.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DADOS=/app/dados
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.js demo.js contas.js entregadores.js email.js enderecos.js importa-ibge.js equipe.js precos.js ./
COPY dist/ ./dist/
RUN mkdir -p /app/dados && chown node:node /app/dados
USER node
EXPOSE 8080
VOLUME ["/app/dados"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/api/status >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
