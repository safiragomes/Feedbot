# Modelo de dados (schema Prisma)

Ref: `monitoria-especificacao.md` § 2 (Modelo de dados) · [ADR-0002](../adr/0002-stack-tecnologica.md) · [ADR-0003](../adr/0003-bot-whatsapp-biblioteca-nao-oficial.md)

## Comportamento esperado

O schema Prisma (`apps/api/prisma/schema.prisma`) implementa 1:1 o ERD da seção 2.1 da spec mestra: `Periodo`, `Turma`, `GrupoRevisao`, `Dupla`, `Monitor`, `Aluno`, `Lista`, `Feedback` + as três tabelas de junção de ocorrência (`FeedbackQuestaoIA`, `FeedbackQuestaoPlagio`, `FeedbackQuestaoProibicao`), `MapeamentoPlanilhaLista` e `PrazoLista`. Acrescenta dois elementos definidos no ADR-0003 (não presentes na spec mestra original): os campos `whatsappGrupoId`/`whatsappGrupoNome` em `GrupoRevisao`, e a tabela `BotSessao`.

## Regras de negócio envolvidas

- **1 monitor = 1 dupla por período** (§ 2.2) — `Monitor.duplaId` é a FK canônica. Não é reforçada por constraint de banco (um monitor pode, em tese, não ter dupla ainda — chefes sem dupla própria); é responsabilidade da camada de aplicação (Fase 1) validar a regra ao vincular monitores, inclusive o teto de 2 monitores por dupla.
- **Semana A/B é escolhida por aluno, não pela dupla toda** — dentro de uma dupla (até 2 monitores), cada aluno tem seu próprio `Aluno.monitorSemanaAId`, que deve ser um dos (até 2) monitores da dupla do próprio aluno. O monitor da semana B nunca é armazenado: é sempre "o outro monitor da dupla", calculado em tempo de leitura (`apps/api/src/services/feedback.ts`, `apps/api/src/services/whatsapp-bot.ts`). Isso permite que, dentro da mesma dupla, um monitor seja semana A para alguns alunos e semana B para outros.
- **PCD não implica cálculo de nota** (§ 2.2) — `Aluno.isPcd` e `Aluno.qtdQuestoesMeta` são apenas informativos; nenhuma lógica de nota vive no banco.
- **Cálculo de semana A/B** (§ 2.2) — não é responsabilidade do schema. É uma função pura (`apps/api/src/domain/semana.ts`), testada isoladamente (ver task "TDD: cálculo de semana A/B"). O schema só armazena o resultado já calculado em `Feedback.semana` (snapshot no momento do registro) e o `Lista.semanaOverride` que alimenta o cálculo.
- **Cada Turma tem exatamente uma aba própria na planilha** (§ 2.2) — não modelado como constraint separada; decorre de `Turma.nomeAbaPlanilha` ser um campo simples da própria turma (não uma tabela de mapeamento turma↔aba).

## Decisões de modelagem (não explícitas na spec mestra)

