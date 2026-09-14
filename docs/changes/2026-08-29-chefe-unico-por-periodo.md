# Chefe único por grupo no período

Data: 2026-08-29

## Regra

Cada monitor-chefe pode responder por no máximo um grupo de revisão em um mesmo período. O mesmo
monitor pode voltar a chefiar um grupo em períodos diferentes.

## Implementação

- Validação explícita nos endpoints de criação e alteração de grupos.
- Índice único composto em `GrupoRevisao(periodoId, chefeId)` para proteger concorrência.
- O formulário de novo grupo não oferece chefes que já estejam vinculados no período.

## Verificação

- Teste de integração da resposta `409` ao tentar criar o segundo grupo.
- Typecheck, lint e build do monorepo.
