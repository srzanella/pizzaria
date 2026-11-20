# Roteiro de homologação

Objetivo: usar o sistema de verdade, com o site na internet, e anotar tudo o que estranhar antes de abrir para todos
os clientes. O WhatsApp continua sendo o caminho principal; o site entra como opção.

**Ao anotar um problema:** código do pedido (ex.: `#K3F9A`), hora, aparelho (Android/iPhone/computador), o que você fez
e o que apareceu. Um print ajuda muito.

## Antes de começar (uma vez)

- [ ] Site abrindo em `https://<domínio>` com o cadeado, e `https://www.<domínio>` levando para ele.
- [ ] Banco zerado, sem dados de demonstração (Configurações → Geral mostra "Nenhum dado de demonstração").
- [ ] Senha do admin trocada (menu do seu nome → Minha senha).
- [ ] Um usuário para cada pessoa da equipe (Configurações → Equipe), cada um entrou e criou a própria senha.
- [ ] Email dos clientes configurado e o email de teste chegou na caixa de entrada (não no spam).
- [ ] Login com Google ligado, com a origem `https://<domínio>` cadastrada no Google Cloud.
- [ ] WhatsApp que recebe os pedidos é o certo (portal → Configurações; hoje 17 99230-1855).
- [ ] Local da pizzaria certo no mapa da gestão (vem da base do IBGE pelo endereço do site).
- [ ] App do entregador instalado em pelo menos um Android, pareado, com bateria "sem restrição".
- [ ] Fase 1: "Modo teste" ligado (aceita pedido fora do horário). Fase 2: desligado.

## Fase 1: equipe e família (2 a 3 dias)

Faça cada cenário pelo menos uma vez no celular. Marque o que funcionou como esperado.

### Pedido pelo site
- [ ] Montar pizza inteira e meio a meio, com borda; adicionar bebida e acompanhamento.
- [ ] Combo (ex.: Pizza + Refri): o desconto aparece no carrinho e na mensagem do WhatsApp.
- [ ] Entrega com CEP e número: aparece "Achamos o seu número no mapa" e a taxa certa para a distância.
- [ ] Número que o mapa não acha: aparece "Ajustar no mapa"; arrastar até a porta muda a taxa se mudar a faixa.
- [ ] Retirada no balcão: sem taxa.
- [ ] Pagamentos: Pix, cartão e dinheiro com troco ("troco para R$ 100").
- [ ] "Concluir no WhatsApp" abre a conversa com a mensagem completa e o link de acompanhamento.
- [ ] O pedido aparece na gestão (Ao vivo) na hora, com som, e o total é o mesmo da mensagem.

### Conta do cliente
- [ ] Entrar com o celular ou email: o código chega em menos de 1 minuto.
- [ ] Entrar com o Google.
- [ ] "Minha conta": pedidos anteriores, endereços salvos, "Pedir de novo".
- [ ] Endereço confirmado no mapa volta certo no pedido seguinte.
- [ ] "Meus dados" → excluir conta (com uma conta de teste).

### Gestão (equipe)
- [ ] Avançar o status: novo → em preparo → no forno → saiu (ou pronto) → concluído.
- [ ] "Avisar no WhatsApp" abre a mensagem certa para o cliente.
- [ ] Cancelar com motivo: o cliente vê o motivo no acompanhamento.
- [ ] Lançar pedido de balcão e de telefone ("+ Novo pedido").
- [ ] Imprimir a comanda.
- [ ] Marcar "pagamento recebido" e conferir o Fechamento do dia.
- [ ] Pessoa da equipe (não admin) não vê Configurações → Equipe/Email/Google.

### Entregador e acompanhamento
- [ ] Iniciar a jornada no app, sair com um pedido e rodar alguns quarteirões **fora do Wi-Fi da pizzaria**.
- [ ] O cliente vê a moto andando no link de acompanhamento; a gestão vê no mapa.
- [ ] "Entreguei" pelo app conclui o pedido.
- [ ] Com a tela do celular desligada por 10 minutos, a posição continua chegando.

### Conferência de preços (o servidor refaz a conta)
- [ ] Pedidos normais **não** mostram "⚠" na gestão. Se algum mostrar, anote o código: é coisa para corrigir.

## Fase 2: alguns clientes reais (1 a 2 semanas)

- [ ] Desligar o "Modo teste" no portal e publicar.
- [ ] Divulgar o link para um grupo pequeno (clientes fiéis, uma noite por vez).
- [ ] Toda noite, conferir: pedidos com "⚠", pedidos "não veio" (mensagem que não chegou no WhatsApp), reclamações.
- [ ] Uma vez por semana: `node servidor/servidor.js copia` e guardar a cópia fora do computador.

## Para considerar aprovado

- Uma semana de pedidos reais sem pedido perdido (todo pedido do site chegou na gestão e no WhatsApp).
- Nenhum valor errado cobrado.
- Entregador rastreado em pelo menos 10 entregas.
- Equipe confortável com a gestão sem precisar de ajuda.
