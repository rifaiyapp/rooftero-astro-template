#!/usr/bin/env bash
set +x
set -euo pipefail

# Safe direct publisher for a validated, already-committed Codex task.
# It never force-pushes and refuses to overwrite a newer/diverged remote branch.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TARGET_BRANCH="${CODEX_GIT_TARGET_BRANCH:-main}"
if [ "$TARGET_BRANCH" != main ]; then
  echo "This project's approved publishing branch is main." >&2
  exit 1
fi
export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=never

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean; commit only the intended validated changes before publishing." >&2
  exit 1
fi

REMOTE_URL="$(git config --local --get remote.origin.url 2>/dev/null || true)"
[ -n "$REMOTE_URL" ] || REMOTE_URL="$(git config --global --get remote.origin.url 2>/dev/null || true)"
if [ -z "$REMOTE_URL" ] && [ -n "${CODEX_GITHUB_REPOSITORY:-}" ]; then
  REMOTE_URL="https://github.com/${CODEX_GITHUB_REPOSITORY}.git"
fi
if [ -z "$REMOTE_URL" ]; then
  echo "No approved origin is configured." >&2
  exit 1
fi
if [[ ! "$REMOTE_URL" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ ]]; then
  echo "Publishing requires a clean approved GitHub origin; run Cloud maintenance in the Cloud environment." >&2
  exit 1
fi
git config --local remote.origin.url "$REMOTE_URL"
# The approved global fallback may duplicate the local URL; every effective
# fetch/push URL must still name exactly the same clean destination.
EFFECTIVE_URLS="$(git remote get-url --all origin)
$(git remote get-url --push --all origin)"
while IFS= read -r url; do
  if [ "$url" != "$REMOTE_URL" ]; then
    echo "Git fetch/push destination differs from the approved origin." >&2
    exit 1
  fi
done <<< "$EFFECTIVE_URLS"

HEAD_SHA="$(git rev-parse HEAD)"
REMOTE_REF="refs/remotes/origin/$TARGET_BRANCH"
# Explicit refspec also refreshes task checkouts with no remote.origin.fetch configuration.
git fetch --quiet origin "refs/heads/$TARGET_BRANCH:$REMOTE_REF"

# If the task commit is already contained by the remote, publication is verified.
if git merge-base --is-ancestor "$HEAD_SHA" "$REMOTE_REF"; then
  exit 0
fi

# Refuse to overwrite remote work. The agent must safely rebase the task commit(s), rerun relevant checks, then retry.
if ! git merge-base --is-ancestor "$REMOTE_REF" "$HEAD_SHA"; then
  echo "Remote branch advanced or diverged; reconcile the task safely before publishing." >&2
  exit 2
fi

git push origin "HEAD:$TARGET_BRANCH"
git fetch --quiet origin "refs/heads/$TARGET_BRANCH:$REMOTE_REF"
if ! git merge-base --is-ancestor "$HEAD_SHA" "$REMOTE_REF"; then
  echo "Remote verification failed after push." >&2
  exit 1
fi
