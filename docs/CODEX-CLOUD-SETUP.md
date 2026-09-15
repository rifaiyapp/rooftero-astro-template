# Your Codex Cloud environment

No local factory skill is required. AGENTS.md, DESIGN.md, the UI runtime and customer docs travel with the repository.

1. Import the template into your own repository. Verify its actual Git origin points there before enabling write access. A plain clone retains the source origin; rebind that copy first. Never modify the master as part of copy setup.
2. Connect your GitHub account/repository to your own Cloud environment. Select Universal and Node 22 (22.12+), with caching enabled.
3. Add **CODEX_GITHUB_TOKEN as a secret**, scoped to your repository with Contents read/write permission. The scripts use it for the approved direct-publish workflow. Never put tokens in prompts, files or URLs.
4. Setup command: `bash scripts/codex-cloud-setup.sh`. Maintenance: `bash scripts/codex-cloud-maintenance.sh`.
5. Only when there is no usable local origin, set normal variable CODEX_GITHUB_REPOSITORY=owner/repository. It never overrides local origin. Optional identity settings: CODEX_GIT_NAME and CODEX_GIT_EMAIL.
6. Allow necessary package/Git services and your own live domain. Browser QA may need `npx playwright install --with-deps chromium` added to environment setup.

Factory 4.9 publishing instructions and scripts are installed independently of the existing foundation metadata. Keydiv Runtime remains 1.0.0 and the repository UI Design runtime remains 2.1. This repair does not change the approved site, profile, forms, Worker, mounts or deployment destination.

Setup installs npm 11 and lockfile dependencies and persists only the approved clean origin in Git configuration. Setup and maintenance prefer local origin, then that environment's previously approved global origin, then the explicit fallback. Maintenance reinstalls only when the lockfile changes or dependencies are missing. Use a separate environment per destination and reset the Cloud cache when applying this repair to remove the previous credential-store setup, or after ownership/credential changes.

## Authentication across Cloud phases

Cloud removes setup secrets before the agent phase; exports from the setup shell do not carry over. See [official Cloud environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environment#environment-variables-and-secrets). The installed Factory 4.9 helper is adapted for this lifecycle: setup writes the secret to a mode-600 handoff file in a mode-700 directory outside the repository, at `${XDG_CONFIG_HOME:-$HOME/.config}/keydiv-codex`. The helper serves it only to HTTPS GitHub requests for the approved repository path. No token value is stored in Git config, remote URLs, source, helper code or committed files. Shell tracing is disabled before reading credentials.

Maintenance recreates the helper and reasserts the clean origin. It refreshes the handoff when `CODEX_GITHUB_TOKEN` is supplied; otherwise it requires an existing handoff for the same repository. Missing credentials or a destination mismatch fail safely. Do not put the secret into an ordinary environment variable to work around the phase boundary. Never print helper output, credential files or credential traces.

The handoff exists only in the privileged Cloud environment and may persist with its cache. Restrict environment access, reset its cache and revoke/rotate the token when access ends. Never run bootstrap or maintenance against a trusted local user's global Git settings merely for QA. Tests use isolated Git configuration and a fake credential. Branch protection remains authoritative; no force-push or policy bypass is allowed.

## Mandatory verified publishing

`client edit -> validate -> inspect intended diff -> commit -> fetch/reconcile main -> authenticated push -> remote verification -> success`

After committing only the intended validated task changes, run `bash scripts/codex-cloud-publish.sh`. It requires a clean worktree and the approved clean GitHub origin, fetches main with an explicit refspec (including task worktrees without a fetch mapping), and pushes `HEAD:main` only when remote main is an ancestor of the task commit. It then fetches again and verifies that remote main contains that commit. An already-published task is accepted only after a fresh fetch proves containment. The approved branch remains main; another target or a different push destination is rejected.

When main advances or diverges, preserve newer remote work, rebase only the task commits onto the fetched main, rerun relevant validation/audits and retry. Stop safely on ambiguous conflicts. A concurrent remote update is protected by the normal non-forced push. Missing authentication, rejected pushes, fetch failures and failed verification must never produce success. Do not force-push or use force-with-lease. A local `work`-branch commit or a prepared PR is not completion.

From a trusted local environment, the same publisher uses the existing approved Git authentication; do not run Cloud bootstrap to replace it. After Git verification, perform bounded live checks when an intended domain is configured. This project does not currently declare one.

Once connected, prompt ordinary edits. Codex reads this repository and safely publishes validated changes to your origin when allowed. Environment scripts, secrets and caching are covered in [official OpenAI documentation](https://learn.chatgpt.com/docs/environments/cloud-environment). The token name and direct-publish scripts here are this template's workflow.

## Client-facing task results

For ordinary content/design edits, follow the Client Mode result rule in [AGENTS.md](../AGENTS.md#keydiv-strict-final-response-contract): return only "✅ Task completed and validated successfully." after completion, validation and verified remote publication. If Git publication fails, return "⚠️ Task completed, but publishing found an issue:" followed by a short plain-language explanation. For a real validation issue, return "⚠️ Task completed, but validation found an issue:" followed by a short plain-language explanation. Never report success for a local-only commit.

All required internal checks still run. Keep routine QA/package-manager details internal. Browser-install/CDN limitations alone do not warrant a client warning when all required non-browser validation passes and no actual site/runtime failure is found; record unavailable checks accurately without claiming browser QA passed. Developer Mode allows relevant details for explicit technical requests, debugging/developer work, or necessary failure diagnosis. Reporting does not change runtime or publishing behavior.
