# Controle de sessão e fluxo do bot

Ref: `monitoria-especificacao.md` § 3 · [ADR-0003](../adr/0003-bot-whatsapp-biblioteca-nao-oficial.md)

## Comportamentos

- `Registrar feedback`, `menu` e `oi` sempre descartam o progresso atual e iniciam um novo fluxo.
- `sair`, `desistir` e `cancelar` encerram o fluxo sem gravar feedback.
- Toda pergunta do fluxo informa que o monitor pode digitar `SAIR`.
- Depois de sair, o monitor pode enviar `Registrar feedback` para começar novamente.
- Desvincular o número no painel executa logout do aparelho conectado e remove as credenciais
  locais. A próxima conexão deve gerar um QR code para qualquer outro número.

## Casos de borda

- Comandos ignoram maiúsculas, espaços externos e acentos.
- Sair sem um fluxo ativo continua retornando a orientação para iniciar novamente.
- Falha no logout remoto não impede a remoção das credenciais locais.
