# Auditoria de segurança, bugs e arquitetura — plano de correção

Data: 2026-08-30

Status: **executado em 2026-08-30**. O resultado está documentado em
`docs/changes/2026-08-30-auditoria-seguranca-arquitetura.md`. Este
documento existe para que outro executor (ex.: Codex) implemente as correções sem precisar
refazer a investigação. Cada achado abaixo já foi verificado lendo o código real — não é
especulação. Depois de aplicado, resuma o que foi feito num novo arquivo em `docs/changes/`
seguindo `docs/templates/change.md` (este aqui não deve virar changelog retroativo).

## Como usar este documento

1. Leia a seção "Achados" inteira antes de começar — alguns itens se relacionam (ex.: a Fase A
   de proteção contra perda de dados é implementada _dentro_ da extração de serviço da Fase D).
2. Execute na ordem das fases (A → E). Rode `pnpm -r typecheck && pnpm -r test` depois de
   **cada fase**, não só no final — mudanças em autenticação e em rotas de exclusão precisam de
   detecção precoce de regressão.
3. Existe um teste de fronteiras arquiteturais em
   `apps/api/test/architecture/layer-boundaries.test.ts` (ver `docs/adr/0004-arquitetura-em-camadas-e-seguranca.md`)
   que barra `domain/` dependendo de infraestrutura e `application/` dependendo de
   rotas/serviços. As extrações da Fase D devem manter esse teste passando.
4. Este projeto já passou por uma auditoria anterior
   (`docs/changes/2026-08-29-auditoria-arquitetura-seguranca.md`) que já corrigiu: hash de
   sessão em SHA-256, CORS restrito, CSP/HSTS, timing de enumeração no **login** (via
   `DUMMY_PASSWORD_HASH`), logs redigidos em produção, e documentou como decisão consciente
   que chefes têm acesso global (não escopado por período). **Não reabra esses itens** — os
   achados abaixo são coisas que aquela auditoria não cobriu.

## Contexto do projeto

Monorepo pnpm: `apps/api` (Fastify + Prisma + PostgreSQL, camadas `routes/ → application/ →
services//db/`, `domain/` puro — ver ADR-0004) e `apps/web` (React 19 + Vite + TypeScript,
CSS puro com variáveis + Tailwind v4 como infraestrutura, sem framework de componentes além
de alguns primitivos estilo shadcn em `components/ui/`). Autenticação é 100% por cookie de
sessão (`HttpOnly`, `SameSite=Strict`, `Secure` em produção); não há token em `localStorage`
nem em querystring.

---

## Achados (por severidade)

### 🔴 Alto — exclusões apagam histórico acadêmico sem aviso

`apps/api/src/routes/management.ts` e `apps/api/src/routes/management/alunos.ts` expõem
`DELETE` para grupo de revisão, dupla, monitor e aluno. No `prisma/schema.prisma`, o modelo
`Feedback` tem `onDelete: Cascade` nas relações com `aluno`, `monitor` e `dupla`. Isso
significa que apagar qualquer um desses registros **apaga em cascata todo o histórico de
feedback** (notas, ocorrências de uso de IA/plágio/proibição) sem qualquer checagem ou aviso.

Rotas afetadas (já lidas, código atual):

```ts
// apps/api/src/routes/management.ts:173-183
app.delete("/grupos-revisao/:id", protectedRoute, async (request, reply) => {
  const { id } = request.params as IdParams;
  await prisma.$transaction([
    prisma.aluno.updateMany({
      where: { dupla: { grupoRevisaoId: id } },
      data: { monitorSemanaAId: null },
    }),
    prisma.grupoRevisao.delete({ where: { id } }),
  ]);
  return reply.code(204).send();
});

// apps/api/src/routes/management.ts:211-218
app.delete("/duplas/:id", protectedRoute, async (request, reply) => {
  const { id } = request.params as IdParams;
  await prisma.$transaction([
    prisma.aluno.updateMany({ where: { duplaId: id }, data: { monitorSemanaAId: null } }),
    prisma.dupla.delete({ where: { id } }),
  ]);
  return reply.code(204).send();
});

// apps/api/src/routes/management.ts:334-337
app.delete("/monitores/:id", protectedRoute, async (request, reply) => {
  await prisma.monitor.delete({ where: request.params as IdParams });
  return reply.code(204).send();
});

// apps/api/src/routes/management/alunos.ts:140-143
app.delete("/alunos/:id", protectedRoute, async (request, reply) => {
  await prisma.aluno.delete({ where: request.params as IdParams });
  return reply.code(204).send();
});
```

