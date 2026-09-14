# Segurança e operação

## Controles implementados

- Todas as rotas administrativas exigem sessão revogável de um monitor-chefe ativo.
- Login e bootstrap possuem limitação de tentativas; senhas usam `scrypt` com salt.
- Tokens são aleatórios, armazenados no banco somente como hash e expiram em 12 horas.
- O hash de sessão usa SHA-256 sobre tokens aleatórios de 256 bits; senhas continuam usando
  `scrypt`. O login executa trabalho equivalente mesmo quando o e-mail não existe.
- O navegador recebe a sessão em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em
  produção; o token não é exposto ao JavaScript nem salvo em `localStorage`.
- Alterações autenticadas por cookie exigem um cabeçalho próprio, como defesa adicional
  contra CSRF. Clientes externos podem continuar usando o esquema Bearer.
- Um novo login revoga sessões anteriores da mesma conta e remove sessões expiradas.
- Entradas HTTP, CSV e ocorrências de feedback têm limites de tamanho.
- Relações de aluno, monitor, lista, turma e plágio são validadas por período.
- Respostas da API usam `no-store` e cabeçalhos defensivos.
- CORS aceita somente origens exatas; CSP bloqueia conteúdo, frames e recursos na API.
- Refresh tokens Google usam AES-256-GCM e têm formato/chave validados antes do uso.
- Logs de produção ocultam cookies e cabeçalhos de autorização.
- O PostgreSQL do Compose é publicado somente em `127.0.0.1`.
- O bot do Discord autentica por token estático (`DISCORD_BOT_TOKEN`), sem sessão local
  persistida em disco — ao contrário da integração anterior com WhatsApp.
- Toda etapa do fluxo `/feedback` que aceita um valor de select do usuário (aluno, curso do
  envolvido, aluno envolvido em plágio) revalida esse valor contra a lista computada no
  servidor antes de usá-lo, em vez de confiar cegamente no que a interação do Discord devolve.
  O Discord não garante que o valor de um select é uma das opções que o bot realmente ofereceu
  — uma interação forjada poderia, sem essa revalidação, submeter o id de um aluno fora da
  responsabilidade do monitor (o caso mais concreto: alunos sem dupla, que não passam pela
  checagem de semana A/B feita em `criarFeedback`). Ver `test/services/discord-bot-revalidacao.test.ts`
  e `test/services/discord-bot-plagio.test.ts`.

## Checklist de produção

1. Use HTTPS em um proxy reverso e não publique a porta do PostgreSQL.
   Defina `TRUST_PROXY=true` somente quando o acesso direto à API estiver bloqueado.
2. Defina `DATABASE_URL`, `AUTH_BOOTSTRAP_SECRET`, `WEB_ORIGIN` e credenciais Google por
   um gerenciador de segredos; nunca reutilize os valores de exemplo.
3. Execute migrations antes de iniciar a API e mantenha backups criptografados testados.
4. Restrinja logs, backups e a planilha às pessoas autorizadas, pois contêm dados acadêmicos.
5. Rode periodicamente `pnpm audit --prod`, `pnpm lint`, `pnpm typecheck` e `pnpm test`.
6. Revogue contas e sessões imediatamente quando um chefe sair da equipe.

## Riscos residuais conhecidos

- Chefes possuem acesso administrativo global, não limitado ao próprio período. Caso haja
  equipes independentes por período, será necessário introduzir autorização por escopo.
- O vínculo de um monitor à conta do Discord é feito manualmente pela chefe, a partir de uma
  lista de membros do servidor buscada ao vivo — um monitor sem vínculo não consegue usar
  `/feedback` (mensagem "procure um chefe"), mas nada impede a chefe de vincular a conta
  errada por engano; não há segundo fator de confirmação além da própria chefe conferir o
  nome/avatar exibido no seletor.
- Google Sheets e a API do Discord dependem de serviços externos; falhas reais desses
  serviços não são reproduzidas integralmente pela suíte automatizada local.
- Grandes trechos de `services/discord-bot.ts` (o fluxo conversacional do bot) só ganharam
  cobertura de teste nesta auditoria — ver `docs/changes/` para a entrada mais recente. Alguns
  métodos que só encapsulam chamadas diretas à API do Discord (registro de comandos, listagem
  de cargos/canais, publicação do painel) continuam sem teste dedicado; o risco é considerado
  baixo por terem pouca lógica de negócio própria, mas vale revisitar se crescerem.
