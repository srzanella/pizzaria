# Pendências (pós)

Itens combinados para depois. Cada um traz o que já foi levantado, para retomar sem refazer a pesquisa.

## Contas dos clientes e rastreamento dos entregadores (feito em 07/11/2026; falta para ir ao ar)

**Pronto:** login do cliente sem senha (celular ou email → código de 6 números por email; ou "Continuar com Google"),
"Minha conta" com pedidos anteriores, "Pedir de novo", endereços salvos no checkout, base de cadastros na gestão
(Clientes → "Base de cadastros do site", com planilha de quem aceita promoções). Entregadores: cadastro e pareamento
do celular na gestão (Entregadores), app Android (`dist/entregador.apk`, em `/motoboy/app.apk`) e versão web
(`/motoboy`), jornada, mapa ao vivo na gestão e no acompanhamento do cliente, "saí para entrega" e "entreguei" pelo app.

**Para ir ao ar, em ordem:**
1. **Servidor na internet com HTTPS** (domínio). O kit está pronto (08/11/2026): veja **SERVIDOR.md**. Do seu
   computador, `node servidor/servidor.js instalar root@IP` prepara o servidor e `publicar --dominio … --apk 1.1`
   põe no ar com https automático (Caddy), backup diário do banco, `SITE_URL` e `ENDERECO_REDE` com o domínio e a
   base do IBGE importada. Antes disso, fora do Wi-Fi da pizzaria o celular do entregador não alcança o servidor e o
   cliente não acompanha.
   **Antes de abrir para clientes:** conferir o WhatsApp que recebe os pedidos (`config.whatsapp` em `src/data.json`,
   hoje 17 99230-1855) e desligar o "Modo teste" (`config.modoTeste`: aceita pedidos fora do horário).