Isso contradiz `apps/api/src/routes/privacy.ts`, que já existe especificamente para remover
dados de um aluno **sem** destruir o histórico de feedback (anonimização em vez de exclusão
física). Ou seja, o próprio projeto já reconhece que apagar feedback é indesejável — só não
aplicou essa regra nas rotas de gestão.

**Cenário de falha real**: um chefe reorganiza os grupos de revisão no meio do período
(comum — grupos e duplas mudam com frequência) e, ao excluir um grupo antigo para recriar a
estrutura, perde silenciosamente todas as notas e ocorrências de plágio/IA já lançadas para
todos os alunos daquele grupo, sem confirmação nem possibilidade de desfazer.

**Correção** (ver Fase A/D): antes de cada exclusão, contar feedback vinculado
(`prisma.feedback.count(...)` pela FK correspondente — `duplaId`, ou via join para
grupo/monitor) e, se houver, responder `409` (`reply.conflict(...)`, já usado em outras
rotas do mesmo arquivo, ex. `management.ts:146`) em vez de deixar o cascade seguir.

### 🟠 Médio — enumeração de conta por tempo de resposta na recuperação de senha

`apps/api/src/application/auth/senhas-service.ts:33-64`:

```ts
export async function solicitarRecuperacaoSenha(
  prisma: PrismaClient,
  emailSender: EmailSender,
  entrada: { email: string; appUrl: URL },
) {
  const conta = await prisma.contaChefe.findUnique({
    where: { email: entrada.email },
    include: { monitor: true },
  });
  if (!conta || !conta.monitor.isChefe || conta.monitor.status !== "ATIVO")
    return "IGNORADA" as const;              // <- caminho "não existe": retorna já
  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  const expiraEm = new Date(Date.now() + 60 * 60 * 1_000);
  await prisma.$transaction([...]);
  const link = new URL(entrada.appUrl);
  link.hash = new URLSearchParams({ recuperacao: token }).toString();
  try {
    await emailSender.enviarRecuperacao({ ... });   // <- caminho "existe": aguarda SMTP real
    return "ENVIADA" as const;
  } catch {
    await prisma.recuperacaoSenha.deleteMany({ where: { tokenHash } });
    throw new SenhaErro("ENVIO_FALHOU");
  }
}
```

A rota `POST /auth/senha/solicitar-recuperacao` (`apps/api/src/routes/auth.ts:192-219`)
sempre responde `204` independente do resultado — o **conteúdo** da resposta já não vaza
nada. Mas quando a conta existe, a função aguarda um round-trip SMTP real (tipicamente
centenas de ms) antes de responder; quando não existe, retorna quase instantaneamente. Um
atacante consegue then enumerar contas de chefe cadastradas medindo a latência da resposta,
mesmo com o corpo da resposta idêntico. (Já existe rate limit de 5 req/15min nessa rota —
reduz o volume de tentativas, não fecha o canal lateral.)

**Correção** (Fase B.1): não aguardar o envio do e-mail antes de responder — disparar
(`void emailSender.enviarRecuperacao(...).catch(...)`) e tratar sucesso/erro de forma
assíncrona (log + limpeza do token em caso de falha), fazendo os dois caminhos (conta existe
/ não existe) retornarem em tempo comparável. Como a função hoje só resolve
`ENVIO_FALHOU`/loga de forma síncrona, será preciso passar um logger (ex.: `request.log`) como
parâmetro, já que a chamada muda de padrão.

