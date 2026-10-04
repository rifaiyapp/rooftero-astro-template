# Rooftero — Roofing & Restoration Astro Template

Rooftero is a premium responsive roofing/restoration landing-page template by KEYDIV. The approved visual direction is documented in `DESIGN.md`; the project uses the `shibga-web-starter` foundation for static Astro builds, Cloudflare deployment, runtime mounting and lead routing.

## Development

```bash
npm install
npm run dev
npm run validate
```

Keep deployment and lead infrastructure unchanged during normal design/content work. Website files, content and assets may be customized for the real client.

## One-file business configuration

Start with `src/config/site.ts`. Replace the demo values with verified client information:

- business/site name;
- production `url`;
- phone and email;
- service area;
- logo/favicon assets if rebranded;
- SEO title, description and social image;
- privacy contact;
- `seo.indexable` launch switch.

The demo intentionally ships with `seo.indexable: false`. Set it to `true` only after the production domain, contact details, content, legal pages, lead routing and business claims have been verified. The robots route, sitemap and page metadata then stay synchronized from the same configuration.

## Lead form

The browser submits leads to the site Worker at `/api/lead`; the Worker forwards through the private `LEAD_GATEWAY` service binding. Public project/form IDs are generated from the destination repository by `scripts/sync-destination.mjs`.

Before a real launch:

1. register the production project/form/origin in the lead-routing workflow;
2. confirm the Cloudflare `LEAD_GATEWAY` service binding;
3. run a deliberate end-to-end test lead;
4. verify the thank-you page and downstream CRM/notification delivery.

Do not place webhook URLs, API keys or gateway secrets in browser code.

## SEO and marketing launch checklist

- Replace every fictional/demo review, rating, license, certification, warranty, response-time and service-area claim with verified client information.
- Confirm one clear H1, conversion CTA, phone number and form path.
- Set the final domain in `site.url` and enable `seo.indexable` only when ready.
- Check `/robots.txt` and `/sitemap.xml` after deployment.
- Add the sitemap in Google Search Console and Bing Webmaster Tools when applicable.
- Add GA4, call tracking, advertising pixels or consent tooling only when the client actually needs them; update the privacy/cookie disclosures when those technologies are enabled.
- Keep legal pages tailored to the real business and jurisdiction. The included legal copy is a practical template, not jurisdiction-specific legal advice.
- Keep the thank-you and 404 pages non-indexable.

## Performance and accessibility

Rooftero uses self-hosted fonts, static Astro output, responsive AVIF/WebP image sets, explicit media dimensions, lazy loading below the fold and a high-priority hero image. Preserve those patterns when replacing imagery.

After meaningful changes, test desktop and mobile layouts, keyboard navigation, forms, FAQ, carousel controls, reduced-motion behavior and Lighthouse/PageSpeed. Avoid adding unnecessary third-party JavaScript because it can materially affect Core Web Vitals.

## Legal pages included

- `/privacy/`
- `/terms/`
- `/accessibility/`
- `/cookies/`

Replace the demonstration contacts and tailor the policies before publishing for a real contractor.
