# Migração do bot de WhatsApp para Discord

Data: 2026-09-02

## O que mudou

- Removido o bot de WhatsApp (`WhatsAppBot`, `@whiskeysockets/baileys`, `.baileys-auth`, endpoints
  de QR/conectar/desconectar/desvincular, volume `feedbot-baileys-auth`).
- Novo bot de Discord (`DiscordBot`, `discord.js`), autenticado por token estático
  (`DISCORD_BOT_TOKEN`), sem pareamento por QR. O fluxo de registro de feedback (`/feedback`) foi
  redesenhado com componentes nativos — slash command, select menus, botões e modais — em vez do
  menu por texto do WhatsApp. Corrigido, na mesma reescrita, o bug pré-existente que atribuía todas
  as questões de plágio marcadas ao mesmo aluno envolvido: agora é um envolvido por questão.
- `Monitor.whatsappNumero` virou opcional/histórico (`String? @unique`, era obrigatório); nova
  identidade de bot é `Monitor.discordUserId` (+ `discordUsername`, `discordDisplayName`,
  `discordAvatarUrl`, `discordVinculadoEm` para exibição e auditoria).
- `Periodo.whatsappAvisosId`/`whatsappComunidadeNome` (feature de broadcast/entrada) viraram
  `discordAvisosCanalId`/`discordAvisosCanalNome` — a chefe escolhe um canal de texto do servidor
  em vez de uma comunidade do WhatsApp; o bot publica um embed com um botão "Registrar feedback".
- `BotSessao.numeroConectado` virou `discordBotTag` + `guildNome`.
- Novo endpoint `GET /discord/membros-monitores`: lista, ao vivo, os membros do servidor com o
  cargo "Monitores" (nome do cargo configurado via `DISCORD_MONITORES_ROLE_ID`), com um flag
  `jaVinculado` indicando se já pertence a outro monitor. Novo endpoint `GET /bot/canais-disponiveis`
  para a mesma finalidade em relação aos canais de texto.
- Painel web: `DiretorioMonitores`, `NovoMonitorModal` e `AtribuirMonitorModal` trocaram o campo de
  texto de número de WhatsApp por um seletor (`DiscordMemberPicker`) que busca a lista acima e
  deixa escolher por nome/usuário — tanto para cadastrar um monitor novo quanto para vincular um já
  existente. A página `Bot` perdeu a UI de QR code/conectar e ganhou um status somente-leitura
  (online/offline, tag do bot, nome do servidor).
- **Sem migração automática de dados**: `whatsappNumero` não pode ser mapeado para
  `discordUserId` (não há como inferir a conta do Discord de alguém a partir do telefone). Cada
  monitor ativo precisa ser vinculado manualmente pela chefe, uma vez, pelo painel — enquanto isso
  não acontece, `/feedback` responde "não cadastrado, procure um chefe" para esse monitor (mesma
  mensagem que já existia para número desconhecido no WhatsApp), o que torna a janela de transição
  seguro por construção: ninguém não-vinculado consegue registrar feedback por engano.

## Por quê

Ref: [ADR-0005](../adr/0005-bot-discord-em-vez-de-whatsapp.md) ·
`docs/specs/controle-sessao-bot.md`. O bot de WhatsApp já teve dois números banidos — risco
inerente a bibliotecas não-oficiais do protocolo WhatsApp Web, não corrigível permanecendo no
WhatsApp. O Discord tem API de bot oficial (token estático, sem risco de banimento pelo padrão de
uso deste bot) e permite uma UX bem melhor (componentes interativos) no mesmo canal privado da
monitoria que a equipe já usa.

## Escopo / arquivos principais

- `apps/api/prisma/schema.prisma`, migration `20260902213013_discord_migration_monitor_periodo_botsessao`
- `apps/api/src/services/discord-bot.ts` (novo, substitui `services/whatsapp-bot.ts`, removido)
- `apps/api/src/application/discord/membros.ts` (novo)
- `apps/api/src/application/feedback-flow/consultas.ts` (novo — consultas puras extraídas do bot)
- `apps/api/src/routes/bot.ts`, `apps/api/src/routes/management.ts`,
  `apps/api/src/application/gestao/gestao-service.ts`
- `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/scripts/bootstrap-producao.ts`
- `apps/web/src/components/DiscordMemberPicker.tsx` (novo), `DiretorioMonitores.tsx`,
  `MonitorAccessModals.tsx`, `components/gestao/AtribuirMonitorModal.tsx`, `pages/Bot.tsx`
- `apps/web/src/lib/types.ts`, `apps/web/src/lib/api.ts`
- `docker-compose.yml`, `docker-compose.production.yml`, `.env.example`, `.env.production.example`

## Como foi verificado

- `pnpm -r typecheck`, `pnpm -r build` e `pnpm lint` limpos no monorepo inteiro.
- `pnpm -r test`: 147 testes em `apps/api` (incluindo novos testes de `application/discord/membros`,
  `application/feedback-flow/consultas`, rotas de bot reescritas e o caso de borda "sem alunos
  elegíveis" portado para o novo bot) e 14 em `apps/web`, todos passando.
- `test/architecture/layer-boundaries.test.ts` (guarda-corpo de fronteira domain/application)
  passou sem alteração, confirmando que o código novo do Discord respeita a mesma separação de
  camadas do bot antigo.
- Verificação manual em ambiente sandbox do Discord (aplicação/bot e servidor de teste separados
  de produção) fica como próximo passo antes do corte em produção — não coberta por este commit,
  que é a implementação; ver ADR-0005 para o plano de rollout completo.
