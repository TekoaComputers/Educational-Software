#!/usr/bin/env bash
# Local web server for testing — sidesteps Chrome's per-file localStorage
# isolation on file:// URLs (each file:// path is its own origin, so progress
# written by Kesem_site/index.html isn't visible to the root index.html).
# Running through http://localhost:8000 gives every page the same origin so
# localStorage + cookies + the OAuth flow all behave like on GitHub Pages.
set -e

PORT="${PORT:-8000}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://localhost:$PORT/"

cd "$ROOT_DIR"

echo "Serving $ROOT_DIR at $URL"
echo "Ctrl-C to stop."

# Best-effort browser open — backgrounded so the server still runs in foreground.
if command -v xdg-open >/dev/null 2>&1; then
    ( sleep 0.5 && xdg-open "$URL" ) &
elif command -v open >/dev/null 2>&1; then
    ( sleep 0.5 && open "$URL" ) &
fi

exec python3 -m http.server "$PORT"
