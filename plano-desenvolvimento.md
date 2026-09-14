# Feedbot — Plano de Desenvolvimento

> Baseado em `monitoria-especificacao.md`, `politica-privacidade.md` e `monitoria-prototipo.html`.

## 1. Contexto

O projeto tem hoje uma especificação técnica completa, uma política de privacidade e um protótipo estático (HTML/CSS/JS + Chart.js, sem backend, com dados mockados) dos dashboards de Alunos e Monitores, diretórios, tela de Gestão (CRUD) e simulação da conversa do bot — mas nenhum código de aplicação ainda. Este documento traduz esse material em um roteiro de fases de desenvolvimento, com entregáveis e critérios de pronto, reaproveitando ao máximo a UI já validada no protótipo.

### Decisão que ajusta a especificação: conexão do bot

O protótipo (painel "Bot do WhatsApp") mostra conexão por **QR code** e gestão de **grupos do WhatsApp** por grupo de revisão. Isso substitui a decisão original da seção 3/8 da especificação (WhatsApp Business Platform oficial via Meta Cloud API, grupos fora de escopo). Ficou definido que **o protótipo é a referência correta**:

- O bot é implementado com uma **biblioteca não-oficial multi-device** (ex.: Baileys), pareada via QR code.
- O escopo passa a **incluir** a possibilidade de adicionar o bot a grupos do WhatsApp por grupo de revisão.
- O fluxo de registro de feedback em si continua 1:1 (monitor↔bot), como já é no protótipo — a capacidade de grupo é aditiva, para avisos/acompanhamento futuro dos chefes.

Consequência: cai a justificativa de "250 conversas/24h sem verificação" e "risco de banimento de número" da seção 8 da especificação (era específica da Cloud API oficial). Em contrapartida, este plano reserva atenção aos riscos inerentes a bibliotecas não-oficiais — ver seção 6.

## 2. Arquitetura e stack

- **Backend**: Node.js + TypeScript, Fastify.
- **Banco/ORM**: PostgreSQL + Prisma, schema derivado 1:1 do modelo de dados da seção 2 da especificação.
- **Bot**: WhatsApp via biblioteca multi-device não-oficial (Baileys), pareamento por QR code, sessão persistida (auth state), suporte a chats 1:1 e a participação em grupos do WhatsApp por grupo de revisão.
- **Planilha**: Google Sheets API, resolução de coluna por busca de header (seção 5.2 da especificação) com cache (memória ou Redis) e botão manual de recarregar mapeamento.
- **Dashboard**: React + TypeScript + Vite + Chart.js, portando a UI já validada em `monitoria-prototipo.html` (paleta, layout, gráficos, heatmap, drawer, modais) para componentes reais alimentados pela API.
- **Autenticação dos chefes**: login por e-mail institucional (magic link ou senha), todos com acesso total (sem isolamento entre chefes, seção 4 da especificação).
- **Hospedagem**: backend + Postgres em Railway/Render; frontend em Vercel.
- **Estrutura de repo**: monorepo (`apps/api`, `apps/web`, `prisma/` dentro de `apps/api`), TypeScript ponta a ponta.

## 3. Fases

### Fase 0 — Fundação do projeto ✅ Concluída

- [x] Criar monorepo (`apps/api`, `apps/web`), configurar TypeScript, lint/format, scripts de dev.
- [x] Modelar o schema Prisma a partir do ERD da seção 2.1 da especificação (Período, Turma, GrupoRevisao, Dupla, Monitor, Aluno, Lista, Feedback + tabelas de junção IA/Plágio/Proibição, MapeamentoPlanilhaLista).
- [x] Adicionar aos modelos os campos necessários à decisão do bot: em `GrupoRevisao`, `whatsappGrupoId` (nullable) e `whatsappGrupoNome`; uma tabela/registro único `BotSessao` (status, número conectado, atualizado_em) para refletir o estado de conexão no dashboard.
- [x] Rodar primeira migration + seed de dados de teste (reaproveitando os geradores de dados mock do protótipo como inspiração para o seed).
- [x] **Critério de pronto**: `prisma migrate dev` roda limpo, seed popula um período de teste completo (grupos, duplas, monitores, alunos, listas).

### Fase 1 — API de Gestão (CRUD) e autenticação ✅ Concluída

