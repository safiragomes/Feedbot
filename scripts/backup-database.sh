#!/bin/sh
set -eu
umask 077

backup_dir=${BACKUP_DIR:-./backups}
compose_file=${COMPOSE_FILE:-docker-compose.production.yml}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
arquivo="$backup_dir/feedbot-$timestamp.sql.gz"
temporario="$backup_dir/.feedbot-$timestamp.sql.tmp"

mkdir -p "$backup_dir"
trap 'rm -f "$temporario"' EXIT HUP INT TERM
docker compose --env-file .env.production -f "$compose_file" exec -T db \
  pg_dump --username feedbot --dbname feedbot --clean --if-exists --no-owner > "$temporario"
gzip -c "$temporario" > "$arquivo"
rm -f "$temporario"
trap - EXIT HUP INT TERM
echo "Backup criado em $arquivo"
