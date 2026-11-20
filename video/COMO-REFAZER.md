# Vídeo de demonstração: como refazer

O vídeo pronto fica em `saida/`:

| Arquivo | O que é |
|---|---|
| `pizzaria-pereira-demonstracao.mp4` | Vídeo final em 1080p, com narração e trilha |
| `pizzaria-pereira-demonstracao.srt` | Legendas (YouTube, LinkedIn, Instagram) |
| `capa.jpg` | Quadro para capa ou miniatura |

## Como foi feito

- **Telas reais.** Um Chrome sem janela abre o site, a gestão e o app do entregador de verdade, numa cópia de demonstração com dados fictícios, e grava cada quadro. Nenhuma tela foi desenhada à mão.
- **Narração.** Voz neural da OpenAI (modelo `gpt-4o-mini-tts`, voz "cedar"), gerada a partir do `roteiro.json`. A tela final avisa que a voz é gerada por inteligência artificial, como a OpenAI exige; mantenha esse aviso ao publicar.
- **Trilha.** Original, sintetizada por `gravacao/musica.mjs`, sem direitos de terceiros.
- **Mixagem.** A trilha abaixa sozinha quando a voz fala. O volume final fica em −16 LUFS, o padrão das redes.

## Trocar o texto da narração

1. Edite `roteiro.json`:
   - `fala` é o texto da legenda, e é ele que a voz da OpenAI lê;
   - `|` divide a fala em trechos. Cada trecho começa quando a tela chega naquele ponto (`fala(k)` em `gravacao/gravar.mjs`);
   - `voz` é o mesmo texto escrito do jeito que a voz offline (Piper) pronuncia certo, como "uótsap" e "i bê gê é". Só é usado com `--motor=piper`.
2. Gere a narração. A chave da API da OpenAI vai numa variável de ambiente, nunca num arquivo do projeto:

   ```bash
   OPENAI_API_KEY=<sua chave> node gravacao/narracao.mjs
   ```

   - O áudio fica guardado em `trabalho/narracao/cache`. Um trecho que não mudou não é pedido de novo, e as durações continuam as mesmas.
   - Se uma leitura sair ruim, peça só aquele trecho de novo, por exemplo `--refazer=conta-1`.
   - Para trocar a voz, mude `narracao.voz` no `roteiro.json`. As amostras ficam em `amostras-voz/`: cedar, marin, onyx, ash, coral e nova.
   - Sem chave ou sem internet, `--motor=piper` usa a voz offline antiga.
3. Monte de novo. Se os trechos mudaram de duração (outra voz ou outro texto), grave de novo antes (veja abaixo), para a imagem acompanhar a voz.

   ```bash
   node gravacao/montar.mjs
   ```

A montagem funciona mesmo sem os quadros da gravação (`trabalho/quadros`): ela reaproveita o `trabalho/video-mudo.mp4`.

## Gravar de novo

Precisa do ambiente de demonstração no ar. Ele é separado do sistema de verdade: banco, caixa de email e servidor são só do vídeo.

1. Ligue o banco e a caixa de email de teste:

   ```bash
   docker start pp-video-banco pp-video-correio
   ```

2. Ligue o servidor de demonstração (porta 5301), a partir da pasta `prototipo`:

   ```bash
   PORT=5301 PAGINA=../video/trabalho/site/index.html DATABASE_URL=postgres://postgres:video@127.0.0.1:5455/pizzaria DADOS=../video/trabalho/dados ADMIN_SENHA_INICIAL=demo-video-2026 SMTP_URL=smtp://127.0.0.1:1035 GOOGLE_CLIENT_ID= ENDERECO_REDE= SITE_URL=https://pizzariapereira.com.br PROXY_CONFIAVEL=0 node server.js
   ```

3. Ligue o proxy da gravação (porta 5310), a partir da pasta `video`:

   ```bash
   node gravacao/proxy.mjs
   ```

4. Se a última gravação foi em outro dia, crie os pedidos de demonstração de hoje (o quadro "Ao vivo" mostra só os pedidos do dia):

   ```bash
   node gravacao/ambiente.mjs dados
   ```

5. Grave (uns 4 minutos) e monte:

   ```bash
   node gravacao/gravar.mjs
   ```

   ```bash
   node gravacao/montar.mjs
   ```

Outras opções do gravador:

- `--ensaio` roda as cenas sem gravar, com capturas em `trabalho/ensaio`;
- `--ate=<cena>` para depois daquela cena.

Se o site ou o cardápio mudarem, refaça a cópia das páginas e os dados de demonstração antes de gravar:

```bash
node gravacao/ambiente.mjs site
```

```bash
node gravacao/ambiente.mjs dados
```

## O que a cópia de demonstração muda

Só a cópia do vídeo muda; o site de verdade fica igual.

- A loja aparece "Aberta agora", e as etiquetas "preço exemplo" ficam escondidas.
- O WhatsApp mostrado é o telefone fixo público da pizzaria.
- CEP, rota e localização da loja respondem com dados reais buscados antes, para a gravação não travar esperando a internet.
- O trajeto da moto é acelerado. O vídeo mostra o selo "trajeto acelerado".
