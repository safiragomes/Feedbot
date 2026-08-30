# Proteção do histórico e reforço das camadas da aplicação

Data: 2026-08-30

## O que mudou

As exclusões de grupos, duplas, monitores e alunos agora são recusadas quando apagariam
feedback acadêmico. A gestão do backend foi extraída dos handlers HTTP para serviços de
aplicação e a inicialização do bot foi encapsulada no próprio serviço.

A recuperação de senha passou a responder sem aguardar o SMTP, evitando enumeração de
contas por latência. Novas senhas usam scrypt com custo maior e parâmetros gravados no hash,
mantendo leitura do formato legado. Também foram adicionados aviso operacional para
`TRUST_PROXY`, logs estruturados no bot e um serviço transacional único para o bootstrap do
primeiro chefe.

No frontend, o seletor pesquisável passou a usar botões irmãos acessíveis, a paginação só é
reajustada quando a página deixa de existir e os dados do chefe passaram de `localStorage`
para `sessionStorage`. As páginas de alunos e monitores e os quatro modais de gestão foram
separados em módulos próprios; tipos e formatadores compartilhados deixaram de depender de
componentes de apresentação.

## Por quê

Executa o plano verificado em
`docs/change/2026-08-30-auditoria-seguranca-arquitetura-plano.md` e mantém a direção de
dependências definida em `docs/adr/0004-arquitetura-em-camadas-e-seguranca.md`.

## Escopo / arquivos principais

- `apps/api/src/application/gestao/` e `application/auth/bootstrap-service.ts`
- `apps/api/src/routes/management.ts`, `routes/auth.ts` e `auth/password.ts`
- `apps/api/src/services/whatsapp-bot.ts` e `server.ts`
- `apps/web/src/components/gestao/`, `FilterSelect.tsx` e `DataTable.tsx`
- `apps/web/src/pages/DiretorioAlunos.tsx`, `DiretorioMonitores.tsx` e `Gestao.tsx`
- testes de segurança e de exclusões da API

## Como foi verificado

- `pnpm -r typecheck`
- `pnpm -r test` — 28 arquivos/121 testes da API e 7 arquivos/14 testes do frontend
- `pnpm exec eslint apps/api apps/web` — sem erros; restaram três avisos preexistentes
- `git diff --check`
- teste de fronteiras arquiteturais incluído na suíte da API

## Addendum — verificação de deploy e dois bugs ao vivo (mesmo dia)

Ao preparar o deploy, três problemas adicionais foram encontrados e corrigidos:

- **Bot preso após número banido**: `WhatsAppBot.desvincular()` tentava apagar a pasta
  inteira de credenciais (`rm` recursivo); em produção essa pasta é a raiz de um volume
  Docker, e o Linux nunca deixa remover o próprio ponto de montagem (`EBUSY`), abortando a
  limpeza sem apagar nem `creds.json` — o número banido nunca saía. Corrigido para apagar o
  conteúdo arquivo por arquivo, sem tocar no diretório. Reproduzido e confirmado nos logs do
  container antes da correção.
- **Nenhum período podia ser excluído**: turmas e listas são criadas automaticamente para
  todo período, então a regra de exclusão (que bloqueava por turma/lista/grupo/monitor)
  tornava qualquer período — mesmo vazio — inexcluível na prática. A regra agora só
  considera alunos, monitores e grupos reais; `Turma`, `Lista` e `MapeamentoPlanilhaLista`
  passam a ter `onDelete: Cascade` a partir do período (nova migration
  `20260830230416_turma_lista_cascade_periodo`), com `Aluno.turma` e `Feedback.lista`
  continuando `Restrict` como rede de segurança.
- **Build da API não reproduzível**: `apps/api/src/generated` (Prisma Client) fica fora do
  git; o Dockerfile copiava o schema só depois do `pnpm install`, então nada gerava o client
  de fato — o build só funcionava por sobrar um `generated/` de uma execução local anterior
  no mesmo contexto. Confirmado com `docker compose build --no-cache`; corrigido com um
  passo explícito de `prisma generate` após copiar `apps/api`.

Verificação adicional:

- `docker compose build --no-cache api` e `docker build --no-cache -f apps/web/Dockerfile .`
  — ambos reproduzíveis do zero, sem depender de estado local.
- Container reiniciado e saudável, `prisma migrate deploy` aplicou as migrations sem
  pendências.
- `pnpm audit --prod` — nenhuma vulnerabilidade conhecida.
- `pnpm -r typecheck`, `pnpm -r test` (125 testes API / 14 web) e `pnpm -r build` — todos
  passando após as correções.
- `pnpm lint` — precisou excluir do `eslint.config.js` os diretórios de skills baixados na
  raiz do repo (não são código do app); depois disso, zero erros, só os três avisos
  preexistentes já conhecidos.
- Testado manualmente pelo painel: exclusão de grupo/dupla/monitor/período com e sem dados
  vinculados, e o fluxo de desvincular/reconectar o bot.
