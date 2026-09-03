# ADR-0004: Arquitetura em camadas e configuração segura

## Contexto

O crescimento das rotas administrativas, OAuth e sincronização com Google Sheets começou a
misturar regras de classificação com detalhes de Prisma e Google APIs. Configurações permissivas
de origem e ausência de limites automatizados também facilitavam regressões de segurança.

## Decisão

Adotar quatro responsabilidades com dependência dirigida para dentro:

1. `domain/`: regras puras e determinísticas, sem HTTP, Prisma, banco ou serviços externos.
2. `application/`: casos de uso e classificação; pode depender do domínio e, durante a migração,
   de tipos do repositório, mas nunca de rotas ou adaptadores externos.
3. `services/` e `db/`: adaptadores de infraestrutura para Google, Discord e PostgreSQL.
4. `routes/`: entrada HTTP, autenticação, parsing e tradução de respostas.

Testes arquiteturais impedem dependências de `domain` para infraestrutura e de `application` para
rotas/serviços. A classificação da importação saiu do adaptador Google e foi movida para
`application/planilha`.

Configuração sensível deve falhar cedo: origens CORS são origens HTTP(S) exatas, HTTPS é exigido
para domínios públicos em produção, wildcard é proibido e confiança em proxy precisa ser ativada
explicitamente. Logs de produção ocultam cookies e autorização.

## Consequências

- Regras podem ser testadas sem rede ou banco.
- Configuração inválida impede inicialização em vez de degradar silenciosamente.
- A mudança de hash de sessão revoga uma vez as sessões anteriores ao deploy.
- A extração gradual de casos de uso existentes continua; não é necessário reescrever todo o
  sistema de uma vez.
