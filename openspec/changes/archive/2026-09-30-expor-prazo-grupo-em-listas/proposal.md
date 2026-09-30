## Why

A feature de prazo por grupo de alunos já está pronta e arquivada no backend (capacidade
`prazo-por-grupo-de-alunos`), mas a interface (`apps/web`) ainda não a expõe. Para o painel
mostrar corretamente, no drawer de um aluno, se uma lista está "pendente" ou "sem prazo
definido" antes de qualquer feedback ser entregue, a UI precisa calcular localmente a
precedência de prazo (exceção individual > prazo do grupo > prazo da turma). Hoje a rota
`GET /listas` só traz o nível de turma (`prazos`) — falta o nível de grupo, então a UI não
consegue reproduzir a precedência completa nesse ponto específico de exibição.

## What Changes

- `GET /listas` passa a incluir também `prazosGrupo: { grupoPrazoId, prazoEntregaFeedback }[]`
  em cada lista da resposta, no mesmo formato já usado por `prazos` (por turma).
- Nenhuma regra de negócio nova: a precedência de prazo já está implementada e testada em
  `calcularPrazoEfetivo` (`apps/api/src/domain/prazo.ts`) e já é usada corretamente pelos
  indicadores de atraso reais (`GET /atrasos`, `GET /feedbacks`) — esta mudança só amplia o
  que a rota de listagem de listas expõe, para a interface poder replicar o mesmo cálculo em
  telas onde ainda não há feedback registrado.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `prazo-por-grupo-de-alunos`: adiciona o requisito de que a consulta geral de listas do
  período (`GET /listas`) também reporte o prazo configurado por grupo de prazo para cada
  lista, na mesma forma que já reporta o prazo por turma.

## Impact

- **Código**: `apps/api/src/routes/management.ts` (handler `GET /listas`) — inclui
  `prazosGrupo` no `include` do Prisma e mapeia para a resposta.
- **Contrato de endpoint**: `GET /listas` ganha um campo novo (`prazosGrupo`) em cada item —
  aditivo, não remove nem renomeia nada existente, não é breaking.
- **Schema/migração Prisma**: nenhuma — os models `GrupoPrazo`/`PrazoGrupoLista` já existem.
- **Documentação**: `docs/specs/prazo-por-grupo-de-alunos.md` ganha uma nota sobre esse campo
  ao arquivar esta change.
- **Fora de escopo**: qualquer mudança em `apps/web` (será tratada em trabalho de UI separado,
  que consumirá este campo novo), e qualquer mudança nas rotas `GET /atrasos`/`GET /feedbacks`
  (já corretas, não tocadas aqui).
