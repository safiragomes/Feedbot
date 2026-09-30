# Expor prazo por grupo em GET /listas

Data: 2026-09-30

## O que mudou

`GET /listas` passa a incluir, em cada lista retornada, o campo `prazosGrupo` — um item por
grupo de prazo com prazo de entrega de feedback configurado para aquela lista, no mesmo
formato já usado pelo campo `prazos` (por turma). Sem regra de negócio nova: a precedência de
prazo (exceção individual > grupo > turma > sem prazo) já existe e é usada corretamente pelos
indicadores de atraso reais (`GET /atrasos`, `GET /feedbacks`).

## Por quê

Passo de preparação para a interface (`apps/web`) do painel poder exibir, no drawer de um
aluno, se uma lista sem feedback ainda entregue está "pendente" ou "sem prazo definido"
quando o aluno pertence a um grupo de prazo — algo que hoje só é calculado corretamente pelo
backend nos indicadores reais, mas que a UI não consegue reproduzir para exibição porque
`GET /listas` não trazia o nível de grupo. Ver
[docs/specs/prazo-por-grupo-de-alunos.md](../specs/prazo-por-grupo-de-alunos.md). Sem ADR:
mudança aditiva, local e reversível, sem trade-off arquitetural relevante.

## Escopo / arquivos principais

- `apps/api/src/routes/management.ts` — handler `GET /listas`.
- `apps/api/test/routes/listas.test.ts` — 3 cenários novos (prazo configurado, ausência de
  prazo, dois grupos na mesma lista).
- `docs/specs/prazo-por-grupo-de-alunos.md` — sincronizado com o campo novo.
- `openspec/changes/expor-prazo-grupo-em-listas/` — Change formal desta entrega.

## Como foi verificado

Ciclo TDD completo (Red → Green → Refactor) confirmado pela usuária em cada fase:
- Red: 3 testes novos falhando em `listas.test.ts` porque `prazosGrupo` vinha `undefined`.
- Green: `include: { prazos: true, prazosGrupo: true }` no handler — 11/11 testes do arquivo
  passando, 234/234 na suíte completa.
- Refactor: remoção de um mapeamento manual desnecessário, mantendo a resposta simétrica ao
  formato já usado por `prazos`.

Gates executados: `pnpm --filter @feedbot/api typecheck`, `test` (234/234),
`test:coverage` (dentro dos pisos de `apps/api/vitest.config.ts`), `pnpm exec eslint apps/api
apps/web` (0 erros — `pnpm lint` na raiz falha por uma pasta `Feedbot/` não rastreada e alheia
a este projeto, pré-existente no ambiente), `pnpm --filter @feedbot/api build`, e
`openspec validate expor-prazo-grupo-em-listas --strict`.
