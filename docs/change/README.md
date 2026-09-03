# Registro de Mudanças (Change Log)

Este diretório registra mudanças significativas entregues no projeto — um arquivo por mudança, em ordem cronológica. É diferente de `docs/adr/`: um ADR registra _por que_ uma decisão arquitetural foi tomada; um registro aqui documenta _o que_ de fato mudou no sistema em um dado momento, o que motivou e como foi verificado.

## Quando criar um registro

Ao concluir algo que altera o comportamento do sistema, do repositório ou do fluxo de trabalho de forma perceptível: uma fase do `plano-desenvolvimento.md`, uma migração de banco relevante, uma mudança de contrato de API, uma correção de bug não trivial. Não é necessário para commits triviais (typo, formatação) — para isso o histórico do git já basta.

## Como criar um registro

1. Copie `template.md` para `AAAA-MM-DD-titulo-curto-em-kebab-case.md`, usando a data em que a mudança foi concluída.
2. Preencha o quê mudou, por quê (linkando spec em `docs/specs/` e/ou ADR em `docs/adr/` quando aplicável) e como foi verificado.
3. Se a mudança tocou um spec ou proporcionou motivo para um ADR, crie/atualize esses documentos primeiro e referencie-os aqui.

## Relação com SDD e TDD

No fluxo deste projeto (spec-driven + test-driven, ver `README.md` na raiz), um registro de mudança normalmente fecha o ciclo: spec em `docs/specs/` → testes escritos a partir da spec → implementação até os testes passarem → registro aqui documentando o que foi entregue e com que cobertura de teste.

## Índice

- [2026-08-17 — Preparação do repositório e do ambiente](2026-08-17-preparacao-repositorio-e-ambiente.md)
- [2026-08-17 — Fase 0: schema Prisma completo, primeira migration e seed](2026-08-17-fase-0-fundacao-schema-e-seed.md)
- [2026-09-02 — Migração do bot de WhatsApp para Discord](2026-09-02-migracao-bot-discord.md)
- [2026-09-03 — Ajustes no bot do Discord após a migração](2026-09-03-ajustes-bot-discord.md)
- [2026-09-03 — Servidor, cargo e canal do Discord por período](2026-09-03-servidor-discord-por-periodo.md)
- [2026-09-03 — Nome do monitor editável e cache do seletor de membros do Discord](2026-09-03-nome-editavel-e-cache-membros.md)
- [2026-09-03 — Auditoria: revalidação de selects, bug de configuração do servidor e cobertura de testes](2026-09-03-auditoria-revalidacao-e-cobertura-de-testes.md)
