# Correção do estado de conexão do bot

Data: 2026-08-29

## Contexto

O socket do WhatsApp podia continuar conectado enquanto `BotSessao` permanecia com o estado
`DESCONECTADO`. Nesse cenário, uma nova tentativa de conexão era ignorada porque já existia um
socket, mas o painel não exibia a conexão nem um QR code.

Uma das causas possíveis era um evento de fechamento atrasado, emitido por um socket antigo após
uma reconexão, sobrescrever o estado persistido pelo socket atual.

## Mudança

- Eventos de fechamento pertencentes a sockets antigos agora são ignorados.
- A consulta de status reconcilia o banco quando o socket atual possui um usuário autenticado.
- O socket em memória passa a ser a fonte de verdade durante a vida do processo.
- Um watchdog executado na API, sem depender do painel, recupera a cada minuto conexões
  ausentes e tentativas presas por mais de dois minutos.

## Verificação

- Typecheck da API.
- ESLint do monorepo.
- Build e reinicialização do container da API.
- Consulta autenticada de `GET /bot`.
