# Controle de fluxo e troca do número do bot

Data: 2026-08-29

## Mudança

- O painel agora apresenta a ação `Desvincular número`, que executa logout remoto e remove as
  credenciais locais antes de permitir um novo pareamento.
- `SAIR`, `DESISTIR` e `CANCELAR` encerram qualquer etapa sem persistir informações.
- Todas as perguntas mostram explicitamente a opção `SAIR`.
- `Registrar feedback`, `MENU` e `OI` descartam o progresso anterior e iniciam um fluxo novo.

## Verificação

- Testes unitários dos comandos globais.
- Typecheck, lint e build.
- Reconstrução do container da API preservando a sessão atual.
