# Auditoria de arquitetura e segurança

## Correções aplicadas

- Extraída a classificação da importação do adaptador Google para a camada de aplicação.
- Criados testes automatizados de fronteiras arquiteturais.
- CORS passou a aceitar apenas origens HTTP(S) exatas, sem wildcard, caminho ou credenciais.
- Domínios públicos exigem HTTPS em produção; confiança em proxy é explícita por `TRUST_PROXY`.
- Adicionados CSP, HSTS em produção e `Cross-Origin-Resource-Policy`.
- Logs de produção foram ativados com ocultação de cookies, `Authorization` e `Set-Cookie`.
- Hash de tokens de sessão aleatórios passou de `scrypt` para SHA-256, reduzindo custo de CPU por
  requisição sem reduzir a resistência dos tokens de 256 bits.
- Login agora executa verificação `scrypt` também para e-mail inexistente, reduzindo enumeração por
  tempo de resposta.
- Chave e payload criptografado do refresh token Google ganharam validação estrutural estrita.
- `.env.example` documenta toda a configuração OAuth e de proxy.
- Permissões do `.env` local foram restringidas a leitura/escrita do proprietário.

## Verificação

- `pnpm audit --prod`: nenhuma vulnerabilidade conhecida.
- Testes de segurança cobrem origens, proxy, hash de sessão e fronteiras de camadas.
- Suíte, lint, typecheck e build completos.

## Riscos residuais

- Baileys continua sendo uma biblioteca não oficial e a sessão local continua sendo um segredo de
  alto impacto.
- Chefes ainda possuem acesso global a todos os períodos; autorização por período é evolução
  futura caso equipes independentes usem a mesma instalação.
- A API deve ficar atrás de HTTPS e firewall; cabeçalhos não substituem isolamento de rede,
  backups criptografados e rotação de segredos.
