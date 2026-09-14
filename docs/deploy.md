# Deploy de produção com Docker Compose

Ver `README.md` para desenvolvimento local. Este documento cobre só o deploy de produção: DNS e
variáveis de ambiente, build e subida da stack, primeiro acesso sem seed, backups e acesso SSH ao
servidor.

O arquivo `docker-compose.production.yml` entrega uma instalação completa:

- PostgreSQL sem porta pública;
- API com migrações automáticas antes de cada inicialização;
- frontend React compilado e servido por Nginx;
- proxy Caddy com certificado HTTPS automático;
- volumes persistentes para banco e certificados.

## 1. Preparar DNS e arquivos de ambiente

Use um domínio ou subdomínio que você realmente controle e crie um registro `A` apontando para o
IP público do servidor. As portas 80 e 443 precisam estar liberadas. Depois:

```bash
cp .env.production.example .env.production
cp apps/api/.env.production.example apps/api/.env.production
chmod 600 .env.production apps/api/.env.production
```

Em `.env.production`, preencha `DOMAIN` sem protocolo e uma senha aleatória forte para o banco.
Em `apps/api/.env.production`, preencha OAuth, chave de criptografia e SMTP. Gere a chave Google
com `openssl rand -base64 32`. Os dois arquivos reais são ignorados pelo Git.

No Google Cloud, cadastre exatamente:

- origem JavaScript: `https://SEU_DOMINIO`;
- URI de redirecionamento: `https://SEU_DOMINIO/api/google/oauth/callback`.

## 2. Construir e iniciar

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

A API executa `prisma migrate deploy` antes de abrir a porta. Nunca execute `prisma:seed` em
produção: a seed contém dados fictícios e limpa tabelas existentes.

## 3. Criar o primeiro acesso, sem seed

Preencha temporariamente em `apps/api/.env.production`:

- `BOOTSTRAP_CHIEF_NAME`, `BOOTSTRAP_CHIEF_EMAIL` e `BOOTSTRAP_CHIEF_PASSWORD`;
- `BOOTSTRAP_PERIOD_NAME`, `BOOTSTRAP_PERIOD_START`, `BOOTSTRAP_PERIOD_END` e
  `BOOTSTRAP_ROTATION_REFERENCE`, usando datas ISO.

Então execute:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml run --rm api \
  node dist/scripts/bootstrap-producao.js
```

O comando usa transação e lock no banco, recusa uma segunda inicialização e cria somente o período,
o primeiro monitor-chefe e sua conta. Depois, apague as variáveis `BOOTSTRAP_*` do arquivo e recrie
a API para que a senha deixe de existir no ambiente do container:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate api
```

Se o período já existir, informe somente `BOOTSTRAP_PERIOD_ID` no lugar dos quatro campos de período.

## 4. Backups

O script abaixo cria um dump compactado e com permissão somente para o usuário atual:

```bash
BACKUP_DIR=/caminho/fora-do-projeto ./scripts/backup-database.sh
```

Agende-o no `cron` do servidor e copie os arquivos para outro equipamento ou armazenamento. Teste
periodicamente a restauração. O script não apaga backups antigos automaticamente.

## Não leve o banco local para produção

O dump inicial (`pg_dump` do banco local restaurado em produção) foi um passo **único**, de
inicialização — usado apenas para levar a primeira conta de chefe real sem depender do fluxo de
bootstrap. Não repita isso depois que a produção estiver no ar: o banco local normalmente acumula
dados de teste/seed (`prisma:seed`), e um dump gerado dali para produção mistura esse lixo com os
dados reais — foi exatamente isso que aconteceu no primeiro deploy e exigiu limpeza manual depois.

A partir do primeiro deploy bem-sucedido, os dois bancos são independentes: qualquer cadastro real
(monitor, grupo, dupla) é feito **direto no painel em produção**. O banco local serve só para testar
código antes de subir uma correção — o que viaja de local para produção é o *código* (via Git +
imagem no GHCR), nunca o banco de dados.

## Atualizações

Como o build do frontend/API não cabe confortavelmente em instâncias de 1 vCPU/1GB, as imagens são
compiladas localmente e publicadas no GitHub Container Registry — o servidor só baixa a imagem
pronta, nunca compila:

```bash
# no seu computador, uma vez (gera o token em github.com/settings/tokens, escopo write:packages):
docker login ghcr.io -u SEU_USUARIO_GITHUB

# no seu computador, após alterar o código:
docker build -f apps/api/Dockerfile -t ghcr.io/safiragomes/feedbot-api:latest .
docker build -f apps/web/Dockerfile -t ghcr.io/safiragomes/feedbot-web:latest --build-arg VITE_API_URL=/api .
docker push ghcr.io/safiragomes/feedbot-api:latest
docker push ghcr.io/safiragomes/feedbot-web:latest
```

```bash
# no servidor:
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.production.yml pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

Antes de atualizar, crie um backup. Confira a instalação com `docker compose ... ps` e com
`https://SEU_DOMINIO/api/health`.

## Acesso SSH ao servidor

```bash
ssh -i ~/Downloads/"NOME-DA-CHAVE.key" ubuntu@IP_DO_SERVIDOR
```

Na primeira vez com uma chave recém-baixada, rode antes (o SSH recusa chaves com permissão
aberta):

```bash
chmod 600 ~/Downloads/"NOME-DA-CHAVE.key"
```

**Se a conexão travar em "Connection timed out"** (mas o site continua no ar normalmente): não é a
VM que está fora do ar nem a Security List da Oracle bloqueando — é mais provável que a rede/ISP de
quem está tentando conectar bloqueie a porta 22 de saída (comum em ISPs residenciais no Brasil).
Pra confirmar o diagnóstico sem depender de outra rede:

```bash
# a mesma porta 443/80 do site responde do lugar de onde a 22 trava?
timeout 8 bash -c 'echo > /dev/tcp/IP_DO_SERVIDOR/443' && echo "443 abre" || echo "443 também não conecta"
```

Se só a 22 travar, o console web da VM (que não passa pela rede local de quem conecta) continua
funcionando, e o **Oracle Cloud Shell** ([cloud.oracle.com](https://cloud.oracle.com) → ícone de
terminal no topo) serve de ponte, já que roda dentro da rede da própria Oracle:

1. No Cloud Shell, use o botão de **upload** (ícone de seta pra cima na barra de ações) pra subir o
   arquivo `.key` do seu computador — o Cloud Shell tem um storage próprio, separado da sua máquina.
2. `chmod 600 ~/"NOME-DA-CHAVE.key"`
3. `ssh -i ~/"NOME-DA-CHAVE.key" ubuntu@IP_DO_SERVIDOR`

Dali dá pra rodar os comandos de atualização normalmente (seção "Atualizações" acima).
