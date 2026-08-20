# 0001. Registrar decisões arquiteturais

Data: 2026-08-17

## Status

Aceito

## Contexto

O Feedbot é desenvolvido por uma equipe pequena (chefes de monitoria e quem for programar), possivelmente com rotatividade entre semestres. Decisões de arquitetura tomadas hoje (stack, forma de integração com WhatsApp e Sheets, modelo de dados) precisam ser rastreáveis para quem chegar depois — sem depender de memória ou de mensagens de chat espalhadas.

## Decisão

Toda decisão arquitetural significativa é registrada como um Architecture Decision Record (ADR) em `docs/adr/`, seguindo o formato de Michael Nygard (Contexto / Decisão / Consequências), numerado sequencialmente. Decisões que substituem uma anterior geram um novo ADR referenciando o antigo, em vez de reescrever o histórico.

## Consequências

Fica mais fácil entender _por que_ o sistema é como é, não só _o que_ ele faz — o código e a especificação técnica (`monitoria-especificacao.md`) descrevem o "o quê"; os ADRs descrevem o "por quê". Tem um custo pequeno de disciplina: toda decisão relevante exige uma parada para documentar antes de seguir.
