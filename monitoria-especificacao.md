# Feedbot — Especificação Técnica

> Nome do projeto: **Feedbot**. O bot que coleta, direto do monitor, o feedback de cada correção — e cuida do resto.

## 1. Contexto e problema

Uma disciplina de programação tem 6 chefes de monitoria, cada um supervisionando um **grupo de revisão**. Cada grupo é dividido em **duplas de monitores** (2 monitores por dupla), que se revezam em semanas A/B para dar feedback a um conjunto fixo de alunos.

Hoje o processo é manual: o monitor corrige a lista na plataforma da disciplina, verifica plágio/uso de IA/uso de proibições, e depois **precisa preencher manualmente uma planilha** com a quantidade de questões corretas. Isso é frequentemente esquecido, sobrecarregando os chefes.

**Objetivo do sistema**: um bot de Discord para os monitores registrarem o resultado da correção (o que já escreve automaticamente na planilha oficial), e um dashboard para os chefes acompanharem alunos e monitores.

**Fora de escopo**: cálculo de nota. A planilha oficial dos professores já calcula a nota a partir da quantidade de questões corretas — o sistema só precisa escrever esse número na célula certa.

---

## 2. Modelo de dados

### 2.1 Entidades principais

```
PERIODO
├── id (PK)
├── nome                     -- ex: "2026.2"
├── data_inicio
├── data_fim
├── data_referencia_rodizio  -- data-base (uma segunda-feira) para calcular semana A/B
└── ativo (bool)

TURMA
├── id (PK)
├── periodo_id (FK → PERIODO)
├── nome                     -- ex: "CC/IA", "EC", "SI" (agrupamento de curso, não sala física)
└── nome_aba_planilha        -- nome exato da aba correspondente na planilha da turma

GRUPO_REVISAO
├── id (PK)
├── periodo_id (FK → PERIODO)
├── chefe_id (FK → MONITOR, monitor com is_chefe = true)
└── nome                     -- ex: "Grupo Bruno"

DUPLA
├── id (PK)
├── grupo_revisao_id (FK → GRUPO_REVISAO)
├── monitor_semana_a_id (FK → MONITOR)
├── monitor_semana_b_id (FK → MONITOR)
└── label                    -- ex: "Dupla 1"

MONITOR
├── id (PK)
├── nome
├── discord_user_id (UNIQUE)  -- identificador usado pelo bot (vinculado manualmente pela chefe)
├── is_chefe (bool)
├── dupla_id (FK → DUPLA, nullable — chefes podem não ter dupla própria)
├── periodo_id (FK → PERIODO)
└── status                    -- ativo | inativo

ALUNO
├── id (PK)
├── nome
├── matricula (UNIQUE)        -- chave usada para localizar a linha na planilha
├── turma_id (FK → TURMA)
├── dupla_id (FK → DUPLA)
├── is_pcd (bool)
└── qtd_questoes_meta         -- nullable; uso informativo no dashboard (NÃO usado para calcular nota)

LISTA                        -- sempre 6 por período, criadas automaticamente ao cadastrar o período
├── id (PK)
├── periodo_id (FK → PERIODO)
├── nome                      -- ex: "Lista 1"
├── qtd_questoes_total
├── ordem                     -- 1..6, único por período; define a semana A/B (não muda depois de criada)
└── semana_override           -- nullable: 'A' | 'B' | null (null = calcula automático)

PRAZO_LISTA                   -- prazo de entrega de feedback é por turma, não global da lista
├── id (PK)
├── lista_id (FK → LISTA)
├── turma_id (FK → TURMA)
└── prazo_entrega_feedback    -- linha só existe depois que o chefe configura o prazo daquela turma

FEEDBACK                      -- criado a cada registro feito pelo monitor no bot
├── id (PK)
├── aluno_id (FK → ALUNO)
├── monitor_id (FK → MONITOR)
├── lista_id (FK → LISTA)
├── dupla_id (FK → DUPLA, snapshot no momento do registro)
├── semana                    -- 'A' | 'B', calculada no momento do preenchimento
├── qtd_questoes_pontuadas
├── usou_ia (bool)
├── plagiou (bool)
├── usou_proibicao (bool)
├── criado_em (timestamp)     -- usado para checar atraso vs. PRAZO_LISTA(lista_id, aluno.turma_id)
├── sincronizado_planilha (bool)
└── atualizado_em

FEEDBACK_QUESTAO_IA
├── feedback_id (FK → FEEDBACK)
└── numero_questao

FEEDBACK_QUESTAO_PLAGIO
├── feedback_id (FK → FEEDBACK)
├── numero_questao
└── aluno_envolvido_id (FK → ALUNO)   -- "plagiou com quem"

FEEDBACK_QUESTAO_PROIBICAO
├── feedback_id (FK → FEEDBACK)
└── numero_questao

MAPEAMENTO_PLANILHA_LISTA     -- resolve onde escrever na planilha (ver seção 5)
├── id (PK)
├── lista_id (FK → LISTA)
├── turma_id (FK → TURMA)
├── coluna_questoes_corretas  -- resolvida dinamicamente por busca de header (cache)
└── atualizado_em
```

