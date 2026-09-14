# Modularização da gestão de alunos

Data: 2026-08-29

## Contexto

`routes/management.ts` concentrava transporte HTTP, normalização de entradas, parsing de CSV,
regras de vínculo e persistência. Isso tornava o módulo difícil de testar isoladamente e elevava
o risco de mudanças na gestão administrativa.

## Mudança

- Os endpoints de alunos foram movidos para `routes/management/alunos.ts`.
- Parsing e validação de importação CSV, além das regras de vínculo de aluno, passaram para a
  camada de aplicação em `application/alunos/alunos-service.ts`.
- Conversores genéricos de entrada HTTP foram centralizados em `http/input.ts`.
- O contrato público dos endpoints foi preservado.

Esta é uma migração incremental: as demais áreas de `management.ts` podem seguir o mesmo corte
por feature sem exigir uma reescrita simultânea da API.

## Verificação

- Testes unitários do parser CSV.
- Typecheck da API.
- ESLint do monorepo.
- Suíte de testes da API.
