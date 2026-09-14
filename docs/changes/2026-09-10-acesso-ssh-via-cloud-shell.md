# Diagnóstico de acesso SSH bloqueado e fallback via Oracle Cloud Shell

Data: 2026-09-10

## O que mudou

- `README.md` ganhou uma seção "Acesso SSH ao servidor" documentando: o `chmod 600` necessário na
  primeira vez com uma chave recém-baixada, como diagnosticar "Connection timed out" na porta 22
  comparando com as portas 80/443 (site), e o fallback via Oracle Cloud Shell quando a rede de quem
  está conectando bloqueia a porta 22 de saída.
- A seção "Atualizações" ganhou o passo de `docker login ghcr.io` (estava implícito, nunca escrito).

## Por quê

O acesso SSH direto ao servidor de produção parou de funcionar a partir da rede residencial usada
pra atualizar o deploy, forçando o uso do console web da VM (Instance Console Connection da Oracle)
pra qualquer atualização — processo lento e sem histórico de comandos.

Diagnóstico feito nesta sessão:

1. `ssh -i chave ubuntu@IP` do computador local: `Connection timed out` na porta 22.
2. As portas 80 e 443 do mesmo servidor respondiam normalmente do mesmo computador — descartando
   VM fora do ar ou bloqueio geral de rede.
3. Pelo Oracle Cloud Shell (roda dentro da rede da própria Oracle), a porta 22 respondeu
   normalmente (chegou a pedir autenticação — `Permission denied (publickey)` antes da chave estar
   no lugar certo, depois conectou com sucesso).

Conclusão: a Security List/NSG da Oracle está correta (porta 22 aberta); o bloqueio é da rede/ISP
de quem tenta conectar de fora, não do servidor. Como o Cloud Shell tem sua própria rede (não passa
pela rede residencial), ele serve de ponte confiável independente desse bloqueio.

## Escopo / arquivos principais

- `README.md` (seção "Deploy de produção com Docker Compose")

## Como foi verificado

Fluxo completo executado ponta a ponta nesta sessão: upload da chave no Cloud Shell → `chmod 600` →
`ssh` bem-sucedido → `git pull --ff-only` → build e push local das imagens (`feedbot-api`,
`feedbot-web`) pro GHCR → `docker compose pull` + `up -d` no servidor via essa mesma sessão SSH →
`docker compose ps` confirmando os 4 serviços (`api`, `web`, `db`, `proxy`) com status `healthy`/
`Running` rodando a versão nova (commit `e03a00a`).
