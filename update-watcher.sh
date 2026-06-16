#!/usr/bin/env bash

# update-watcher.sh
# Verifica a cada 10 segundos se há atualizações no repositório GitHub.
# Se houver, faz pull, executa build e reinicia o processo pm2.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Nome da branch que você deseja monitorar (geralmente main ou master)
BRANCH="main"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

while true; do
  # Busca alterações remotas sem mesclar
  git fetch origin "$BRANCH" > /dev/null 2>&1

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/$BRANCH)

  if [ "$LOCAL" != "$REMOTE" ]; then
    log "Atualização detectada. Atualizando..."
    git pull origin "$BRANCH"
    if [ $? -ne 0 ]; then
      log "Falha ao fazer git pull. Ignorando esta verificação."
      sleep 10
      continue
    fi
    log "Instalando dependências..."
    npm ci
    log "Executando build..."
    npm run build
    log "Reiniciando aplicação com pm2..."
    pm2 restart zoroflix-site || pm2 start npm --name "zoroflix-site" -- run start
    log "Atualização concluída."
  else
    #log "Nenhuma atualização encontrada."
    :
  fi
  sleep 10
done
