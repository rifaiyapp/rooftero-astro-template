# Design System

## Project intent
- Audience: homeowners seeking roofing and restoration services; template buyers customizing for clients.
- Primary user goal: request a free roof inspection or call.
- Page/site archetype: approved premium roofing and restoration single-page commercial template.
- Brand personality: confident, practical local service authority; Rooflume is a fictional demo brand.
- Current profile: private-demo (Project Configuration).

## Design input
- Input mode: reference-led; existing approved implementation is the reference.
- Reference fidelity (when applicable): strict composition and behavior preservation.
- Supplied direction/assets: preserve all existing source and public imagery. Factory upgrades do not authorize redesign.

## Art direction
- Selected style family: Service Authority, describing the approved design rather than replacing it.
- Secondary influence (optional): none added.
- Design thesis: bold roofing photography, angular navy/orange compositions and prominent inspection/call actions.
- Signature visual idea: polygon-cut sections, ribbons and action shapes.
- Visual density: retain the completed content-rich landing page.

## Composition
- Main grid/alignment: existing CSS grids and section alignment are authoritative.
- Content width/gutters: base shell min(1480px, calc(100% - 60px)); preserve responsive overrides.
- Hero/section anatomy: preserve exact source order in src/pages/index.astro, including hero callback, services, process, testimonials, FAQ and footer.
- Media treatment: preserve image placement, object positions, polygon clips and overlays.

## Typography
- Display role: Arial Narrow, Roboto Condensed, Impact, sans-serif stack as implemented.
- Body role: Inter, system UI and existing fallback stack; do not introduce a new font download.
- Label/navigation role: existing display stack; Lobster Two italic and Oswald 700 for the phone lockup.
- Scale/line-length notes: all current clamps, weights, line heights, letter spacing and wrapping remain authoritative.

## Color
- Background: navy #061f49, deep navy #031936, white #ffffff.
- Surface: paper #f2f1ef and navy-soft #15345d.
- Text: ink #14233c with existing white-on-dark treatment.
- Muted: #60708a.
- Primary accent/action: orange #ff6a00.
- Secondary accent (optional): gold #ffc248.
- Border/focus: existing borders and visible gold focus treatment.

## Spacing
- Rhythm: retain current section-specific spacing rather than normalizing it.
- Key section/gutter notes: src/styles/global.css is the precise spacing source of truth.

## Imagery
- Approved sources/assets: existing public/assets originals and optimized variants, local logos, icons and fonts. Resale licensing requires separate confirmation.
- Imagery role: real roofing/service photography, fleet and service area map.
- Crop/aspect treatment: retain every current crop, dimension and responsive source selection.
- LCP/media notes: hero uses the existing eager/high-priority image; preserve below-fold loading behavior.

## Interaction / CTA
- Primary action: free roof inspection callback form.
- Secondary action (if justified): call links and mobile action bar.
- Motion language: preserve existing carousel, navigation, hover transitions, scrolling and reduced-motion rules.

## Responsive behavior
- Desktop: preserve multi-column compositions and callback placement.
- Tablet: preserve current 1050px and 820px reflow rules.
- Mobile: preserve 520px rules, mobile menu, sticky call/inspection actions and current imagery positioning.

## Current page-specific notes
The approved implementation controls all details not enumerated here. Preserve 100% of page design, layout, content, responsive behavior, imagery, field structure, animations, typography, colors and functionality during Project Upgrade.

Callback controls remain website (honeypot), name, phone, email, zip and message, in their existing order. Preserve validation, pending/error/success states, duplicate protection and the submitted event. Default submissions are non-sending demos with honest feedback; customer-configured live mode retains the approved pending/error/success behavior. Read docs/FORM-INTEGRATION.md before integrations. Common rebrand values live in src/config/site.ts.

The thank-you page follows the home hero's photographic navy treatment, with a top-centered logo and viewport-centered confirmation. It reuses hero typography, eyebrow, gold button and responsive image crop, with all styling in global.css.

The minimal 404 page reuses the approved navy thank-you shell, logo, hero typography and gold home action. Its home links target the trusted runtime mount root; unknown documents retain HTTP 404.
