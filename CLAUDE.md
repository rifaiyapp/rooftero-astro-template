# Website Project Rules

Use this repository to build and maintain the client website.

## Normal website work

You may edit:
- `src/pages/**`
- `src/components/**`
- `src/layouts/**`
- `src/styles/**`
- `src/content/**`
- `src/data/**`
- `src/lib/**`
- `public/assets/**`
- `DESIGN.md` when a durable design decision changes

Preserve infrastructure and configuration during ordinary website work:
- `publishing/**`
- `scripts/**`
- `wrangler.jsonc`
- `project.config.json`
- `package.json`
- `package-lock.json`
- `astro.config.mjs`
- `tsconfig.json`
- `metadata.json`
- `src/config/lead.ts`
- `src/scripts/lead-form.ts`
- `src/utils/runtime-mount.mjs`
- `AGENTS.md`
- `CLAUDE.md`

Do not change dependencies, package managers, framework versions, deployment behavior, routing infrastructure, or form delivery code unless the user explicitly requests a maintenance/developer task.

## Forms

All customer-facing inquiry, quote, callback, estimate, contact, consultation, inspection, financing, appointment or service forms must use the existing form integration.

For each logical form:
- use a unique HTML form ID;
- include a hidden `form_source` with a stable descriptive value;
- use canonical field names such as `name`, `phone`, `email`, `zip`, `service`, `subject`, and `message`;
- include at least `name` and `phone` when appropriate for a lead form;
- keep labels, validation and accessible status feedback;
- include a `.form-status` element with `role="status"` and `aria-live="polite"`;
- connect the form with the existing `connectLeadForm` helper;
- never add a direct webhook, external form backend, secret, API key or private endpoint to browser code.

Use root-relative internal links such as `/about/` and `/contact/`. Do not hardcode a deployment prefix.

## Quality

Keep the site lightweight, responsive, accessible and static-first. Do not invent awards, licenses, ratings, statistics, testimonials or business claims.

After ordinary website work, run:

```bash
npm run validate
```

Do not send real test submissions unless the user explicitly asks for a live form test.
