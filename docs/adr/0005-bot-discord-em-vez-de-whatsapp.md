# 0005. Bot do Discord em vez de WhatsApp

Data: 2026-09-02

## Status

Aceito — substitui [ADR-0003](0003-bot-whatsapp-biblioteca-nao-oficial.md).

## Contexto

ADR-0003 decidiu conectar o bot ao WhatsApp por uma biblioteca multi-device não-oficial (Baileys),
pareada por QR code, e já registrava o risco aceito conscientemente: "bibliotecas não-oficiais não
têm SLA da Meta [...] e o número pode ser banido por uso fora dos termos de serviço da Meta". Esse
risco se concretizou duas vezes — dois números dedicados ao bot foram banidos, interrompendo o
registro de feedback para todos os monitores até um novo pareamento (ou, no pior caso, um número
novo). Não há indício de que o padrão de uso (uma conversa individual por monitor, dentro de um
fluxo guiado) viole os termos de uso do WhatsApp; o banimento é inerente ao risco de operar um
cliente não-oficial do protocolo do WhatsApp Web, que a Meta pode invalidar a qualquer momento.

O bot precisa continuar vivendo num espaço fechado — hoje, a monitoria já usa (ou pretende usar) um
servidor de Discord dedicado, com um canal restrito aos monitores por cargo ("Monitores"). Ao
contrário do WhatsApp, o Discord tem uma API de bot oficial, autenticada por token estático (sem
pareamento por QR), com componentes de interface nativos (slash commands, botões, select menus,
modais) e sem risco de banimento pelo padrão de uso deste bot.

## Decisão

- O bot passa a operar exclusivamente no Discord, via `discord.js`, autenticado por
  `DISCORD_BOT_TOKEN` (token estático de aplicação, sem pareamento).
- O fluxo de registro de feedback é redesenhado com componentes nativos do Discord (slash command
  `/feedback`, botões, select menus, modais como fallback para listas com mais de 25 questões) em
  vez do menu por texto livre do WhatsApp — ver `docs/specs/controle-sessao-bot.md`.
- A identidade do monitor no bot passa de `Monitor.whatsappNumero` (número de telefone, única chave
  antes) para `Monitor.discordUserId` (ID de conta do Discord). `whatsappNumero` permanece no
  schema como campo histórico opcional — não é mais obrigatório, não é mais lido pelo bot, e pode
  ficar `null` em qualquer monitor novo.
- Não existe migração automática de `whatsappNumero` para `discordUserId`: não é possível descobrir
  a conta do Discord de alguém a partir do número de telefone. A chefe faz esse vínculo manualmente
  pelo painel, escolhendo entre os membros do servidor que têm o cargo "Monitores" (lista buscada
  ao vivo via `GET /discord/membros-monitores`) — ver `docs/changes/2026-09-02-migracao-bot-discord.md`
  para o passo a passo da transição.
- O bot do WhatsApp (`WhatsAppBot`, `@whiskeysockets/baileys`) foi removido, junto com o volume de
  sessão (`.baileys-auth` / `feedbot-baileys-auth`) e a UI de QR code no painel.

## Consequências

- Elimina o risco de banimento que já se concretizou duas vezes — a API oficial do Discord não tem
  esse modo de falha para o padrão de uso deste bot.
- Ganha-se uma UX melhor por construção: componentes nativos evitam erros de digitação (números
  fora de faixa, texto ambíguo) que o fluxo por texto do WhatsApp precisava validar a cada etapa, e
  a etapa de confirmação agora mostra um resumo antes de gravar (o WhatsApp não tinha isso).
  Aproveitando a reescrita do zero, o bug pré-existente de só permitir um aluno "envolvido" em
  plágio por conversa (mesmo com várias questões marcadas) foi corrigido: agora é um por
  questão — com um atalho de UX que pergunta primeiro se foi a mesma pessoa em todas, evitando
  repetir a pergunta de curso+aluno quando o caso comum (um único envolvido) se aplica.
- Perde-se a familiaridade do WhatsApp para monitores que não usam Discord no dia a dia — mitigado
  por já existir (ou estar sendo criado) um servidor de Discord dedicado à monitoria.
- A vinculação manual de conta do Discord é um trabalho pontual (mas real) da chefe durante a
  transição — não escala automaticamente como o WhatsApp escalava (número já era o identificador).
  Aceito conscientemente: como não há como inferir a conta do Discord de alguém, um vínculo
  self-service dependeria dos próprios monitores agirem, o que atrasaria a transição; o vínculo
  manual pela chefe, a partir de uma lista real de membros do servidor, é mais rápido e não deixa
  a migração pendente de terceiros.
- `Monitor.whatsappNumero` (histórico) e `GrupoRevisao.whatsappGrupoId`/`whatsappGrupoNome` (campos
  nunca usados por nenhum código, herdados do ADR-0003) continuam no schema sem uso ativo — a
  limpeza desses últimos é um follow-up separado, fora do escopo desta migração.
