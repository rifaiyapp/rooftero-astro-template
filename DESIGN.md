# Rooftero design system

## Intent and reference
- Audience: homeowners seeking roof repair, inspection, replacement and storm response; Rooftero is a fictional demonstration brand.
- Input: reference-led, strict composition, using `design-references/rooftero-reference.png` at its original 724 × 2172 resolution.
- Design thesis: a practical roofing service page with warm cream surfaces, deep forest bands, bold compact headings and clear inspection/call actions.
- Preserve original business copy, phone, services, reviews, FAQs, navigation destinations and form functionality. Reference text and photos do not replace repository content.

## Composition
- One fixed 80px header combines logo, dark-green navigation, phone and inspection action on translucent white with an 18px blur. At narrower widths, navigation uses a white dropdown; mobile header height is 70px. Document padding and anchor offsets account for the header.
- Hero: original residential roofing image, cream readability overlay, left headline/call actions, right white callback card, shallow curved bottom edge.
- Four promise cards; three equal service cards on forest with overlapping circular icons.
- About: layered existing roofing photos on the left, content and a two-column trust list on the right.
- Process: photo panel occupying 32%, horizontal steps occupying 68% at desktop.
- Reviews: forest band, white cards, matching outlined circular controls, six original reviews and pagination.
- FAQ: introduction and roofing media on the left, numbered accordion and trust points on the right.
- Final CTA: standalone white section with generous vertical space, a 46/54 copy/photo split, rounded architectural fleet crop and a lightly overlapping inspection badge. Three-part forest footer.
- Desktop shell: 90% at 1440px, capped at 1296px, matching the reference's approximately 90% content width. Smaller screens use 20–40px gutters.
- Spacing rhythm: shared 8/12/16/24/32/48px tokens; large sections use 80–112px, medium sections 64–96px, compact sections 56–72px. Mobile section spacing is 56–64px. Reviews and footer remain comparatively compact. Form content determines hero height without clipping.

## Typography and color
- Headings: self-hosted League Spartan, weights 700–800; tight tracking, sentence case except hero/process.
- Body and interface: self-hosted Inter, weights 400–700. Both fonts use swap and carry their OFL licenses.
- Hero title: roughly 67px at 1440px; section titles 44–54px; body 16px; compact supporting labels 12–15px.
- Tokens are centralized in `src/styles/global.css` under `--rooftero-*`.
- Cream #f8f4ec, forest #263e34 and #102d28, headings #0b3036, text #263936.
- Burnt orange #a94f12 for accessible white-text actions; warm orange for dark-section labels; white form/cards.
- Corners 6–10px; soft forest-tinted shadows; restrained borders. No polygon buttons or section ribbons.

## Brand and imagery
- Original geometric roof/protective R mark and custom path wordmark: `public/brand/rooftero-logo.svg`, reversed variant and standalone mark.
- All logo artwork is vector paths, with no external font or image dependency.
- Runtime-served brand copies and fonts live under `public/assets/` so existing nested-mount URL rewriting remains unchanged. The requested `public/brand/` SVGs are the portable originals.
- Existing roofing photographs remain the only photographic source. Recompose/crop to fit the reference without generating new roofing imagery.
- Explicit image dimensions and responsive AVIF/WebP sources remain. Hero is eager/high-priority; supporting images load lazily.

## Interaction and responsive behavior
- Primary action: existing inspection form; secondary: existing telephone number. Form fields, validation, gateway behavior, metadata and submitted event remain intact.
- Existing carousel, FAQ, navigation and floating-action hooks are preserved.
- Motion: short hover/focus and existing carousel/accordion transitions; honor reduced motion.
- Tablet: two review cards; two promise columns; about/process/FAQ recompose as needed.
- Mobile: copy and actions before form; one service/review column; vertical process; stacked FAQ and final CTA; circular call/quote actions hide around form/footer.
- Semantic labels, keyboard focus, accordion states and touch targets remain required.

## Runtime constraints
- Exactly one `private-demo` profile: preserve noindex metadata/headers, crawling behavior and absence of promoting canonical/sitemap.
- Customer-owned non-sending demo form remains the default. Protected runtime, lead configuration, publishing and dependency files are unchanged by visual work.
- Confirmation and strict 404 reuse the cream/forest brand while retaining their existing route behavior.
