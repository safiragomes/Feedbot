# Fases 2, 3, 5 e 6 — bot de feedback, Sheets, grupos e privacidade (retomada)

Data: 2026-08-20

## O que mudou

Uma sessão anterior já havia implementado boa parte das Fases 2, 3, 5 e 6
(`apps/api/src/services/whatsapp-bot.ts`, `services/google-sheets.ts`,
`services/feedback.ts`, `routes/bot.ts`, `routes/feedback.ts`,
`routes/privacy.ts`, além de um `apps/web/src/App.tsx` já consumindo a API
real), mas isso nunca tinha sido registrado em `plano-desenvolvimento.md` /
`docs/change/`, não havia testes cobrindo essa lógica nova, e nada disso
estava commitado (repositório sem nenhum commit). Esta entrega retoma esse
trabalho: revisa o que já existia, corrige um erro real encontrado, adiciona
cobertura de teste que faltava e atualiza o plano para refletir o estado real
do código.

- **Correção de bug**: `apps/web/src/App.tsx` chamava `setErro("")`
  sincronamente antes do primeiro `await` dentro da função `load`, invocada
  direto no corpo de um `useEffect` — violação real de
  `react-hooks/set-state-in-effect` (não falso positivo: o `pnpm lint`
  falhava). Corrigido adiando todas as atualizações de estado para depois do
  `await`, e envolvendo `load` em `useCallback` para satisfazer
  `exhaustive-deps` sem recriar a função a cada render.
- **Testes novos**: `apps/api/test/services/feedback.test.ts`, cobrindo
  `criarFeedback` (o núcleo de regras de negócio do fluxo do bot) contra o
  Postgres local — caminho feliz com dedup de questões repetidas, registro do
  aluno envolvido em plágio, e as quatro validações de rejeição (dupla
  diferente da do monitor, quantidade de questões fora do intervalo, número
  de questão inválido, aluno envolvido em plágio próprio). Nenhuma rota do
  bot/Sheets tinha teste antes desta entrega.
- **Plano atualizado**: `plano-desenvolvimento.md` — Fases 2, 3, 5 e 6 tinham
  todos os itens como `[ ]` mesmo com código já implementado; marcadas como
  "🟡 código implementado, pendente validação" com os itens de código
  concluídos, mantendo em aberto apenas o que de fato depende de verificação
  manual fora deste ambiente (parear um número real de WhatsApp, escrever
  numa planilha real) ou de trabalho que ainda não existe (tela "Grupos do
  WhatsApp" no dashboard, paridade visual completa do dashboard com o
  protótipo).

## Por quê

Ref: `plano-desenvolvimento.md` (Fases 2, 3, 5, 6) ·
[docs/change/2026-08-19-fase-1-gestao-e-autenticacao.md](2026-08-19-fase-1-gestao-e-autenticacao.md).
O objetivo desta sessão era continuar de onde uma execução anterior parou.
Como o progresso não estava documentado nem commitado, a primeira etapa foi
auditar o que já existia no código antes de escrever qualquer linha nova, e
só então corrigir o que estava de fato quebrado (o lint) e fechar a lacuna
mais arriscada (zero testes na lógica que grava dados no banco a partir do
bot).

## Escopo / arquivos principais

- `apps/web/src/App.tsx` (correção do bug de `setState` em efeito)
- `apps/api/test/services/feedback.test.ts` (novo)
- `plano-desenvolvimento.md`

## Como foi verificado

- `pnpm lint`, `pnpm --filter @feedbot/api typecheck`,
  `pnpm --filter @feedbot/web typecheck`: limpos.
- `pnpm --filter @feedbot/api build`, `pnpm --filter @feedbot/web build`:
  limpos.
- `pnpm --filter @feedbot/api test`: 15 testes passando (9 anteriores + 6
  novos de `criarFeedback`), contra o Postgres local
  (`docker compose up db`, já em execução). Confirmado manualmente que o
  `afterAll` do novo teste não deixa dados residuais (`periodo.findMany`
  filtrando pelo prefixo usado no teste retorna 0 linhas após a suíte
  rodar).
- `pnpm --filter @feedbot/web test`: 1 teste passando (sem mudança de
  cobertura nesta entrega).

## Limite desta entrega

Não commitei nada — o repositório segue sem nenhum commit
(`git log` vazio), incluindo o trabalho de sessões anteriores. Os itens
marcados como pendentes de "validação com número/planilha real" continuam
sem verificação end-to-end: este ambiente não tem um número de WhatsApp de
teste nem credenciais de uma planilha Google real para exercitar
`whatsapp-bot.ts` e `google-sheets.ts` de ponta a ponta. A tela "Grupos do
WhatsApp" (Fase 5) e a paridade visual completa do dashboard com o protótipo
(Fase 4) ainda não existem.
