#!/usr/bin/env bash
set +x
set -euo pipefail
# Factory 4.9 static contract and isolated integration tests. All network/npm
# operations are mocked; Git configuration and credentials belong only to fixtures.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETUP="$ROOT/scripts/codex-cloud-setup.sh"
MAINT="$ROOT/scripts/codex-cloud-maintenance.sh"
PUBLISH="$ROOT/scripts/codex-cloud-publish.sh"
for file in "$SETUP" "$MAINT" "$PUBLISH"; do
  [ -f "$file" ] || { echo 'Missing Cloud script' >&2; exit 1; }
  bash -n "$file"
done
grep -q CODEX_GITHUB_TOKEN "$SETUP"
grep -q CODEX_GITHUB_TOKEN "$MAINT"
grep -q 'git push origin "HEAD:$TARGET_BRANCH"' "$PUBLISH"
grep -q 'git merge-base --is-ancestor' "$PUBLISH"
if grep -qE 'credential\.helper[[:space:]]+store|force-with-lease|git push.*(--force| -f)' "$SETUP" "$MAINT" "$PUBLISH"; then
  echo 'Unsafe Git publishing pattern' >&2; exit 1
fi
if grep -qE 'https://[^/@]+:[^/@]+@github\.com/' "$SETUP" "$MAINT" "$PUBLISH"; then
  echo 'Credential-bearing GitHub URL' >&2; exit 1
fi
mkdir -p "$ROOT/tmp"
FIXTURE="$(mktemp -d "$ROOT/tmp/cloud-test.XXXXXX")"
export QA_FIXTURE="$FIXTURE" QA_REPO="$FIXTURE/repo"
export QA_REAL_GIT="$(command -v git)"
export GIT_CONFIG_GLOBAL="$FIXTURE/global-config" GIT_CONFIG_NOSYSTEM=1
export XDG_CONFIG_HOME="$FIXTURE/config with spaces"
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_CONFIG_COUNT CODEX_GIT_TARGET_BRANCH
mkdir -p "$FIXTURE/bin" "$QA_REPO"
: > "$GIT_CONFIG_GLOBAL"
cat > "$FIXTURE/bin/npm" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$QA_FIXTURE/npm-calls"
mkdir -p "$QA_REPO/node_modules"
MOCK
cat > "$FIXTURE/bin/git" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  fetch)
    echo fetch >> "$QA_FIXTURE/transport"
    [ ! -f "$QA_FIXTURE/fetch-fails" ] || exit 1
    if [ -f "$QA_FIXTURE/verify-fails" ] && [ -f "$QA_FIXTURE/pushed" ]; then exit 1; fi
    shift
    args=()
    for arg in "$@"; do
      if [ "$arg" = origin ]; then args+=("$QA_FIXTURE/remote.git"); else args+=("$arg"); fi
    done
    exec "$QA_REAL_GIT" fetch "${args[@]}"
    ;;
  push)
    echo push >> "$QA_FIXTURE/transport"
    [ ! -f "$QA_FIXTURE/push-fails" ] || exit 1
    printf 'protocol=https\nhost=github.com\npath=destination-example/product.git\n\n' |
      "$QA_REAL_GIT" credential fill > /dev/null
    if [ -f "$QA_FIXTURE/race" ]; then
      "$QA_REAL_GIT" --git-dir="$QA_FIXTURE/remote.git" update-ref refs/heads/main "$(cat "$QA_FIXTURE/race")"
    fi
    if [ ! -f "$QA_FIXTURE/ignore-push" ]; then "$QA_REAL_GIT" push "$QA_FIXTURE/remote.git" "$3"; fi
    touch "$QA_FIXTURE/pushed"
    exit
    ;;
