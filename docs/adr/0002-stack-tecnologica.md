# 0002. Stack tecnológica do Feedbot

Data: 2026-08-17

## Status

Aceito

## Contexto

O Feedbot precisa de: uma API que sirva tanto o bot do WhatsApp quanto o dashboard web; um banco relacional que reflita o modelo de dados desenhado (Período → Grupo → Dupla → Aluno/Monitor → Feedback, ver `monitoria-especificacao.md` seção 2); um frontend para os 6 chefes de monitoria; e hospedagem de baixo custo, já que é uma ferramenta interna de disciplina, sem orçamento de produto comercial. A equipe que vai desenvolver é pequena, então minimizar troca de contexto entre linguagens/ferramentas importa mais do que otimizar performance de ponta.

## Decisão

- **Backend**: Node.js + TypeScript, Fastify.
- **Banco/ORM**: PostgreSQL + Prisma — o modelo relacional já desenhado (FKs claras entre as entidades) se encaixa bem em Prisma, que gera migrations automaticamente a partir do schema.
- **Dashboard**: React + TypeScript + Vite + Chart.js (mesma biblioteca de gráficos já usada no protótipo `monitoria-prototipo.html`, preservando o visual validado).
- **Autenticação dos chefes**: login por e-mail institucional (magic link ou senha), todos os 6 chefes com o mesmo nível de acesso — sem necessidade de um provedor de identidade complexo dado o número pequeno de usuários.
- **Hospedagem**: backend + Postgres em um provedor de baixo custo (Railway ou Render); frontend em Vercel.
- Todo o stack é TypeScript de ponta a ponta (backend, frontend, schema do Prisma).

## Consequências

Um único monorepo TypeScript reduz fricção para quem desenvolve os dois lados. Prisma acelera o início do projeto, mas amarra o time ao seu modelo de migrations — aceitável dado o porte do projeto. Fastify e Vite são leves e bem documentados, mas têm ecossistemas menores que alternativas mais populares (Express, Next.js) — troca aceita em favor de performance de build/dev e simplicidade.

Esta decisão **não cobre** a conectividade do bot com o WhatsApp em si — ver [ADR-0003](0003-bot-whatsapp-biblioteca-nao-oficial.md).
