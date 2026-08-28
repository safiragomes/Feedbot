# Segurança e operação

## Controles implementados

- Todas as rotas administrativas exigem sessão revogável de um monitor-chefe ativo.
- Login e bootstrap possuem limitação de tentativas; senhas usam `scrypt` com salt.
- Tokens são aleatórios, armazenados no banco somente como hash e expiram em 12 horas.
- O navegador recebe a sessão em cookie `HttpOnly`, `SameSite=Strict` e `Secure` em
  produção; o token não é exposto ao JavaScript nem salvo em `localStorage`.
- Alterações autenticadas por cookie exigem um cabeçalho próprio, como defesa adicional
  contra CSRF. Clientes externos podem continuar usando o esquema Bearer.
- Um novo login revoga sessões anteriores da mesma conta e remove sessões expiradas.
- Entradas HTTP, CSV e ocorrências de feedback têm limites de tamanho.
- Relações de aluno, monitor, lista, turma e plágio são validadas por período.
- Respostas da API usam `no-store` e cabeçalhos defensivos.
- O PostgreSQL do Compose é publicado somente em `127.0.0.1`.
- Credenciais da sessão do WhatsApp ficam fora do Git e o diretório usa permissão `0700`.

## Checklist de produção

1. Use HTTPS em um proxy reverso e não publique PostgreSQL ou o diretório do Baileys.
2. Defina `DATABASE_URL`, `AUTH_BOOTSTRAP_SECRET`, `WEB_ORIGIN` e credenciais Google por
   um gerenciador de segredos; nunca reutilize os valores de exemplo.
3. Execute migrations antes de iniciar a API e mantenha backups criptografados testados.
4. Restrinja logs, backups e a planilha às pessoas autorizadas, pois contêm dados acadêmicos.
5. Rode periodicamente `pnpm audit --prod`, `pnpm lint`, `pnpm typecheck` e `pnpm test`.
6. Revogue contas e sessões imediatamente quando um chefe sair da equipe.

## Riscos residuais conhecidos

- Baileys é uma integração não oficial. Mudanças do WhatsApp podem interromper o bot e
  uma sessão local roubada permite operar o número conectado. Para maior garantia e
  suporte oficial, planeje migração para a WhatsApp Business Platform.
- Chefes possuem acesso administrativo global, não limitado ao próprio período. Caso haja
  equipes independentes por período, será necessário introduzir autorização por escopo.
- Google Sheets e WhatsApp dependem de serviços externos; falhas reais desses serviços não
  são reproduzidas integralmente pela suíte automatizada local.
