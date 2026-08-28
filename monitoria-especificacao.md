# Feedbot — Especificação Técnica

> Nome do projeto: **Feedbot**. O bot que coleta, direto do monitor, o feedback de cada correção — e cuida do resto.

## 1. Contexto e problema

Uma disciplina de programação tem 6 chefes de monitoria, cada um supervisionando um **grupo de revisão**. Cada grupo é dividido em **duplas de monitores** (2 monitores por dupla), que se revezam em semanas A/B para dar feedback a um conjunto fixo de alunos.

Hoje o processo é manual: o monitor corrige a lista na plataforma da disciplina, verifica plágio/uso de IA/uso de proibições, e depois **precisa preencher manualmente uma planilha** com a quantidade de questões corretas. Isso é frequentemente esquecido, sobrecarregando os chefes.

**Objetivo do sistema**: um bot de WhatsApp para os monitores registrarem o resultado da correção (o que já escreve automaticamente na planilha oficial), e um dashboard para os chefes acompanharem alunos e monitores.

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
├── whatsapp_numero (UNIQUE)  -- identificador usado pelo bot
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

- **1 monitor = 1 dupla por período.** Simplifica o roteamento do bot: o número de WhatsApp resolve diretamente a dupla, sem precisar perguntar.
- **PCD não implica cálculo de nota no sistema.** `is_pcd` e `qtd_questoes_meta` existem só para contextualizar o dashboard (ex: mostrar a meta do aluno junto da entrega). A nota é 100% responsabilidade da planilha oficial dos professores.
- **Cálculo de semana A/B**:
  ```
  semana = lista.semana_override
           OR (FLOOR(DATEDIFF(hoje, periodo.data_referencia_rodizio) / 7) % 2 == 0 ? 'A' : 'B')
  ```
  `semana_override` permite ajuste manual por lista (ex: feriado, semana de prova) sem quebrar o cálculo automático das demais.
- **Cada Turma tem exatamente uma aba própria na planilha** (não há aba compartilhada entre turmas).
- **Todo período tem sempre exatamente 6 listas**, criadas automaticamente ao cadastrar o período. A lista em si (nome, quantidade de questões, ordem) é a mesma para todas as turmas do período, mas o prazo de entrega de feedback é definido por turma (`PRAZO_LISTA`) — a mesma lista pode ter prazos diferentes em turmas diferentes.

---

## 3. Fluxo do bot (WhatsApp)

```
1. Mensagem chega → identifica MONITOR pelo whatsapp_numero
2. monitor.dupla_id → resolve DUPLA → resolve lista de ALUNOS da dupla
   (o monitor só vê os alunos da própria dupla — nenhuma pergunta extra necessária aqui)

3. Bot pergunta: "Qual lista?"
   → mostra as Listas ativas do período
   → monitor seleciona (ex: Lista 3)

4. Bot pergunta: "Qual aluno?"
   → lista os alunos da dupla
   → monitor seleciona

5. Bot pergunta: "Quantas questões corretas?"
   → monitor informa o número

6. Bot pergunta: "Usou IA?" (sim/não)
   → se sim: "Em quais questões?" (seleção múltipla)

7. Bot pergunta: "Plagiou?" (sim/não)
   → se sim: "Em quais questões?" + "Com quem?" (busca por nome/matrícula de outro aluno)

8. Bot pergunta: "Usou alguma proibição da lista?" (sim/não)
   → se sim: "Em quais questões?"

9. Bot mostra resumo de confirmação:
   "Cauã Ribeiro · Lista 3 · 7 questões corretas · IA: Q3 · Plágio: não · Proibição: não"
   → monitor confirma ou corrige

10. Ao confirmar:
    a. Grava FEEDBACK + tabelas relacionadas (IA/plágio/proibição) no banco
    b. Resolve MAPEAMENTO_PLANILHA_LISTA(lista_id, aluno.turma_id) → aba + coluna
    c. Localiza a linha do aluno na aba pela matrícula
    d. Escreve qtd_questoes_pontuadas na célula "Questões corretas" correspondente
       (nenhuma outra célula é tocada — Nota, Prova, Unidade são fórmula da planilha)
    e. Bot confirma: "Registrado ✅"

11. Bot pergunta: "Próximo aluno (mesma lista) ou trocar de lista?"
    → "próximo aluno": volta ao passo 4, sem repetir a pergunta de lista
    → "trocar de lista": volta ao passo 3
```