### 🟡 Baixo — parâmetros de custo do scrypt

`apps/api/src/auth/password.ts:1-30`:

```ts
const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
export const DUMMY_PASSWORD_HASH = `scrypt$feedbot-dummy-salt$${scryptSync(
  "senha-inexistente",
  "feedbot-dummy-salt",
  KEY_LENGTH,
).toString("hex")}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, keyHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

Usa os parâmetros padrão do Node (`N=16384, r=8, p=1`) — abaixo da recomendação atual da
OWASP para hashing de senha interativo, e o formato armazenado não guarda os parâmetros de
custo usados, então qualquer reforço tem que manter compatibilidade retroativa.

**Correção** (Fase B.2, cuidado — mexe em autenticação): mudar o formato do hash para
incluir os parâmetros de custo, ex. `scrypt$N$r$p$salt$hash`, com `N` maior (ex. `32768`,
lembrando de passar `{ maxmem: ... }` no `scrypt()` porque memória necessária =
`128 * N * r` bytes — `32768 * 8 * 128 ≈ 33.5MB`, que já estoura o `maxmem` padrão de 32MB do
Node, então é obrigatório passar `maxmem` explícito). `verifyPassword` precisa continuar
aceitando o formato antigo de 3 campos (`scrypt$salt$hash`, assumindo os parâmetros padrão
antigos) para não invalidar senhas já cadastradas — só hashes **novos** (login bem-sucedido
com troca de senha, cadastro, recuperação) passam a usar o formato reforçado. Não é
necessário migrar hashes existentes ativamente; a troca é oportunista.

### 🟡 Baixo — `TRUST_PROXY` sem aviso em runtime

`apps/api/src/config/runtime.ts:32-36` já documenta em comentário que `TRUST_PROXY=true` só
é seguro atrás de um proxy reverso confiável (senão dá pra falsificar `X-Forwarded-For` e
furar o rate limit por IP), mas não há nenhum aviso em tempo de execução. **Correção** (Fase
B.3): logar um `app.log.warn(...)` no boot quando `TRUST_PROXY=true`, lembrando o operador.

### 🟡 Baixo — logging fora do padrão no bot do WhatsApp

`apps/api/src/services/whatsapp-bot.ts` usa `console.log`/`console.error` diretamente
(linhas ~156, 168, 190, 198, 238, 458) em vez do logger estruturado do Fastify, que já redige
`authorization`/`cookie`/`set-cookie` em produção (`apps/api/src/app.ts:32-37`). Isso é
inconsistente com o resto do código e não se beneficia da redação automática caso algum dia
um payload sensível seja logado ali.

**Correção** (Fase B.4): `WhatsAppBot` já recebe dependências via construtor (`emailSender`,
`sheets`) — adicionar um parâmetro `logger` (tipo `{ info; warn; error }`, default
`console` para não quebrar os testes existentes) e trocar as chamadas diretas por
`this.logger.error(...)` etc. Em `server.ts`, instanciar passando `app.log`.

### 🟡 Baixo — bootstrap do primeiro chefe duplicado

`apps/api/src/scripts/bootstrap-producao.ts` reimplementa a mesma lógica de criação do
primeiro chefe que já existe em `POST /auth/bootstrap`
(`apps/api/src/routes/auth.ts`, em torno da linha 77, que usa `reply.conflict("A
inicialização já foi concluída")` com lock consultivo). Dois caminhos independentes para a
mesma operação sensível (criar a primeira conta admin) divergem com o tempo.

**Correção** (Fase B.5): extrair a lógica comum (validação de e-mail/senha/whatsapp, lock
consultivo, criação transacional) para uma função em `application/auth/` e fazer tanto a
rota quanto o script chamarem essa função.

### 🟡 Baixo (frontend) — elemento interativo aninhado em `FilterSelect`

`apps/web/src/components/FilterSelect.tsx` (componente criado na sessão de redesign
anterior). O botão de limpar filtro é renderizado assim:

