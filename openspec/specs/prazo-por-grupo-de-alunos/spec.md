# prazo-por-grupo-de-alunos Specification

## Purpose
Permite que a chefe de monitoria organize alunos em grupos livres (independentes de turma) só
para conceder um prazo de entrega de feedback alternativo, sem precisar de uma exceção
individual por aluno.

## Requirements

### Requirement: Criar grupo de prazo com nome único no período
O sistema DEVE (MUST) permitir criar um grupo de prazo informando período e nome, e DEVE (MUST) rejeitar a
criação quando já existe um grupo de prazo com o mesmo nome no mesmo período.

#### Scenario: Criação com nome único no período
- **WHEN** a chefe cria um grupo de prazo com um nome que nenhum outro grupo de prazo usa
  naquele período
- **THEN** o sistema responde com sucesso e o grupo de prazo criado

#### Scenario: Nome duplicado no mesmo período
- **WHEN** a chefe tenta criar um grupo de prazo com um nome já usado por outro grupo de prazo
  no mesmo período
- **THEN** o sistema responde com um erro de conflito e não cria o grupo

### Requirement: Renomear grupo de prazo
O sistema DEVE (MUST) permitir renomear um grupo de prazo existente, e DEVE (MUST) rejeitar a renomeação
quando o novo nome já é usado por outro grupo de prazo no mesmo período.

#### Scenario: Renomeação com sucesso
- **WHEN** a chefe renomeia um grupo de prazo para um nome que nenhum outro grupo de prazo usa
  naquele período
- **THEN** o sistema responde com sucesso e o grupo de prazo passa a ter o novo nome

#### Scenario: Renomeação para nome já usado no período
- **WHEN** a chefe tenta renomear um grupo de prazo para um nome já usado por outro grupo de
  prazo no mesmo período
- **THEN** o sistema responde com um erro de conflito e o nome do grupo não muda

### Requirement: Excluir grupo de prazo preserva os alunos
Excluir um grupo de prazo DEVE (MUST) remover o grupo e qualquer prazo configurado nele, mas NÃO DEVE
excluir os alunos que pertenciam a ele — eles devem passar a não ter grupo de prazo.

#### Scenario: Exclusão de grupo com alunos e prazos configurados
- **WHEN** a chefe exclui um grupo de prazo que tem alunos atribuídos e prazos configurados
  para uma ou mais listas
- **THEN** o sistema responde com sucesso, o grupo de prazo e seus prazos configurados deixam
  de existir, e os alunos que pertenciam a ele continuam existindo, sem nenhum grupo de prazo

### Requirement: Atribuir alunos a um grupo de prazo em lote
O sistema DEVE (MUST) permitir atribuir uma lista de alunos a um grupo de prazo de uma vez, desde que
todos os alunos pertençam ao mesmo período do grupo, e DEVE (MUST) rejeitar a atribuição quando algum
aluno é de um período diferente. Um aluno pertence a no máximo um grupo de prazo por vez —
atribuí-lo a um novo grupo o remove do grupo anterior, se houver.

#### Scenario: Atribuição em lote de alunos do mesmo período
- **WHEN** a chefe atribui um lote de alunos, todos do mesmo período do grupo de prazo, a esse
  grupo de prazo
- **THEN** o sistema responde com sucesso informando quantos alunos foram atualizados, e cada
  aluno do lote passa a pertencer a esse grupo de prazo

#### Scenario: Atribuição rejeitada por período diferente
- **WHEN** a chefe tenta atribuir a um grupo de prazo um lote que inclui pelo menos um aluno de
  um período diferente do período do grupo
- **THEN** o sistema responde com um erro e nenhum aluno do lote é atualizado

#### Scenario: Atribuição move o aluno de um grupo para outro
- **WHEN** a chefe atribui a um grupo de prazo um aluno que já pertence a outro grupo de prazo
- **THEN** o sistema responde com sucesso e o aluno passa a pertencer só ao novo grupo de prazo

### Requirement: Desvincular alunos de um grupo de prazo em lote
O sistema DEVE (MUST) permitir remover um lote de alunos do grupo de prazo ao qual pertencem, sem
excluir o grupo de prazo e sem exigir que sejam movidos para outro grupo.

