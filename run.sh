#!/usr/bin/env bash
#
# Start the whole SIDC Road / pothole stack in one go.
#
#   ./run.sh            infra + backend + frontend
#   ./run.sh --ngrok    the above, plus public tunnels for the app and MinIO
#
# Ctrl-C stops the backend, frontend and ngrok. Docker containers are left
# running on purpose (they hold your database); stop them with:
#   docker compose down
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
BACKEND_PORT=8080   # must match the vite proxy target in frontend/vite.config.ts
FRONTEND_PORT=5173
USE_NGROK=0
PIDS=()

[[ "${1:-}" == "--ngrok" ]] && USE_NGROK=1

RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BLUE=$'\e[34m'; DIM=$'\e[2m'; OFF=$'\e[0m'
say()  { printf '%s==>%s %s\n' "$BLUE" "$OFF" "$*"; }
ok()   { printf '%s  ok%s %s\n' "$GREEN" "$OFF" "$*"; }
warn() { printf '%s  !!%s %s\n' "$YELLOW" "$OFF" "$*"; }
die()  { printf '%s ERR%s %s\n' "$RED" "$OFF" "$*" >&2; exit 1; }

cleanup() {
  trap - EXIT INT TERM
  echo
  say "shutting down"
  # Each child is started with setsid, so it leads its own process group and
  # "kill -- -PID" takes down the grandchildren too (npm -> vite, uvicorn
  # --reload -> worker), which a plain kill on the child would leave orphaned.
  for pid in "${PIDS[@]:-}"; do
    [[ -z "$pid" ]] && continue
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  done
  sleep 2
  for pid in "${PIDS[@]:-}"; do
    [[ -z "$pid" ]] && continue
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
  done
  ok "backend, frontend and tunnels stopped"
  printf '%sdocker containers left running (docker compose down to stop them)%s\n' "$DIM" "$OFF"
}
trap cleanup EXIT INT TERM

# wait_for <label> <seconds> <command...>
wait_for() {
  local label="$1" limit="$2"; shift 2
  for ((i = 1; i <= limit; i++)); do
    if "$@" >/dev/null 2>&1; then ok "$label ready (${i}s)"; return 0; fi
    sleep 1
  done
  warn "$label did not come up within ${limit}s"
  return 1
}

port_open() { (echo > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

mkdir -p "$LOG_DIR"

# ---------------------------------------------------------------- checks ----
command -v docker >/dev/null || die "docker not found"
docker info >/dev/null 2>&1 || die "docker daemon is not running"
[[ -x "$ROOT/backend/.venv/bin/uvicorn" ]] || die "backend venv missing — run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
[[ -d "$ROOT/frontend/node_modules" ]] || die "frontend deps missing — run: cd frontend && npm install"

# ------------------------------------------------------------------ infra ---
say "starting postgres + minio"
docker compose -f "$ROOT/docker-compose.yml" up -d >/dev/null 2>&1 || die "docker compose up failed"
wait_for "postgres :5434" 45 docker exec midc-pothole-postgres pg_isready -U postgres
wait_for "minio    :9000" 45 curl -sf http://localhost:9000/minio/health/live

# ------------------------------------------------------------------ ngrok ---
if [[ $USE_NGROK -eq 1 ]]; then
  command -v ngrok >/dev/null || die "ngrok not found"
  say "starting ngrok tunnels"
  setsid ngrok start --all --config "$HOME/.config/ngrok/ngrok.yml" --config "$ROOT/ngrok.yml" \
    --log stdout > "$LOG_DIR/ngrok.log" 2>&1 &
  PIDS+=($!)

  if wait_for "ngrok agent" 30 curl -sf http://localhost:4040/api/tunnels; then
    # Pull the public URL of each tunnel straight from the local ngrok API.
    APP_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import json,sys
t=[x['public_url'] for x in json.load(sys.stdin)['tunnels']
   if x['proto']=='https' and x['name']=='app']
print(t[0] if t else '')
")
    if [[ -n "${APP_URL:-}" ]]; then
      # Images are served from the app's own origin: vite proxies /pothole-images
      # to MinIO, so one tunnel covers app, API and images. Exported vars beat
      # .env (python-dotenv does not override the environment), so no file is
      # edited and the localhost default stays intact for local runs.
      export S3_PUBLIC_URL="$APP_URL"
      ok "S3_PUBLIC_URL -> $APP_URL  (images proxied via /pothole-images)"
    else
      warn "could not read the ngrok URL; images will use localhost and will not load on a phone"
    fi
  fi
fi

# ---------------------------------------------------------------- backend ---
say "starting backend on :$BACKEND_PORT"
setsid bash -c 'cd "$1" && exec .venv/bin/uvicorn main:app --reload --port "$2"' _ \
  "$ROOT/backend" "$BACKEND_PORT" > "$LOG_DIR/backend.log" 2>&1 &
PIDS+=($!)
wait_for "backend  :$BACKEND_PORT" 60 curl -sf "http://localhost:$BACKEND_PORT/" \
  || warn "see $LOG_DIR/backend.log"

# --------------------------------------------------------------- frontend ---
say "starting frontend"
: > "$LOG_DIR/frontend.log"
setsid bash -c 'cd "$1" && exec npm run dev' _ "$ROOT/frontend" > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)

# Vite silently picks the next free port if 5173 is taken, so read the port it
# actually bound from its own output rather than assuming one.
FRONTEND_URL=""
for ((i = 1; i <= 60; i++)); do
  FRONTEND_URL=$(grep -oE 'http://localhost:[0-9]+' "$LOG_DIR/frontend.log" | head -1)
  [[ -n "$FRONTEND_URL" ]] && break
  sleep 1
done

if [[ -n "$FRONTEND_URL" ]]; then
  FRONTEND_PORT="${FRONTEND_URL##*:}"
  if wait_for "frontend :$FRONTEND_PORT" 30 curl -sf "$FRONTEND_URL/"; then
    :
  else
    warn "see $LOG_DIR/frontend.log"
  fi
else
  warn "frontend did not report a URL — see $LOG_DIR/frontend.log"
  FRONTEND_URL="http://localhost:$FRONTEND_PORT"
fi

# ----------------------------------------------------------------- report ---
cat <<EOF

  ${GREEN}stack is up${OFF}

  app          $FRONTEND_URL
  api          http://localhost:$BACKEND_PORT        ${DIM}docs at /docs${OFF}
  minio api    http://localhost:9000
  minio console http://localhost:9001      ${DIM}minioadmin / minioadmin${OFF}
  postgres     localhost:5434
EOF
[[ $USE_NGROK -eq 1 && -n "${APP_URL:-}" ]] && echo "  public app   $APP_URL      <- open this on the phone"
cat <<EOF

  logs         $LOG_DIR/
  ${DIM}Ctrl-C to stop.${OFF}

EOF

wait