### 2.2 Regras de negócio importantes

- **1 monitor = 1 dupla por período.** Simplifica o roteamento do bot: a conta do Discord resolve diretamente a dupla, sem precisar perguntar.
- **1 chefe = 1 grupo por período.** Um chefe não pode responder por dois grupos de revisão no mesmo período.
- **PCD/ND usa equivalência proporcional no envio.** O Feedbot guarda os acertos reais, mas envia
  à planilha `min(total, acertos / 0,75)` para alunos marcados manualmente com condição especial.
  A planilha continua responsável por calcular a nota final.
- **Cálculo de semana A/B**:
  ```
  semana = lista.semana_override
           OR (FLOOR(DATEDIFF(hoje, periodo.data_referencia_rodizio) / 7) % 2 == 0 ? 'A' : 'B')
  ```
  `semana_override` permite ajuste manual por lista (ex: feriado, semana de prova) sem quebrar o cálculo automático das demais.
- **Cada Turma tem exatamente uma aba própria na planilha** (não há aba compartilhada entre turmas).
- **Todo período tem sempre exatamente 6 listas**, criadas automaticamente ao cadastrar o período. A lista em si (nome, quantidade de questões, ordem) é a mesma para todas as turmas do período, mas o prazo de entrega de feedback é definido por turma (`PRAZO_LISTA`) — a mesma lista pode ter prazos diferentes em turmas diferentes.

---

## 3. Fluxo do bot (Discord)

```
1. Monitor usa o comando /feedback (ou o botão "Registrar feedback" do painel de entrada)
   no canal de registro do período → identifica MONITOR pelo discord_user_id
   (sem vínculo ativo: bot responde "procure um chefe" e encerra)
2. monitor.dupla_id → resolve DUPLA → resolve lista de ALUNOS da dupla
   (o monitor só vê os alunos da própria dupla — nenhuma pergunta extra necessária aqui)

3. Bot pergunta: "Qual lista?"
   → select menu com as Listas ativas do período
   → monitor seleciona (ex: Lista 3)

4. Bot pergunta: "Qual aluno?"
   → select menu com os alunos da dupla (paginado se houver mais de 25)
   → monitor seleciona

5. Bot pergunta: "Quantas questões corretas?"
   → select menu com 0..total, mais a opção "F" para aluno que não entregou/respondeu a lista
   → se F: pula IA/plágio/proibição (não fazem sentido pra uma lista não entregue) e vai
     direto ao resumo

6. Bot pergunta: "Usou IA?" (botões Sim/Não)
   → se sim: "Em quais questões?" (select de seleção múltipla)

7. Bot pergunta: "Plagiou?" (botões Sim/Não)
   → se sim e mais de uma questão marcada: "Foi a mesma pessoa em todas?" (evita repetir a
     pergunta de curso+aluno no caso comum de um único envolvido)
   → para cada questão (ou uma vez só, se mesma pessoa): "Qual o curso da pessoa envolvida?"
     + "Com quem?" (select dos alunos do curso escolhido)

8. Bot pergunta: "Usou alguma proibição da lista?" (botões Sim/Não)
   → se sim: "Em quais questões?"

9. Bot mostra um resumo (embed) de confirmação:
   "Cauã Ribeiro · Lista 3 · 7 questões corretas · IA: Q3 · Plágio: não · Proibição: não"
   → botões Confirmar/Cancelar

10. Ao confirmar:
    a. Grava FEEDBACK + tabelas relacionadas (IA/plágio/proibição) no banco
    b. Resolve MAPEAMENTO_PLANILHA_LISTA(lista_id, aluno.turma_id) → aba + coluna
    c. Localiza a linha do aluno na aba pela matrícula
    d. Escreve qtd_questoes_pontuadas (ou "F") na célula "Questões corretas" correspondente
       (nenhuma outra célula é tocada — Nota, Prova, Unidade são fórmula da planilha)
    e. Bot confirma: "Feedback salvo ✅"

11. Não há "próximo aluno" automático: o monitor usa /feedback de novo para registrar outro
    (cada execução do comando começa do zero, descartando qualquer progresso anterior).
```

**Interface**: componentes nativos do Discord (slash command, select menus, botões), não texto livre — evita erro de digitação e permite seleção múltipla de questões com confiabilidade. Um modal com campo de texto é o fallback só para listas com mais de 25 questões (não cabem num select). Ver `docs/specs/controle-sessao-bot.md` para o comportamento completo, incluindo casos de borda.

