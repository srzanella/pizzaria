# Servidor de produção (homologação)

Tudo é comandado do seu computador, dentro da pasta `prototipo`, com `node servidor/servidor.js …`. O Windows 10/11 já
traz o `ssh` e o `tar` que ele usa. Nenhuma senha aparece na tela: elas ficam em arquivos que só você tem.

```
internet ──443/80──▶ Caddy (https automático) ──▶ site (Node) ──▶ banco (PostgreSQL)
                                                       └──▶ backup (cópia diária do banco)
```

## 1. O que contratar

| Item | Recomendação |
|---|---|
| Servidor (VPS) | Ubuntu Server 24.04 ou 26.04 LTS (ou Debian 12/13), 2 vCPU, 2 a 4 GB de RAM, 40 GB de SSD. Datacenter em São Paulo, se o provedor tiver. |
| Domínio | `.com.br` no [registro.br](https://registro.br). |
| DNS | Registro **A** do domínio (`@`) e do **www**, os dois com o IP do servidor. Se o servidor tiver IPv6, o **AAAA** também. |
| Firewall do provedor | Se o painel tiver um firewall próprio, libere as portas **22, 80 e 443** (TCP; a 443 também em UDP). |

## 2. Primeira vez (uns 15 minutos)

1. **Chave de acesso deste computador:**
   ```
   node servidor/servidor.js chave
   ```
   Copie a linha que começa com `ssh-ed25519` e cole no painel do provedor ao criar o servidor (campo "SSH key").

2. **Preparar o servidor** (Docker, firewall, atualizações automáticas, usuário `pizzaria`):
   ```
   node servidor/servidor.js instalar root@IP-DO-SERVIDOR
   ```
   Se o provedor entrega outro usuário com sudo (ex.: `ubuntu`), use `ubuntu@IP`. Para desligar também o login por
   senha no SSH, acrescente `--so-chave` (só depois que a chave funcionar).

3. **Apontar o DNS** para o IP e esperar propagar. Confira com `nslookup seudominio.com.br`: tem de mostrar o IP.

4. **Publicar:**
   ```
   node servidor/servidor.js publicar --dominio seudominio.com.br --apk 1.1
   ```
   Na primeira vez ele:
   - cria `servidor/producao.env` (senha do banco, `CHAVE_SEGREDOS`, senha inicial do admin) e `CREDENCIAIS-SERVIDOR.md`;
   - gera o site e o app do entregador já com o endereço `https://seudominio.com.br` (`--apk`; precisa do Docker aqui);
   - envia, monta, sobe, tira o certificado https e importa a base de endereços do IBGE;
   - confere de fora se o https está respondendo.

5. **Entrar:** `https://seudominio.com.br/gestao`, usuário `admin`, senha do `CREDENCIAIS-SERVIDOR.md`.

## 3. Logo depois de publicar, na gestão

- **Menu do seu nome → Minha senha:** troque a senha do admin.
- **Configurações → Equipe:** um usuário para cada pessoa (o sistema gera uma senha provisória; no primeiro acesso a
  pessoa cria a dela). Administrador vê tudo; equipe vê pedidos, clientes e relatórios.
- **Configurações → Email dos clientes:** Brevo (grátis até 300 por dia) com o domínio autenticado (SPF e DKIM, os
  registros que a Brevo mostra; vão no DNS do domínio). Sem isso o código de acesso cai no spam ou não chega.
- **Configurações → Login com Google:** no Google Cloud, adicione a origem `https://seudominio.com.br` e cole o ID.
- **Entregadores:** cadastre e pareie. O app baixa em `https://seudominio.com.br/motoboy/app.apk`.
- **Mapa:** o local da pizzaria vem da base do IBGE pelo endereço do site. Confira no mapa da gestão.

## 4. No dia a dia

| Quero… | Comando |
|---|---|
| publicar uma versão nova | `node servidor/servidor.js publicar` |
| ver se está tudo no ar (site, certificado, containers, disco, cópias) | `node servidor/servidor.js status` |
| ver o que o site está dizendo | `node servidor/servidor.js logs site` (ou `caddy`, `banco`, `backup`; `--seguir` para acompanhar) |
| baixar a cópia mais recente do banco | `node servidor/servidor.js copia` (`--agora` faz uma antes) |
| alguém esqueceu a senha da gestão | `node servidor/servidor.js senha <usuário>` (a senha nova vai para o `CREDENCIAIS-SERVIDOR.md`) |
| desfazer a última publicação | `node servidor/servidor.js voltar` (rodar de novo desfaz o voltar) |
| gerar o app do entregador de novo | `node servidor/servidor.js publicar --apk 1.2` (número maior que o anterior) |
| mudar o cardápio, preços, horários, promoções | portal do site (`/#portal`) → Configurações → Copiar JSON → colar em `src/data.json` → `publicar` |

## 5. Cópias de segurança do banco

- Todo dia às 4h (Brasília) o serviço `backup` grava `/opt/pizzaria/backups/pizzaria-AAAA-MM-DD_HHMM.dump`, confere
  o arquivo e guarda os últimos 14 dias. Cada `publicar` também tira uma cópia antes de trocar a versão
  (`…-antes.dump`): se a versão nova estragar algo, é dela que se volta.
- Uma vez por semana, rode `node servidor/servidor.js copia` e guarde o arquivo também fora do computador (nuvem,
  pen drive). Se o servidor sumir, é com ele que tudo volta.
- **Restaurar** (no servidor, `ssh pizzaria@IP`):
  ```
  cd /opt/pizzaria
  docker compose stop site
  docker compose exec -T banco pg_restore -U pizzaria -d pizzaria --clean --if-exists --no-owner < backups/pizzaria-AAAA-MM-DD_HHMM.dump
  docker compose start site
  ```
  Num servidor novo: instale, publique uma vez e restaure a cópia do mesmo jeito (envie o arquivo com `scp`).

## 6. O que já vem protegido

- https com certificado renovado sozinho e HSTS; o `www` redireciona para o domínio.
- Só as portas 22, 80 e 443 abertas. O site e o banco não têm porta para a internet.
- Senhas da equipe no banco, com scrypt. A página pública não leva usuário nem senha.
- Limites de tentativas (login, códigos, pedidos) contados no banco, pelo IP real que o Caddy informa.
- Total de cada pedido do site refeito com o cardápio: se não bater, vale a conta do cardápio e a gestão mostra o aviso.
- Atualizações de segurança automáticas no sistema e fail2ban no SSH.

## 7. Guarde (se perder, dá trabalho)

| Arquivo | Para quê |
|---|---|
| `servidor/producao.env` | senha do banco e `CHAVE_SEGREDOS` (sem ela, a senha do email salva na gestão precisa ser digitada de novo) |
| `CREDENCIAIS-SERVIDOR.md` | usuário e senha inicial da gestão |
| `~/.ssh/pizzaria_servidor` | a chave que entra no servidor (perdeu? cadastre outra pelo painel do provedor) |
| `android/assinatura/entregador.jks` + `ANDROID_ASSINATURA_SENHA` do `.env` | sem eles, versão nova do app não instala por cima |

Um gerenciador de senhas (Bitwarden, 1Password) guarda tudo isso. Nada disso vai para o Git: o `.gitignore` já tira.

## 8. Quando algo não funciona

| Sintoma | O que fazer |
|---|---|
| "Não consegui entrar em pizzaria@…" | a chave pública não está no servidor, ou a porta SSH é outra (`--porta 2222`) |
| o https não abre depois de publicar | o DNS ainda não aponta para o IP, ou a porta 80 está fechada no firewall do provedor. Veja `logs caddy` |
| "O site não ficou saudável" | `logs site` mostra o motivo. `voltar` põe a versão anterior no ar enquanto isso |
| disco cheio | `status` mostra o uso. As cópias com mais de 14 dias saem sozinhas |