- [x] Autenticação de chefes (senha), sessão, guarda de rotas — todos com acesso total (seção 4).
- [x] Endpoints CRUD para Período, Turma, GrupoRevisao, Dupla, Monitor, Aluno (incluindo importação em lote CSV e marcação de PCD/neurodivergência), Lista.
- [x] Regra de negócio "1 monitor = 1 dupla por período" validada na API.
- [x] **Critério de pronto**: todas as operações da tela "Gestão" do protótipo (criar/editar/excluir grupo, dupla, monitor, vincular aluno) funcionam via API real, com os mesmos modais/confirmações já desenhados.

### Fase 2 — Bot do WhatsApp: conexão e fluxo individual de feedback 🟡 Código implementado, pendente validação com número real

- [x] Integração com Baileys: pareamento por QR (real, no lugar do mock), reconexão automática, persistência da sessão (`apps/api/src/services/whatsapp-bot.ts`).
- [x] Resolução de monitor por `whatsapp_numero` → dupla → alunos da dupla.
- [x] Fluxo guiado por texto (seção 3, passos 1–11): lista → aluno → questões corretas → IA (+questões) → plágio (+questões +com quem) → proibição (+questões) → resumo de confirmação → gravação. (O protótipo mostra botões/listas nativos do WhatsApp; a implementação atual usa respostas por texto numerado — equivalente funcionalmente, migrar para mensagens interativas do Baileys é um ajuste futuro opcional, não bloqueante.)
- [x] Cálculo de semana A/B (fórmula da seção 2.2, respeitando `semana_override`) — reaproveita `calcularSemana` da Fase 0.
- [x] Gravação de `FEEDBACK` + tabelas relacionadas (IA/Plágio/Proibição) no banco (`apps/api/src/services/feedback.ts`, com testes de integração cobrindo as regras de validação).
- [ ] **Critério de pronto**: com um número de WhatsApp de teste, é possível parear o bot via QR e completar o fluxo inteiro de registro de feedback ponta a ponta, refletido no banco. Ainda não verificado com um número real — depende de execução manual fora deste ambiente.

### Fase 3 — Integração com Google Sheets 🟡 Código implementado, pendente validação com planilha real

- [x] Autenticação via service account do Google Sheets API (`apps/api/src/services/google-sheets.ts`).
- [x] Resolução de mapeamento por busca de header (seção 5.2): localiza bloco da lista, subcoluna "Questões corretas", persiste o mapeamento resolvido em `MapeamentoPlanilhaLista` e expõe recarga manual. (O cache é persistido no banco em vez de TTL em memória de 5–10 min — funcionalmente cobre o requisito, já que só muda quando o layout da planilha muda; ver nota no registro de progresso.)
- [x] Escrita pontual: localiza linha do aluno por matrícula (coluna B), escreve apenas `qtd_questoes_pontuadas`, nunca toca Nota/Prova/Unidade.
- [x] Marca `sincronizado_planilha` e expõe falhas de sincronização; endpoint `POST /feedbacks/:id/reprocessar-planilha` para reprocessamento manual a partir do dashboard. (Reprocessamento é manual, não uma fila automática — suficiente para o volume da disciplina; automatizar fica como melhoria futura.)
- [x] Escrita ligada ao fluxo de confirmação do bot (Fase 2, passo 10).
- [ ] **Critério de pronto**: registrar um feedback pelo bot escreve corretamente a célula certa numa planilha de teste, e uma falha simulada (aluno não encontrado) fica visível no dashboard sem quebrar o restante do fluxo. Ainda não verificado contra uma planilha real — depende de credenciais de service account fora deste ambiente.

### Fase 4 — Dashboards (Alunos e Monitores) e Diretórios 🟡 Versão funcional entregue, sem paridade visual com o protótipo

- [x] Dashboard React consumindo a API real (`apps/web/src/App.tsx`): login, seletor de período, páginas de Alunos/Monitores/Diretórios/Gestão/Bot, todas com dados reais.
- [x] Dashboard de Alunos: stat cards, gráfico de ocorrências por lista (IA/plágio/proibição), tabela de alunos.
- [x] Dashboard de Monitores: stat cards, tabela de monitores por grupo/dupla.
- [x] Diretórios de Alunos e Monitores.
- [x] Seletor de Período no topo, global.
- [ ] Ainda faltam, em relação ao protótipo: filtros (Turma/Grupo/Dupla/Lista), heatmap de questões, ranking, donuts de composição, drawers de detalhe de aluno/monitor, busca nos diretórios, tela "Grupos & duplas" com CRUD completo (hoje é somente leitura).
- [ ] **Critério de pronto**: os dois dashboards mostram dados reais do banco, com paridade visual e funcional com o protótipo (mesmos gráficos, filtros e drawers) — pendente o trabalho acima.

