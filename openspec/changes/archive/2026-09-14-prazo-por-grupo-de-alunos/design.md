## Context

Ver `proposal.md` (seção Why) para a motivação. Hoje o prazo efetivo de um aluno para uma
lista é calculado combinando dois níveis — `PrazoLista` (por turma) e `PrazoAlunoLista`
(exceção individual) — com a exceção prevalecendo sobre a turma. Essa combinação está
duplicada inline em dois lugares do código (o cálculo de indicadores de atraso e a listagem de
feedbacks), sem uma função central. Turma e exceção individual, hoje, não têm nenhuma spec
formal em `openspec/specs/` — esta é a primeira capacidade de prazo formalizada nessa
ferramenta.

O modelo de dados já tem um precedente estrutural muito próximo do que esta mudança precisa:
`GrupoRevisao` (um grupo organizado pela chefe, escopado a um período, com alunos vinculados
via FK opcional) e `PrazoLista` (prazo por escopo × lista, com upsert idempotente por chave
composta). O grupo de prazo reaproveita a forma dos dois, sem reaproveitar o código deles
(são conceitos de negócio independentes, coincidência estrutural apenas).

## Goals / Non-Goals

**Goals:**
- Adicionar um terceiro nível de prazo (grupo) sem alterar o comportamento observável dos dois
  níveis existentes para alunos sem grupo.
- Centralizar o cálculo de precedência numa única função pura, testável sem banco, para não
  triplicar a lógica que hoje já está duplicada em dois lugares.
- Reaproveitar os padrões arquiteturais já estabelecidos (camadas domain → application →
  services/routes, `GestaoErro`, helpers de `http/input.ts`, mapeamento global de erros de
  constraint do Prisma) em vez de introduzir convenções novas.

**Non-Goals:**
- Não altera `GrupoRevisao`, `Dupla`, ou qualquer fluxo de revisão de monitoria.
- Não expõe nenhuma mudança em `apps/web` nesta entrega.
- Não adiciona forma de remover pontualmente o prazo de uma combinação (grupo, lista) sem
  excluir o grupo inteiro — mesma limitação que o prazo por turma já tem hoje.
- Não resolve os gaps de cobertura de teste pré-existentes em `atualizarPrazosDaTurma` e
  `atribuirAlunosADupla` (funções análogas já existentes, sem teste de application hoje) — ver
  Riscos/Trade-offs.

## Decisions

**Modelagem do grupo de prazo como duas tabelas novas + um campo opcional em `Aluno`.**
`GrupoPrazo` (período + nome, único por período) e `PrazoGrupoLista` (grupo × lista, único por
par, upsert idempotente) espelham exatamente `GrupoRevisao`/`PrazoLista`. `Aluno` ganha um
campo de FK opcional para o grupo (igual ao padrão já usado para `duplaId`), o que já expressa
no próprio schema o invariante "um aluno pertence a no máximo um grupo de prazo por vez" — não
precisa de validação de aplicação para essa regra especificamente, só para a compatibilidade de
período na atribuição. Alternativa rejeitada: uma tabela de associação aluno↔grupo (many-to-
many). Rejeitada porque o negócio já fixou cardinalidade 1 (no máximo um grupo por aluno), e o
projeto já resolve esse mesmo tipo de relação com um campo de FK opcional direto em `Aluno`
(`duplaId`) em vez de tabela de associação — manter os dois vínculos de aluno com a mesma forma
evita uma inconsistência de modelagem sem ganho real (não há necessidade de histórico de
associações passadas).

**`onDelete` do grupo de prazo: `Restrict` na relação com `Periodo`, `Cascade` na relação com
`PrazoGrupoLista`, `SetNull` na relação com `Aluno`.** Mesma escolha já feita para
`GrupoRevisao`/`Dupla`/`Aluno.duplaId`: um grupo de prazo representa trabalho deliberado da
chefe (por isso bloqueia a exclusão do período, como já ocorre para `GrupoRevisao`, ao
contrário de `Turma`/`Lista`, que são scaffolding automático e cascateiam); seus prazos
configurados não têm significado fora do grupo (cascade); os alunos vinculados a ele não devem
ser apagados quando o grupo é excluído (`SetNull`, mesma mecânica de `duplaId`). Isso exige
estender a checagem pré-exclusão de período (que hoje conta alunos/monitores/grupos de revisão)
para também contar grupos de prazo — sem isso, excluir um período com um grupo de prazo órfão
resultaria num erro de constraint genérico em vez da mensagem já usada para os outros três
casos.

