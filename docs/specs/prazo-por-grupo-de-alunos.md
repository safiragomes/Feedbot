# Prazo por grupo de alunos

## Comportamento esperado

A chefe organiza alunos em grupos de prazo independentes de turma e de grupos de revisão.
O prazo efetivo de feedback segue: exceção individual > prazo do grupo > prazo da turma >
sem prazo configurado. Os indicadores de atraso e `GET /feedbacks` usam a mesma regra.

Todas as operações de gestão exigem sessão de chefe autenticada.

| Operação | Entrada / resposta |
| --- | --- |
| `GET /grupos-prazo` | Lista grupos por nome; aceita `periodoId` como filtro. |
| `POST /grupos-prazo` | Recebe `periodoId` e `nome`; retorna o grupo criado, HTTP 201. |
| `PATCH /grupos-prazo/:id` | Recebe `nome`; retorna o grupo renomeado. |
| `DELETE /grupos-prazo/:id` | Remove o grupo e seus prazos, desvincula os alunos; HTTP 204. |
| `GET /grupos-prazo/:id/prazos-lista` | Lista todas as listas do período, por ordem, com `listaId`, `listaNome`, `ordem`, `qtdQuestoesTotal` e `prazoEntregaFeedback` (ISO ou `null`). |
| `PUT /grupos-prazo/:id/prazos-lista` | Recebe `prazos: [{ listaId, prazoEntregaFeedback }]`; retorna `{ atualizados }`. |
| `PATCH /alunos/atribuir-grupo-prazo` | Recebe `alunoIds` e `grupoPrazoId` (identificador ou `null`); retorna `{ atualizados }`. |
| `GET /alunos?grupoPrazoId=<id>` | Retorna os alunos do grupo solicitado. |

## Regras de negócio

- Nome de grupo é único no período; criar ou renomear para nome duplicado retorna conflito.
- Um aluno pertence a no máximo um grupo de prazo; a nova atribuição substitui a anterior.
- Na atribuição, todos os alunos precisam existir e pertencer ao período do grupo. Um lote
  com aluno de outro período é rejeitado antes de qualquer atualização.
- Na desvinculação com `null`, todos os alunos precisam existir, mas não há grupo de destino
  para comparar períodos. Grupo, prazos e alunos fora do lote são preservados.
- Configurar o mesmo par grupo/lista novamente atualiza a data, sem duplicar o prazo.
- Listas de outro período são rejeitadas antes de configurar os prazos do lote.
- Excluir o grupo preserva os alunos, que ficam sem grupo, e remove seus prazos configurados.
- Um grupo de prazo vinculado bloqueia a exclusão do período, inclusive quando não tem alunos.
- A precedência independe de qual data é maior: o prazo do grupo pode antecipar ou prorrogar
  o prazo da turma; a exceção individual continua prevalecendo.

## Casos de borda

- Aluno sem grupo usa exceção individual e turma, como antes.
- Grupo sem prazo para uma lista não impede o uso do prazo da turma.
- Ausência nos três níveis resulta em `null` e nunca gera atraso.
- A consulta de prazos inclui listas ainda não configuradas, com `null`.
- Desvincular ou excluir o grupo faz o cálculo voltar aos níveis individual/turma.
- A atribuição em lote segue o limite de 1 a 500 alunos usado na gestão existente.

## Fora de escopo

- Alterações no painel `apps/web`, em `GrupoRevisao` ou no fluxo de revisão.
- Remoção pontual de um prazo de grupo/lista: é possível sobrescrever a data ou excluir o grupo.
- Correção de lacunas de testes nas funções antigas de atribuição de dupla e prazo de turma.

Modelagem: [modelo de dados](modelo-dados.md). Change: `prazo-por-grupo-de-alunos`.