```tsx
<button type="button" className="filter-select-trigger" onClick={...} ...>
  <span>{selected ? selected.label : placeholder}</span>
  {value ? (
    <span role="button" tabIndex={0} className="filter-select-clear" onClick={(event) => {
      event.stopPropagation();
      onChange("");
    }}>
      <IconX />
    </span>
  ) : (
    <IconChevronDown />
  )}
</button>
```

Um `<span role="button">` **dentro** de um `<button>` real é HTML inválido (elementos
interativos não podem ser aninhados) e, na prática, inacessível por teclado: navegadores não
sintetizam clique a partir de Enter/Espaço num elemento não-nativo dentro de um botão pai que
já captura o foco/clique.

**Correção** (Fase C.1): reestruturar para o botão "abrir" e o botão "limpar" serem
**irmãos**, não pai/filho — ex.: envolver os dois num `<div className="filter-select-trigger">`
(não mais um `<button>`), com um `<button>` interno para abrir o combobox (ocupando a maior
parte da largura) e um `<button className="filter-select-clear">` real e separado para
limpar. Ajustar o CSS em `apps/web/src/index.css` (`.filter-select-trigger`,
`.filter-select-clear`) para o novo aninhamento continuar parecendo um único pill visualmente.

### 🟡 Baixo (frontend) — paginação reseta com frequência desnecessária

`apps/web/src/components/DataTable.tsx`:

```tsx
useEffect(() => {
  setPage(0);
}, [rows]);
```

Como os callers tipicamente passam um array recém-filtrado/derivado a cada render (ex.
`alunos.filter(...)` inline nos componentes de página), a referência de `rows` muda em
qualquer re-render do componente pai, não só quando o conteúdo realmente muda — isso pode
voltar a paginação pra página 1 mais vezes do que deveria (ex. o usuário clica "Próxima" e
algo não relacionado no componente pai força um novo array com o mesmo conteúdo).

**Correção** (Fase C.2): resetar a página só quando ela ficar fora do intervalo válido:

```tsx
useEffect(() => {
  setPage((atual) => (atual * pageSize >= rows.length ? 0 : atual));
}, [rows.length, pageSize]);
```

### 🟡 Baixo (frontend) — PII em `localStorage`

`apps/web/src/App.tsx` guarda `{id, nome, email}` do chefe logado (`feedbot-chefe`) em
`localStorage` via `localStorage.setItem("feedbot-chefe", JSON.stringify(newChefe))`. Não é
credencial (a sessão real é o cookie `HttpOnly`), mas é um dado de sessão que sobrevive ao
fechar o navegador sem necessidade, legível por qualquer script na mesma origem.

**Correção** (Fase C.3): trocar `localStorage` por `sessionStorage` para a chave
`feedbot-chefe` (mantém `feedbot-theme` em `localStorage`, já que preferência de tema não é
sensível e faz sentido persistir entre sessões).

### Confirmado sem problema (não mexer)

- Sem XSS: nenhum `dangerouslySetInnerHTML`/`.innerHTML`/`eval` em todo `apps/web/src`.
- Sem SQL/command injection: nenhum `$queryRaw`/`$executeRaw` com input interpolado; sem
  `child_process` em nenhum lugar do backend.
- CORS restrito por allowlist exata (`apps/api/src/app.ts:54-58`), sem reflexão de origem.
- Erros 500 já mascarados para o cliente (`apps/api/src/app.ts:76-102`) — só 4xx
  intencionais (`reply.badRequest`/`conflict`/etc.) chegam com mensagem detalhada ao
  frontend, então o toast de erro no `apps/web/src/lib/api.ts` não é um vetor de vazamento
  na prática.
- Autorização (`requireChief` + checagem de período/dupla/monitor) consistente em todas as
  rotas revisadas — nenhum IDOR encontrado.
