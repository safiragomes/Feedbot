# Fase 1 — Gestão e autenticação

Data: 2026-08-19

## O que mudou

- Autenticação de chefes por e-mail e senha, com tokens de sessão aleatórios,
  armazenados somente como hash, expiração de 12 horas e logout revogável.
- Bootstrap seguro da primeira conta mediante `AUTH_BOOTSTRAP_SECRET`; um chefe
  autenticado pode cadastrar as demais contas de chefes.
- Rotas protegidas de CRUD para períodos, turmas, grupos de revisão, duplas,
  monitores, alunos e listas.
- Importação transacional de alunos por CSV. O arquivo usa os headers
  `nome,matricula,turmaId,duplaId,isPcd,qtdQuestoesMeta`.
- Validações de vínculo: chefe pertence ao período do grupo, aluno tem turma e
  dupla no mesmo período, e um monitor não pode ser atribuído a uma dupla de
  outro período nem a duas duplas.
- Migration `20260819100000_fase_1_gestao_auth` aplicada ao PostgreSQL local.

## Como foi verificado

- `pnpm --filter @feedbot/api typecheck`
- `pnpm lint`
- `pnpm --filter @feedbot/api test` (9 testes)
- `pnpm --filter @feedbot/api build`
- `prisma migrate deploy` contra o PostgreSQL local (duas migrations aplicadas)

## Limite desta entrega

O dashboard React ainda será ligado a essas rotas na Fase 4. A Fase 1 entrega a
API que substitui as operações mockadas da tela Gestão.
