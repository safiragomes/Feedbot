# Listas fixas por período e prazo de entrega de feedback por turma

Data: 2026-08-28

## O que mudou

- Todo período passa a ter sempre exatamente 6 listas, criadas automaticamente
  (nome, ordem 1..6, quantidade de questões padrão) quando o período é cadastrado
  via `POST /periodos`.
- O prazo de entrega de feedback deixa de ser um valor único por lista e passa a
  ser configurável por turma (mesma lista, prazos diferentes por turma), através de
  um novo modelo `PrazoLista` e dos endpoints `GET`/`PUT /prazos-lista`.
- `Lista.prazoEntregaFeedback` foi removido; em seu lugar, `Lista.ordem` (1..6,
  único por período, definida na criação e imutável depois) passa a ser o critério
  de ordenação usado para o cálculo de semana A/B.
- Nova UI em Gestão: um único "Editar lista" reúne nome, quantidade de questões e
  os prazos de CC/IA, SI e EC; não há um segundo card de prazos.
- O perfil do aluno permite cadastrar uma exceção de prazo por lista. A exceção
  substitui o prazo da turma nos indicadores e na cobrança do monitor.
- Feedback ausente depois do prazo efetivo passa a contar como atraso do monitor.
  Com o bot conectado, o verificador envia no privado um único lembrete por
  aluno/lista, informando nominalmente quais feedbacks faltam.
- Dashboards (`Drawers.tsx`, `MonitoresDashboard.tsx`) passam a tratar combinações
  lista×turma sem prazo configurado como "sem prazo" em vez de contá-las como
  atraso.

## Por quê

Levantamento com o usuário: as 6 listas da disciplina são as mesmas para todas as
turmas de um período, mas cada turma tem um prazo de entrega de feedback diferente
— um valor único por lista não representava essa realidade. Ver
`monitoria-especificacao.md` § 2.1 (entidades `LISTA`/`PRAZO_LISTA`) e
`docs/specs/modelo-dados.md` (decisão de modelagem sobre `Lista.ordem` substituindo
`prazoEntregaFeedback`).

## Escopo / arquivos principais

- `apps/api/prisma/schema.prisma`, migration
  `20260828140000_lista_ordem_prazo_por_turma`
- `apps/api/src/domain/lista.ts` (novo)
- `apps/api/src/services/feedback.ts`, `apps/api/src/services/whatsapp-bot.ts`
  (ordenação por `ordem`)
- `apps/api/src/routes/management.ts` (criação automática de listas, endpoints de
  `PrazoLista`)
- `apps/api/src/routes/feedback.ts` (prazo resolvido por turma em `GET /feedbacks`)
- `apps/api/prisma/seed.ts`
- `apps/web/src/lib/types.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/format.ts`
- `apps/web/src/pages/Gestao.tsx`, `apps/web/src/components/Topbar.tsx`,
  `apps/web/src/components/Drawers.tsx`, `apps/web/src/pages/MonitoresDashboard.tsx`

## Como foi verificado

- `pnpm --filter @feedbot/api test` (51 testes, incluindo nova cobertura em
  `test/routes/listas.test.ts`: criação automática das 6 listas, rejeição de
  mudança de `ordem`, upsert de prazos por turma, validação de período).
- `pnpm --filter @feedbot/web test`.
- `pnpm --filter @feedbot/api exec tsc --noEmit` e `pnpm --filter @feedbot/web exec
tsc -b --noEmit` sem erros.
- Migration aplicada sobre o banco local com dados de seed pré-existentes
  (`prisma migrate dev`), reseed (`prisma db seed`) e verificação manual dos
  painéis de Listas e Prazos no dashboard.
