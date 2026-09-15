## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Keydiv Astro Factory v4.9 client editing instructions

These repository-visible instructions incorporate Keydiv Astro Factory 4.9 cloud publishing and Keydiv UI Design 2.1 editing rules. They do not migrate Keydiv Runtime v1.0.0 or change the installed foundation metadata in `project.config.json`.

This is an approved, completed commercial template. Project Upgrade is foundation-only: preserve the page design, content, layout, images, typography, colors, responsive behavior, animations, form fields and functionality. Do not redesign because runtime guidance changed. Read `project.config.json`, `DESIGN.md` and `docs/DISTRIBUTION.md` first.

- Exactly one profile: `private-demo`. Keep robots meta and equivalent headers `noindex,nofollow,noarchive,nosnippet`, allow crawling so noindex can be seen, and do not add indexable sitemaps or promoting canonicals. Noindex is not access control.
- Static-first Astro; retain minimal existing client scripts. No framework, adapter, tracking or deployment dependency without a real requirement. Never install Wrangler solely for publishing.
- Node 22.12+ or Node 24, below 25; npm 11. Cloud uses Node 22; local preference is `.nvmrc`.
- Keydiv Runtime v1.0.0 is the current stable baseline, recorded by `project.config.json` `runtimeVersion` independently of factory/UI versions. The repository implementation is authoritative. Never automatically upgrade Astro, Node, Wrangler or related runtime dependencies across production sites. Follow the branch-based upgrade policy and root/nested/deep-nested, form, thank-you and strict 404 checks in `docs/CUSTOMER-SETUP.md#framework-upgrade-policy`; preserve all client content, design, customizations and the installed Keydiv runtime.
- Cloud bootstrap: `bash scripts/codex-cloud-setup.sh`; cached maintenance: `bash scripts/codex-cloud-maintenance.sh`. The destination owner configures its own environment once using `CODEX_GITHUB_TOKEN`; see `docs/CODEX-CLOUD-SETUP.md`. Never expose credentials or execute privileged bootstrap merely for local QA.
- The form ships in non-sending demo mode. Read `docs/FORM-INTEGRATION.md` before configuring a customer-owned Lead Service. Preserve its fields, validation and interaction UX; never reintroduce seller routing or send test leads without authorization.
- Team-facing infrastructure names are Lead Service, Publishing Service, Automation Service and Project Configuration. Never print private endpoint values, identifiers, webhooks or credentials.
- Preserve semantic markup, labels, keyboard focus, reduced motion, responsive reflow, reserved image dimensions and self-hosted media. Target WCAG 2.2 AA and LCP <=2.5s, INP <=200ms, CLS <=0.1 without claiming unmeasured field results.
- Preserve appropriate security headers, no secret/client credential storage, no lead-data logging, no unnecessary third-party resources. Do not add HSTS without domain readiness confirmation or broad immutable caching on error responses.

## Validation and safe direct publishing

1. Inspect Git status and existing instructions; preserve unrelated user changes, history and the valid remote. Fetch `origin/main` before editing when practical, and inspect ancestry without resetting user work.
2. Install with `npm ci` when needed; run `npm run validate`, `npm audit`, `npm run audit:distribution`, `npm run qa:cloud`, `git diff --check`, and scan the intended diff for secrets, private configuration leakage, starter contamination and unintended files. Do not suppress failed checks or use force audit fixes.
3. Run `npm run qa:form` and `npm run qa:runtime` for changes affecting runtime/page behavior. Render desktop/mobile and inspect screenshots when available; never claim visual QA without rendering. `QA_BASELINE` may point to a pre-change build for pixel comparison.
4. Commit only intended validated changes, then fetch latest main again. Preserve newer remote work. Rebase only task commits if needed, resolve only unambiguous conflicts, and rerun relevant validation/audit after reconciliation.
5. After committing, run `bash scripts/codex-cloud-publish.sh` to fetch latest main, require safe ancestry, push `HEAD:main` with authentication, fetch again and verify the task commit is contained by remote main. If main advanced/diverged, safely reconcile only task commits, rerun relevant checks and retry. Routine work does not stop at a local commit or prepared pull request. A pull request is used only if explicitly requested or required by policy. Never force-push, overwrite newer work or publish failed validation. Failed authentication, push or remote verification forbids a success response.
6. Prefer actual local origin, then the approved origin persisted by this environment. Only if no origin is available use `CODEX_GITHUB_REPOSITORY=owner/repository`. Never infer an owner or use a seller/agency fallback. A clone still pointing to its source must be rebound to the buyer repository before write-enabled setup. Never change the master remote as part of copy setup.
7. Publishing Service uses the existing static configuration and `dist`. Perform bounded live verification at the intended domain when available, including route status, noindex and security headers. Report results using the Client Mode contract below.

