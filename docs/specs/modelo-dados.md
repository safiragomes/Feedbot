# Modelo de dados (schema Prisma)

Ref: `monitoria-especificacao.md` § 2 (Modelo de dados) · [ADR-0002](../adr/0002-stack-tecnologica.md) · [ADR-0003](../adr/0003-bot-whatsapp-biblioteca-nao-oficial.md)

## Comportamento esperado

O schema Prisma (`apps/api/prisma/schema.prisma`) implementa 1:1 o ERD da seção 2.1 da spec mestra: `Periodo`, `Turma`, `GrupoRevisao`, `Dupla`, `Monitor`, `Aluno`, `Lista`, `Feedback` + as três tabelas de junção de ocorrência (`FeedbackQuestaoIA`, `FeedbackQuestaoPlagio`, `FeedbackQuestaoProibicao`) e `MapeamentoPlanilhaLista`. Acrescenta dois elementos definidos no ADR-0003 (não presentes na spec mestra original): os campos `whatsappGrupoId`/`whatsappGrupoNome` em `GrupoRevisao`, e a tabela `BotSessao`.

## Regras de negócio envolvidas

- **1 monitor = 1 dupla por período** (§ 2.2) — `Monitor.duplaId` é a FK canônica. Não é reforçada por constraint de banco (um monitor pode, em tese, não ter dupla ainda — chefes sem dupla própria); é responsabilidade da camada de aplicação (Fase 1) validar a regra ao vincular monitores.
- **PCD não implica cálculo de nota** (§ 2.2) — `Aluno.isPcd` e `Aluno.qtdQuestoesMeta` são apenas informativos; nenhuma lógica de nota vive no banco.
- **Cálculo de semana A/B** (§ 2.2) — não é responsabilidade do schema. É uma função pura (`apps/api/src/domain/semana.ts`), testada isoladamente (ver task "TDD: cálculo de semana A/B"). O schema só armazena o resultado já calculado em `Feedback.semana` (snapshot no momento do registro) e o `Lista.semanaOverride` que alimenta o cálculo.
- **Cada Turma tem exatamente uma aba própria na planilha** (§ 2.2) — não modelado como constraint separada; decorre de `Turma.nomeAbaPlanilha` ser um campo simples da própria turma (não uma tabela de mapeamento turma↔aba).

## Decisões de modelagem (não explícitas na spec mestra)

1. **IDs**: `String @id @default(cuid())` em todas as entidades — mais adequado a importação em lote (§ 7, CSV de alunos) e sincronização do que autoincrement.
2. **Enums**: `MonitorStatus` (`ATIVO`/`INATIVO`), `Semana` (`A`/`B`, usado em `Lista.semanaOverride` e `Feedback.semana`), `BotSessaoStatus` (`DESCONECTADO`/`CONECTANDO`/`CONECTADO`).
3. **Dupla ↔ Monitor, duas relações distintas**: o ERD original tem `Monitor.dupla_id` (a dupla à qual o monitor pertence) e, separadamente, `Dupla.monitor_semana_a_id`/`monitor_semana_b_id` (qual monitor específico cobre cada semana). São direções diferentes do mesmo relacionamento conceitual, modeladas no Prisma como três relações nomeadas (`DuplaMonitores`, `DuplaMonitorSemanaA`, `DuplaMonitorSemanaB`). **A consistência entre elas (o monitor apontado por `monitorSemanaAId` deve ter `duplaId` igual ao da própria dupla) não é garantida pelo banco — é validação de aplicação**, a ser implementada junto do CRUD de duplas (Fase 1).
4. **`GrupoRevisao.chefeId` não é `@unique`**: a spec descreve 6 chefes para 6 grupos nesta oferta da disciplina, mas não estabelece "um monitor não pode chefiar mais de um grupo" como regra permanente do domínio — não adicionamos essa restrição além do que a spec mestra afirma.
5. **`onDelete`**: `Restrict` (padrão do Prisma) em todas as FKs, exceto as três tabelas de junção de `Feedback` (`FeedbackQuestaoIA/Plagio/Proibicao`), que são `Cascade` — são linhas compostas que só existem em função do `Feedback` pai. Exclusões em cascata de negócio (ex: excluir grupo remove duplas e alunos, como no protótipo) ficam a cargo da camada de aplicação, não do banco — evita perda de histórico de `Feedback` por acidente de FK.
6. **`BotSessao` é uma tabela singleton**: uma única linha representa o estado de conexão do bot (reflete o painel "Bot do WhatsApp" do protótipo). Mantida por `upsert` com id fixo pela aplicação, não por constraint de banco.
7. **Unicidades adicionadas**: `Monitor.whatsappNumero` (usado para roteamento do bot, § 3), `Aluno.matricula` (chave de busca na planilha, § 5.3), `MapeamentoPlanilhaLista(listaId, turmaId)` (um mapeamento por lista×turma, § 5.2), `Turma(periodoId, nome)`, `Periodo.nome`, `Lista(periodoId, nome)`, `Dupla(grupoRevisaoId, label)`, `Dupla.monitorSemanaAId`/`monitorSemanaBId` (um monitor não pode ser "semana A" de duas duplas ao mesmo tempo — consequência direta de "1 monitor = 1 dupla por período"), `GrupoRevisao.whatsappGrupoId` (um grupo do WhatsApp não pode estar ligado a mais de um grupo de revisão).

## Casos de borda

- Chefe sem dupla própria → `Monitor.duplaId` nullable (spec § 2.1 já prevê).
- Dupla recém-criada sem monitores ainda → `monitorSemanaAId`/`monitorSemanaBId` nullable (estado "vago" do protótipo).
- `Lista.semanaOverride` nulo → cálculo automático via `data_referencia_rodizio` do período.
- `MapeamentoPlanilhaLista.colunaQuestoesCorretas` nulo → ainda não resolvido por busca de header; resolvido sob demanda (Fase 3).

## Fora de escopo (nesta mudança)

- Autenticação de chefes (Fase 1).
- Qualquer lógica de leitura/escrita na planilha (Fase 3) — `MapeamentoPlanilhaLista` só guarda o cache do mapeamento.
- Persistência da sessão do Baileys em si (arquivo local, fora do banco — ver `.gitignore`); `BotSessao` só guarda o status exibido no dashboard.
