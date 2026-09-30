## ADDED Requirements

### Requirement: Consulta geral de listas expõe o prazo por grupo

Ao consultar as listas de um período, o sistema DEVE (MUST) informar, para cada lista, o
prazo de entrega de feedback configurado para cada grupo de prazo que tenha uma configuração
para aquela lista — na mesma consulta que já informa o prazo por turma, e sem exigir uma
consulta separada por grupo de prazo.

#### Scenario: Lista com prazo configurado para um grupo de prazo

- **WHEN** a chefe de monitoria consulta as listas de um período que tem um grupo de prazo
  com prazo de entrega de feedback configurado para uma dessas listas
- **THEN** a lista retornada inclui o prazo de entrega de feedback configurado por aquele
  grupo de prazo para aquela lista

#### Scenario: Lista sem nenhum prazo configurado por grupo

- **WHEN** a chefe de monitoria consulta as listas de um período em que nenhum grupo de
  prazo tem prazo configurado para uma determinada lista
- **THEN** a lista retornada indica ausência de prazo por grupo para aquela lista, sem erro

#### Scenario: Lista com prazos configurados para mais de um grupo de prazo

- **WHEN** a chefe de monitoria consulta as listas de um período em que dois grupos de prazo
  distintos têm prazos configurados para a mesma lista
- **THEN** a lista retornada inclui o prazo de entrega de feedback de cada um dos dois grupos
  de prazo separadamente, identificando a qual grupo cada prazo pertence