esac
exec "$QA_REAL_GIT" "$@"
MOCK
chmod +x "$FIXTURE/bin/git" "$FIXTURE/bin/npm"
export PATH="$FIXTURE/bin:$PATH"
cd "$QA_REPO"
git init -q -b work
git config user.name 'Cloud QA'
git config user.email 'cloud-qa@example.invalid'
git config core.autocrlf false
git config commit.gpgsign false
git config core.hooksPath "$FIXTURE/no-hooks"
printf '{}\n' > package-lock.json
printf 'node_modules/\n' > .gitignore
git add package-lock.json .gitignore
git commit -qm baseline
BASE_SHA="$(git rev-parse HEAD)"
git init -q --bare "$FIXTURE/remote.git"
"$QA_REAL_GIT" push -q "$FIXTURE/remote.git" HEAD:main
export CODEX_GITHUB_TOKEN='fixture-only-not-a-credential'
export CODEX_GITHUB_REPOSITORY='fallback-example/copy'
git remote add origin https://github.com/destination-example/product.git
fail() { echo "$1" >&2; exit 1; }
expect_failure() { if "$@" >> "$FIXTURE/output" 2>&1; then fail 'Expected safe failure'; fi; }
reset_transport() {
  : > "$FIXTURE/transport"
  # Fixed marker files only, inside this test fixture.
  rm -f "$FIXTURE/pushed" "$FIXTURE/push-fails" "$FIXTURE/fetch-fails" "$FIXTURE/verify-fails" "$FIXTURE/ignore-push" "$FIXTURE/race"
}
assert_no_push() { if grep -q push "$FIXTURE/transport"; then fail 'Unexpected push'; fi; }
bash -x "$SETUP" > "$FIXTURE/output" 2>&1
test "$(git config --global --get remote.origin.url)" = https://github.com/destination-example/product.git
test "$(git config --local --get remote.origin.url)" = https://github.com/destination-example/product.git
test -f node_modules/.codex-package-lock.sha256
COUNT="$(wc -l < "$FIXTURE/npm-calls")"
unset CODEX_GITHUB_TOKEN
bash "$MAINT" >> "$FIXTURE/output" 2>&1
test "$(wc -l < "$FIXTURE/npm-calls")" = "$COUNT"
HELPER="$XDG_CONFIG_HOME/keydiv-codex/git-credential-codex"
REPLY="$(printf 'protocol=https\nhost=github.com\npath=destination-example/product.git\n\n' | git credential fill)"
[[ "$REPLY" == *'password=fixture-only-not-a-credential'* ]]
unset REPLY
for request in 'https github.com other-example/product.git' 'https example.invalid destination-example/product.git' 'http github.com destination-example/product.git'; do
  read -r protocol host path <<< "$request"
  if printf 'protocol=%s\nhost=%s\npath=%s\n\n' "$protocol" "$host" "$path" | "$HELPER" get > /dev/null; then fail 'Credential scope failure'; fi
done
# Git Bash does not implement POSIX mode bits; enforce these on Linux Cloud.
if [ "$(uname -s)" = Linux ]; then
  test "$(stat -c %a "$XDG_CONFIG_HOME/keydiv-codex")" = 700
  test "$(stat -c %a "$XDG_CONFIG_HOME/keydiv-codex/token")" = 600
fi
printf '{"changed":true}\n' > package-lock.json
bash "$MAINT" >> "$FIXTURE/output" 2>&1
test "$(wc -l < "$FIXTURE/npm-calls")" -eq "$((COUNT + 1))"
git restore package-lock.json
git config --local --unset-all remote.origin.url
bash "$MAINT" >> "$FIXTURE/output" 2>&1
test "$(git config --local --get remote.origin.url)" = https://github.com/destination-example/product.git
git remote set-url origin https://github.com/other-example/copy.git
expect_failure bash "$MAINT"
git remote set-url origin https://github.com/destination-example/product.git
mv "$XDG_CONFIG_HOME/keydiv-codex/token" "$FIXTURE/token-backup"
expect_failure bash "$MAINT"
expect_failure bash "$SETUP"
mv "$FIXTURE/token-backup" "$XDG_CONFIG_HOME/keydiv-codex/token"
git config --local --unset-all remote.origin.url
git config --global --unset-all remote.origin.url
export CODEX_GITHUB_TOKEN='fixture-only-not-a-credential'
bash "$SETUP" >> "$FIXTURE/output" 2>&1
test "$(git config --local --get remote.origin.url)" = https://github.com/fallback-example/copy.git
git config --local --unset-all remote.origin.url
git config --global --unset-all remote.origin.url
unset CODEX_GITHUB_REPOSITORY
expect_failure bash "$SETUP"
expect_failure bash "$MAINT"
expect_failure bash "$PUBLISH"
git config --local remote.origin.url git@github.com:destination-example/product.git
bash "$SETUP" >> "$FIXTURE/output" 2>&1
test "$(git remote get-url origin)" = https://github.com/destination-example/product.git
git config --local remote.origin.pushurl https://github.com/other-example/copy.git
expect_failure bash "$MAINT"
expect_failure bash "$PUBLISH"
git config --local --unset-all remote.origin.pushurl
git remote set-url origin "https://x-access-token:${CODEX_GITHUB_TOKEN}@github.com/destination-example/product.git"
bash -x "$MAINT" >> "$FIXTURE/output" 2>&1
test "$(git remote get-url origin)" = https://github.com/destination-example/product.git
unset CODEX_GITHUB_TOKEN
echo 'PASS origin precedence, clean URLs, explicit fallback, cache reuse and setup-to-agent authentication'

