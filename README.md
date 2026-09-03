# Feedbot

Bot do Discord + dashboard para a monitoria de Introdução à Programação registrar o resultado da correção de listas e escrever automaticamente na planilha oficial. Ver `monitoria-especificacao.md` (spec mestra), `politica-privacidade.md` e `plano-desenvolvimento.md` (roteiro de fases), e `docs/arquitetura.md` para uma visão geral de como o repositório é organizado.

## Integração com Google Sheets

O servidor recebe uma credencial OAuth de aplicação web (`GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_OAUTH_REDIRECT_URI`). Pela tela **Gestão → Planilha**, o
chefe conecta uma conta Google, autoriza acesso offline e vincula a planilha de cada período. O
refresh token é persistido criptografado com `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 bytes em base64).

O Feedbot valida as abas `Notas Interno CCIA`, `Notas Interno EC` e `Notas Interno SI`, localiza o
aluno pela matrícula e escreve exclusivamente na coluna **Questões corretas** da lista. As colunas
de nota e suas fórmulas não são alteradas.

## Requisitos

- Node.js 22+ (ver `.nvmrc`)
- pnpm 11+ (`corepack enable` ou `npm i -g pnpm`)
- Docker (para o Postgres local) ou um PostgreSQL próprio

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # ajuste DATABASE_URL se não usar o docker-compose

docker compose up -d db       # sobe Postgres local na porta 5435 (evita conflito com outros projetos)
pnpm --filter @feedbot/api prisma:migrate
pnpm --filter @feedbot/api prisma:seed
```

Para habilitar o primeiro acesso no desenvolvimento, defina `AUTH_BOOTSTRAP_SECRET` em
`apps/api/.env`. Depois de subir a API, envie uma única vez `POST /auth/bootstrap` com
`{ "segredo", "monitorId", "email", "senha" }`, usando o ID de um monitor marcado como chefe.
As demais contas são criadas pela tela **Monitores**: um chefe envia o convite e o convidado
define a própria senha pelo link pessoal recebido por e-mail.

## Deploy de produção com Docker Compose

O arquivo `docker-compose.production.yml` entrega uma instalação completa:

- PostgreSQL sem porta pública;
- API com migrações automáticas antes de cada inicialização;
- frontend React compilado e servido por Nginx;
- proxy Caddy com certificado HTTPS automático;
- volumes persistentes para banco e certificados.

### 1. Preparar DNS e arquivos de ambiente

Use um domínio ou subdomínio que você realmente controle e crie um registro `A` apontando para o
IP público do servidor. As portas 80 e 443 precisam estar liberadas. Depois:

```bash
cp .env.production.example .env.production
cp apps/api/.env.production.example apps/api/.env.production
chmod 600 .env.production apps/api/.env.production
```

Em `.env.production`, preencha `DOMAIN` sem protocolo e uma senha aleatória forte para o banco.
Em `apps/api/.env.production`, preencha OAuth, chave de criptografia e SMTP. Gere a chave Google
com `openssl rand -base64 32`. Os dois arquivos reais são ignorados pelo Git.

No Google Cloud, cadastre exatamente:

- origem JavaScript: `https://SEU_DOMINIO`;
- URI de redirecionamento: `https://SEU_DOMINIO/api/google/oauth/callback`.

### 2. Construir e iniciar

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

A API executa `prisma migrate deploy` antes de abrir a porta. Nunca execute `prisma:seed` em
produção: a seed contém dados fictícios e limpa tabelas existentes.

### 3. Criar o primeiro acesso, sem seed

Preencha temporariamente em `apps/api/.env.production`:

- `BOOTSTRAP_CHIEF_NAME`, `BOOTSTRAP_CHIEF_EMAIL` e `BOOTSTRAP_CHIEF_PASSWORD`;
- `BOOTSTRAP_PERIOD_NAME`, `BOOTSTRAP_PERIOD_START`, `BOOTSTRAP_PERIOD_END` e
  `BOOTSTRAP_ROTATION_REFERENCE`, usando datas ISO.

Então execute:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm api \
  node dist/scripts/bootstrap-producao.js
```

O comando usa transação e lock no banco, recusa uma segunda inicialização e cria somente o período,
o primeiro monitor-chefe e sua conta. Depois, apague as variáveis `BOOTSTRAP_*` do arquivo e recrie
a API para que a senha deixe de existir no ambiente do container:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate api
```

