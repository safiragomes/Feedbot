# Nome do monitor editável e cache do seletor de membros do Discord

Data: 2026-09-03

## O que mudou

- O nome do monitor (`Monitor.nome`) agora é editável direto no diretório de monitores — clique no
  nome pra editar inline, mesmo padrão de clique-para-editar já usado no campo do Discord. O
  backend já aceitava `nome` no `PATCH /monitores/:id`; só faltava a UI.
- Ao vincular a conta do Discord de um monitor já existente, se o nome de exibição escolhido for
  diferente do nome cadastrado, aparece a opção "Também renomear o monitor para '<nome>'" (marcada
  por padrão) — pensado pra migração em massa dos monitores já cadastrados pro nome que eles usam
  no Discord.
- `DiscordBot.membrosComPapelMonitores` passou a cachear o resultado por 60 segundos (por
  servidor+cargo). A busca ao vivo (`guild.members.fetch`) usa o Gateway do Discord, que tem um
  rate limit próprio pro opcode 8 (Request Guild Members) — abrir o seletor de monitores repetidas
  vezes em pouco tempo (várias linhas do diretório, ou o cadastro de vários monitores seguidos)
  estava batendo nesse limite na prática ("Request with opcode 8 was rate limited").
- `DiscordMemberPicker` deixou de listar (em vez de só desabilitar) membros já vinculados a outro
  monitor — reduz ruído ao vincular muitos monitores em sequência. Essa checagem consulta o banco
  direto a cada chamada (sem cache), então excluir um monitor libera o membro dele de volta na
  lista imediatamente, sem precisar esperar o cache de 60s dos membros do Discord expirar.

## Por quê

Pedido direto durante o uso real do painel: a chefe quer migrar os nomes dos monitores já
cadastrados pra bater com o nome de exibição no Discord (planejando puxar os nomes direto de lá nos
próximos períodos), e esbarrou no rate limit do Discord ao abrir o seletor de membros repetidas
vezes seguidas.

## Escopo / arquivos principais

- `apps/web/src/pages/DiretorioMonitores.tsx` (`NomeCell`, checkbox de sincronizar nome)
- `apps/api/src/services/discord-bot.ts` (`cacheMembros`, `MEMBROS_CACHE_MS`)
- `apps/web/src/components/DiscordMemberPicker.tsx` (filtra já vinculados em vez de desabilitar)

## Como foi verificado

- `pnpm -r typecheck`, `pnpm -r build` e `pnpm lint` limpos no monorepo inteiro.
- `pnpm --filter @feedbot/api test`: 166 testes passando, incluindo os casos garantindo que o cache
  evita uma segunda chamada a `guild.members.fetch` dentro da janela mas busca de novo pra uma
  combinação servidor+cargo diferente (`test/services/discord-bot-membros-cache.test.ts`), e que
  excluir o monitor vinculado libera o membro de volta na próxima consulta, sem esperar nenhum
  cache expirar (`test/routes/bot.test.ts`).