**Interface recomendada**: fluxo guiado por botões/listas do WhatsApp (não texto livre), para evitar erro de digitação e permitir seleção múltipla de questões com confiabilidade.

**Escopo de conexão — só conversa individual (1:1).** O bot conversa diretamente com cada monitor, nunca em grupo. Essa decisão não é só de produto — é também técnica: a API oficial do WhatsApp (Cloud API) tem uma Groups API própria desde 2026, mas ela **cria grupos novos via link de convite** (máx. 8 participantes por grupo) — não permite adicionar o bot a um grupo do WhatsApp já existente. Como o fluxo de registro de feedback é sempre individual por natureza (inclusive por privacidade, já que envolve apontar com quem um aluno plagiou), grupos do WhatsApp ficam **fora do escopo da v1**. Se no futuro fizer sentido um canal de avisos/lembretes para os chefes, isso pode ser resolvido com mensagens 1:1 para cada chefe, sem precisar de grupo.

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
- **Bot**: WhatsApp Business Platform oficial (Meta Cloud API), com fluxo por botões/listas interativas. Justificativa: suporta o volume da equipe (250 conversas/24h sem verificação, mais que suficiente pros 60+ monitores) sem depender de biblioteca não-oficial, que arrisca banimento de número.
- **Sincronização com planilha**: Google Sheets API (leitura de header + escrita pontual de célula, com cache de mapeamento em memória ou Redis).
- **Dashboard**: React + TypeScript, com Vite como bundler (build rápido, boa DX). Chart.js para os gráficos (mesma biblioteca usada no protótipo, então o visual já fica alinhado).
- **Autenticação dos chefes**: login simples por e-mail institucional (ex: magic link ou senha), todos com o mesmo nível de acesso (ver seção 4). Não há necessidade de um provedor de identidade complexo dado o número pequeno de usuários (6 chefes).
- **Hospedagem**: um provedor com tier gratuito ou baixo custo pra começar (ex: Railway ou Render pro backend + banco, Vercel pro frontend) — dá pra migrar depois se o uso crescer.

Toda a stack é TypeScript de ponta a ponta (backend, frontend, e o schema do Prisma), o que reduz fricção de troca de contexto pra quem for desenvolver os dois lados.

---

## 9. Decisões finais e pontos que seguem em aberto

**Resolvido nesta rodada:**

- ✅ Orçamento do WhatsApp: não é bloqueio — o limite gratuito de 250 conversas/24h (sem verificação de empresa) cobre o volume da equipe. Verificação completa (selo verde) fica pra depois, se fizer falta, e exige CNPJ.
- ✅ Grupos do WhatsApp: fora do escopo da v1 (ver seção 3).
- ✅ Stack: definida na seção 8.
- ✅ Política de privacidade: ver documento separado `politica-privacidade.md`.

**Ainda em aberto (não bloqueia o início do desenvolvimento):**

1. **Responsável técnico pela infraestrutura**: quem vai manter hospedagem, número de WhatsApp e monitorar falhas de sincronização com a planilha no dia a dia.
2. **Comportamento em caso de falha de sincronização com a planilha**: reprocessamento automático, alerta no dashboard, ou fila manual de reenvio — pode ser decidido durante a implementação, sem travar o início.

---

## 10. Resumo do fluxo ponta a ponta

```
Monitor corrige a lista na plataforma da disciplina
        ↓
Abre o WhatsApp e conversa com o bot
        ↓
Bot já sabe quem ele é e quais alunos ele atende (número → dupla → alunos)
        ↓
Monitor escolhe lista → aluno → questões corretas → IA → plágio → proibição → confirma
        ↓
Sistema grava no banco E escreve automaticamente na planilha oficial
        ↓
Chefe acompanha tudo pelo dashboard (Alunos e Monitores), sem precisar checar manualmente
```
