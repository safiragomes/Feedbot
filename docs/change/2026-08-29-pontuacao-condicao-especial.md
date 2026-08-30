# Pontuação proporcional para condição especial

## Mudança

- O perfil do aluno permite ao chefe marcar manualmente `PCD/ND · meta de 2/3`.
- O feedback preserva a quantidade real de acertos no banco.
- Ao sincronizar com o Sheets, alunos marcados recebem o equivalente proporcional
  `min(total, acertos / (2/3))`, com duas casas decimais.
- O equivalente nunca ultrapassa o total da lista; alunos comuns permanecem sem ajuste.

## Verificação

- Testes unitários cobrem valor comum, proporcional, arredondamento e teto.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build`.
