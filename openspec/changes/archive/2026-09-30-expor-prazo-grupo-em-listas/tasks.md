## 1. Teste (Red)

- [x] 1.1 Em `apps/api/test/routes/listas.test.ts`, criar um grupo de prazo (via
      `prisma.grupoPrazo.create`) no período de teste já existente, configurar um prazo desse
      grupo para uma das listas fixas (via `prisma.prazoGrupoLista.create` ou pela rota
      `PUT /grupos-prazo/:id/prazos-lista`), e escrever um novo `it("GET /listas retorna o
      prazo configurado por grupo de prazo", ...)` que injeta `GET /listas?periodoId=` e
      espera que a lista correspondente traga `prazosGrupo` contendo
      `{ grupoPrazoId, prazoEntregaFeedback }` com o valor configurado. Rodar
      `pnpm --filter @feedbot/api test listas.test.ts` e confirmar que falha porque
      `prazosGrupo` não vem na resposta (ou vem `undefined`).
- [x] 1.2 No mesmo teste (ou em um `it` companheiro), cobrir o caso de uma lista sem nenhum
      prazo de grupo configurado: `prazosGrupo` deve vir como array vazio (`[]`), nunca
      `undefined` ou erro. Confirmar que esse cenário também falha antes da implementação
      (ou documentar, se já passar incidentalmente por `undefined` ser falsy em algum assert
      frouxo, e então apertar a asserção para o formato exato).
- [x] 1.3 Cobrir o caso de dois grupos de prazo distintos com prazos configurados para a
      mesma lista: `prazosGrupo` deve conter as duas entradas, cada uma com seu próprio
      `grupoPrazoId`. Adicionar limpeza dos registros de `grupoPrazo`/`prazoGrupoLista`
      criados no `afterAll` do arquivo, para não vazar dados entre execuções.

## 2. Implementação mínima (Green)

- [x] 2.1 Em `apps/api/src/routes/management.ts`, no handler `GET /listas`, alterar
      `include: { prazos: true }` para `include: { prazos: true, prazosGrupo: true }` e
      mapear cada lista retornada para expor `prazosGrupo` no formato
      `{ grupoPrazoId, prazoEntregaFeedback }[]` (mesmo formato de `prazos`), preservando os
      demais campos já retornados sem alteração. Rodar
      `pnpm --filter @feedbot/api test listas.test.ts` e confirmar que os três cenários da
      seção 1 passam.

## 3. Refactor

- [x] 3.1 Revisar o mapeamento adicionado quanto a nomes e formato — deve ser simétrico ao
      já usado por `prazos` (turma) na mesma rota e ao já usado por
      `GET /grupos-prazo/:id/prazos-lista` para o mesmo relacionamento
      (`apps/api/src/routes/management/grupos-prazo.ts`) — sem duplicar lógica de mapeamento
      que já exista em outro lugar reaproveitável.

## 4. Verificação e documentação

- [x] 4.1 Rodar a suíte completa da API e confirmar que nada quebrou:
      `pnpm --filter @feedbot/api typecheck`, `pnpm --filter @feedbot/api test`,
      `pnpm --filter @feedbot/api test:coverage` (sem reduzir os pisos de
      `apps/api/vitest.config.ts`), `pnpm lint`, `pnpm --filter @feedbot/api build`.
- [x] 4.2 Rodar `pnpm exec openspec validate expor-prazo-grupo-em-listas --strict` e corrigir
      qualquer erro apontado.
- [x] 4.3 Antes de arquivar: sincronizar `docs/specs/prazo-por-grupo-de-alunos.md` com o novo
      campo exposto por `GET /listas`, e criar
      `docs/changes/<data>-expor-prazo-grupo-em-listas.md` a partir de
      `docs/templates/change.md`. Avaliar necessidade de ADR (esperado: não, por ser mudança
      aditiva e local, sem trade-off relevante — registrar isso explicitamente no lugar do
      ADR caso confirmado).
- [x] 4.4 Pedir confirmação explícita da usuária imediatamente antes de mover esta Change
      para o arquivo (confirmações anteriores, como as dos itens 4.1/4.2, não contam).