- Bot do WhatsApp: mensagens de grupo (`@g.us`) são ignoradas; feedback só é aceito do
  monitor que de fato ocupa o slot da semana A/B daquele aluno (revalidado em
  `services/feedback.ts`), então engenharia social na conversa não basta para forjar
  feedback em nome de outro monitor.

---

## Plano de execução

### Fase A — Bloquear exclusões que apagam histórico (prioridade máxima)

Implementar como parte da Fase D (as funções de exclusão vão morar no novo
`application/gestao/`): antes de `delete`, contar `Feedback` vinculado e responder
`reply.conflict(...)` se houver. Ordem sugerida de checagem por rota:

- `DELETE /grupos-revisao/:id` → `prisma.feedback.count({ where: { dupla: { grupoRevisaoId: id } } })`
- `DELETE /duplas/:id` → `prisma.feedback.count({ where: { duplaId: id } })`
- `DELETE /monitores/:id` → `prisma.feedback.count({ where: { monitorId: id } })`
- `DELETE /alunos/:id` → `prisma.feedback.count({ where: { alunoId: id } })` (e apontar na
  mensagem de erro para o fluxo de anonimização em `routes/privacy.ts` como alternativa)

Mensagem sugerida: `reply.conflict("Existem feedbacks registrados para este <recurso>; não é possível excluir.")`.

### Fase B — Segurança (média/baixa)

Ordem: B.1 (timing) → B.2 (scrypt, com cuidado extra de compatibilidade) → B.3 (aviso
TRUST_PROXY) → B.4 (logger do bot) → B.5 (consolidar bootstrap). Detalhes de cada um na
seção "Achados" acima.

### Fase C — Frontend: bugs e robustez

C.1 (FilterSelect a11y) → C.2 (DataTable paginação) → C.3 (localStorage → sessionStorage).
Detalhes na seção "Achados" acima.

### Fase D — Arquitetura do backend

1. Criar `apps/api/src/application/gestao/` (nome de arquivo por recurso, ex.
   `grupos-service.ts`, `duplas-service.ts`, `monitores-service.ts`, `periodos-service.ts` —
   ou um único `gestao-service.ts` se a divisão natural sair pequena) seguindo o padrão já
   estabelecido em `apps/api/src/application/alunos/alunos-service.ts`.
2. Mover para lá: a função `validateMonitorDupla` (hoje inline em `management.ts:20-38`) e a
   orquestração de `POST /periodos`, `PATCH /monitores/:id`, `PUT /prazos-lista` (hoje com
   loops e transações Prisma multi-etapa direto no handler). As rotas em `management.ts`
   passam a só fazer parsing de input + chamar o serviço + traduzir o resultado em resposta
   HTTP, no mesmo estilo de `management/alunos.ts`.
3. As checagens de cascade da Fase A entram nas novas funções de exclusão desse serviço.
4. Unificar o tipo `IdParams` (hoje duplicado idêntico em `management.ts:16` e
   `management/alunos.ts:17`) num único lugar (ex. `apps/api/src/http/params.ts` ou dentro
   de `http/input.ts`, que já existe) e importar dos dois arquivos de rota.
5. Mover o reset de sessão do bot feito hoje direto em `server.ts:13-16`
   (`prisma.botSessao.updateMany(...)`) para dentro de `WhatsAppBot` — por exemplo um método
   `WhatsAppBot.iniciar()` chamado no boot, para que lógica de domínio do bot não fique no
   entrypoint do processo.
6. Rodar `apps/api/test/architecture/layer-boundaries.test.ts` depois de cada extração para
   confirmar que a direção de dependência (`domain` → nada, `application` → `domain`,
   `services/routes` → `application`) continua correta.

### Fase E — Arquitetura do frontend

1. Extrair os modais definidos hoje dentro de `apps/web/src/pages/Gestao.tsx` (1013 linhas):
   `NovoGrupoModal`, `NovaDuplaModal`, `VincularAlunoModal`, `AtribuirMonitorModal` — cada um
   para seu próprio arquivo em `apps/web/src/components/gestao/`. `MembroSlot` (menor,
   não é modal) pode ir junto ou ficar em `Gestao.tsx`, a critério de quem implementar.
   `Gestao.tsx` passa a só importar e orquestrar. Nenhum desses componentes é usado fora de
   `Gestao.tsx` hoje, então a mudança é de baixo risco (não precisa tocar em outros arquivos
   além dos novos + `Gestao.tsx`).
