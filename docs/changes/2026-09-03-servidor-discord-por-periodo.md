# Servidor, cargo e canal do Discord por período

Data: 2026-09-03

## O que mudou

- Cada período passa a poder ter seu próprio servidor do Discord — antes, servidor (`DISCORD_GUILD_ID`)
  e cargo de monitores (`DISCORD_MONITORES_ROLE_ID`) eram fixos por variável de ambiente, configurados
  uma única vez pra vida inteira do bot. Novos campos `Periodo.discordGuildId` e
  `Periodo.discordMonitoresRoleId`, ao lado do já existente `discordAvisosCanalId`.
- `DiscordBot` deixou de depender de um `guildId`/`roleId` fixos: `iniciar()` só exige
  `DISCORD_BOT_TOKEN`. Os métodos que antes usavam esses campos (`membrosComPapelMonitores`,
  `canaisDisponiveis`) agora recebem o `guildId`/`roleId` explicitamente por chamada. Novos métodos
  `guildsDisponiveis()` (servidores em que o bot está presente) e `rolesDisponiveis(guildId)` (cargos
  de um servidor).
- O `/feedback` é registrado em **todos** os servidores em que o bot está presente — tanto ao ficar
  pronto quanto imediatamente ao ser convidado pra um servidor novo (evento `GuildCreate`). Continua
  restrito ao canal vinculado de cada período; como um canal pertence a exatamente um servidor, isso
  já garante o servidor certo também, sem precisar de uma checagem separada.
- Painel (tela **Bot**): a antiga seção única "Canal de avisos do período" virou um fluxo de três
  passos em sequência — **1. Servidor** → **2. Cargo de monitores** → **3. Canal de registro** —,
  cada um escolhido de uma lista buscada ao vivo (`FilterSelect`), sem copiar/colar nenhum ID. Trocar
  de servidor limpa automaticamente cargo e canal escolhidos antes.
- `DiscordMemberPicker` (usado no cadastro/vínculo de monitores) agora recebe `periodoId` e busca os
  membros do servidor **daquele período** especificamente, em vez de um servidor único e global.
- Removidas as variáveis de ambiente `DISCORD_GUILD_ID`, `DISCORD_MONITORES_ROLE_ID` e o não-usado
  `DISCORD_CLIENT_ID`; só `DISCORD_BOT_TOKEN` continua sendo configuração de ambiente.

## Por quê

A monitoria cria um servidor do Discord novo a cada período (semestre) — a versão anterior do bot
assumia um único servidor fixo pra vida inteira do processo, configurado por variável de ambiente,
o que exigiria editar `.env` e reiniciar a API toda vez que um período novo começasse. Ref:
[ADR-0005](../adr/0005-bot-discord-em-vez-de-whatsapp.md) · `docs/specs/controle-sessao-bot.md`.

## Escopo / arquivos principais

- `apps/api/prisma/schema.prisma`, migration `20260903071721_periodo_discord_guild_role`
- `apps/api/src/services/discord-bot.ts` (guildsDisponiveis, rolesDisponiveis, registro de comandos
  por servidor, remoção dos campos fixos guildId/roleId)
- `apps/api/src/routes/bot.ts` (rotas `/bot/servidores-disponiveis`,
  `/bot/periodos/:id/{cargos,canais,membros-monitores}-disponiveis`, `/bot/periodos/:id/servidor`,
  `/bot/periodos/:id/cargo`)
- `apps/api/src/server.ts` (construtor do `DiscordBot` sem os parâmetros removidos)
- `apps/web/src/pages/Bot.tsx` (fluxo Servidor → Cargo → Canal)
- `apps/web/src/components/DiscordMemberPicker.tsx` (prop `periodoId`)
- `apps/web/src/lib/types.ts`, `apps/web/src/lib/api.ts`
- `README.md`, `apps/api/.env.example`, `apps/api/.env.production.example`

## Como foi verificado

- `pnpm -r typecheck`, `pnpm -r build` e `pnpm lint` limpos no monorepo inteiro.
- `pnpm --filter @feedbot/api test`: 163 testes passando, incluindo a reescrita completa de
  `test/routes/bot.test.ts` (11 casos cobrindo vincular/trocar servidor, listar cargos/canais/membros
  escopados por período, recusar operações sem servidor/cargo vinculado) e um novo teste unitário
  pra `guildsDisponiveis()` (ordenação e formato).
