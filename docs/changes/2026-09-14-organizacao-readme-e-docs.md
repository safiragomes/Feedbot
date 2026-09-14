# Organização do README e documentação operacional

Data: 2026-09-14

## O que mudou

- O `README.md` (297 linhas) tinha ~75% do conteúdo dedicado a um runbook operacional de
  produção (DNS, Docker Compose de produção, bootstrap sem seed, backups, publicação de imagens
  no GHCR, acesso SSH e o contorno via Oracle Cloud Shell) e à configuração do bot no Discord
  Developer Portal — informação de operação, não de introdução ao projeto.
- Esse conteúdo foi extraído para dois novos documentos: `docs/deploy.md` (deploy de produção,
  backups, atualizações, acesso SSH) e `docs/bot-discord.md` (configuração da aplicação no
  Developer Portal e operação contínua do bot).
- O `README.md` manter as seções "Deploy de produção" e "Bot do Discord" apenas como um resumo de
  1 parágrafo com link para o documento correspondente.
- A referência cruzada em `docs/arquitetura.md` (que apontava para a seção "Deploy de produção"
  do README) foi atualizada para `docs/deploy.md`.

## Por quê

Preparação de repositório antes de uma nova mudança de comportamento (grupo de prazo especial,
ver `docs/specs/` e `docs/changes/` correspondentes). O README deve orientar quem chega ao projeto
pela primeira vez (o que é, como rodar localmente, para onde ir); runbooks operacionais extensos
ali dentro dificultam achar as duas coisas. `monitoria-especificacao.md`, `politica-privacidade.md`,
`plano-desenvolvimento.md` e `monitoria-prototipo.html` permaneceram na raiz — são referenciados
explicitamente como parte da hierarquia de specs em `docs/specs/README.md` § "Hierarquia de specs",
não são desorganização.

## Escopo / arquivos principais

- `README.md`
- `docs/deploy.md` (novo)
- `docs/bot-discord.md` (novo)
- `docs/arquitetura.md`

## Como foi verificado

Mudança só de documentação, sem comportamento executável envolvido — validação foi leitura
cruzada: todo link novo (`docs/deploy.md`, `docs/bot-discord.md`) resolve para um arquivo
existente, nenhum conteúdo foi perdido na migração (comparação linha a linha entre o texto restante
e os dois arquivos novos), e a referência em `docs/arquitetura.md` para o antigo texto do README foi
corrigida. Não há ADR associado: é reorganização de documentação, sem decisão arquitetural.
