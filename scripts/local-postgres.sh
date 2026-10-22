#!/usr/bin/env bash
# Starts (or stops) a throwaway PostgreSQL cluster for database tests when
# Docker / the Supabase CLI stack is not available.
#   scripts/local-postgres.sh start   -> listens on 127.0.0.1:54329, user postgres, no password
#   scripts/local-postgres.sh stop
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA_DIR="${PGDATA_DIR:-.tmp/pgdata}"
PORT="${PGPORT:-54329}"

run() {
  if [ "$(id -u)" = "0" ]; then
    # initdb/pg_ctl refuse to run as root.
    chown -R postgres:postgres "$(dirname "$DATA_DIR")" 2>/dev/null || true
    su postgres -s /bin/bash -c "$*"
  else
    bash -c "$*"
  fi
}

case "${1:-start}" in
  start)
    mkdir -p "$(dirname "$DATA_DIR")"
    if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
      run "'$PGBIN/initdb' -D '$DATA_DIR' -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
    fi
    run "'$PGBIN/pg_ctl' -D '$DATA_DIR' -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l '$DATA_DIR/server.log' -w start >/dev/null"
    echo "PostgreSQL running: postgres://postgres@127.0.0.1:$PORT/postgres"
    ;;
  stop)
    run "'$PGBIN/pg_ctl' -D '$DATA_DIR' -m fast stop" || true
    ;;
  *)
    echo "usage: $0 start|stop" >&2
    exit 1
    ;;
esac
