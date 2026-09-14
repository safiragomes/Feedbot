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

## Deploy de produção

Deploy usa Docker Compose completo (Postgres sem porta pública, API com migração automática,
frontend por Nginx, proxy Caddy com HTTPS automático), publicado via imagens no GHCR. Ver
[`docs/deploy.md`](docs/deploy.md) para o passo a passo completo: DNS e ambiente, build e subida,
primeiro acesso sem seed, backups e acesso SSH ao servidor (incluindo o contorno via Oracle Cloud
Shell quando a porta 22 trava).

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
  deploy.md       passo a passo de deploy de produção, backups e acesso ao servidor
  bot-discord.md  configuração da aplicação no Discord e operação contínua
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
`docs/specs/controle-sessao-bot.md` para o comportamento completo do fluxo. Ver
[`docs/bot-discord.md`](docs/bot-discord.md) para configurar a aplicação no Developer Portal e
operar o bot continuamente (24/7).
