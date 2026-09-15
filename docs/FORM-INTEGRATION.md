# Form integration

**The template sends no lead data by default.** A valid submission reports “Demo only. Your request was not sent.” Fields remain filled and the button stays usable. No submitted event, request or persistent storage is used. The visible fields and validation stay intact. The form's method="dialog" prevents native navigation/submission outside a dialog if JavaScript is unavailable; JavaScript handles configured delivery.

## Customer-owned Lead Service

Copy .env.example to your ignored .env, or set these build-time variables in your own publishing environment:

```dotenv
PUBLIC_LEAD_MODE=live
PUBLIC_LEAD_PROJECT_ID=<project-id>
PUBLIC_LEAD_FORM_ID=hero-quote
```

Set live mode and both identifiers, then rebuild. Blank identifiers fail closed with a call-us message. Omitting live mode keeps the non-sending demo. The browser resolves the same-origin endpoint from the LP's runtime pathname on submission: `/` uses `/api/lead`, while `/roofing` and `/roofing/` use `/roofing/api/lead`. Any mount depth works with the same compiled build; Astro's build base does not select the endpoint. The shared resolver in `src/utils/runtime-mount.mjs` captures the submission mount once for both the lead endpoint and the delayed thank-you redirect. API and thank-you suffixes resolve back to their owning mount. Query strings and fragments do not affect these destinations. `PUBLIC_LEAD_ENDPOINT` is no longer used.

Configuration is in src/config/lead.ts; behavior is in src/scripts/lead-form.ts. The Publishing Service Worker handles `/api/lead` in publishing/asset-router.mjs and calls `/v1/submit` through the server-only `LEAD_GATEWAY` Service Binding declared in wrangler.jsonc. Provision the shared Lead Service in the destination Cloudflare account and register the destination origin and identifiers with it before enabling live mode. Destination sync preserves this binding while updating Worker identity and the build base path. A destination copy must configure its own authorized Lead Service; no public endpoint fallback exists. Astro's static preview alone does not run this Worker route.

PUBLIC_* values are browser-visible: never put credentials, private webhooks, secret headers or authentication tokens in them. Any downstream secrets belong only in the Lead Service. [Astro environment variables](https://docs.astro.build/en/guides/environment-variables/) are compiled into the static build; variable changes require rebuilding.

## Request and response

See [deployment configuration](CUSTOMER-SETUP.md#service-binding-and-production-build-variables) for the exact Service Binding and [runtime mounts](CUSTOMER-SETUP.md#runtime-mount-configuration) for root, nested and deep nested deployment. `RUNTIME_MOUNT_PATHS` is a Cloudflare Runtime Variable, not an Astro `PUBLIC_*` build variable; root remains available automatically.

The JSON POST contains project_id, form_id, fields, metadata, submit_elapsed_ms and honeypot. The existing meta and website aliases are preserved, including meta.submit_elapsed_ms. Fields include name, phone, email, zip and message. Additional named controls are included; repeated names become arrays. The website honeypot control stays separate from fields and populates both honeypot and website. Metadata contains page URL, referrer and the five UTM parameters. The Worker validates a JSON object and forwards the original body unchanged so server-side field validation and spam checks remain owned by the Lead Service. Avoid sensitive URL data and implement your privacy/consent requirements before collecting production requests.

The Lead Service must return a successful HTTP status with JSON `{ "success": true }` only after acceptance. The Worker awaits this acknowledgement and returns only `{ "success": true }` to the browser. Other responses return a generic failure without internal bodies, headers, cookies or redirects. Rate limits retain HTTP 429; other upstream failures return 502, and a missing binding returns 503. Invalid JSON, network failures and the existing 15-second browser timeout preserve inputs and show a generic error. Requests omit credentials, enforce same-origin mode, reject redirects and do not retry automatically. Confirmed success resets fields, prevents duplicates, emits rooflume:lead-submitted with field data and redirects to `<runtime mount>thank-you/` only after confirmed success. Review listeners before adding analytics; never log personal data. Adjust callback wording if the customer cannot promise it.

The Worker requires POST, an Origin matching the current request origin, same-origin Fetch Metadata when supplied, and application/json. Other methods return 405, origin violations 403, other media types 415, malformed/non-object JSON 400 and bodies exceeding 32 KiB 413. Actual streamed bytes are bounded even without Content-Length. API responses are non-cacheable and retain security/noindex headers, with no CORS access granted. Only origin, referrer, user agent and Cloudflare's connecting IP are forwarded as browser context; client cookies, authorization and forwarding headers are excluded. Origin checks restrict browser use and are not authentication for non-browser clients. The Lead Service continues to own origin/project authorization, server-side validation, honeypot/timing checks, spam/rate limits, privacy controls and downstream delivery. A lost response can still represent an accepted request; design server duplicate handling accordingly.

## Verification

npm run qa:worker (also part of npm run validate) checks the Worker route, payload forwarding, safe rejection/failure paths, static routing and frontend base paths. npm run qa:form checks demo, JavaScript-disabled fallback, missing configuration and live success/error/timeout paths plus the thank-you redirect in temporary builds with intercepted requests. No real leads are sent. Verify actual production delivery with customer authorization after configuring their own service.