1. **IDs**: `String @id @default(cuid())` em todas as entidades — mais adequado a importação em lote (§ 7, CSV de alunos) e sincronização do que autoincrement.
2. **Enums**: `MonitorStatus` (`ATIVO`/`INATIVO`), `Semana` (`A`/`B`, usado em `Lista.semanaOverride` e `Feedback.semana`), `BotSessaoStatus` (`DESCONECTADO`/`CONECTANDO`/`CONECTADO`).
3. **Dupla ↔ Monitor ↔ Aluno, duas relações distintas**: `Monitor.duplaId` fixa a dupla à qual o monitor pertence (até 2 monitores por dupla). Separadamente, `Aluno.monitorSemanaAId` escolhe, por aluno, qual dos (até 2) monitores da própria dupla é o responsável pela semana A — o outro é implicitamente o da semana B, e por isso não existe uma coluna `monitorSemanaBId`. Essa divisão foi corrigida nesta revisão: uma modelagem anterior guardava semana A/B como dois FKs independentes em `Aluno` sem vínculo com a dupla, o que permitia (incorretamente) atribuir qualquer monitor do período a qualquer aluno. **A consistência entre `Aluno.monitorSemanaAId` e `Monitor.duplaId` (o monitor escolhido precisa pertencer à mesma dupla do aluno) não é garantida pelo banco — é validação de aplicação** (`apps/api/src/routes/management.ts`).
4. **Um chefe por grupo no período**: `GrupoRevisao(periodoId, chefeId)` é único. O mesmo chefe não pode responder por dois grupos dentro de um período, mas pode voltar a chefiar um grupo em outro período.
5. **`onDelete`**: `Restrict` (padrão do Prisma) em todas as FKs, exceto as três tabelas de junção de `Feedback` (`FeedbackQuestaoIA/Plagio/Proibicao`), que são `Cascade` — são linhas compostas que só existem em função do `Feedback` pai. Exclusões em cascata de negócio (ex: excluir grupo remove duplas e alunos, como no protótipo) ficam a cargo da camada de aplicação, não do banco — evita perda de histórico de `Feedback` por acidente de FK.
6. **`BotSessao` é uma tabela singleton**: uma única linha representa o estado de conexão do bot (reflete o painel "Bot do WhatsApp" do protótipo). Mantida por `upsert` com id fixo pela aplicação, não por constraint de banco.
7. **Unicidades adicionadas**: `Monitor.whatsappNumero` (usado para roteamento do bot, § 3), `Aluno.matricula` (chave de busca na planilha, § 5.3), `MapeamentoPlanilhaLista(listaId, turmaId)` (um mapeamento por lista×turma, § 5.2), `Turma(periodoId, nome)`, `Periodo.nome`, `Lista(periodoId, nome)`, `Lista(periodoId, ordem)`, `PrazoLista(listaId, turmaId)` (um prazo por lista×turma), `Dupla(grupoRevisaoId, label)`, `GrupoRevisao.whatsappGrupoId` (um grupo do WhatsApp não pode estar ligado a mais de um grupo de revisão).
8. **`Lista.ordem` substitui `Lista.prazoEntregaFeedback` como critério de ordenação para o cálculo de semana A/B** (`posicaoDaLista` em `apps/api/src/services/feedback.ts`, `listasComSemana` em `apps/api/src/services/whatsapp-bot.ts`). O prazo deixou de ser um valor único por lista — cada turma pode ter um prazo diferente para a mesma lista (`PrazoLista`) — então não pode mais servir de critério de ordenação turma-independente. `ordem` é definida na criação da lista (sempre 6 por período, criadas automaticamente) e nunca é editável depois: `Feedback.semana` é um snapshot gravado no momento do registro, não recalculado, então mudar `ordem` depois corromperia silenciosamente a semana A/B de feedbacks já registrados sem re-avaliá-los. O prazo em si foi modelado como tabela de junção (`PrazoLista`) em vez de campo em `Turma` ou `Lista`, já que é inerentemente um valor por par (lista, turma), não pertencendo a nenhuma das duas entidades isoladamente.

## Casos de borda

- Chefe sem dupla própria → `Monitor.duplaId` nullable (spec § 2.1 já prevê).
- Dupla recém-criada sem monitores, ou aluno ainda sem escolha de semana A → `Monitor.duplaId`/`Aluno.monitorSemanaAId` nullable (estado "vago" do protótipo); nesse caso a semana B também fica indefinida, já que depende de A estar resolvida.
- `Lista.semanaOverride` nulo → cálculo automático via `data_referencia_rodizio` do período.
- `PrazoLista` sem linha para um par (lista, turma) → prazo ainda não configurado; tratado como `null` pela aplicação (o dashboard exclui esses feedbacks das estatísticas de atraso em vez de contá-los como atrasados).
- `MapeamentoPlanilhaLista.colunaQuestoesCorretas` nulo → ainda não resolvido por busca de header; resolvido sob demanda (Fase 3).

## Fora de escopo (nesta mudança)

- Autenticação de chefes (Fase 1).
- Qualquer lógica de leitura/escrita na planilha (Fase 3) — `MapeamentoPlanilhaLista` só guarda o cache do mapeamento.
- Persistência da sessão do Baileys em si (arquivo local, fora do banco — ver `.gitignore`); `BotSessao` só guarda o status exibido no dashboard.
