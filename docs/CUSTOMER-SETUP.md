# Set up your copy

1. Import into your own GitHub repository. Use its origin, credentials and environment. A clone alone does not change origin. Follow [Cloud setup](CODEX-CLOUD-SETUP.md).
2. Follow [customization](CUSTOMIZATION.md). Replace fictional contacts/reviews/service areas and unverified licensing, ratings, insurance and warranty claims with approved facts. Confirm commercial licensing and asset rights.
3. Configure your own [Lead Service](FORM-INTEGRATION.md), or retain the non-sending demo. Add the privacy/consent disclosures required for your practices.
4. Choose exactly one launch profile. The master stays private-demo with noindex metadata/headers, crawlable robots and no canonical/sitemap. Public-organic needs production metadata, domain/canonical, indexing and an appropriate sitemap. Ads-landing defaults to noindex,follow and must allow ad crawlers. Update project.config.json, layout metadata, public/_headers, public/robots.txt and matching validation/QA gates together. JSON alone does not change output. Keep previews noindex.

## Your Cloudflare account/domain

Static output is dist. No seller account ID, zone, route or domain is configured. `npm run sync:destination` (also run automatically by prebuild) derives technical identity from the current Git `origin` repository name, regardless of account. It updates the Worker name in `wrangler.jsonc` and the repository name and deployment base path in `project.config.json`. Repeated runs leave already synchronized files untouched. Wrangler is not a project dependency.

| Repository | Worker name | Base path |
| --- | --- | --- |
| rooflume-astro-template | rooflume | / |
| rooftero-astro-template | rooftero | / |
| vantoro-astro-template | vantoro | / |
| plumbero-astro-template | plumbero | / |
| shibga-roofing-lp-01 | shibga-roofing-lp-01 | /lp/roofing-01/ |
| other destination names | repository name | / |

Every `<brand>-astro-template` repository deploys at `/`. Other destinations retain the existing `DEPLOYMENT_BASE_PATH` override and Shibga LP rule. Worker names are lowercase. When no usable origin is available, `CODEX_GITHUB_REPOSITORY`, then `GITHUB_REPOSITORY`, can supply an explicit `owner/repository` fallback. Stale environment values cannot override origin; `CLOUDFLARE_WORKER_NAME` does not determine destination identity. Bind the copy's origin to its actual destination before building. Sync does not customize visible branding, logos, content, design or lead project IDs.

