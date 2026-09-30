# Interface de prazo por grupo de alunos

Data: 2026-09-30

## O que mudou

A interface (`apps/web`) passa a expor a feature de "grupo de prazo", que já estava completa
no backend. Nova página "Prazos por grupo" (menu Gestão, rota `/grupos-prazo`) com CRUD de
grupo (criar/renomear/excluir), atribuição/desvinculação de alunos em lote e edição do prazo
do grupo por lista. O diretório de alunos ganhou filtro e coluna de grupo de prazo. O drawer do
aluno ganhou um seletor de grupo de prazo e a seção "Prazo individual" passou a indicar se o
prazo de referência (antes de uma exceção) vem do grupo ou da turma — a função `prazoEfetivo`
local do drawer agora replica a precedência completa (individual > grupo > turma), a mesma já
usada no backend (`calcularPrazoEfetivo`).

## Por quê

Fechar a lacuna deixada intencionalmente de fora na entrega anterior (ver
[docs/changes/2026-09-14-prazo-por-grupo-de-alunos.md](2026-09-14-prazo-por-grupo-de-alunos.md),
que restringiu o escopo a `apps/api`) e no gap de contrato resolvido em
[docs/changes/2026-09-30-expor-prazo-grupo-em-listas.md](2026-09-30-expor-prazo-grupo-em-listas.md).
Ver [docs/specs/prazo-por-grupo-de-alunos.md](../specs/prazo-por-grupo-de-alunos.md), seção
"Interface (apps/web)". Sem ADR: reaproveita 100% dos padrões de UI já estabelecidos (mesma
estrutura de página/modal de "Grupos & duplas" e do painel de prazo por lista), sem decisão de
arquitetura nova.

Não passou pelo processo formal do OpenSpec: as specs deste repositório descrevem apenas
comportamento observável via HTTP (ver `openspec/config.yaml`), e esta mudança não altera
nenhum contrato de API — só consome endpoints já especificados na capacidade
`prazo-por-grupo-de-alunos`.

## Escopo / arquivos principais

- `apps/web/src/lib/types.ts` — `GrupoPrazo`, `Aluno.grupoPrazoId`, `Lista.prazosGrupo`.
- `apps/web/src/lib/api.ts` — `gruposPrazo`, `criarGrupoPrazo`, `renomearGrupoPrazo`,
  `excluirGrupoPrazo`, `prazosGrupo`, `salvarPrazosGrupo`, `atribuirAlunosGrupoPrazo`.
- `apps/web/src/lib/routes.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/App.tsx` —
  registro da página/rota/menu.
- `apps/web/src/pages/GruposPrazo.tsx` (nova) e
  `apps/web/src/components/gestao-prazo/*.tsx` (novos modais).
- `apps/web/src/pages/DiretorioAlunos.tsx` — filtro e coluna de grupo de prazo.
- `apps/web/src/components/Drawers.tsx` — precedência de 3 níveis e seletor de grupo de prazo.
- Testes novos: `Drawers.test.tsx`, `pages/GruposPrazo.test.tsx`,
  `pages/DiretorioAlunos.test.tsx`; `App.test.tsx` ajustado para o endpoint novo carregado por
  `load()`.

## Como foi verificado

`pnpm --filter @feedbot/web typecheck`, `test` (12 arquivos, 30 testes — 22 preexistentes + 8
novos), `pnpm exec eslint apps/web apps/api` (0 erros — `pnpm lint` na raiz falha por uma pasta
`Feedbot/` não rastreada e alheia a este projeto, pré-existente no ambiente), `pnpm --filter
@feedbot/web build`. Suíte de `apps/api` revalidada (234/234) para garantir que nada
regrediu do lado do backend.
