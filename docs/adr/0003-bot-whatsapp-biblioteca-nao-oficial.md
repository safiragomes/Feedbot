# 0003. Bot do WhatsApp via biblioteca não-oficial (QR code) e suporte a grupos

Data: 2026-08-17

## Status

Aceito — substitui a decisão original registrada na seção 3 e 8 de `monitoria-especificacao.md`.

## Contexto

A especificação original decidiu pela WhatsApp Business Platform oficial (Meta Cloud API), com conexão por número verificado e token, justificando pelo limite gratuito de 250 conversas/24h (suficiente para os 60+ monitores) e por evitar o risco de banimento associado a bibliotecas não-oficiais. Ela também colocou grupos do WhatsApp fora do escopo da v1, argumentando que a Groups API da Cloud API só cria grupos novos via link de convite (não permite adicionar o bot a um grupo já existente), e que o fluxo de feedback é inerentemente individual.

O protótipo interativo (`monitoria-prototipo.html`, painel "Bot do WhatsApp"), construído e validado depois da especificação, já implementa e assume um fluxo diferente: conexão por **QR code** (padrão de bibliotecas multi-device não-oficiais, ex. Baileys) e uma tela de gestão para **adicionar o bot a grupos do WhatsApp existentes**, um por grupo de revisão — pensada para avisos/acompanhamento futuro dos chefes, sem alterar o fluxo 1:1 de registro de feedback.

Ao planejar o desenvolvimento (`plano-desenvolvimento.md`), esse conflito foi identificado e resolvido: o protótipo é a referência correta a seguir.

## Decisão

- O bot se conecta ao WhatsApp por meio de uma **biblioteca multi-device não-oficial** (ex. Baileys), pareada por **QR code**, com a sessão de autenticação persistida localmente (nunca versionada — ver `.gitignore`).
- O escopo passa a **incluir** a possibilidade de adicionar o bot a **grupos do WhatsApp já existentes**, um por grupo de revisão, geridos pela tela "Bot do WhatsApp" do dashboard.
- O fluxo de registro de feedback continua estritamente 1:1 (monitor conversando diretamente com o bot) — a capacidade de grupo é aditiva, não substitui esse fluxo.

## Consequências

- Cai a justificativa original de "250 conversas/24h sem verificação" e de "risco de banimento" como argumento a favor da Cloud API — esses riscos passam a existir do lado oposto: bibliotecas não-oficiais não têm SLA da Meta, a sessão pode cair e exigir novo QR sem aviso, e o número pode ser banido por uso fora dos termos de serviço da Meta.
- Recomenda-se um número de WhatsApp dedicado ao bot (não o número pessoal de nenhum chefe ou monitor), justamente por esse risco.
- O dashboard precisa expor claramente o status de conexão (conectado/desconectado) para que um chefe perceba rapidamente se o bot caiu e precisa de novo pareamento.
- Ganha-se a capacidade de comunicação em grupo por grupo de revisão, que a Cloud API não permitiria sem reconstruir os grupos do zero.
