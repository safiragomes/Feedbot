# Feedbot

Bot de WhatsApp + dashboard para a monitoria de Introdução à Programação registrar o resultado da correção de listas e escrever automaticamente na planilha oficial. Ver `monitoria-especificacao.md` (spec mestra), `politica-privacidade.md` e `plano-desenvolvimento.md` (roteiro de fases).

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
- volumes persistentes para banco, certificados e sessão do WhatsApp.

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

- `BOOTSTRAP_CHIEF_NAME`, `BOOTSTRAP_CHIEF_EMAIL`, `BOOTSTRAP_CHIEF_PASSWORD` e
  `BOOTSTRAP_CHIEF_WHATSAPP`;
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
  specs/  specs de feature (SDD)
  adr/    Architecture Decision Records
  change/ registro de mudanças entregues
```

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

## Bot do WhatsApp

O bot usa uma biblioteca não-oficial multi-device (ex. Baileys), pareada por QR code — ver [ADR-0003](docs/adr/0003-bot-whatsapp-biblioteca-nao-oficial.md). A sessão de autenticação nunca é versionada (`apps/api/.baileys-auth/` está no `.gitignore`).

### Execução contínua (24/7)

O painel pode ser fechado sem desconectar o bot: a conexão pertence à API, não ao
navegador. A API também mantém um watchdog independente do painel para refazer conexões
interrompidas ou presas. Para manter API, bot e banco ativos com reinício automático, execute:

```bash
docker compose up -d --build
docker compose ps
```

O serviço `api` usa `restart: unless-stopped`. As credenciais do WhatsApp ficam no
volume `feedbot-baileys-auth`, portanto reiniciar ou recriar o container não exige novo
QR code. Um novo pareamento só é necessário quando o próprio WhatsApp revoga a sessão
ou quando o usuário solicita **Desconectar** no painel.

O computador/servidor e o Docker precisam permanecer ligados. Para disponibilidade
real 24/7, execute o Compose em um servidor permanente e configure o Docker para iniciar
com o sistema operacional. A disponibilidade ainda depende da internet e do WhatsApp;
revogação do aparelho conectado exige um novo pareamento manual.
