# Arquitetura do repositório

Visão geral de como o código está organizado, para orientar quem chega no repositório pela
primeira vez. Para _o quê_ o sistema faz (domínio, regras de negócio), ver
`monitoria-especificacao.md` na raiz — este documento é sobre a estrutura do código, não sobre
comportamento de feature.

## Monorepo

Gerenciado por pnpm workspaces (`pnpm-workspace.yaml`), dois pacotes:

```
apps/
  api/    Fastify + TypeScript + Prisma (PostgreSQL) — backend e bot do Discord
  web/    React + TypeScript + Vite — painel administrativo (SPA)
openspec/
  specs/    especificações executáveis atuais, por capacidade de negócio
  changes/  Changes do OpenSpec em andamento (archive/ guarda as concluídas)
docs/
  specs/      specs leves de feature (SDD) — comportamento e regras de negócio
  adr/        Architecture Decision Records — decisões difíceis de reverter e por quê
  changes/    registro cronológico de mudanças entregues — o quê mudou e como foi verificado
  templates/  modelos usados por docs/adr/ e docs/changes/
scripts/
  backup-database.sh
```

Não há CI configurado no repositório (sem `.github/workflows`) — `pnpm lint`, `pnpm typecheck`,
`pnpm test` e `pnpm build` na raiz rodam os três em todos os workspaces e são o gate manual antes
de subir uma mudança.

## `apps/api` — arquitetura em camadas

A raiz de `src/` é organizada por responsabilidade, não por feature, com uma fronteira de
dependência unidirecional garantida por teste automatizado
(`test/architecture/layer-boundaries.test.ts` — falha o build se violada):

```
domain/        regras de negócio puras, sem I/O — não importa de routes/services/db/prisma
application/   orquestra domain + Prisma para um caso de uso — não importa de routes/services
services/      integrações com o mundo externo (Discord, Google Sheets, SMTP) + persistência
routes/        adaptadores HTTP (Fastify) — parsing de request, chamada a application/services, resposta
auth/          sessão de chefe, hashing de senha, preHandler requireChief
config/        leitura de variáveis de ambiente
db/            client Prisma
http/          helpers de parsing/validação de entrada HTTP genéricos
generated/     código gerado pelo Prisma (não editar manualmente)
scripts/       scripts de operação (bootstrap de produção, etc.), não HTTP
```

`domain/` é onde mora a lógica que precisa ser correta e testável sem banco — ex.:
`domain/monitorSemana.ts` decide "quem cobre a semana A/B de um aluno" a partir só de ids em
memória; é reaproveitada tanto por `services/feedback.ts` (lançamento manual do chefe) quanto
pelo bot, evitando que as duas superfícies de entrada implementem a mesma regra duas vezes e
divirjam.

`application/` fica entre domínio e infraestrutura: recebe `PrismaClient` como argumento (nunca
importa um client global), executa consultas e aplica regras de `domain/`. Exemplo:
`application/feedback-flow/consultas.ts` (`alunosElegiveis`, `listasPermitidas`) é
transporte-agnóstico — usado hoje só pelo bot do Discord, mas não depende dele.

`services/` é a camada mais "suja" de propósito: é onde vivem as integrações reais com
Discord (`discord-bot.ts`), Google Sheets (`google-sheets.ts`, `google-oauth.ts`) e e-mail
(`email.ts`), além de `feedback.ts` (`criarFeedback`, a função central que persiste um
feedback — chamada tanto pelo bot quanto pelo lançamento manual do chefe, e que não deve ser
alterada sem entender as duas superfícies que dependem dela).

### Injeção de dependência e testabilidade