Se o período já existir, informe somente `BOOTSTRAP_PERIOD_ID` no lugar dos quatro campos de período.

### 4. Backups

O script abaixo cria um dump compactado e com permissão somente para o usuário atual:

```bash
BACKUP_DIR=/caminho/fora-do-projeto ./scripts/backup-database.sh
```

Agende-o no `cron` do servidor e copie os arquivos para outro equipamento ou armazenamento. Teste
periodicamente a restauração. O script não apaga backups antigos automaticamente.

### Não leve o banco local para produção

O dump inicial (`pg_dump` do banco local restaurado em produção) foi um passo **único**, de
inicialização — usado apenas para levar a primeira conta de chefe real sem depender do fluxo de
bootstrap. Não repita isso depois que a produção estiver no ar: o banco local normalmente acumula
dados de teste/seed (`prisma:seed`), e um dump gerado dali para produção mistura esse lixo com os
dados reais — foi exatamente isso que aconteceu no primeiro deploy e exigiu limpeza manual depois.

A partir do primeiro deploy bem-sucedido, os dois bancos são independentes: qualquer cadastro real
(monitor, grupo, dupla) é feito **direto no painel em produção**. O banco local serve só para testar
código antes de subir uma correção — o que viaja de local para produção é o *código* (via Git +
imagem no GHCR), nunca o banco de dados.

### Atualizações

Como o build do frontend/API não cabe confortavelmente em instâncias de 1 vCPU/1GB, as imagens são
compiladas localmente e publicadas no GitHub Container Registry — o servidor só baixa a imagem
pronta, nunca compila:

```bash
# no seu computador, após alterar o código:
docker build -f apps/api/Dockerfile -t ghcr.io/safiragomes/feedbot-api:latest .
docker build -f apps/web/Dockerfile -t ghcr.io/safiragomes/feedbot-web:latest --build-arg VITE_API_URL=/api .
docker push ghcr.io/safiragomes/feedbot-api:latest
docker push ghcr.io/safiragomes/feedbot-web:latest
```

```bash
# no servidor:
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.production.yml pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

Antes de atualizar, crie um backup. Confira a instalação com `docker compose ... ps` e com
`https://SEU_DOMINIO/api/health`.

## Scripts (raiz)

| Script                         | O que faz                                |
| ------------------------------ | ---------------------------------------- |
| `pnpm dev`                     | sobe `apps/api` e `apps/web` em paralelo |
| `pnpm test`                    | roda os testes de todos os workspaces    |
| `pnpm test:coverage`           | testes com pisos mínimos de cobertura    |
| `pnpm typecheck`               | `tsc --noEmit` em todos os workspaces    |
| `pnpm lint`                    | ESLint no repositório inteiro            |
| `pnpm format` / `format:check` | Prettier (aplica / só verifica)          |
| `pnpm build`                   | build de produção de todos os workspaces |

Cada app também tem `test:watch` (`pnpm --filter @feedbot/api test:watch`) para o loop de TDD.

Os limites de cobertura ficam na configuração do Vitest de cada aplicação e representam o piso
atual, não a meta final: mudanças devem manter ou elevar esses valores. Reduzir um limite exige
justificativa explícita na revisão. O relatório HTML é gerado em `coverage/`.

## Estrutura

```
apps/
  api/    Fastify + TypeScript + Prisma (PostgreSQL)
  web/    React + TypeScript + Vite + Chart.js
docs/
  arquitetura.md  visão geral de como o código está organizado
  seguranca.md    controles de segurança e checklist de produção
  specs/  specs de feature (SDD)
  adr/    Architecture Decision Records
  change/ registro de mudanças entregues
```

Ver `docs/arquitetura.md` para uma explicação mais detalhada de como o repositório é organizado
(camadas do backend, estrutura do painel, como as pastas de `docs/` se relacionam).

## Como este projeto é desenvolvido

### SDD — Spec-Driven Development

Nenhuma feature é implementada sem spec. A spec mestra é `monitoria-especificacao.md`; specs de feature (comportamento, regras de negócio, casos de borda) vivem em `docs/specs/`. Ver `docs/specs/README.md` para o fluxo completo.

### TDD — Test-Driven Development

