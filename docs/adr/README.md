# Architecture Decision Records (ADR)

Este diretório registra decisões arquiteturais significativas do Feedbot: o que foi decidido, o contexto que levou à decisão e as consequências aceitas.

## Quando criar um ADR

Sempre que uma decisão for difícil de reverter ou afetar múltiplas partes do sistema: escolha de stack, formato de integração externa (WhatsApp, Google Sheets), modelo de autenticação/autorização, estratégia de dados, etc. Mudanças de implementação local (refatoração, nome de função) não precisam de ADR — isso é para `docs/change/` ou para o histórico do git.

## Como criar um ADR

1. Copie `template.md` para `NNNN-titulo-curto-em-kebab-case.md`, usando o próximo número sequencial de 4 dígitos.
2. Preencha Contexto, Decisão e Consequências.
3. Status inicial é `Proposto`. Quando aceito (mesmo que já implementado), mude para `Aceito`.
4. Se uma decisão futura substituir esta, não edite o ADR antigo — crie um novo ADR e marque o antigo como `Substituído por ADR-NNNN`.

## Índice

- [ADR-0001](0001-registrar-decisoes-arquiteturais.md) — Registrar decisões arquiteturais
- [ADR-0002](0002-stack-tecnologica.md) — Stack tecnológica do Feedbot
- [ADR-0003](0003-bot-whatsapp-biblioteca-nao-oficial.md) — Bot do WhatsApp via biblioteca não-oficial (QR code) e suporte a grupos — substituído por ADR-0005
- [ADR-0004](0004-arquitetura-em-camadas-e-seguranca.md) — Arquitetura em camadas e configuração segura
- [ADR-0005](0005-bot-discord-em-vez-de-whatsapp.md) — Bot do Discord em vez de WhatsApp
