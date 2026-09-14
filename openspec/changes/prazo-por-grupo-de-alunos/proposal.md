## Why

Hoje o prazo de entrega de feedback só tem dois níveis: um padrão por turma e uma exceção
individual por aluno. Quando a chefe de monitoria precisa dar um prazo alternativo a um
conjunto de alunos que não corresponde a nenhuma turma (por exemplo, alunos em rematrícula), a
única ferramenta disponível hoje é cadastrar uma exceção aluno por aluno — o que não escala e
não deixa explícito que aqueles alunos compartilham o mesmo motivo.

## What Changes

- Introduz o "grupo de prazo": um grupo de alunos que a chefe cria livremente, independente de
  turma, usado só para conceder um prazo de entrega alternativo. Um aluno pertence a no máximo
  um grupo de prazo por vez.
- A precedência do prazo efetivo passa a ter três níveis: exceção individual do aluno > prazo
  do grupo de prazo > prazo da turma > sem prazo configurado (nunca erro).
- Novos endpoints de gestão em `apps/api` (protegidos por `requireChief`, como toda rota de
  gestão hoje): criar/renomear/excluir grupo de prazo; atribuir alunos em lote a um grupo;
  desvincular alunos de um grupo em lote (sem excluir o grupo nem movê-los para outro);
  configurar/consultar o prazo do grupo por lista.
- Atualiza os dois pontos do código que hoje calculam o prazo efetivo do aluno (indicadores de
  atraso e a listagem de feedbacks) para considerar o novo nível de grupo, mantendo o
  comportamento atual para alunos sem grupo.
- **Não-objetivos / fora de escopo desta entrega**: qualquer mudança em `apps/web` (só
  `apps/api`); qualquer mudança no `GrupoRevisao` (equipe de revisão de monitoria) — é um
  conceito deliberadamente independente e não relacionado, embora tenha nome parecido; remover
  pontualmente o prazo configurado de um grupo para uma lista específica sem excluir o grupo
  inteiro (mesma limitação que o prazo por turma já tem hoje — só dá para sobrescrever com
  outra data).

## Capabilities

### New Capabilities

- `prazo-por-grupo-de-alunos`: grupo de alunos definido livremente pela chefe para conceder um
  prazo de entrega de feedback alternativo ao da turma — CRUD do grupo, atribuição/desvinculação
  de alunos em lote, configuração do prazo do grupo por lista, e a precedência de três níveis do
  prazo efetivo (exceção do aluno > grupo > turma > sem prazo).

### Modified Capabilities

(Nenhuma — o projeto ainda não tem specs formais em `openspec/specs/` para as capacidades de
prazo por turma ou exceção individual; esta é a primeira capacidade formalizada nesse domínio.)

## Impact

- **Schema Prisma**: novos models `GrupoPrazo` e `PrazoGrupoLista`; novo campo opcional
  `Aluno.grupoPrazoId`; nova migração. `docs/specs/modelo-dados.md` precisa registrar essas
  decisões de modelagem (o schema se declara "derivado" desse documento).
- **Contrato de endpoints**: novos endpoints HTTP em `apps/api` para grupo de prazo (CRUD,
  atribuição/desvinculação em lote, configuração de prazo por lista); extensão de `GET /alunos`
  com um novo filtro.
- **Comportamento existente**: os dois pontos que hoje calculam o prazo efetivo do aluno
  (cálculo de indicadores de atraso e a listagem de feedbacks) mudam de fórmula (dois níveis →
  três), sem mudar o formato de resposta.
- **Documentação**: `docs/specs/prazo-por-grupo-de-alunos.md` (novo) e
  `docs/changes/<data>-prazo-por-grupo-de-alunos.md` (novo, ao arquivar).