In your own Cloudflare account, connect your destination repository to Workers Builds, choose main, build with `npm run build` and deploy with `npx wrangler deploy`. Use Node 22.12+ or 24 with npm 11. Set public form variables in that build environment. Alternatively authenticate locally to your own account, build and use the same deploy command. Confirm the target account; never reuse seller credentials. See [Cloudflare static-assets setup](https://developers.cloudflare.com/workers/static-assets/get-started/).

Attach your own custom domain in the Worker's domain settings, then record its approved HTTPS URL in project.config.json. The root build's asset router also supports configured runtime route mounts such as `/roofing/` or `/templates/service/roofing/` without rebuilding.

### Runtime mount configuration

For root deployment, `RUNTIME_MOUNT_PATHS` is not required. `/` is always valid and remains available automatically, including when nested mounts are configured.

For one nested mount, set this Cloudflare Runtime Variable:

```text
RUNTIME_MOUNT_PATHS=["/path/"]
```

For multiple nested mounts, including a deep nested mount:

```text
RUNTIME_MOUNT_PATHS=["/path/","/multi/level/path/"]
```

Runtime mount paths require a leading and trailing slash in deployment configuration. Set `RUNTIME_MOUNT_PATHS` as JSON or JSON text in the Cloudflare Worker's runtime variables. It is NOT an Astro `PUBLIC_*` build variable. `keep_vars: true` preserves dashboard variables during deployment; a build environment variable alone does not configure the running Worker.

A no-slash mount root receives a 308 redirect to the same mount with a trailing slash, retaining the host and query string, before asset lookup; the slash variant serves the root LP internally; the `/thank-you/` suffix serves the thank-you page, and `/api/lead` uses the same protected Service Binding handler at any depth. Existing static paths take priority, and mounted asset paths resolve to their root files. Missing files and reserved asset/API paths retain 404 responses.

Unknown child documents and unconfigured mounts return HTTP 404 instead of being discovered as new mounts. The longest configured mount wins at segment boundaries. Missing or invalid runtime configuration enables only `/`; any invalid entry rejects the entire additional list, without disabling root pages or the root Lead Service route.

Mount values must be absolute paths using letters, digits, hyphens, underscores, dots or tildes, configured with leading and trailing slashes. Reserved route/asset segments (`api`, `assets`, `_astro`, `thank-you`, `index.html`), dot traversal, encoded paths, URLs, queries and fragments are rejected. Changes to this runtime variable take effect without an Astro rebuild. Verify the variable in each destination Worker before enabling its nested routes. Review custom links and client configuration separately when customizing the template.

### Service binding and production build variables

The existing server-only Cloudflare Service Binding is:

```text
LEAD_GATEWAY -> lead-gateway
```

Provision the authorized service in the destination account. For production form delivery, set these build variables and rebuild:

```dotenv
PUBLIC_LEAD_MODE=live
PUBLIC_LEAD_PROJECT_ID=<project-id>
PUBLIC_LEAD_FORM_ID=hero-quote
```

Do not use `PUBLIC_LEAD_ENDPOINT`. The browser uses the same-origin lead API; delivery uses the Service Binding. See [form integration](FORM-INTEGRATION.md) for authorization and the request/response contract. The master remains in non-sending demo mode until explicitly configured.

### Expected routes

With `/path/` configured as a runtime mount:

| Request path | Expected behavior |
| --- | --- |
| `/` | Landing page |
| `/thank-you/` | Thank-you page |
| `/unknown/` | HTTP 404 |
| `/path` | HTTP 308 redirect to `/path/` |
| `/path/` | Landing page |
| `/path/thank-you/` | Thank-you page |
| `/path/api/lead` | Lead gateway through the Service Binding for valid same-origin JSON POST requests |
| `/path/unknown/` | Branded HTTP 404 |

The same behavior applies at `/multi/level/path/` when configured. Unknown paths never become landing-page mounts automatically.

Run npm run validate, npm audit, npm run audit:distribution, npm run qa:form and npm run qa:runtime. Check actual live routes, missing-route 404, mobile navigation, form delivery, indexing and security headers. Keep safe revalidation caching; add HSTS only after domain readiness. No seller hosting or automation is required.

## Framework upgrade policy

Keydiv Runtime v1.0.0 is the current stable baseline. `project.config.json` records `runtimeVersion` separately from `factoryVersion` and `uiRuntimeVersion`; changing metadata is not a runtime migration. The tested repository runtime implementation is the source of truth.

Never automatically upgrade Astro, Node, Wrangler or related runtime dependencies across production sites. Existing production sites can remain on a stable older runtime unless security, compatibility or maintenance requirements justify upgrading. A factory skill update alone is not an upgrade requirement.

Framework upgrades must:

1. Happen on an upgrade branch.
2. Preserve all site content, design and client customizations.
3. Preserve the installed Keydiv runtime; use explicit migration steps for a separately justified runtime upgrade.
4. Run `npm run validate`.
5. Run `npm run audit:distribution`.
6. Test root deployments without `RUNTIME_MOUNT_PATHS`.
7. Test nested deployments, including trailing-slash redirects and assets.
8. Test deep nested deployments and multiple configured mounts.
9. Test form submission and failure handling through the same-origin API and Service Binding.
10. Test thank-you redirects after confirmed submission success at each mount depth.
11. Test strict 404 behavior for unknown root, nested and deep nested paths.

Use repository Worker/runtime/form QA and isolated or staging deployment checks. Real lead submissions require customer authorization. Verify/repair compatibility with the installed Keydiv runtime before merging or publishing; never replace client pages or design as an upgrade shortcut.