**Escopo de conexão.** O bot responde de forma efêmera (visível só para quem executou o comando) dentro de um único canal de texto por período, configurado pela chefe no painel — não em mensagem privada (DM) nem em qualquer canal do servidor. Cada período usa um servidor do Discord próprio, criado do zero a cada semestre; o vínculo de cada monitor à própria conta do Discord é feito manualmente pela chefe (não há como descobrir automaticamente a conta de alguém a partir de outro identificador). Ver [ADR-0005](docs/adr/0005-bot-discord-em-vez-de-whatsapp.md) para o histórico da decisão (o bot era WhatsApp originalmente — ver [ADR-0003](docs/adr/0003-bot-whatsapp-biblioteca-nao-oficial.md) — e migrou para Discord depois de bans reais de número).

---

## 4. Permissões

- Todos os 6 chefes (monitores com `is_chefe = true`) têm **acesso total**: qualquer grupo, qualquer período, ambos os dashboards.
- **Não há isolamento entre chefes.** A visão padrão de cada dashboard é a geral (todos os grupos agregados), permitindo comparação entre grupos e insights cross-grupo (ex: "grupo X tem taxa de atraso muito maior que os outros").
- Filtro de "Grupo de revisão" é sempre livre — qualquer chefe pode restringir a visão a 1 grupo específico (o próprio ou de um colega).
- Não existe papel de "coordenador geral" separado — todos os 6 chefes têm o mesmo nível de acesso.

---

## 5. Integração com a planilha (Google Sheets)

### 5.1 Estrutura da planilha (confirmada)

- Uma planilha do Google Sheets por disciplina/período, com **uma aba por Turma** (ex: aba "CC/IA", aba "EC", aba "SI") — sem mistura de turmas na mesma aba.
- Dentro de cada aba: linhas = alunos (identificados pela coluna Matrícula), colunas agrupadas por Lista, cada grupo de lista com subcolunas (Questões corretas, Nota, Prova, Unidade).
- **O sistema só escreve na subcoluna "Questões corretas".** Todas as outras colunas (Nota, Prova, Unidade) são fórmula da própria planilha e nunca devem ser sobrescritas.

### 5.2 Resolução do mapeamento — por busca de header (não por letra fixa)

Em vez de fixar a letra da coluna manualmente, o sistema:

1. Varre a linha de cabeçalho da aba da turma.
2. Localiza o bloco de colunas correspondente ao nome da lista (ex: "Lista 3").
3. Dentro desse bloco, localiza a subcoluna com o texto "Questões corretas".
4. Guarda esse resultado em `MAPEAMENTO_PLANILHA_LISTA` como cache.

Essa abordagem é resiliente a mudanças de layout (reordenar listas, adicionar colunas) — se a estrutura mudar, o sistema recalcula automaticamente na próxima leitura, sem precisar de reconfiguração manual constante.

**Cache**: o mapeamento resolvido deve ser cacheado (ex: 5–10 min) para não bater na API do Sheets a cada registro individual, especialmente quando vários monitores estão preenchendo simultaneamente. Deve existir um botão manual de "recarregar mapeamento" no dashboard para o caso de a planilha mudar de layout durante o período.

### 5.3 Fluxo de escrita

```
(lista_id, aluno.turma_id)
  → resolve aba + coluna via MAPEAMENTO_PLANILHA_LISTA (cache) ou via varredura de header
  → busca a linha do aluno pela matrícula (coluna B) dentro daquela aba
  → escreve qtd_questoes_pontuadas na célula [linha, coluna "Questões corretas"]
  → marca FEEDBACK.sincronizado_planilha = true
```

Se a escrita falhar (erro de API, aluno não encontrado na aba, etc.), o registro deve ficar marcado como `sincronizado_planilha = false` para reprocessamento, e o chefe deve conseguir ver isso no dashboard.

---

## 6. Dashboards

Ambos os dashboards são organizados **por Período** (seletor obrigatório no topo) e mostram, por padrão, a visão geral de todos os grupos.

### 6.1 Dashboard de Alunos

**Filtros combináveis**: Turma, Grupo de revisão, Dupla (opcional).

**Métricas agregadas**:

- Total de alunos no filtro atual
- Uso de IA (contagem e % de alunos afetados)
- Plágio (contagem e % de alunos afetados)
- Uso de proibição (contagem e % de alunos afetados)
- Contagem de alunos PCD no filtro

**Visualizações**:

- Gráfico de ocorrências (IA / plágio / proibição) por lista
- Tabela por aluno: nome, matrícula, turma, dupla, listas entregues, badges de ocorrências, badge de PCD