`app.ts` exporta `buildApp({ prisma, bot, sheets, emailSender })` — cada dependência externa é
injetada, nunca instanciada implicitamente dentro de uma rota. Isso é o que permite os testes de
rota (`test/routes/*.test.ts`) chamarem `buildApp({ prisma: prismaFalso, bot: botFalso })` e
usarem `app.inject(...)` sem precisar de um banco ou de um bot do Discord real — o mesmo padrão
se repete nos testes de `services/discord-bot.ts`, que constroem a classe direto
(`new DiscordBot(prismaFalso, ...)`) e chamam seus métodos internos.

Em produção, `server.ts` monta as dependências reais (Prisma real, `DiscordBot` real com token
do ambiente, etc.) e chama `buildApp`.

### O bot do Discord como parte da API, não um processo separado

`DiscordBot` (`services/discord-bot.ts`) roda no mesmo processo Node da API — não é um worker
nem uma função serverless separada. `server.ts` chama `bot.iniciar()` na subida; a classe mantém
sua própria máquina de estados de conversa em memória (`Map<discordUserId, Conversa>`, com
limpeza por TTL) e um watchdog de reconexão. Ver `docs/specs/controle-sessao-bot.md` para o
comportamento do fluxo e `docs/adr/0005-bot-discord-em-vez-de-whatsapp.md` para por que o bot é
Discord (e não mais WhatsApp).

## `apps/web` — painel

SPA em React + Vite, sem framework de roteamento de servidor (roteamento client-side em
`App.tsx`). Estrutura de `src/`:

```
pages/        uma tela por rota do painel (Gestao, Bot, DiretorioMonitores, Planilha, ...)
components/   componentes reutilizados entre páginas (modais, seletores, gráficos)
components/ui components de UI genéricos (sem conhecimento de domínio)
lib/          api.ts (client HTTP), types.ts (tipos compartilhados com o backend, mantidos
              manualmente em sincronia — não há geração automática de tipos a partir do Fastify),
              funções puras de formatação/regra de UI (format.ts, dupla.ts, monitor-risco.ts)
```

`lib/api.ts` é o único lugar que faz `fetch` contra a API — páginas e componentes não chamam a
API diretamente. Autenticação por cookie `HttpOnly` (ver `docs/seguranca.md`); o token nunca é
acessível via JavaScript no navegador.

## Como `openspec/` e as pastas de `docs/` se relacionam

Para uma mudança de comportamento, o fluxo passa primeiro por uma **Change do OpenSpec**
(`openspec/changes/<change-id>/`: proposal, spec delta em WHEN/THEN, design, tasks — ver
`openspec/config.yaml`). Ao arquivar, ela sincroniza `openspec/specs/` e alimenta os dois
documentos que o projeto já mantinha antes de adotar o OpenSpec (ver `docs/specs/README.md` para
o detalhe): **spec leve de feature** (`docs/specs/`, o que o sistema deve fazer, no formato que o
resto do projeto já consulta) → testes (red) → implementação (green/refactor) → **registro de
mudança** (`docs/changes/`, o que de fato mudou e como foi verificado, a partir de
`docs/templates/change.md`). **ADRs** (`docs/adr/`, a partir de `docs/templates/adr.md`) são
ortogonais a esse fluxo — registram uma decisão difícil de reverter (stack, integração externa,
modelo de auth) independente de quando foi implementada.

Este documento (`docs/arquitetura.md`) é diferente desses: não registra uma decisão nem uma
mudança pontual, é a fotografia atual de como o código está organizado — deve ser atualizado
quando a estrutura em si mudar (uma camada nova, uma reorganização de pastas), não a cada
feature.

## Deploy

`docker-compose.yml` é o ambiente local (Postgres). `docker-compose.production.yml` monta a
stack completa de produção: Postgres (sem porta pública), API (roda `prisma migrate deploy`
antes de subir), frontend compilado servido por Nginx, e Caddy como proxy reverso com HTTPS
automático. Imagens são compiladas localmente e publicadas no GHCR — o servidor de produção só
baixa imagens prontas, nunca compila (ver `docs/deploy.md` para o passo a passo completo).
