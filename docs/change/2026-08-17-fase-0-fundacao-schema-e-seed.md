# Fase 0 — schema Prisma completo, primeira migration e seed

Data: 2026-08-17

## O que mudou

- Postgres local dedicado ao Feedbot via `docker-compose.yml` (porta 5435, para não colidir com outros projetos já rodando nesta máquina).
- Schema Prisma completo (`apps/api/prisma/schema.prisma`): as 10 entidades do ERD da spec mestra (`Periodo`, `Turma`, `GrupoRevisao`, `Dupla`, `Monitor`, `Aluno`, `Lista`, `Feedback` + 3 tabelas de junção de ocorrência) mais os dois elementos do ADR-0003 (`GrupoRevisao.whatsappGrupoId/whatsappGrupoNome`, tabela `BotSessao`).
- Driver adapter `@prisma/adapter-pg` configurado (Prisma 7 exige adapter explícito; não existe mais engine binário default) — cliente compartilhado em `apps/api/src/db/client.ts`.
- Função pura `calcularSemana` (`apps/api/src/domain/semana.ts`), implementando a fórmula de semana A/B da spec mestra § 2.2, construída em TDD (7 testes cobrindo override, limites de semana e datas anteriores à referência).
- Primeira migration (`20260817171320_init`) aplicada e validada com `prisma migrate reset` a partir de um banco vazio.
- `apps/api/prisma/seed.ts`: popula um período de teste completo (1 período, 3 turmas, 6 grupos de revisão com chefes, 12 duplas, 30 monitores, 36 alunos, 6 listas), idempotente (pode ser rodado repetidas vezes sem violar constraints).

## Por quê

Ref: `plano-desenvolvimento.md` (Fase 0) · `docs/specs/modelo-dados.md` · [ADR-0002](../adr/0002-stack-tecnologica.md) · [ADR-0003](../adr/0003-bot-whatsapp-biblioteca-nao-oficial.md). Fecha o restante da Fase 0 que não tinha sido feito na preparação de ambiente anterior (`2026-08-17-preparacao-repositorio-e-ambiente.md`): modelar o schema a partir do ERD, rodar a primeira migration e ter um seed de dados de teste.

## Escopo / arquivos principais

- `docker-compose.yml`
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260817171320_init/`, `apps/api/prisma/seed.ts`
- `apps/api/prisma.config.ts` (comando de seed configurado)
- `apps/api/src/db/client.ts` (PrismaClient com driver adapter)
- `apps/api/src/domain/semana.ts`, `apps/api/test/domain/semana.test.ts`
- `docs/specs/modelo-dados.md`

## Como foi verificado

- `pnpm --filter @feedbot/api test`: 7 testes passando (1 de `/health`, 6 de `calcularSemana` — construídos em ciclo red→green).
- `prisma validate` / `prisma format`: schema válido.
- `prisma migrate dev --name init`: aplicada com sucesso; 13 tabelas confirmadas via `psql \dt`.
- `prisma db seed` rodado 3x consecutivas: contagens estáveis (1 período, 3 turmas, 6 grupos, 12 duplas, 30 monitores — 6 chefes + 24 de dupla —, 36 alunos, 6 listas), confirmando idempotência.
- **Verificação do zero absoluto** (com consentimento explícito do usuário, exigido pela barreira de segurança do próprio Prisma para ações de agente de IA): `prisma migrate reset --force` — banco apagado e recriado, migration reaplicada, seed rodado manualmente em seguida (o reset não dispara o seed automaticamente nesta configuração) — mesmas contagens exatas do primeiro seed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`: todos limpos no monorepo inteiro após as mudanças.

### Nota operacional

`prisma migrate reset` não re-executa o seed automaticamente neste setup (Prisma 7 + `prisma.config.ts`) — é preciso rodar `pnpm --filter @feedbot/api prisma:seed` manualmente depois. O `README.md` já documenta os dois passos em sequência.
