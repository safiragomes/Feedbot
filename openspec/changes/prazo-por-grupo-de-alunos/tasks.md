## 1. Schema Prisma

- [x] 1.1 Adicionar `GrupoPrazo`, `PrazoGrupoLista` e o campo opcional `Aluno.grupoPrazoId` ao
      `schema.prisma` (com relações reversas em `Periodo` e `Lista`, comentários `///`
      explicando a independência de `GrupoRevisao` e a semântica de "sem prazo configurado") e
      verificar que `pnpm --filter @feedbot/api prisma:generate` roda sem erro.
- [x] 1.2 Gerar a migração (`prisma migrate dev --name adiciona_grupo_prazo` via
      `pnpm --filter @feedbot/api`) e verificar que aplica sem erro num banco de
      desenvolvimento local.
- [x] 1.3 Atualizar `docs/specs/modelo-dados.md` com as novas decisões de modelagem (unique
      constraints, `onDelete` de cada FK) e verificar que o documento cobre `GrupoPrazo` e
      `PrazoGrupoLista` no mesmo nível de detalhe que já cobre `GrupoRevisao`/`PrazoLista`.

## 2. Domain: precedência do prazo efetivo (cenários "Sem grupo...", "Com grupo...", "Exceção
   individual...", "Nenhum nível...")

- [x] 2.1 Escrever `apps/api/test/domain/prazo.test.ts` cobrindo os 4 cenários de precedência
      da spec e confirmar que falha porque `calcularPrazoEfetivo` ainda não existe.
- [x] 2.2 Implementar `calcularPrazoEfetivo` em `apps/api/src/domain/prazo.ts` e verificar que
      `pnpm --filter @feedbot/api test prazo.test.ts` passa.
- [x] 2.3 Revisar nome/comentário da função contra o padrão de estilo de
      `apps/api/src/domain/monitorSemana.ts` e confirmar que os testes continuam verdes.

## 3. Application: configurar prazo do grupo por lista + bloqueio de exclusão de período
   (cenários "Configuração inicial...", "Repetir a configuração...", "Configuração
   rejeitada...", "Consulta com listas...")

- [x] 3.1 Escrever em `apps/api/test/application/gestao-service.test.ts` os casos de
      `atualizarPrazosDoGrupo` (upsert idempotente, grupo inexistente, lista de outro período)
      e de `excluirPeriodo` bloqueando quando há `GrupoPrazo` vinculado ao período; confirmar
      que falham.
- [x] 3.2 Implementar `atualizarPrazosDoGrupo` em `gestao-service.ts` (espelhando
      `atualizarPrazosDaTurma`) e estender `excluirPeriodo` para contar `grupoPrazo`; verificar
      que os testes de 3.1 passam.
- [x] 3.3 Revisar consistência das mensagens de erro com os pares de turma e confirmar que os
      testes continuam verdes.

## 4. Application: atribuir/desvincular alunos em lote (cenários "Atribuição em lote...",
   "Atribuição rejeitada...", "Atribuição move...", "Desvinculação em lote")

- [x] 4.1 Escrever em `apps/api/test/application/alunos-service.test.ts` os casos de
      `atribuirAlunosAGrupoPrazo`: sucesso em lote no mesmo período, rejeição por período
      diferente, mover aluno de um grupo para outro, e desvincular com `null` validando a
      existência dos alunos; confirmar que falham.
- [ ] 4.2 Implementar `atribuirAlunosAGrupoPrazo` em `alunos-service.ts` (espelhando
      `atribuirAlunosADupla`) e verificar que os testes de 4.1 passam.
- [ ] 4.3 Revisar simetria de validação entre os ramos "atribuir" e "desvincular" e confirmar
      testes verdes.

## 5. Rotas: CRUD de grupo de prazo (cenários "Criação com nome único...", "Nome duplicado...",
   "Renomeação...", "Exclusão de grupo com alunos e prazos...")

- [ ] 5.1 Escrever `apps/api/test/routes/grupos-prazo.test.ts` cobrindo criar (sucesso e
      conflito de nome), renomear (sucesso e conflito de nome) e excluir com cascata (grupo e
      prazos somem, aluno fica sem grupo — estilo `test/routes/exclusao-cascata.test.ts`);
      confirmar que falham.