**Precedência do prazo efetivo extraída para uma função pura em `domain/`.** Hoje essa
combinação (exceção > turma) está duplicada inline em dois lugares (indicadores de atraso e
listagem de feedbacks); adicionar um terceiro nível sem extrair criaria uma terceira cópia. O
projeto já tem o precedente exato desse tipo de extração — outra regra de negócio que também
estava duplicada em dois lugares foi movida para uma função pura em `domain/`, justamente para
virar a única fonte da regra e ser testável sem banco. Alternativa rejeitada: manter a lógica
inline nos dois call sites, só adicionando o terceiro nível em cada um. Rejeitada porque
manteria (e pioraria) a duplicação existente sem necessidade — a função é trivial o suficiente
para não precisar de I/O, cada call site já teria que buscar os três valores de qualquer forma.

**Funções de application vs. lógica inline na rota.** Critério adotado, extraído do próprio
código: uma operação vira função de application quando envolve validação cross-entity (ex.:
comparar período de duas entidades) e/ou uma transação multi-linha; permanece inline na rota
quando é um CRUD de uma linha com checagem de unicidade simples, ou uma exclusão cujo único
efeito é o que o próprio schema (cascade/setnull) já resolve sozinho. Isso mantém o grupo de
prazo consistente com a divisão já existente: criar/renomear/excluir grupo ficam inline nas
rotas (mesmo padrão de `GrupoRevisao`, `Turma`, `Lista`); configurar prazo do grupo por lista e
atribuir/desvincular alunos em lote viram funções de `application/`, pelos mesmos motivos que
suas contrapartes de turma/dupla já são funções de `application/`.

**Desvincular alunos em lote é capacidade nova, sem espelhar uma rota existente 1:1.** A
atribuição em lote de alunos a uma dupla, hoje, exige um `duplaId`; desvincular só existe
aluno-por-aluno. Para grupo de prazo, o mesmo endpoint de atribuição em lote aceita um valor
nulo para desvincular em lote (decisão confirmada com a usuária), reaproveitando a mesma forma
de payload em vez de criar uma rota irmã só para esse caso. A validação de que os alunos do
lote existem se aplica igualmente aos dois casos (atribuir e desvincular) — só a checagem de
compatibilidade de período é pulada quando não há grupo de destino contra o qual comparar.

**Sem ADR.** Nenhuma das decisões acima é difícil de reverter ou afeta múltiplas partes do
sistema fora do próprio domínio de prazo: a modelagem é aditiva (nova migração reversível), seu
formato replica um precedente já em produção, e o ponto de extensão da regra de precedência
está isolado numa única função pura. Pelo critério do projeto, essas decisões de modelagem
local vão registradas em `docs/specs/modelo-dados.md`, não em `docs/adr/`.

## Risks / Trade-offs

- **[Risco] Duas tabelas novas + um campo novo aumentam levemente a superfície de consultas
  Prisma que hoje só olham dois níveis de prazo** → Mitigação: a mudança de consulta é
  localizada aos dois pontos já identificados (indicadores de atraso, listagem de feedbacks);
  ambos passam a chamar a mesma função de precedência, então um erro de precedência falha nos
  dois lugares de forma idêntica e detectável pelo mesmo teste de domínio.
- **[Risco] `atualizarPrazosDaTurma` e `atribuirAlunosADupla` — as funções que servem de
  molde para as novas funções de grupo — não têm teste de application hoje.** Copiar a
  estrutura sem copiar a lacuna de cobertura é intencional: as novas funções (`grupo`) ganham
  teste completo nesta entrega; corrigir a lacuna nas funções antigas (`turma`/`dupla`) fica
  como tarefa separada e opcional, fora dos commits desta feature, para não misturar
  rastreabilidade entre uma correção de dívida técnica preexistente e a feature nova.
- **[Risco] `GET /feedbacks` não tem nenhum teste de rota hoje**, então a mudança na consulta
  Prisma desse endpoint (incluir o prazo do grupo) fica sem rede de segurança de teste de rota
  além da cobertura indireta da função de domínio → Mitigação: criar um teste mínimo de rota
  para esse endpoint como parte da fatia que faz essa mudança, em vez de aceitar o risco
  silenciosamente.

## Migration Plan

Uma única migração Prisma aditiva (dois models novos, um campo opcional novo em `Aluno`, sem
alterar nenhuma coluna existente) — não há dado existente para migrar/retrocompatibilizar.
Rollback é a reversão padrão de migração Prisma (nenhuma dependência de dado externo). Sem
etapas de deploy fora do fluxo normal do projeto (schema → migração → geração do client →
código que a usa).