2. **Email de verdade** para o código de acesso: hoje vai para a caixa de teste (Mailpit, http://localhost:8025), que
   não entrega para ninguém. Configurar em **Gestão → Configurações → Email dos clientes** (Gmail com senha de app,
   Brevo ou o SMTP do domínio): a gestão confere servidor e senha antes de salvar e tem o botão de email de teste.
   Para ir ao ar, o ideal é um remetente do domínio da pizzaria com SPF e DKIM (não cai no spam); depois, tirar o
   serviço `correio` do compose. Guardar a `CHAVE_SEGREDOS` do `.env`: ela cifra a senha do email no banco.
3. **Google**: em **Gestão → Configurações → Login com Google** está o passo a passo (projeto no Google Cloud, tela
   de consentimento publicada, ID do cliente "Aplicativo da Web" com as origens que a tela mostra para copiar), o
   campo do ID, o botão para testar o login ali mesmo e "Salvar e ligar". O Google só aceita https ou localhost:
   hoje dá para testar em http://localhost:8090; para os clientes, depois do domínio, cadastrar a origem https dele.
   Pelo IP da rede (http://192.168.1.13:8090) o site esconde o botão, porque o Google recusaria.
4. **App do entregador**: gerar o APK já com o endereço público (`node android/gerar-apk.js --servidor https://…`),
   instalar nos celulares (o Android pede para permitir instalar desta fonte) e parear pela gestão.
   **Guardar** `android/assinatura/entregador.jks` e `ANDROID_ASSINATURA_SENHA` do `.env`: sem eles, versões novas do
   app não instalam por cima (teria de desinstalar em cada celular). iPhone: só a página `/motoboy` no navegador
   (rastreia com a tela ligada); um app de iPhone precisa de um Mac e da conta Apple Developer (US$ 99/ano).
   Celulares Xiaomi, Samsung e Motorola: deixar o app "sem restrição de bateria" (o app pede) e, em alguns,
   ligar o "início automático" à mão. Se o sistema fechar o app, a gestão mostra "sem sinal há X min" e basta abrir o
   app de novo (a jornada retoma). Testado só por dentro (APK verificado, fluxo testado com o app web): falta testar
   num Android de verdade.
   **Verificação de desenvolvedor do Android:** desde 30/09/2026, no Brasil, ela vale só para apps baixados de lojas
   (Play, Galaxy Store, Xiaomi etc.); um APK instalado direto, como este, ainda instala normalmente. Em 2027 passa a
   valer para todo app em celular Android certificado. Antes disso, registrar o pacote `br.com.pizzariapereira.entregador`
   com a chave de assinatura no Android Developer Console (developer.android.com/developer-verification): a conta
   completa custa US$ 25 e pede documento (empresa: D-U-N-S, que pode levar até 28 dias); a de distribuição limitada é
   grátis e sem documento, mas só para até 20 aparelhos e uso pessoal. Sem registro, cada celular teria de ligar o
   "fluxo avançado" (modo desenvolvedor + 24 h de espera) ou instalar pelo cabo (ADB). Sem a chave
   `entregador.jks`, não dá para registrar o pacote.
   Navegador: o GPS só funciona em https; por http na rede local a página `/motoboy` avisa e só o app Android rastreia.
5. **LGPD**: publicar uma política de privacidade (a conta guarda nome, email, celular e endereços; o aceite de
   promoções fica registrado com data; o cliente exclui a conta em "Meus dados"). Para os entregadores, avisar por
   escrito que a localização é coletada só durante a jornada, para acompanhar as entregas, e guardada por 60 dias.
6. **Mapa**: usa os mapas do OpenStreetMap (uso leve, com atribuição). Com muito acesso, trocar por um provedor com
   chave (MapTiler, Stadia ou Carto).
7. **Endereço → ponto no mapa pelo número** (feito em 08/11/2026): o OpenStreetMap quase não tem numeração no Brasil
   (para "Av. Eduardo Andrea Matarazzo, 7555" devolvia um trecho qualquer da avenida). Agora o servidor procura
   primeiro na base oficial do IBGE (CNEFE, Censo 2022: 206 mil endereços de Ribeirão Preto, tabela `enderecos_ibge`;
   arquivo em `dados-ibge/3543402_RIBEIRAO_PRETO.zip`). Quando o número não está na base (casas depois de 2022, como
   o 7555 dessa avenida), o checkout mostra "Não achamos o número exato" e o cliente ajusta o pino no mapa; com
   conta, o ponto confirmado fica salvo para os próximos pedidos.
   **No servidor de produção**, rodar uma vez: `node importa-ibge.js dados-ibge/3543402_RIBEIRAO_PRETO.zip`
   (vale para todas as instâncias). Para entregar em outra cidade, baixar o .zip dela no IBGE
   (ftp.ibge.gov.br → Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio)
   e importar do mesmo jeito. Quando o IBGE publicar uma versão nova, importar de novo (substitui a cidade).
   Fonte: IBGE, Cadastro Nacional de Endereços para Fins Estatísticos.

**Decisão de segurança (para lembrar):** a conta mostra os pedidos feitos com ela e os feitos no mesmo aparelho, mas
não os antigos com o mesmo telefone (pedidos por WhatsApp ou balcão). O código vai para o email, então ele prova o
email e não o celular: ligar tudo pelo telefone deixaria qualquer pessoa que soubesse o número de alguém ver o
endereço e os pedidos dela. A equipe libera o histórico antigo no perfil do cliente (Clientes → cliente → "Conta no
site") depois de confirmar com ele. Se um dia houver confirmação do celular (WhatsApp/SMS), dá para ligar sozinho.

## Escala (o que já está pronto e o que falta)

**Pronto (migração para PostgreSQL, 06/11/2026):** o servidor pode rodar em várias instâncias atrás de um
balanceador. Sessões ficam no banco; mudanças num pedido usam trava de linha (`SELECT … FOR UPDATE`); os avisos ao
vivo passam pelo `LISTEN/NOTIFY` do Postgres, então o painel recebe pedidos que entraram por outra instância; o
esquema é criado com trava (`pg_advisory_lock`), então várias instâncias podem subir juntas. Testado com duas
instâncias no mesmo banco e 16 mudanças simultâneas no mesmo pedido.

**Feito para ir ao ar (08/11/2026):**
- **Cópia de segurança automática**: no servidor de produção, o serviço `backup` grava o banco todo dia às 4h e guarda
  14 dias; `node servidor/servidor.js copia` baixa a mais recente (SERVIDOR.md, seção 5). No Docker local continua
  manual: `docker exec pizzaria-pereira-banco sh -c "pg_dump -U pizzaria -Fc pizzaria > /tmp/pizzaria.dump"` e
  `docker cp pizzaria-pereira-banco:/tmp/pizzaria.dump pizzaria.dump` (evite o `>` do PowerShell em binários).
- **Limites por IP no banco** em todas as rotas (login da equipe, pedidos, acompanhamento, contas, entregadores). O IP
  vem do `X-Forwarded-For` só com `PROXY_CONFIAVEL` (quantos proxies seus há na frente; produção = 1, o Caddy). Antes,
  qualquer um mandava um IP inventado a cada tentativa e escapava do limite. Login: 12 senhas erradas por 15 min por
  IP (as certas não contam: a equipe divide o IP da pizzaria).
- **Preço conferido no servidor** (`precos.js`): o pedido do site é refeito com o cardápio publicado (mesma conta do
  site, promoções inclusive, com tolerância de 15 min no relógio do celular). Se o cliente pagaria menos, vale a conta
  do cardápio e a gestão mostra "⚠ valor corrigido"; outros problemas (item fora do cardápio, brinde sem promoção,
  distância menor que a linha reta) aparecem como "⚠ conferir". O local da pizzaria não pode mais ser trocado por um
  cliente: vem da base do IBGE pelo endereço do site (`config.endereco`).
- **Usuários da equipe no banco** (`equipe.js`, scrypt), fora da página pública: Gestão → Configurações → Equipe
  (senha provisória, "crie a sua senha" no primeiro acesso, tirar acesso, admin ou equipe) e "Minha senha" no menu.
  Esqueceu a senha: `node servidor/servidor.js senha <usuário>` (ou `node equipe.js senha <usuário>` no servidor).
- **HTTPS** com o Caddy na frente e `SITE_URL` definido (servidor/docker-compose.yml).

**Falta:**
1. **Cardápio editável direto no servidor.** Hoje o portal do site (`/#portal`) edita na tela, mas para valer é preciso
   "Copiar JSON", colar em `src/data.json` e publicar de novo. Ideal: salvar no banco pela gestão, como o email.
2. **Tamanho do pool** (`PG_POOL`, 10 por instância): somar todas as instâncias abaixo do `max_connections` do banco
   (100 no Postgres padrão) ou usar PgBouncer.
3. Quando houver muitos meses de histórico: guardar o "primeiro pedido de cada cliente" numa coluna/tabela, em vez de
   calcular a cada análise (hoje um `DISTINCT ON` sobre todos os pedidos, indexado).
4. Remover o volume antigo do SQLite (`pizzaria-pereira_dados`, só com `pedidos.db.migrado-…`) quando não fizer
   mais falta, e tirar a montagem `dados:/app/dados` do `docker-compose.yml`.

## Aviso automático de status pelo WhatsApp (API oficial da Meta)

**Situação hoje:** quando a equipe muda o status de um pedido no painel, aparece o botão "Avisar <cliente>". Ele abre a conversa do cliente no WhatsApp com a mensagem pronta e o link de acompanhamento, e a equipe só toca em enviar. O cliente também acompanha tudo ao vivo pelo link `/#acompanhar/<token>`.

**Objetivo:** a mensagem sair sozinha, sem o toque da equipe, e o painel saber quando a mensagem do cliente chegou no WhatsApp.

### O que a pizzaria precisa providenciar

- Conta no Meta Business (Gerenciador de Negócios) e um app em developers.facebook.com com o produto WhatsApp.
- Número para a API. Há dois caminhos:
  - **Coexistência:** o mesmo número do app WhatsApp Business continua no celular e também passa a enviar pela API. Limitações citadas: 5 mensagens por segundo, alguns recursos do app ficam desligados (apagar para todos, mensagens temporárias, listas de transmissão viram só leitura) e não há verificação clássica da empresa. O número precisa estar em uso no app há algum tempo. Confirmar a elegibilidade no Brasil na documentação da Meta antes de decidir.
  - **Número novo, só para avisos:** mais simples, mas o cliente recebe os avisos de um número diferente do que ele usou para pedir.
- Token permanente de um usuário do sistema, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
- ID do número de telefone (phone number ID) e o App Secret do app.
- Site publicado em HTTPS com endereço público, por causa do webhook. Definir `SITE_URL` no `docker-compose.yml`.
- Templates aprovados na categoria Utilidade (sugestões abaixo).

### Custos e regras (página oficial de preços, consultada em 06/11/2026)

- Cobrança por mensagem desde 01/07/2025; o modelo por conversa acabou.
- **A partir de 01/10/2026, templates de Utilidade são cobrados mesmo dentro da janela de 24 h** aberta pela mensagem do cliente (antes eram grátis).
- Mensagens de serviço (texto livre dentro da janela de 24 h): 1.000 grátis por mês por número; a partir da 1.001ª são cobradas.
- Brasil: cobrança em reais disponível desde julho de 2026. Contas que não estiverem em BRL devem migrar até 30/06/2027, quando a Meta deixa de entregar as mensagens delas para clientes no Brasil.
- Valores por mensagem: conferir na tabela atual da Meta antes de orçar. As fontes não oficiais divergem.

### Como implementar (plano)

1. **Envio no `server.js`:** ao mudar o status para `preparo`, `saiu`, `pronto` ou `cancelado`, enviar um template com `POST https://graph.facebook.com/<versão>/<phone-number-id>/messages` e `Authorization: Bearer <token>`, idioma `pt_BR`. Configurar por variáveis de ambiente: token, ID do número, App Secret, token de verificação, versão da API, quais status avisam e um modo simulado (só registra no log).
   - Avisar só pedidos com canal `site` ou `whatsapp`, em que o próprio cliente iniciou a conversa (opt-in). Pedidos de telefone/balcão continuam com o botão manual.
   - Se falhar, tentar de novo uma vez. Continuando a falha, o painel mostra o botão manual de sempre.
2. **Rota curta** `/p/<token>`, que redireciona para `/#acompanhar/<token>`, para usar no botão de URL dinâmica do template.
3. **Webhook** `/api/whatsapp/webhook`:
   - `GET` de verificação: conferir `hub.verify_token` e responder com `hub.challenge`.
   - `POST`: validar o cabeçalho `X-Hub-Signature-256` (`sha256=` + HMAC-SHA256 do corpo bruto com o App Secret; comparar em tempo constante). Responder 200 rápido.
   - `messages`: a mensagem do pedido chega com o link `#acompanhar/<token>` (e o código `#XXXXX`). Ligar ao pedido, marcar "WhatsApp recebido" e avisar o painel ao vivo (selo "WhatsApp ✓" no cartão dos Novos). Confirmação automática fica opcional; por padrão a equipe confirma.
   - `statuses`: atualizar o estado de cada aviso enviado (enviado / entregue / lido / falhou).
4. **Painel:** indicador "aviso automático ligado/simulado/desligado"; no lugar do "Avisar <cliente>", mostrar "<cliente> avisada no WhatsApp ✓"; nos detalhes, a lista de avisos com o estado de entrega.
5. **Testes:** API do Graph simulada num servidor local (variável para trocar a URL base), webhook com assinatura válida e inválida, e o fluxo de ponta a ponta já existente.

### Templates sugeridos (categoria Utilidade, `pt_BR`)

| Nome | Texto | Botão |
|---|---|---|
| `pedido_confirmado` | Olá, {{1}}! Seu pedido {{2}} foi confirmado e já está sendo preparado. Previsão: {{3}}. | Acompanhar pedido → `https://<site>/p/{{1}}` |
| `pedido_saiu_entrega` | {{1}}, seu pedido {{2}} saiu para entrega! {{3}} | Acompanhar pedido → `https://<site>/p/{{1}}` |
| `pedido_pronto_retirada` | {{1}}, seu pedido {{2}} está pronto para retirada em {{3}}. | — |
| `pedido_cancelado` | {{1}}, seu pedido {{2}} foi cancelado. Motivo: {{3}}. Qualquer dúvida, responda esta mensagem. | — |

Variável vazia não é aceita pela Meta: mandar "em breve" quando não houver previsão, e "Já está a caminho." quando não houver entregador.

### Fontes

- [Preços da WhatsApp Business Platform (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Webhooks: verificação e assinatura (Meta)](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
- [Registro de números e coexistência (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration/)
- [Envio de mensagens pela Cloud API](https://scriptagc.wasmer.app/https_developers_facebook_com/docs/whatsapp/cloud-api/guides/send-messages)
- Coexistência, visão de provedores: [360dialog](https://docs.360dialog.com/partner/waba-management/whatsapp-coexistence), [seven.io](https://help.seven.io/en/whatsapp/whatsapp-coexistence), [TalkAll](https://talkall.com.br/en/novidades/whatsapp-coexistence)
