# Preparação do repositório e do ambiente

Data: 2026-08-17

## O que mudou

- Monorepo pnpm criado (`apps/api`, `apps/web`), com TypeScript, ESLint (flat config) e Prettier compartilhados na raiz.
- `apps/api`: Fastify + TypeScript + Prisma (datasource inicial, sem modelos ainda) + Vitest, com uma rota `GET /health` construída em ciclo TDD (teste vermelho → implementação → teste verde).
- `apps/web`: Vite + React + TypeScript + Vitest + React Testing Library, com o boilerplate padrão do Vite substituído por um placeholder mínimo do Feedbot, também via TDD.
- `docs/adr/` criado com o processo de ADR e três decisões já registradas: ADR-0001 (processo), ADR-0002 (stack, espelhando a seção 8 da spec mestra) e ADR-0003 (bot via biblioteca não-oficial + QR code + grupos do WhatsApp, substituindo a decisão original da spec).
- `docs/changes/` criado com o processo de registro de mudanças (este arquivo é o primeiro registro).
- `docs/specs/` criado com o fluxo de Spec-Driven Development e a hierarquia spec mestra → specs de feature → ADRs.
- `README.md` na raiz documentando setup, scripts e o fluxo spec → red → green → refactor → change record.

## Por quê

Ref: `plano-desenvolvimento.md` (Fase 0, parcial — schema Prisma completo fica para uma próxima mudança) e [ADR-0002](../adr/0002-stack-tecnologica.md), [ADR-0003](../adr/0003-bot-whatsapp-biblioteca-nao-oficial.md). O pedido explícito foi preparar repositório e ambiente de forma a viabilizar SDD e TDD desde o primeiro commit, com decisões e mudanças rastreáveis.

## Escopo / arquivos principais

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json` (raiz)
- `apps/api/{src,test,prisma,vitest.config.ts,tsconfig*.json}`
- `apps/web/{src,test,vite.config.ts,tsconfig*.json}`
- `docs/adr/`, `docs/changes/`, `docs/specs/`

## Como foi verificado

- `pnpm --filter @feedbot/api test`: 1 passou (rota `/health`, ciclo red→green documentado nesta sessão).
- `pnpm --filter @feedbot/web test`: 1 passou (render do `App`, mesmo ciclo red→green).
- `pnpm --filter @feedbot/api prisma:generate`: cliente Prisma gerado com sucesso a partir do schema inicial.
- Boot manual do servidor Fastify (`tsx src/server.ts`) + `curl http://localhost:3333/health` → `{"status":"ok"}`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @feedbot/api build`, `pnpm --filter @feedbot/web build` e `pnpm format:check` rodando limpos em todos os workspaces.

### Nota

Durante a instalação, `typescript@latest` resolveu para a 7.0.2, que `typescript-eslint` ainda não suporta. TypeScript foi fixado em `6.0.3` na raiz e em `apps/api` (já era `~6.0.2` em `apps/web`, gerado pelo próprio template do Vite) — decisão de compatibilidade de tooling, não uma decisão arquitetural, por isso registrada aqui e não em ADR.
