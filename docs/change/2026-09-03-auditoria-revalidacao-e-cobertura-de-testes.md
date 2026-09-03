# Auditoria: revalidação de selects, bug de configuração do servidor e cobertura de testes

Data: 2026-09-03

## O que mudou

- **Revalidação server-side dos selects do bot** (segurança): as etapas do fluxo `/feedback`
  que recebem um id via select do Discord (escolha do aluno, curso do envolvido em plágio,
  aluno envolvido em plágio) passaram a revalidar esse id contra a lista computada no servidor
  antes de usá-lo, em vez de confiar diretamente no valor devolvido pela interação. O Discord
  não garante que esse valor é uma das opções que o bot ofereceu; sem a revalidação, uma
  interação forjada poderia registrar feedback para um aluno fora da responsabilidade do
  monitor — o caso mais concreto é o de alunos sem dupla, que não passam pela checagem de
  semana A/B feita dentro de `criarFeedback`. Ver `docs/seguranca.md`.
- **Bug de perda de configuração corrigido**: `PUT /bot/periodos/:id/servidor` limpava cargo e
  canal do período toda vez que o servidor era salvo — inclusive na primeira vez, quando não
  havia servidor algum antes. Agora só limpa quando o servidor está de fato **trocando** por um
  diferente do que já estava vinculado; definir pela primeira vez ou salvar o mesmo servidor de
  novo preserva cargo e canal já configurados.
- **Cobertura de teste do fluxo do bot**: `services/discord-bot.ts` tinha ~35% de cobertura de
  linhas antes desta auditoria — os testes existentes injetavam uma conversa já pronta no meio
  do fluxo e testavam só uma transição isolada; nenhum teste percorria o caminho desde
  `/feedback` até a gravação de fato. Adicionados: o caminho feliz completo (entrada →
  lista → aluno → pontuação → IA/plágio/proibição → resumo → gravação, incluindo a
  sincronização com a planilha), as checagens de entrada de `iniciarFluxo` (monitor não
  vinculado/inativo, canal não configurado, canal errado, sem listas), os dois modos de falha
  de `gravarFeedback` (validação de negócio rejeitada; feedback salvo mas a planilha falha), a
  paginação e os botões sim/não/cancelar de `tratarBotao`, a validação de `tratarModal`
  (fallback de texto livre para listas com mais de 25 questões/questões) e o despacho de
  questões via select. Cobertura de `discord-bot.ts` subiu para ~74% de linhas / ~65% de
  branches; cobertura do backend como um todo subiu de ~60% para ~68% de statements.

## Por quê

Pedido direto: como a migração dos monitores cadastrados só pode acontecer no momento do
deploy (não dá para testar o vínculo real sem produção), a chefe pediu uma auditoria completa
por "pontas soltas, bugs, vazamentos, inseguranças" antes de ir pra produção — e, nesta
segunda rodada, uma verificação específica de que o código foi de fato desenvolvido com TDD
(cobertura de teste condizente com o volume de lógica de negócio, não só os testes que existem
hoje).

## Escopo / arquivos principais

- `apps/api/src/services/discord-bot.ts` (`rejeitarSelecaoInvalida`, revalidação nas etapas
  `aluno`/`cursoEnvolvido`/`envolvido`)
- `apps/api/src/routes/bot.ts` (`PUT /bot/periodos/:id/servidor`, guarda `trocandoDeServidor`)
- `apps/api/test/services/discord-bot-revalidacao.test.ts` (novo)
- `apps/api/test/services/discord-bot-entrada.test.ts` (novo)
- `apps/api/test/services/discord-bot-fluxo-completo.test.ts` (novo)
- `apps/api/test/services/discord-bot-gravar-feedback.test.ts` (novo)
- `apps/api/test/services/discord-bot-botoes.test.ts` (novo)
- `apps/api/test/services/discord-bot-modal.test.ts` (novo)
- `apps/api/test/services/discord-bot-questoes-select.test.ts` (novo)
- `apps/api/test/routes/bot.test.ts` (3 casos cobrindo primeira vinculação / mesmo servidor /
  troca de servidor)
- `docs/seguranca.md`, `README.md` (atualizados para refletir o bot do Discord de ponta a
  ponta — ainda descreviam WhatsApp/Baileys/QR code residualmente)

## Como foi verificado

- `pnpm -r typecheck`, `pnpm -r build` e `pnpm lint` limpos no monorepo inteiro.
- `pnpm --filter @feedbot/api test`: 195 testes passando (36 novos casos adicionados nesta
  auditoria, incluindo os de revalidação e os de cobertura do fluxo do bot).
- `pnpm --filter @feedbot/api test:coverage`: `discord-bot.ts` subiu de 35,1%/23,6% para
  74,2%/65,4% (linhas/branches); cobertura geral do backend subiu de ~60%/51% para ~68%/58%.
  Gaps remanescentes documentados em `docs/seguranca.md` (métodos que só encapsulam chamadas
  diretas à API do Discord, com pouca lógica de negócio própria).
