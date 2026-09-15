# Distribution boundary

The current product source is destination-neutral. Earlier seller-owned Lead Service routing and identifiers were removed from frontend configuration and related QA. No private webhook, credential header, embedded token or analytics account ID was found in current runtime source. The default build does not send leads.

Cloud scripts use neutral CODEX_* settings and actual origin. Publishing config uses a repository-derived Worker name and static assets, with no account/zone/domain binding. It also declares the approved server-only LEAD_GATEWAY Service Binding for same-origin form delivery; the destination account must provide its authorized shared Lead Service. No gateway credentials or public delivery URL are shipped to the browser. Destination sync runs before each build and changes only technical project identity and deployment base path, preserving the binding; branding and Lead Service IDs remain separate customization. Creator credit is non-operational.

- Run npm run audit:distribution after building. It scans current repository text/output for seller operational dependencies, credential patterns and tracked local artifacts. Pattern scanning is not proof of absence of every possible secret.
- Distribute a clean archive of the current product revision, not the local workspace or .git directory. Exclude environment files, dependencies, built/QA output, credentials and logs. Git archive honors repository export exclusions.
- Master history is intentionally preserved. Earlier revisions contain obsolete seller integration settings; do not deploy those as customer templates. Full-history imports carry historical material even though current source is neutral. Prefer a fresh repository from the current archive for a clean handoff. Never rewrite master history for this purpose.
- Clones retain source origin. Bind a copy to the buyer repository before write-enabled setup; scripts cannot infer whether an existing source remote is intended.
- Confirm commercial license and imagery/font/icon redistribution rights and preserve required notices. Productization grants no new rights and does not verify fictional business claims.

Continue with [customer setup](CUSTOMER-SETUP.md). No author GitHub/Cloudflare account, private Lead Service or Automation Service is required.
