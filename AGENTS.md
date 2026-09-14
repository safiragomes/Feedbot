# Repository instructions

- Escreva código, comentários, mensagens de erro, documentação, especificações e nomes de teste
  em português, seguindo o restante do repositório.
- Use Node.js 22 e pnpm; não troque o gerenciador de pacotes nem edite `pnpm-lock.yaml` à mão.
- Use kebab-case para arquivos e pastas; importe arquivos concretos, sem barrel files (`index.ts`
  reexportando tudo).
- Nunca logue corpo de requisição, credenciais, cookies, tokens ou dados pessoais.
- Nunca exclua nem reescreva uma migração do Prisma já aplicada — o banco de produção já tem
  dados reais; uma correção de schema sempre vira uma migração nova.
- Durante o desenvolvimento, rode primeiro o teste mais estreito relacionado à mudança; só rode
  todos os gates da seção Verificação depois. Não há CI configurado neste repositório — esses
  gates são o crivo manual antes de qualquer entrega, não uma rede de segurança automática.

## Monorepo

`apps/api` (Fastify + TypeScript + Prisma + PostgreSQL, backend e bot do Discord) e `apps/web`
(React + TypeScript + Vite, painel administrativo). Ver `docs/arquitetura.md` para a estrutura
completa de cada um.

### `apps/api` — arquitetura e testabilidade

- Fronteira de camadas unidirecional, garantida por
  `apps/api/test/architecture/layer-boundaries.test.ts`: `domain/` (regras puras, sem I/O) →
  `application/` (orquestra `domain/` + Prisma, recebe `PrismaClient` injetado, nunca importa de
  `routes/`/`services/`) → `services/` e `routes/` (integrações externas e adaptadores HTTP
  Fastify). Não instancie Prisma ou outra dependência externa dentro de uma rota ou caso de uso —
  receba injetado.
- Erros de constraint do Prisma (`P2002`/`P2003`/`P2025`) já são convertidos globalmente para
  409/404 em `apps/api/src/app.ts` — não duplique esse mapeamento manualmente nas rotas.
- Toda rota de gestão usa o preHandler `requireChief`
  (`apps/api/src/auth/require-chief.ts`) — só chefe autenticado.
- Convenção de teste: rotas usam Postgres real via `buildApp({ prisma })` + `app.inject(...)`
  (ver `apps/api/test/routes/listas.test.ts`); `services/` mockam o `PrismaClient` inteiro (ver
  `apps/api/test/services/atrasos.test.ts`); `domain/` é testado como função pura, sem I/O.
- Valide entrada HTTP com os helpers de `apps/api/src/http/input.ts` (`parseText`, `parseDate`,
  `parseBoolean`, `parsePositiveInteger`, `parseOptionalPositiveInteger`) em vez de validação
  manual ad-hoc espalhada pelas rotas — é o único padrão de validação usado hoje (o projeto não
  usa Zod nem gera OpenAPI).

## OpenSpec e documentação

- `openspec/` guarda Changes formais (`proposal.md`, spec delta em WHEN/THEN, `design.md`,
  `tasks.md`) para toda mudança de comportamento relevante. Rode
  `pnpm exec openspec instructions <artefato> --change <id>` antes de escrever cada artefato, e
  `pnpm exec openspec validate <id> --strict` antes de considerar a Change pronta.
- Agrupe `openspec/specs/` e `openspec/changes/` estritamente por capacidade de negócio (ex.:
  `prazo-por-grupo-de-alunos`), nunca por rota HTTP, controller ou tabela do banco.
- `docs/specs/` guarda specs leves por feature (formato: Comportamento esperado/Regras de
  negócio/Casos de borda/Fora de escopo) — o artefato que o resto do projeto já consulta. Ao
  arquivar uma Change, sincronize `docs/specs/<feature>.md` com o que foi decidido nela.
- `docs/changes/` guarda o registro de cada entrega significativa, a partir de
  `docs/templates/change.md`, com o mesmo change-id da Change do OpenSpec.
- `docs/adr/` guarda ADRs (formato Nygard, a partir de `docs/templates/adr.md`) só para decisão
  difícil de reverter ou que afete múltiplas partes do sistema. Decisão de modelagem local (ex.:
  cardinalidade de uma FK nova) vai em `docs/specs/modelo-dados.md`, não em ADR — quando não
  houver ADR, registre "Not applicable" com o motivo no registro de mudança.
- Não arquive uma Change sem testes passando, typecheck limpo e
  `openspec validate <id> --strict` sem erros. Peça confirmação explícita do usuário
  imediatamente antes de arquivar — confirmações anteriores (de warnings, por exemplo) não
  contam.
- Não remova seção obrigatória de `docs/templates/change.md` ou `docs/templates/adr.md` ao usar
  o template; preencha "Not applicable" com o motivo quando uma seção não se aplicar.
- Mantenha `docs/adr/README.md` e `docs/changes/README.md` atualizados — toda entrada nova
  (ADR ou registro de mudança) entra no índice do respectivo arquivo.

## SDD (Spec-Driven Development)

- Leia os artefatos do OpenSpec da Change (e a spec leve relacionada em `docs/specs/`, se já
  existir) antes de propor ou escrever qualquer código.
- Código e testes devem mapear diretamente para os requisitos e cenários da spec — a spec é a
  fonte da verdade, o código é a implementação dela.
- Se surgir uma ambiguidade, um caso de borda não previsto ou uma decisão que mude
  comportamento/contrato/escopo durante o desenvolvimento, pare a implementação, pergunte ao
  usuário e atualize os artefatos do OpenSpec com a resposta antes de continuar — não invente
  uma decisão de contrato para preencher a lacuna.

## TDD (Test-Driven Development)

- Ciclo estrito Red → Green → Refactor.
- Não avance de Red para Green, nem de Green para Refactor, sem confirmação explícita do
  usuário.
- Antes de pedir confirmação, explique em português o que vai ser implementado ou alterado na
  próxima fase.
- Red: escreva o teste a partir da spec antes do código de produção, rode e confirme que falha
  pelo motivo certo.
- Green: implemente o mínimo necessário para o teste passar.
- Refactor: melhore a estrutura mantendo o comportamento e os testes verdes.
- Nunca mocke o sistema sob teste; mocke uma dependência externa só quando necessário (ver as
  convenções de teste de `apps/api` acima).
- Prefira commits pequenos e granulares por fatia concluída — um commit por fase (Red, Green,
  Refactor, Docs), nunca duas fases agrupadas — em vez de um único commit final. É o que dá
  rastreabilidade real ao ciclo e serve como evidência auditável do processo.

## Verificação

Antes de considerar uma mudança pronta: `pnpm --filter @feedbot/api typecheck`,
`pnpm --filter @feedbot/api test`, `pnpm --filter @feedbot/api test:coverage` (sem reduzir os
pisos de `apps/api/vitest.config.ts` — reduzir um limite exige justificativa explícita), `pnpm
lint` e `pnpm --filter @feedbot/api build`. Rode `pnpm --filter @feedbot/web test`,
`typecheck`, `lint` e `build` também quando a mudança tocar `apps/web`.
