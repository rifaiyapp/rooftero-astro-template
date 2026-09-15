# Customize Rooflume

The approved design is recorded in DESIGN.md. Edit locally or prompt Codex using this repository alone; no seller skill or account is required.

| Change | Where |
| --- | --- |
| Name, phone, primary CTA, logo, favicons, SEO defaults | src/config/site.ts |
| Services, paragraphs, reviews, FAQs, service areas and footer disclosures | src/pages/index.astro |
| Colors, type, spacing, responsive layout | src/styles/global.css; preserve DESIGN.md |
| Form delivery | [Form integration](FORM-INTEGRATION.md) |
| Profile and destination domain | project.config.json plus [launch steps](CUSTOMER-SETUP.md) |

Keep long-form content in the page. Site config updates common branding, not every quotation/editorial mention. Search for demo branding and replace fictional proof with verified customer facts. Update the fictional-brand footer disclosure only after configuring a real business. No email, address, hours or social accounts have been invented; add only supplied facts.

The logo uses ResponsiveImage.astro and src/assets/image-manifest.json. Replace its optimized AVIF/WebP variants with matching dimensions or update the manifest/component usage. Other imagery lives in public/assets. Preserve crops, dimensions, alt descriptions and responsive sources. Review image redistribution rights and required font/icon licenses separately from visual approval.

Example Codex prompts:

- “Change the business name and phone to these values, including accessible labels and editorial mentions. Preserve the layout and typography.”
- “Replace the logo with this supplied asset while preserving its visual size.”
- “Replace demo reviews with these authorized reviews without changing the carousel.”

Run npm run validate, npm audit, npm run qa:form and npm run qa:runtime after changes. Codex follows AGENTS.md to validate and safely publish. Changing profile JSON alone does not change indexing output; update metadata, headers and matching gates together.