#### Scenario: Desvinculação em lote
- **WHEN** a chefe desvincula um lote de alunos que pertencem a um grupo de prazo
- **THEN** o sistema responde com sucesso, cada aluno do lote passa a não ter nenhum grupo de
  prazo, e o grupo de prazo em si continua existindo com os demais alunos e prazos que tinha

### Requirement: Configurar o prazo do grupo por lista
O sistema DEVE (MUST) permitir configurar o prazo de entrega de feedback de um grupo de prazo para uma
ou mais listas, desde que as listas pertençam ao mesmo período do grupo; configurar de novo o
prazo de uma combinação (grupo, lista) já configurada DEVE (MUST) atualizar o valor em vez de criar uma
segunda configuração; configurar para uma lista de outro período DEVE (MUST) ser rejeitado.

#### Scenario: Configuração inicial do prazo do grupo para uma lista
- **WHEN** a chefe configura o prazo de entrega de uma lista para um grupo de prazo do mesmo
  período da lista
- **THEN** o sistema responde com sucesso e passa a reportar esse prazo para a combinação
  (grupo, lista)

#### Scenario: Repetir a configuração atualiza em vez de duplicar
- **WHEN** a chefe configura novamente o prazo de entrega da mesma lista para o mesmo grupo de
  prazo, com uma data diferente da configurada anteriormente
- **THEN** o sistema responde com sucesso e passa a reportar só a nova data para essa combinação
  (grupo, lista), sem manter a configuração anterior como uma entrada separada

#### Scenario: Configuração rejeitada por lista de outro período
- **WHEN** a chefe tenta configurar o prazo de uma lista que pertence a um período diferente do
  período do grupo de prazo
- **THEN** o sistema responde com um erro e nenhum prazo é configurado

### Requirement: Consultar o prazo configurado do grupo por lista
O sistema DEVE (MUST) permitir consultar, para cada lista do período de um grupo de prazo, se há um
prazo configurado para aquele grupo — a ausência de configuração para uma combinação (grupo,
lista) é reportada como "sem prazo configurado", nunca como um erro.

#### Scenario: Consulta com listas configuradas e não configuradas
- **WHEN** a chefe consulta os prazos de um grupo de prazo que tem prazo configurado para
  algumas listas do período e não tem para outras
- **THEN** o sistema responde com sucesso, reportando o prazo configurado para as listas que o
  têm e "sem prazo configurado" (não um erro) para as demais

### Requirement: Precedência do prazo efetivo de entrega de feedback
O prazo efetivo de entrega de feedback de um aluno para uma lista DEVE (MUST) seguir a ordem de
precedência: exceção individual do aluno para aquela lista, senão o prazo do grupo de prazo do
aluno para aquela lista (quando o aluno pertence a um grupo), senão o prazo da turma do aluno
para aquela lista, senão nenhum prazo. Nenhum nível configurado significa que o aluno
simplesmente não tem prazo para aquela lista, e isso nunca é tratado como atraso.

#### Scenario: Sem grupo e sem exceção usa o prazo da turma
- **WHEN** um aluno não pertence a nenhum grupo de prazo e não tem exceção individual para uma
  lista que tem prazo configurado na turma dele
- **THEN** o prazo efetivo do aluno para aquela lista é o prazo configurado na turma

#### Scenario: Com grupo e sem exceção usa o prazo do grupo, mesmo com prazo diferente na turma
- **WHEN** um aluno pertence a um grupo de prazo que tem prazo configurado para uma lista, não
  tem exceção individual para essa lista, e a turma do aluno tem um prazo diferente configurado
  para a mesma lista
- **THEN** o prazo efetivo do aluno para aquela lista é o prazo configurado no grupo, não o da
  turma

#### Scenario: Exceção individual prevalece mesmo com o aluno em um grupo
- **WHEN** um aluno tem uma exceção individual configurada para uma lista, independentemente de
  pertencer ou não a um grupo de prazo com prazo configurado para a mesma lista
- **THEN** o prazo efetivo do aluno para aquela lista é o da exceção individual

#### Scenario: Nenhum nível configurado deixa o aluno sem prazo
- **WHEN** um aluno não tem exceção individual para uma lista, não pertence a um grupo de prazo
  com prazo configurado para essa lista, e a turma do aluno também não tem prazo configurado
  para essa lista
- **THEN** o aluno não tem prazo efetivo para aquela lista, e isso não é contado como atraso
