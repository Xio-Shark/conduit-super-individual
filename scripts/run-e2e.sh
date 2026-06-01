#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pick_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("", 0))
print(s.getsockname()[1])
s.close()
PY
}

API_PORT="$(pick_port)"
WEB_PORT="$(pick_port)"
while [ "$WEB_PORT" = "$API_PORT" ]; do WEB_PORT="$(pick_port)"; done

export API_PORT WEB_PORT WEB_STRICT_PORT=true API_TARGET="http://127.0.0.1:${API_PORT}"
export E2E_BASE_URL="http://127.0.0.1:${WEB_PORT}"
export E2E_SKIP_SERVER=1

npm run dev &
DEV_PID=$!
cleanup() {
  kill "$DEV_PID" 2>/dev/null || true
  wait "$DEV_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sf "${E2E_BASE_URL}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

npx playwright test "$@"
