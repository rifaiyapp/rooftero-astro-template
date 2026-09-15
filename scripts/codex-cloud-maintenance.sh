#!/usr/bin/env bash
set +x
set -euo pipefail

# Destination-neutral maintenance for cached Codex Cloud containers.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

normalize_github_remote() {
  local raw="$1" path=""
  case "$raw" in
    https://github.com/*) path="${raw#https://github.com/}" ;;
    https://*@github.com/*) path="${raw#*github.com/}" ;;
    git@github.com:*) path="${raw#git@github.com:}" ;;
    ssh://git@github.com/*) path="${raw#ssh://git@github.com/}" ;;
    *) printf '%s\n' "$raw"; return ;;
  esac
  path="${path%.git}"
  printf 'https://github.com/%s.git\n' "$path"
}

REMOTE_URL="$(git config --local --get remote.origin.url 2>/dev/null || true)"
if [ -z "$REMOTE_URL" ]; then
  REMOTE_URL="$(git config --global --get remote.origin.url 2>/dev/null || true)"
fi
if [ -z "$REMOTE_URL" ] && [ -n "${CODEX_GITHUB_REPOSITORY:-}" ]; then
  REMOTE_URL="https://github.com/${CODEX_GITHUB_REPOSITORY}.git"
fi
if [ -z "$REMOTE_URL" ]; then
  echo "No approved Git origin is available." >&2
  exit 1
fi
REMOTE_URL="$(normalize_github_remote "$REMOTE_URL")"

if [[ ! "$REMOTE_URL" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ ]]; then
  echo "Codex Cloud publishing requires an approved GitHub origin." >&2
  exit 1
fi
PUSH_URL="$(git config --local --get-all remote.origin.pushurl 2>/dev/null || true)"
if [ -n "$PUSH_URL" ]; then
  if [ "$(normalize_github_remote "$PUSH_URL")" != "$REMOTE_URL" ]; then
    echo "Git push destination differs from the approved origin." >&2
    exit 1
  fi
  git config --local --unset-all remote.origin.pushurl
fi

# Cloud removes setup secrets before the agent phase. Keep only a mode-600
# credential handoff in this privileged, ephemeral environment, never in the repo.
CRED_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/keydiv-codex"
umask 077
mkdir -p "$CRED_DIR"
CRED_DIR="$(cd "$CRED_DIR" && pwd -P)"
case "$CRED_DIR/" in
  "$REPO_ROOT/"*) echo "Cloud credential storage must be outside the repository." >&2; exit 1 ;;
esac
chmod 700 "$CRED_DIR"
CRED_HELPER="$CRED_DIR/git-credential-codex"
for file in "$CRED_HELPER" "$CRED_DIR/token" "$CRED_DIR/repository"; do
  [ ! -L "$file" ] || { echo "Unsafe Cloud credential storage." >&2; exit 1; }
done
REPOSITORY="${REMOTE_URL#https://github.com/}"
if [ -n "${CODEX_GITHUB_TOKEN:-}" ]; then
  printf '%s' "$CODEX_GITHUB_TOKEN" > "$CRED_DIR/token"
  printf '%s\n' "$REPOSITORY" > "$CRED_DIR/repository"
elif [ ! -s "$CRED_DIR/token" ] || [ ! -f "$CRED_DIR/repository" ] ||
     [ "$(cat "$CRED_DIR/repository")" != "$REPOSITORY" ]; then
  echo "No credential is available for the approved repository; rerun Cloud setup with CODEX_GITHUB_TOKEN." >&2
  exit 1
fi
chmod 600 "$CRED_DIR/token" "$CRED_DIR/repository"
cat > "$CRED_HELPER" <<'EOF'
#!/usr/bin/env bash
set +x
set -euo pipefail
action="${1:-get}"
protocol=""
host=""
path=""
while IFS='=' read -r key value; do
  [ -n "$key" ] || break
  case "$key" in
    protocol) protocol="$value" ;;
    host) host="$value" ;;
    path) path="$value" ;;
  esac
done
case "$action" in
  get)
    CRED_DIR="$(cd "$(dirname "$0")" && pwd -P)"
    if [ "$protocol" = https ] && [ "$host" = github.com ] &&
       [ -s "$CRED_DIR/token" ] && [ -f "$CRED_DIR/repository" ] &&
       [ "${path%.git}" = "$(sed 's/\.git$//' "$CRED_DIR/repository")" ]; then
      printf 'username=x-access-token\npassword=%s\n' "$(cat "$CRED_DIR/token")"
    else
      printf 'quit=true\n'
      exit 1
    fi
    ;;
  store|erase) ;;
esac
EOF
chmod 700 "$CRED_HELPER"

# An empty first helper resets inherited helpers for GitHub; no credential store.
git config --global --unset-all credential.helper >/dev/null 2>&1 || true
git config --global --unset-all credential.https://github.com.helper >/dev/null 2>&1 || true
git config --global --add credential.https://github.com.helper ""
git config --global --add credential.https://github.com.helper "!\"$CRED_HELPER\""
git config --global credential.https://github.com.useHttpPath true

git config --global remote.origin.url "$REMOTE_URL"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

if [ ! -f package-lock.json ]; then
  exit 0
fi

CURRENT_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
STAMP="node_modules/.codex-package-lock.sha256"
PREVIOUS_HASH=""
[ -f "$STAMP" ] && PREVIOUS_HASH="$(cat "$STAMP")"

if [ ! -d node_modules ] || [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ]; then
  npm ci
  mkdir -p node_modules
  printf '%s\n' "$CURRENT_HASH" > "$STAMP"
fi
