# Controle de sessão e fluxo do bot

Ref: [ADR-0005](../adr/0005-bot-discord-em-vez-de-whatsapp.md) (substitui [ADR-0003](../adr/0003-bot-whatsapp-biblioteca-nao-oficial.md))

## Comportamentos

- O comando `/feedback` e o botão "Registrar feedback" (publicado pelo painel no canal de avisos do
  período) sempre iniciam um novo fluxo, descartando qualquer progresso anterior daquele monitor.
- Toda resposta do bot é efêmera (visível só para quem executou o comando) e enviada no próprio
  canal — não há mensagem privada (DM).
- Cada etapa do fluxo usa um componente nativo do Discord: select menu (lista, aluno, pontuação,
  curso, envolvido), botões (sim/não, confirmar/cancelar) ou, quando a lista tem mais de 25
  questões, um modal com campo de texto livre.
- Etapas que não dependem de consulta ao banco (sim/não, escolha de questões, etc.) respondem num
  único round-trip ao Discord (`Interaction.update`) em vez do padrão de dois passos
  (`deferUpdate` + `editReply`) — só as etapas que realmente precisam esperar uma consulta (listar
  alunos/turmas, montar o resumo, gravar o feedback) usam o padrão de dois passos.
- Etapas com mais de 25 opções (aluno, envolvido) usam um select paginado (botões Anterior/Próximo).
- Se o monitor marcar plágio em mais de uma questão, o bot primeiro pergunta se foi a
  mesma pessoa envolvida em todas — se sim, pergunta curso e aluno uma única vez e
  aplica a todas as questões; se não, pergunta separadamente para cada questão (cada
  uma pode ter um envolvido diferente).
- Na pergunta "quantas questões corretas", o monitor pode responder **F** em vez de um número
  quando o aluno não entregou/respondeu a lista — distinto de responder 0 (aluno respondeu e
  errou tudo). Quando F é escolhido, o bot zera a pontuação, não pergunta IA/plágio/proibição
  (não fazem sentido pra uma lista não entregue) e vai direto pra confirmação. A planilha grava
  o texto "F" na coluna de questões corretas em vez de um número (`Feedback.faltou`).
- A etapa de confirmação mostra um resumo completo (embed) antes de gravar.
- Conversas em memória sem atividade por 15 minutos são descartadas automaticamente (não há um
  comando explícito de "sair" no fluxo por componentes — fechar a mensagem efêmera não avisa o
  bot).
- Uma conta do Discord sem monitor ativo vinculado recebe a mensagem "não cadastrado, procure um
  chefe" e não consegue iniciar o fluxo — é assim que a janela de migração de monitores existentes
  fica segura por construção (ver `docs/change/2026-09-02-migracao-bot-discord.md`).
- Cada período usa um servidor do Discord próprio (`Periodo.discordGuildId`, `discordMonitoresRoleId`,
  `discordAvisosCanalId`), criado do zero a cada semestre — o bot fica presente em vários servidores
  simultaneamente (um por período, incluindo os de períodos antigos que não foram removidos) e
  registra o `/feedback` em todos eles. O que restringe o comando a "o canal certo" já basta pra
  restringir também a "o servidor certo", já que um canal do Discord pertence a exatamente um
  servidor.

## Casos de borda

- Se os alunos elegíveis do monitor mudarem entre a escolha da lista e a resposta (reatribuição,
  remoção), o bot avisa que não há mais alunos sob responsabilidade e encerra o fluxo, em vez de
  mostrar um select vazio.
- Falha ao sincronizar com a planilha depois de gravar o feedback não desfaz o registro — o
  feedback fica salvo e a mensagem final avisa que a planilha precisa ser reprocessada depois.
- Trocar o servidor vinculado a um período limpa automaticamente o cargo e o canal escolhidos antes
  (pertencem ao servidor anterior, não existem no novo).

## Aviso de queda de conexão

Um watchdog interno (`DiscordBot.verificarConexao`) checa a cada minuto se o bot ainda está
conectado ao Discord. Se ficar desconectado por mais de 5 minutos sem reconectar sozinho, todo
chefe com conta ativa recebe um e-mail de aviso; quando volta a conectar, recebe um segundo e-mail
confirmando a recuperação (com o tempo aproximado que ficou fora). No máximo um e-mail de cada tipo
por episódio de instabilidade, independente de quantas vezes a conexão oscilar internamente.

Isso **não cobre**: o processo da API cair inteiro (não só a conexão com o Discord — nesse caso o
Docker reinicia sozinho via `restart: unless-stopped`, mas ninguém é avisado do evento em si) nem o
bot nunca conseguir subir por falta/erro em `DISCORD_BOT_TOKEN` depois de um deploy (o processo sobe
normalmente, só o bot fica silenciosamente desligado — ver log de boot ou a tela Bot do painel).
