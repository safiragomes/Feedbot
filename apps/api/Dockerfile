FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @feedbot/api...

COPY apps/api apps/api
# apps/api/src/generated fica fora do git (.gitignore); num clone limpo esse
# diretório não existe até este passo — sem ele, o build depende por acidente
# de sobra de um `prisma generate` local anterior, o que falha silenciosamente
# em CI/deploy de verdade.
RUN pnpm --filter @feedbot/api exec prisma generate
# tsc pode estourar o heap padrão do V8 em hosts com pouca RAM (ex.: instâncias
# free-tier de 1GB); folga explícita evita OOM durante o build de produção.
RUN NODE_OPTIONS="--max-old-space-size=1536" pnpm --filter @feedbot/api build
RUN chmod +x apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api
CMD ["./docker-entrypoint.sh"]