# Missing fetch mapping and local origin simulate a recreated task checkout.
git config --local --unset-all remote.origin.fetch
git config --local --unset-all remote.origin.url
printf 'task\n' > task.txt
git add task.txt
git commit -qm task
TASK_SHA="$(git rev-parse HEAD)"
reset_transport
printf 'uncommitted\n' > dirty.txt
expect_failure bash "$PUBLISH"
test ! -s "$FIXTURE/transport"
rm dirty.txt
touch "$FIXTURE/fetch-fails"
expect_failure bash "$PUBLISH"
assert_no_push
reset_transport
mv "$XDG_CONFIG_HOME/keydiv-codex/token" "$FIXTURE/token-backup"
expect_failure bash "$PUBLISH"
test "$("$QA_REAL_GIT" --git-dir="$FIXTURE/remote.git" rev-parse main)" = "$BASE_SHA"
mv "$FIXTURE/token-backup" "$XDG_CONFIG_HOME/keydiv-codex/token"
reset_transport
touch "$FIXTURE/push-fails"
expect_failure bash "$PUBLISH"
test "$("$QA_REAL_GIT" --git-dir="$FIXTURE/remote.git" rev-parse main)" = "$BASE_SHA"
reset_transport
touch "$FIXTURE/ignore-push"
expect_failure bash "$PUBLISH"
test "$(grep -c fetch "$FIXTURE/transport")" -eq 2
reset_transport
touch "$FIXTURE/verify-fails"
expect_failure bash "$PUBLISH"
test "$("$QA_REAL_GIT" --git-dir="$FIXTURE/remote.git" rev-parse main)" = "$TASK_SHA"
reset_transport
bash "$PUBLISH" >> "$FIXTURE/output" 2>&1
assert_no_push
test "$(grep -c fetch "$FIXTURE/transport")" -eq 1
git checkout -qb remote-work "$BASE_SHA"
printf 'remote work\n' > remote.txt
git add remote.txt
git commit -qm remote-work
REMOTE_SHA="$(git rev-parse HEAD)"
"$QA_REAL_GIT" push -q "$FIXTURE/remote.git" HEAD:refs/heads/race-candidate
git checkout -q work
"$QA_REAL_GIT" --git-dir="$FIXTURE/remote.git" update-ref refs/heads/main "$REMOTE_SHA"
git update-ref refs/remotes/origin/main "$BASE_SHA"
reset_transport
expect_failure bash "$PUBLISH"
assert_no_push
test "$(git rev-parse HEAD)" = "$TASK_SHA"
test "$("$QA_REAL_GIT" --git-dir="$FIXTURE/remote.git" rev-parse main)" = "$REMOTE_SHA"
git rebase --onto refs/remotes/origin/main "$BASE_SHA" work >> "$FIXTURE/output" 2>&1
test -f task.txt && test -f remote.txt
reset_transport
bash "$PUBLISH" >> "$FIXTURE/output" 2>&1
test "$(cat "$FIXTURE/transport")" = "$(printf 'fetch\npush\nfetch')"
git merge-base --is-ancestor HEAD refs/remotes/origin/main
SYNC_SHA="$(git rev-parse HEAD)"
git checkout -qb race-work
printf 'concurrent\n' > concurrent.txt
git add concurrent.txt
git commit -qm concurrent
RACE_SHA="$(git rev-parse HEAD)"
"$QA_REAL_GIT" push -q "$FIXTURE/remote.git" HEAD:refs/heads/race-candidate
git checkout -q work
printf 'next task\n' >> task.txt
git add task.txt
git commit -qm next-task
reset_transport
printf '%s\n' "$RACE_SHA" > "$FIXTURE/race"
expect_failure bash "$PUBLISH"
test "$("$QA_REAL_GIT" --git-dir="$FIXTURE/remote.git" rev-parse main)" = "$RACE_SHA"
reset_transport
git fetch --quiet origin refs/heads/main:refs/remotes/origin/main
git rebase --onto refs/remotes/origin/main "$SYNC_SHA" work >> "$FIXTURE/output" 2>&1
bash "$PUBLISH" >> "$FIXTURE/output" 2>&1
git merge-base --is-ancestor HEAD refs/remotes/origin/main
CODEX_GIT_TARGET_BRANCH=other expect_failure bash "$PUBLISH"
if grep -Fq 'fixture-only-not-a-credential' "$FIXTURE/output" "$GIT_CONFIG_GLOBAL" .git/config "$HELPER"; then
  fail 'Credential exposed outside the restricted handoff'
fi
echo 'PASS clean-tree gate, authenticated push, divergence/race safety, rejection and mandatory remote verification'