2. Separar `apps/web/src/pages/Diretorios.tsx` (586 linhas, duas páginas não relacionadas no
   mesmo arquivo) em `DiretorioAlunos.tsx` e `DiretorioMonitores.tsx`. Ajustar o import em
   `apps/web/src/App.tsx` (hoje `import { DiretorioAlunos, DiretorioMonitores } from
"./pages/Diretorios"`) para os dois novos caminhos.
3. Mover o tipo `ConfirmRequest` de `apps/web/src/components/ui.tsx` para
   `apps/web/src/lib/types.ts` — hoje `apps/web/src/lib/acoes.ts:2` importa esse tipo de
   `components/ui`, uma inversão (lib de ações dependendo de componente de apresentação).
   `ui.tsx` passa a importar `ConfirmRequest` de `lib/types.ts` em vez de declará-lo.
4. Remover duplicações:
   - `initialsOf` (definida localmente em `Gestao.tsx:369-377`) faz a mesma coisa que
     `initials()` em `apps/web/src/lib/format.ts:11-19` (já usada por `Sidebar.tsx` e
     `ui.tsx`) — apagar a versão local e importar a compartilhada.
   - `apps/web/src/pages/AlunosDashboard.tsx:358,366,374` calcula `Math.round((x/total)*100)`
     manualmente em vez de usar `pct()` (`lib/format.ts:27-29`, que já trata divisão por
     zero) — trocar pelas chamadas a `pct()` e remover o workaround manual
     `const total = filtrados.length || 1` (linha 60) se `pct()` já cobrir o caso.
   - `apps/web/src/pages/Diretorios.tsx:41` e `apps/web/src/pages/AlunosDashboard.tsx:29`
     têm a mesma linha (`[...new Set(alunos.map((a) => a.turma.nome))].sort((a, b) =>
a.localeCompare(b))`) para montar a lista de turmas do filtro — extrair para um util em
     `lib/format.ts` (ex. `turmasUnicas(alunos)`) e usar nos dois lugares.
5. **Menor prioridade, só se sobrar tempo** — puramente cosmético, sem valor funcional:
   reorganizar `apps/web/src/components/ui.tsx` (arquivo único com `Avatar`, `Chip`,
   `StatCard`, `Panel`, `Modal`, `Drawer`, `DrawerCloseButton`, `MiniRow`, `EmptyState`,
   `ConfirmModal`) em arquivos individuais dentro de `apps/web/src/components/ui/` (que já
   existe e hoje só tem `sonner.tsx` e `skeleton.tsx`), com um `apps/web/src/components/ui/index.ts`
   que reexporta tudo — assim nenhum dos ~10 arquivos que hoje fazem `import { Avatar, Chip,
... } from "../components/ui"` precisa mudar.

## Como verificar

- `pnpm -r typecheck` e `pnpm -r test` — rodar depois de cada fase, não só no final.
- `apps/api/test/architecture/layer-boundaries.test.ts` continua passando depois da Fase D.
- Manual (logado no app): tentar excluir um grupo/dupla/monitor/aluno que tenha feedback
  vinculado → deve bloquear com mensagem clara; excluir um sem feedback vinculado → deve
  continuar funcionando normalmente.
- Login e recuperação de senha continuam funcionando, incluindo login com uma senha
  hasheada no formato antigo do scrypt (valida a compatibilidade retroativa da Fase B.2).
- No combobox de filtro (`FilterSelect`), navegar por Tab até o botão de limpar e ativá-lo
  com Enter/Espaço. Na tabela (`DataTable`), trocar de filtro/página e confirmar que a
  paginação não volta pra página 1 sem necessidade.