**Por aluno (detalhe)**:

- Histórico completo de feedbacks por lista
- Quais questões tiveram IA/plágio/proibição
- Com quem plagiou (quando aplicável)
- Sinalização de reincidência (ex: 3+ ocorrências ao longo do período)

### 6.2 Dashboard de Monitores

**Filtro**: Grupo de revisão (opcional — sem filtro mostra todos os grupos).

**Métricas agregadas**:

- Total de monitores no filtro atual
- % de entregas no prazo (comparando `FEEDBACK.criado_em` com `LISTA.prazo_entrega_feedback`)
- Contagem de monitores com atraso recorrente
- Grupos ativos

**Visualizações**:

- Gráfico de atrasos por grupo de revisão (no prazo vs. atrasado)
- Tabela por monitor: nome, grupo, dupla, semana (A/B), % de entregas no prazo, total de registros

---

## 7. Gestão (CRUD)

Tela de gestão por período, disponível a todos os chefes:

- **Grupos de revisão**: criar, editar, definir chefe responsável
- **Duplas**: criar dentro de um grupo, vincular 2 monitores (semana A e semana B)
- **Monitores**: adicionar, remover, manter de um período para outro; vincular a uma dupla
- **Alunos**: importação em lote (CSV/planilha) por turma/período; vinculação manual ou em lote a uma dupla; marcação de PCD

---

## 8. Stack (decidida)

- **Backend**: Node.js + TypeScript, com Fastify (leve, boa performance, first-class TypeScript) ou Express se a equipe já tiver mais familiaridade com ele.
- **ORM / banco**: PostgreSQL + Prisma. Prisma encaixa bem no modelo relacional já desenhado (FKs claras entre Período/Grupo/Dupla/Aluno/Monitor/Feedback) e gera migrations automaticamente a partir do schema — acelera bastante o início do projeto.
- **Bot**: Discord, via `discord.js` (API oficial de bot, autenticação por token estático, sem pareamento), com fluxo por slash command/select menus/botões nativos. Decisão atual — ver [ADR-0005](docs/adr/0005-bot-discord-em-vez-de-whatsapp.md); a v1 original usava WhatsApp por biblioteca não-oficial ([ADR-0003](docs/adr/0003-bot-whatsapp-biblioteca-nao-oficial.md)), substituída depois de dois bans reais de número.
- **Sincronização com planilha**: Google Sheets API (leitura de header + escrita pontual de célula, com cache de mapeamento em memória ou Redis).
- **Dashboard**: React + TypeScript, com Vite como bundler (build rápido, boa DX). Chart.js para os gráficos (mesma biblioteca usada no protótipo, então o visual já fica alinhado).
- **Autenticação dos chefes**: login simples por e-mail institucional (ex: magic link ou senha), todos com o mesmo nível de acesso (ver seção 4). Não há necessidade de um provedor de identidade complexo dado o número pequeno de usuários (6 chefes).
- **Hospedagem**: um provedor com tier gratuito ou baixo custo pra começar (ex: Railway ou Render pro backend + banco, Vercel pro frontend) — dá pra migrar depois se o uso crescer.

Toda a stack é TypeScript de ponta a ponta (backend, frontend, e o schema do Prisma), o que reduz fricção de troca de contexto pra quem for desenvolver os dois lados.

---

## 9. Decisões finais e pontos que seguem em aberto

**Resolvido nesta rodada:**

- ✅ Bot: Discord, sem custo de mensageria a considerar (ao contrário do orçamento de conversas/24h do WhatsApp, decisão original que não se aplica mais — ver seção 3 e ADR-0005).
- ✅ Stack: definida na seção 8.
- ✅ Política de privacidade: ver documento separado `politica-privacidade.md`.

**Ainda em aberto (não bloqueia o início do desenvolvimento):**

1. **Responsável técnico pela infraestrutura**: quem vai manter hospedagem, o token do bot do Discord e monitorar falhas de sincronização com a planilha no dia a dia.
2. **Comportamento em caso de falha de sincronização com a planilha**: reprocessamento automático, alerta no dashboard, ou fila manual de reenvio — pode ser decidido durante a implementação, sem travar o início.

---

## 10. Resumo do fluxo ponta a ponta

```
Monitor corrige a lista na plataforma da disciplina
        ↓
Abre o Discord e usa /feedback no canal de registro do período
        ↓
Bot já sabe quem ele é e quais alunos ele atende (conta do Discord → dupla → alunos)
        ↓
Monitor escolhe lista → aluno → questões corretas → IA → plágio → proibição → confirma
        ↓
Sistema grava no banco E escreve automaticamente na planilha oficial
        ↓
Chefe acompanha tudo pelo dashboard (Alunos e Monitores), sem precisar checar manualmente
```