### Fase 5 — Bot: grupos do WhatsApp por grupo de revisão 🟡 API pronta, falta tela no dashboard

- [x] Rotas de API para adicionar/remover o bot de um grupo do WhatsApp por grupo de revisão, persistindo `whatsappGrupoId`/`whatsappGrupoNome` (`apps/api/src/routes/bot.ts`), com validação do formato do ID e de que o bot está conectado (usa `nomeDoGrupo`, que falha se não houver socket ativo).
- [ ] Tela "Grupos do WhatsApp" no dashboard React ainda não existe — a página "Bot" atual só mostra conexão e pendências de planilha, sem UI para associar grupos.
- [ ] **Critério de pronto**: o bot consegue ser adicionado a um grupo de WhatsApp de teste e o dashboard reflete o estado "adicionado".

### Fase 6 — Privacidade e segurança 🟡 Parcialmente implementada

- [x] Endpoints de acesso e exclusão (anonimização) de dados de aluno/monitor (`apps/api/src/routes/privacy.ts`), mantendo o histórico de feedback já processado. Correção de dados já é coberta pelos endpoints de gestão (Fase 1).
- [x] Bot só responde a números cadastrados em uma dupla ativa; monitor só registra feedback de alunos da própria dupla (validado em `criarFeedback` e na listagem de alunos do fluxo do bot).
- [x] Rate limit básico no `@fastify/rate-limit` (100 req/min) e segredos fora do repo (`.env` no `.gitignore`).
- [ ] Dashboards restritos a chefes autenticados — já vale para as rotas de gestão/feedback/bot, mas falta revisão específica de HTTPS em produção (depende do provedor de hospedagem, Fase 7).
- [ ] **Critério de pronto**: checklist de segurança revisado; fluxo de exclusão de dados testado manualmente.

### Fase 7 — QA, deploy e handoff

- [ ] Deploy do backend+Postgres (Railway/Render) e do frontend (Vercel); variáveis de ambiente e segredos configurados.
- [ ] Testes manuais ponta a ponta replicando o fluxo da seção 10 da especificação.
- [ ] Documentar runbook operacional cobrindo as duas pendências abertas da especificação (seção 9): quem mantém a infraestrutura/número do bot no dia a dia, e o que fazer quando a sincronização com a planilha falhar.
- [ ] **Critério de pronto**: sistema publicado, acessível pelos 6 chefes, com runbook escrito.

## 4. Riscos específicos da biblioteca não-oficial de WhatsApp (Fases 2 e 5)

- Sessão pode cair e exigir novo pareamento por QR sem aviso — o dashboard deve deixar isso visível (status "desconectado").
- Risco de banimento do número pela Meta em uso fora dos termos — não há SLA oficial; recomenda-se número dedicado, não o pessoal de nenhum chefe.
- Sem selo verde/verificação oficial — aceitável dado o uso interno da disciplina.

## 5. Verificação end-to-end sugerida

1. `pnpm --filter api prisma migrate dev && pnpm --filter api seed` — banco populado.
2. `pnpm --filter api dev` + `pnpm --filter web dev` — subir API e dashboard localmente.
3. Parear um número de teste via QR, rodar o fluxo completo do bot (Fase 2) e conferir gravação no banco.
4. Conferir escrita na planilha de teste (Fase 3) e simular uma falha de sincronização.
5. Navegar pelos dois dashboards e diretórios, comparando visualmente com `monitoria-prototipo.html`.
6. Testar exclusão de dados de um aluno/monitor de teste (Fase 6).

## 6. Registro de progresso

Ver `docs/changes/` para o detalhe de cada entrega:

- [2026-08-17 — Preparação do repositório e do ambiente](docs/changes/2026-08-17-preparacao-repositorio-e-ambiente.md)
- [2026-08-17 — Fase 0: schema Prisma completo, primeira migration e seed](docs/changes/2026-08-17-fase-0-fundacao-schema-e-seed.md)
- [2026-08-19 — Fase 1: gestão e autenticação](docs/changes/2026-08-19-fase-1-gestao-e-autenticacao.md)
- [2026-08-20 — Fases 2, 3, 5 e 6: bot de feedback, Sheets, grupos e privacidade (retomada)](docs/changes/2026-08-20-retomada-bot-sheets-privacidade.md)
