# Prazo de feedback por grupo de alunos

Data: 2026-09-14

Change-id: `prazo-por-grupo-de-alunos`

## O que mudou

A chefe pode criar, consultar, renomear e excluir grupos de prazo, atribuir ou desvincular
alunos em lote e configurar prazos por lista. O prazo efetivo passa a seguir exceção
individual > grupo > turma > sem prazo. Indicadores de atraso e listagem de feedbacks usam
uma única função de domínio para essa precedência.

A migração aditiva `20260914052642_adiciona_grupo_prazo` cria `GrupoPrazo`, `PrazoGrupoLista`
e `Aluno.grupoPrazoId`. Excluir o grupo remove seus prazos e preserva os alunos sem vínculo;
a existência de grupo bloqueia a exclusão de período.

## Por quê

Permitir prazos alternativos para conjuntos livres de alunos, como rematrícula, sem cadastrar
exceção individual para cada aluno. Ver a [spec da feature](../specs/prazo-por-grupo-de-alunos.md)
e as [decisões de modelagem](../specs/modelo-dados.md).

ADR: **Not applicable** — modelagem local aditiva que replica precedentes existentes; a regra
fica isolada no domínio. Não há decisão difícil de reverter ou mudança transversal fora da
capacidade de prazo, conforme o `design.md` da Change.

## Escopo / arquivos principais

- `apps/api/prisma/schema.prisma` e migração aditiva de grupo de prazo.
- `apps/api/src/domain/prazo.ts`: precedência pura.
- `apps/api/src/application/gestao/gestao-service.ts`: prazos do grupo e bloqueio de período.
- `apps/api/src/application/alunos/alunos-service.ts`: atribuição e desvinculação em lote.
- `apps/api/src/routes/management/grupos-prazo.ts`, `management/alunos.ts` e registro em `management.ts`.
- `apps/api/src/services/atrasos.ts` e `apps/api/src/routes/feedback.ts`: consumidores da precedência.
- Testes de domínio, application, rotas e serviço; spec leve, OpenSpec e índices de documentação.

`apps/web`: Not applicable — explicitamente fora do escopo. Migrações aplicadas não foram
reescritas. As alterações locais preexistentes em `migration_lock.toml` e as exclusões de
`monitoria-prototipo.html`/`plano-desenvolvimento.md` não fazem parte destes commits.

## Como foi verificado

Ambiente: Node.js 22.23.2, pnpm 11.21.0, Postgres local `feedbot-db` na porta 5435.
O Node 22 foi executado de forma isolada por `pnpm dlx node@22`, chamando o CLI do pnpm.

- Testes estreitos antes da implementação confirmaram Red por função/rotas ausentes e pela
  precedência que ignorava grupo; Green foi verificado após cada implementação.
- `pnpm --filter @feedbot/api typecheck`: passou.
- `pnpm --filter @feedbot/api test`: 45 arquivos e 231 testes passaram.
- `pnpm --filter @feedbot/api test:coverage`: 45 arquivos e 231 testes passaram; statements
  69,37%, branches 59,77%, funções 69,90%, linhas 71,65%. Pisos inalterados.
- `pnpm lint`: passou sem erros; dois avisos preexistentes de Fast Refresh em `apps/web/src/components/ChartCanvas.tsx`, arquivo não alterado nesta change.
- `pnpm --filter @feedbot/api build`: passou.
- `pnpm exec openspec validate prazo-por-grupo-de-alunos --strict`: passou. Marcadores `MUST`
  foram acrescentados como equivalentes de `DEVE`, sem mudança de contrato, para eliminar
  os avisos normativos da ferramenta em modo estrito.
- Testes de rotas usam `buildApp({ prisma })` e Postgres real; serviço de atrasos usa mock do
  Prisma injetado. O sistema sob teste não foi mockado.

### Rastreabilidade SDD/TDD desta retomada

| Fatia | Red | Green | Refactor |
| --- | --- | --- | --- |
| 4 — Atribuição em application | `2d013a6` | `ba281d6` | `e53a558` |
| 5 — CRUD de grupo | `0aa71d4` | `fd43d18` | `5f78a4d` |
| 6 — Prazos por lista | `4c55aa6` | `7459453` | `367f358` |
| 7 — Atribuição HTTP e filtro | `9c90d1c` | `f5643eb` | `50a73f0` |
| 8 — Indicadores e feedbacks | `19d8c57` | `cd21b76` | `9ad0cb9` |

A retomada partiu de `cadd029`, com as seções 1–3 concluídas. Red, Green, Refactor e Docs
permanecem em commits separados. Na seção 4, as transições foram confirmadas pela usuária;
a verificação final do Refactor foi executada por ela. Durante a seção 5, a usuária autorizou
a continuação autônoma das fases e dos testes, mantendo os commits separados.

### Revisão assistida por IA

Finding **ajustado**: o teste de consulta de prazos dependia da lista sem prazo criada pelo
cenário de exclusão anterior. Isso enfraquecia a verificação quando executado isoladamente.
O commit `c9cb1fb` cria uma fixture própria de lista sem prazo e verifica `null` explicitamente.
O comando `pnpm --filter @feedbot/api test test/routes/grupos-prazo.test.ts -t "GET de prazos"`
passou isoladamente; a suíte completa com cobertura passou após o ajuste.

A revisão também conferiu fronteiras de camada, injeção de Prisma, exclusão preservando
alunos, precedência nos dois consumidores e formato HTTP sem expor os arrays internos de
prazos. Os gates comprovam os cenários automatizados; não houve implantação em produção.
