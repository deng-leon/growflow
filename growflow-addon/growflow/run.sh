#!/usr/bin/env bash
# shellcheck disable=SC1091
source /usr/lib/bashio/bashio.sh

bashio::log.info "Starting GrowFlow Plant Tracker..."

LOG_LEVEL=$(bashio::config 'log_level')
bashio::log.info "Log level: ${LOG_LEVEL}"

# Persistent paths — /data is HA's persistent volume (survives restarts)
export NODE_ENV="production"
export LOG_LEVEL="${LOG_LEVEL}"
export DB_PATH="/data/growflow.db"
export DATABASE_URL="file:/data/growflow.db"
export UPLOADS_PATH="/data/uploads"
export CONTROLLER_ENABLED="$(bashio::config 'controller_enabled')"
bashio::log.info "Controller enabled: ${CONTROLLER_ENABLED}"

mkdir -p /data/uploads

# Debug: show filesystem
bashio::log.info "BUILD_FROM image contents:"
ls -la /app/ 2>&1 || bashio::log.warning "/app does not exist"
which node 2>&1 || bashio::log.warning "node not found"
cat /etc/os-release | head -2

# Ensure database schema is up to date without destructive schema sync.
bashio::log.info "Migrating database schema..."
cd /app/backend
sh scripts/init-db.sh 2>&1 || {
  bashio::log.error "Database migration failed!"
  exit 1
}

bashio::log.info "Starting server..."
cd /app
exec node backend/dist/index.js