- [ ] 5.2 Criar `apps/api/src/routes/management/grupos-prazo.ts` com
      `GET/POST/PATCH/DELETE /grupos-prazo`, registrar a partir de `management.ts`; verificar
      que os testes de 5.1 passam.
- [ ] 5.3 Revisar consistência com o padrão de `GrupoRevisao` (mensagens de erro, formato de
      resposta) e confirmar testes verdes.

## 6. Rotas: prazo do grupo por lista (cenários "Configuração inicial...", "Repetir a
   configuração...", "Configuração rejeitada...", "Consulta com listas...", em HTTP)

- [ ] 6.1 Estender `apps/api/test/routes/grupos-prazo.test.ts` com: GET retorna "sem prazo
      configurado" para combinação (grupo, lista) ainda não configurada, PUT grava e um
      segundo PUT na mesma combinação atualiza em vez de duplicar, PUT rejeita lista de outro
      período; confirmar que falham.
- [ ] 6.2 Implementar `GET`/`PUT /grupos-prazo/:id/prazos-lista` usando
      `atualizarPrazosDoGrupo`; verificar que os testes de 6.1 passam.
- [ ] 6.3 Revisar consistência de formato de resposta com `GET`/`PUT /prazos-lista` (turma) e
      confirmar testes verdes.

## 7. Rotas: atribuição/desvinculação de alunos em lote + filtro em `GET /alunos` (cenários
   "Atribuição em lote...", "Atribuição rejeitada...", "Atribuição move...", "Desvinculação em
   lote", em HTTP)

- [ ] 7.1 Estender `apps/api/test/routes/alunos.test.ts` com: atribuição em lote com sucesso,
      rejeição por período diferente, desvinculação em lote via `grupoPrazoId: null`, e
      `GET /alunos?grupoPrazoId=` retornando os alunos do grupo; confirmar que falham.
- [ ] 7.2 Implementar `PATCH /alunos/atribuir-grupo-prazo` e estender `GET /alunos` em
      `apps/api/src/routes/management/alunos.ts`; verificar que os testes de 7.1 passam.
- [ ] 7.3 Revisar consistência com `PATCH /alunos/atribuir-dupla` e confirmar testes verdes.

## 8. Integração: indicadores de atraso e listagem de feedbacks (cenários de precedência fim a
   fim)

- [ ] 8.1 Estender `apps/api/test/services/atrasos.test.ts` (mock de `PrismaClient`, sem
      Postgres real) com os cenários de prazo de grupo prevalecendo sobre turma, exceção
      prevalecendo sobre grupo, e nenhum nível configurado não gerando atraso; criar um teste
      mínimo de rota para `GET /feedbacks` cobrindo o novo nível (hoje sem nenhum teste de
      rota); confirmar que todos falham.
- [ ] 8.2 Trocar o cálculo inline de prazo efetivo por `calcularPrazoEfetivo` em
      `apps/api/src/services/atrasos.ts` e `apps/api/src/routes/feedback.ts`, incluindo
      `prazosGrupo` nos includes de `lista` em ambos; verificar que os testes de 8.1 passam.
- [ ] 8.3 Revisar se sobrou algum resquício da lógica inline antiga e confirmar testes verdes.

## 9. Fechamento

- [ ] 9.1 Rodar `pnpm --filter @feedbot/api typecheck`, `pnpm --filter @feedbot/api test` e
      `pnpm --filter @feedbot/api test:coverage` (sem reduzir os pisos de
      `apps/api/vitest.config.ts`) e confirmar que todos passam.
- [ ] 9.2 Rodar `pnpm lint` e `pnpm --filter @feedbot/api build` e confirmar que passam.
- [ ] 9.3 Sincronizar `docs/specs/prazo-por-grupo-de-alunos.md` com o spec desta Change
      (formato Comportamento esperado/Regras de negócio/Casos de borda/Fora de escopo).
- [ ] 9.4 Criar `docs/changes/<data>-prazo-por-grupo-de-alunos.md` a partir de
      `docs/templates/change.md`, registrando "ADR: Not applicable" com o motivo (ver
      `design.md`), e atualizar `docs/adr/README.md`/`docs/changes/README.md` com a entrada
      nova.
- [ ] 9.5 Rodar `pnpm exec openspec validate prazo-por-grupo-de-alunos --strict` e confirmar
      que passa sem erros.
- [ ] 9.6 Pedir confirmação explícita da usuária antes de mover a Change para o arquivo.