Para cada fatia de trabalho: escreva o teste a partir da spec (**red**), rode e confirme que falha, implemente o mínimo para passar (**green**), depois limpe mantendo os testes verdes (**refactor**). `apps/api` usa Vitest; `apps/web` usa Vitest + React Testing Library (`apps/web/test/setup.ts` carrega os matchers do `jest-dom`).

### docs/adr — decisões arquiteturais

Toda decisão difícil de reverter (stack, integrações externas, modelo de auth) vira um ADR em `docs/adr/`, no formato Nygard (Contexto/Decisão/Consequências). Ver `docs/adr/README.md`.

### docs/change — registro de mudanças

Toda entrega significativa (uma fase do `plano-desenvolvimento.md`, uma migração, uma mudança de contrato de API) ganha um registro em `docs/change/`: o que mudou, por quê e como foi verificado. Ver `docs/change/README.md`.

Fluxo fechado, ponta a ponta: **spec → red → green → refactor → change record** (linkando a spec e, se houver, o ADR relacionado).

## Bot do Discord

O bot usa a API oficial do Discord (`discord.js`), autenticado por um token estático de
aplicação (`DISCORD_BOT_TOKEN`) — sem pareamento por QR code — ver
[ADR-0005](docs/adr/0005-bot-discord-em-vez-de-whatsapp.md) (substitui a decisão anterior de
WhatsApp, [ADR-0003](docs/adr/0003-bot-whatsapp-biblioteca-nao-oficial.md)) e
`docs/specs/controle-sessao-bot.md` para o comportamento completo do fluxo.

Cada **período** (semestre) usa um servidor do Discord próprio, criado do zero — servidor,
cargo de monitores e canal de registro são escolhidos pela chefe direto no painel (tela
**Bot**, fluxo Servidor → Cargo → Canal, cada passo buscado ao vivo na API do Discord), não
por variável de ambiente.

### Configurar a aplicação no Discord Developer Portal

1. Crie uma aplicação em [discord.com/developers/applications](https://discord.com/developers/applications)
   e, dentro dela, um Bot.
2. Em **Bot**, ative o intent privilegiado **Server Members Intent** (necessário para listar
   membros por cargo no vínculo de monitores). O bot não precisa do Message Content Intent — o
   fluxo é só slash command/componentes, nunca lê texto livre de mensagens normais.
3. Copie o **token** do bot para `DISCORD_BOT_TOKEN`.
4. Em **OAuth2 → URL Generator**, marque os escopos `bot` e `applications.commands` e as
   permissões `View Channels`, `Send Messages`, `Embed Links` e `Use Application Commands`.
   Use a URL gerada para convidar o bot a cada servidor de período. Link de convite do bot
   atual (aplicação do Feedbot no Developer Portal):

   ```
   https://discord.com/oauth2/authorize?client_id=1544875651369271397&permissions=2147503104&integration_type=0&scope=bot+applications.commands
   ```

5. Convide o bot ao servidor do período atual e, no painel, vincule servidor → cargo "Monitores"
   → canal de registro. Um período novo (servidor novo) repete só os passos 4 e 5 — o mesmo
   link acima serve pra convidar o bot a qualquer servidor novo, sem precisar gerar de novo.

### Execução contínua (24/7)

O painel pode ser fechado sem desconectar o bot: a conexão pertence à API, não ao
navegador. A API mantém um watchdog interno (`DiscordBot.verificarConexao`) que detecta quedas
e reconexões e avisa cada chefe por e-mail se a queda passar de 5 minutos sem se resolver
sozinha. Para manter API, bot e banco ativos com reinício automático, execute:

```bash
docker compose up -d --build
docker compose ps
```

O serviço `api` usa `restart: unless-stopped`. Como a autenticação é por token estático (sem
sessão pareada), reiniciar ou recriar o container não exige nenhuma ação manual — o bot volta a
conectar sozinho assim que `DISCORD_BOT_TOKEN` estiver disponível.

O computador/servidor e o Docker precisam permanecer ligados. Para disponibilidade real 24/7,
execute o Compose em um servidor permanente e configure o Docker para iniciar com o sistema
operacional. A disponibilidade ainda depende da internet e da API do Discord; revogar/regenerar
o token do bot no Developer Portal exige atualizar `DISCORD_BOT_TOKEN` e reiniciar a API.