## Keydiv Codex Cloud verified publishing

For ordinary authorized code-changing Client Mode tasks, the normal completion path is:

`edit -> validate -> inspect intended diff -> commit -> fetch/reconcile main -> authenticated push -> remote verification -> success response`

Use the repository's canonical `scripts/codex-cloud-publish.sh` after committing only the intended validated changes. Do not stop at a local `work` branch commit or prepared pull request when direct publishing is authorized.

- Keep `origin` clean (`https://github.com/owner/repository.git`); never embed credentials in the remote URL.
- Authentication is supplied by the ephemeral Codex Cloud credential helper configured from `CODEX_GITHUB_TOKEN`.
- Cloud setup secrets are removed before the agent phase. Setup hands the repository-scoped credential to a restricted file outside the repository in the privileged ephemeral environment; maintenance reasserts the helper and reuses that handoff when the secret is absent. Never print credential-helper output, enable credential tracing, or copy credential files into the repository. Missing authentication must fail safely. See `docs/CODEX-CLOUD-SETUP.md`.
- Never force-push or overwrite newer remote work.
- If remote `main` advanced/diverged, fetch and safely reconcile only the task commit(s), rerun relevant validation, then retry. Stop on ambiguous conflicts.
- After push, verify the task commit is contained by remote `main`.
- Do not return the Client Mode success response until remote verification succeeds.
- If edit/validation succeeds but publication fails, use the short publishing-issue response from the strict final-response contract.

## Customer-portable template runtime

This repository is a distributable template/product. Normal maintenance must be possible from the repository instructions alone; do not require the customer to install the Keydiv factory skill.

- Preserve the approved design system in `DESIGN.md` unless the customer explicitly requests a redesign.
- Use the current repository `origin` for Git finalization. Never infer or rewrite the customer destination to a seller-owned GitHub account.
- Never expose or reintroduce seller-private Lead Service, Automation Service, publishing credentials, webhooks, tokens, private endpoints, or account identifiers.
- Treat form/backend integration as customer-owned configuration. Do not silently send leads/data to the template author's systems.
- Keep common customer business/rebrand values centralized when the project provides a site config.
- Before launch, make the intended indexing/profile behavior explicit so a demo/noindex profile is not accidentally shipped as production.
- Follow the repository's safe validation, direct-publish, visual QA, and strict concise final-response rules.

- Agency copies are ordinary destination copies; no separate agency-specific factory/runtime is required.

## Keydiv client-safe website editing boundary

For ordinary client/team website requests, use Client Website Edit mode and make the **smallest correct diff**. Normal maintenance must work from these repository instructions without installing local skills.

Allowed when required by the request:
- website-facing Astro/HTML pages, components and layouts;
- content, sections and pages, including creation, removal or reordering when requested;
- CSS, responsive styles, colors, typography, spacing and visual states;
- approved images, icons, favicons and other presentation assets;
- approved business/site content configuration such as `src/config/site.ts`;
- accessibility, SEO/content metadata and structured data consistent with the selected profile;
- safe performance/Core Web Vitals improvements and image/font/CSS/JS optimization;
- browser-side JavaScript used only for visible website interactions or animations, including accordions, tabs, carousels and navigation.

Keep presentation JavaScript lean, accessible and performance-safe. Prefer CSS for purely visual motion and honor `prefers-reduced-motion`. Do not introduce hidden data collection, auth/session logic, private API calls, secrets or lead-routing behavior through presentation work. Visible form copy/layout may change only while preserving fields, validation, submission behavior and delivery.

For ordinary client content/design/SEO/performance work, do not modify these protected files or systems unless explicitly required by an authorized developer/runtime task:
- `AGENTS.md`, `README.md`, `docs/**`;
- `project.config.json`, including `runtimeVersion` and factory/UI metadata;
- `wrangler.json`, `wrangler.jsonc`, `publishing/**`, `.github/**`;
- `qa/**` and infrastructure/bootstrap/migration/runtime scripts;
- runtime mount/router implementation, including `src/utils/runtime-mount.mjs`;
- Lead Service delivery/routing implementation, including `src/config/lead.ts` and `src/scripts/lead-form.ts`;
- Service Bindings, private endpoints, secrets, `.env*`, credentials and automation/webhook configuration;
- Cloudflare runtime/deployment configuration and publishing behavior;
- dependency/framework configuration, including `package.json`, lockfiles, `.nvmrc`, `tsconfig.json` and `astro.config.*`.

Classify files and code by **purpose, not extension**. A site-facing page can contain protected runtime integration; preserve that integration while editing the requested presentation. Reading an instruction file does not authorize modifying it.

