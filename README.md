# Feedbot

Bot de WhatsApp + dashboard para a monitoria de Introdução à Programação registrar o resultado da correção de listas e escrever automaticamente na planilha oficial. Ver `monitoria-especificacao.md` (spec mestra), `politica-privacidade.md` e `plano-desenvolvimento.md` (roteiro de fases).

## Requisitos

- Node.js 22+ (ver `.nvmrc`)
- pnpm 11+ (`corepack enable` ou `npm i -g pnpm`)
- Docker (para o Postgres local) ou um PostgreSQL próprio

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # ajuste DATABASE_URL se não usar o docker-compose

docker compose up -d          # sobe Postgres local na porta 5435 (evita conflito com outros projetos)
pnpm --filter @feedbot/api prisma:migrate
pnpm --filter @feedbot/api prisma:seed
```

Para habilitar o primeiro acesso ao painel, defina `AUTH_BOOTSTRAP_SECRET` em
`apps/api/.env`. Depois de subir a API, envie uma única vez `POST /auth/bootstrap`
com `{ "segredo", "monitorId", "email", "senha" }`, usando o ID de um monitor
marcado como chefe. As demais contas de chefe são criadas por `POST /auth/contas`
com a sessão autenticada.

## Scripts (raiz)

| Script                         | O que faz                                |
| ------------------------------ | ---------------------------------------- |
| `pnpm dev`                     | sobe `apps/api` e `apps/web` em paralelo |
| `pnpm test`                    | roda os testes de todos os workspaces    |
| `pnpm typecheck`               | `tsc --noEmit` em todos os workspaces    |
| `pnpm lint`                    | ESLint no repositório inteiro            |
| `pnpm format` / `format:check` | Prettier (aplica / só verifica)          |
| `pnpm build`                   | build de produção de todos os workspaces |

Cada app também tem `test:watch` (`pnpm --filter @feedbot/api test:watch`) para o loop de TDD.

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
