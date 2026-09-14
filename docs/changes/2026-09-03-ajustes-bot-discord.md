# Ajustes no bot do Discord após a migração

Data: 2026-09-03

## O que mudou

- `/feedback` e o botão do painel agora só funcionam no canal vinculado como canal de
  registro do período (`Periodo.discordAvisosCanalId`) — em qualquer outro canal do servidor, o
  bot recusa e indica o canal correto, em vez de responder em qualquer lugar que o slash command
  esteja registrado.
- No fluxo de plágio, a pergunta "foi a mesma pessoa em todas as questões?" só aparece quando há
  mais de uma questão marcada — evita repetir curso+aluno quando só uma questão foi marcada.
- Nova distinção entre **0 corretas** (aluno respondeu e errou tudo) e **F** (aluno não
  entregou/respondeu a lista), refletindo a mesma convenção já usada na planilha. Na etapa de
  pontuação do bot, o monitor pode responder F em vez de um número; quando isso acontece, o bot
  zera a pontuação, pula as perguntas de IA/plágio/proibição (não fazem sentido pra uma lista não
  entregue) e vai direto pra confirmação. Novo campo `Feedback.faltou` no schema; a sincronização
  com a planilha grava o texto "F" na coluna de questões corretas em vez de um número quando esse
  campo é verdadeiro.
- `DiscordMemberPicker` (usado no cadastro/vínculo de monitores) ganhou uma opção de inserir o ID
  do Discord manualmente, para quando o membro não aparece na busca ao vivo (ex.: problema de
  permissão do bot no servidor).
- O seletor de canal na tela Bot (vincular canal de avisos) passou a usar o componente de busca
  padrão do sistema (`FilterSelect`, já usado nos filtros de Grupo/Lista) em vez de um `<select>`
  nativo.
- Textos residuais de "WhatsApp" que sobraram na interface (menu lateral, tela de login, rodapé do
  e-mail de aviso de queda do bot) foram corrigidos para "Discord".
- Otimização de latência: passos do fluxo que não dependem de consulta ao banco (sim/não, F,
  cancelar) agora respondem num único round-trip ao Discord (`Interaction.update`) em vez do padrão
  de dois passos (`deferUpdate` + `editReply`) usado antes em todos os passos. Corrigido, na mesma
  mudança, um bug introduzido por essa otimização: quando nenhuma etapa/customId batia com o
  esperado (mensagem obsoleta de um fluxo reiniciado), a interação ficava sem nenhuma resposta,
  algo que o Discord mostra como "Esta interação falhou" — agora sempre confirma o recebimento
  nesse caso, mesmo sem mudar a mensagem.
- Reescrito o aviso por e-mail de queda/recuperação de conexão do bot. A versão anterior (portada
  do bot de WhatsApp) usava os eventos `ShardDisconnect`/`ClientReady` do discord.js — mas
  `ClientReady` só dispara uma vez na vida do processo, então depois da primeira queda o aviso de
  "reconectado" parava de funcionar e o bot nunca mais avisava de quedas seguintes. Substituído por
  um watchdog de checagem periódica (a cada minuto, olhando `client.isReady()`), que garante no
  máximo um e-mail de queda e um de recuperação por episódio de instabilidade — sem depender da
  semântica exata de cada evento de shard do discord.js.
- Corrigida uma exposição de segurança local: ao remover o código do bot de WhatsApp, a entrada do
  `.gitignore` para `apps/api/.baileys-auth/` também foi removida — mas a pasta local ainda tinha
  as credenciais reais da sessão antiga do Baileys (chaves de identidade, `creds.json`), que
  passaram a aparecer como não rastreadas no git. Reintroduzida a entrada no `.gitignore`.
- Adicionada validação de formato (dígitos apenas) na entrada manual de ID do Discord no
  `DiscordMemberPicker`, e removido CSS morto do QR code do WhatsApp (`.qr-box`).

## Por quê

Ref: [ADR-0005](../adr/0005-bot-discord-em-vez-de-whatsapp.md) ·
`docs/specs/controle-sessao-bot.md`. Ajustes de usabilidade e correção pedidos durante a
configuração real do bot em produção, logo após a migração de WhatsApp para Discord: o comando
precisava ficar restrito ao canal correto (segurança/organização), o fluxo de plágio estava
repetitivo no caso comum de um único envolvido, e a planilha já tinha uma convenção (F) que o bot
não conseguia registrar.

## Escopo / arquivos principais

- `apps/api/prisma/schema.prisma`, migration `20260902233046_feedback_faltou`
- `apps/api/src/services/discord-bot.ts` (restrição de canal, fluxo de plágio, etapa de pontuação)
- `apps/api/src/services/feedback.ts` (`NovoFeedback.faltou`, `criarFeedback`)
- `apps/api/src/services/google-sheets.ts` (`sincronizarFeedback` grava "F")
- `apps/web/src/components/DiscordMemberPicker.tsx` (entrada manual de ID)
- `apps/web/src/pages/Bot.tsx` (seletor de canal com `FilterSelect`)
- `apps/web/src/components/Sidebar.tsx`, `apps/web/src/pages/Login.tsx` (textos residuais)
- `apps/api/src/services/email.ts` (texto residual no rodapé do aviso de queda)
- `.gitignore` (reintrodução da entrada de `.baileys-auth/`)
- `apps/web/src/index.css` (remoção do `.qr-box` morto)

## Como foi verificado

- `pnpm -r typecheck`, `pnpm -r build` e `pnpm lint` limpos no monorepo inteiro.
- `pnpm --filter @feedbot/api test`: 156 testes passando, incluindo os novos casos — plágio da
  mesma pessoa em várias questões vs. pessoas diferentes por questão
  (`test/services/discord-bot-plagio.test.ts`), fluxo de "F" zerando pontuação e pulando direto
  pra confirmação (`test/services/discord-bot-faltou.test.ts`), `criarFeedback` zerando
  pontuação/ocorrências quando `faltou: true` mesmo com dados divergentes enviados
  (`test/services/feedback.test.ts`), e o watchdog de conexão garantindo no máximo um e-mail de
  queda e um de recuperação por episódio de instabilidade (`test/services/discord-bot-watchdog.test.ts`).
- Verificação manual do bot em produção durante a própria sessão de configuração: conexão,
  listagem de membros por cargo (69 membros confirmados via script de diagnóstico direto contra a
  API do Discord) e vínculo de canal restrito ao cargo de chefes.