Requests to improve SEO, page speed, Core Web Vitals or accessibility, optimize images/fonts/CSS/JS, or fix LCP/CLS/INP are valid client work. Make targeted site-facing improvements while preserving the `private-demo` profile/indexing rules, accessibility, form behavior, routing, Keydiv Runtime, Cloudflare publishing and lead integration. Do not modify infrastructure merely to improve a synthetic score. If a protected change is necessary, it requires an explicitly authorized developer task; an optimization request alone does not authorize it.

Touch only the implementation needed for the request. Do not opportunistically edit instructions, docs, QA, scripts or runtime metadata, upgrade dependencies, refactor unrelated CSS/components, or rewrite a whole page when a local change is sufficient. Run affected checks and all repository-required validation internally, then follow the existing safe Git/publishing workflow and exact Client Mode response contract.

## Keydiv UI/UX design runtime

For meaningful page/section design or redesign tasks:
- read `docs/KEYDIV-UI-DESIGN.md` before editing;
- read `DESIGN.md` as the persistent project design source of truth and update it only when a durable design-system decision genuinely changes;
- classify the task as reference-led, directed, or auto art direction;
- do not require a reference image: when none is supplied, choose a suitable premium art direction automatically;
- when references are supplied, inspect and match their defining anatomy at the requested/inferred fidelity;
- avoid generic AI/SaaS fallback layouts and repeated project templates;
- own typography, color, spacing, content hierarchy, imagery direction, CTA hierarchy, responsive composition, and subtle purposeful motion;
- perform visual QA/render comparison when browser tooling is available and refine visible issues before finalization;
- never mark visual QA passed when no rendered page was inspected;
- never invent factual business proof/claims;
- after design work, continue to follow all existing repository validation, Git, profile, security, accessibility, and Publishing Service rules.

For small visual changes, use **Small Visual Edit** behavior: read `docs/KEYDIV-UI-DESIGN.md` and `DESIGN.md`, preserve the current art direction, and make the smallest implementation diff. Do not rewrite `DESIGN.md` for a tiny edit or refactor unrelated CSS/components. Do not update `AGENTS.md` or `docs/**` during a normal client edit; a durable design decision permits updating `DESIGN.md` only, not protected instructions.

Presentation JavaScript is allowed for a justified visible interaction or animation; keep it lean, accessible, performance-safe and separate from protected runtime, lead delivery and deployment behavior.


## Keydiv strict final-response contract

Client Mode is the default for ordinary website edits: content/text, images, colors, FAQs, phone/email, sections, layout/design, presentation interactions/animations, SEO, accessibility, performance and optimization. It also applies to Foundation Setup, Runtime Install, Runtime Repair, Destination Publishing, and Validation and Launch.

Run all required internal validation, audit, visual QA, Git synchronization, publishing, and live checks exactly as required. This rule changes user-facing output only, not validation requirements or deployment logic.

This reporting rule does not authorize editing instruction files. Ordinary client edits must also follow the client-safe smallest-diff boundary above.

### Client Mode result

For a code-changing Client Mode task, success is allowed only after the requested edit, required validation, intended commit, safe push to main, and remote verification all succeed. A local workspace edit or local commit is not publication.

When the requested task is complete, all required validation passes, and required Git publication is remotely verified, the assistant-written final response must be exactly:

```text
✅ Task completed and validated successfully.
```

If the edit/validation succeeds but Git publication fails, return only:

```text
⚠️ Task completed, but publishing found an issue:
[short plain-language explanation]
```

For a real validation issue after completing the requested change, return only:

```text
⚠️ Task completed, but validation found an issue:
[short plain-language explanation]
```

Do not expose routine command names/results (`npm run validate`, `npm audit`, `npm run audit:distribution`, `npm run qa:cloud`, `npm run qa:form`, `npm run qa:runtime`, `git diff --check`), individual QA suites, internal runtime checks, package-manager or Playwright browser-download details. Do not add checklists, logs, headings, Git details, commit hashes, file summaries, or implementation summaries to client results.

Playwright/CDN/browser-install limitations alone are environment limitations, not evidence of a site/runtime failure. When all required non-browser validation passes and no actual site/runtime failure is found, do not present those limitations as a client-facing warning. Keep an accurate internal record of unavailable browser checks; never claim unrun browser/visual QA passed. Do not skip available required checks or dismiss actual failures.

Normal deployment propagation is not a validation error. Preserve bounded live verification and do not claim live deployment is complete without evidence.

### Developer Mode and blockers

Detailed validation results may be shown when the user explicitly requests technical details, the task is debugging/developer work, or a failure requires technical diagnosis. A detailed content/design prompt alone does not select Developer Mode. Include only relevant details; raw logs only when needed for diagnosis, with secrets/private configuration redacted.

If the requested work itself is incomplete or blocked (for example by authentication or a Git conflict), report only the blocker and minimum actionable detail; do not claim completion. Never hide real validation failures or publish failed validation.
