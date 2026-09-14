# Bot do Discord — configuração e operação

O bot usa a API oficial do Discord (`discord.js`), autenticado por um token estático de
aplicação (`DISCORD_BOT_TOKEN`) — sem pareamento por QR code — ver
[ADR-0005](adr/0005-bot-discord-em-vez-de-whatsapp.md) (substitui a decisão anterior de
WhatsApp, [ADR-0003](adr/0003-bot-whatsapp-biblioteca-nao-oficial.md)) e
`specs/controle-sessao-bot.md` para o comportamento completo do fluxo.

Cada **período** (semestre) usa um servidor do Discord próprio, criado do zero — servidor,
cargo de monitores e canal de registro são escolhidos pela chefe direto no painel (tela
**Bot**, fluxo Servidor → Cargo → Canal, cada passo buscado ao vivo na API do Discord), não
por variável de ambiente.

## Configurar a aplicação no Discord Developer Portal

1. Crie uma aplicação em [discord.com/developers/applications](https://discord.com/developers/applications)
   e, dentro dela, um Bot.
2. Em **Bot**, ative o intent privilegiado **Server Members Intent** (necessário para listar
   membros por cargo no vínculo de monitores). O bot não precisa do Message Content Intent — o
   fluxo é só slash command/componentes, nunca lê texto livre de mensagens normais.
3. Copie o **token** do bot para `DISCORD_BOT_TOKEN`.
4. Em **OAuth2 → URL Generator**, marque os escopos `bot` e `applications.commands` e as
   permissões `View Channels`, `Send Messages`, `Embed Links` e `Use Application Commands`.
   Use a URL gerada para convidar o bot a cada servidor de período. Link de convite do bot
   atual (aplicação do Feedbot no Developer Portal):

   ```
   https://discord.com/oauth2/authorize?client_id=1544875651369271397&permissions=2147503104&integration_type=0&scope=bot+applications.commands
   ```

5. Convide o bot ao servidor do período atual e, no painel, vincule servidor → cargo "Monitores"
   → canal de registro. Um período novo (servidor novo) repete só os passos 4 e 5 — o mesmo
   link acima serve pra convidar o bot a qualquer servidor novo, sem precisar gerar de novo.

## Execução contínua (24/7)

O painel pode ser fechado sem desconectar o bot: a conexão pertence à API, não ao
navegador. A API mantém um watchdog interno (`DiscordBot.verificarConexao`) que detecta quedas
e reconexões e avisa cada chefe por e-mail se a queda passar de 5 minutos sem se resolver
sozinha. Para manter API, bot e banco ativos com reinício automático, execute:

```bash
docker compose up -d --build
docker compose ps
```

O serviço `api` usa `restart: unless-stopped`. Como a autenticação é por token estático (sem
sessão pareada), reiniciar ou recriar o container não exige nenhuma ação manual — o bot volta a
conectar sozinho assim que `DISCORD_BOT_TOKEN` estiver disponível.

O computador/servidor e o Docker precisam permanecer ligados. Para disponibilidade real 24/7,
execute o Compose em um servidor permanente e configure o Docker para iniciar com o sistema
operacional. A disponibilidade ainda depende da internet e da API do Discord; revogar/regenerar
o token do bot no Developer Portal exige atualizar `DISCORD_BOT_TOKEN` e reiniciar a API.
