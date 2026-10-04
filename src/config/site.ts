// Central rebrand and launch configuration. Replace demo values with verified client details before launch.
export const site = {
  name: 'Rooftero',
  url: 'https://rooftero.keydiv.workers.dev',
  locale: 'en_US',
  isDemo: true,
  phone: { display: '(800) 555-0198', href: 'tel:+18005550198' },
  email: { display: 'hello@rooftero.example', href: 'mailto:hello@rooftero.example' },
  logo: {
    src: '/assets/brand/rooftero-logo.svg',
    reversed: '/assets/brand/rooftero-logo-reversed.svg',
    alt: 'Rooftero — Roofing & Restoration',
  },
  favicon: {
    large: '/favicon-32x32.png',
    small: '/favicon-16x16.png',
    ico: '/favicon.ico',
    svg: '/favicon.svg',
    apple: '/assets/brand/apple-touch-icon.png',
  },
  primaryCta: 'Get Free Inspection',
  seo: {
    indexable: false,
    title: 'Roof Repair & Replacement | Rooftero',
    description: 'Responsive roof repair, replacement, inspections, and storm-response roofing with clear estimates, documented recommendations, and straightforward scheduling.',
    image: '/assets/optimized/roofing-hero-1920.webp',
  },
  serviceArea: 'North Hills and the greater metro area',
  legal: {
    updated: 'October 4, 2026',
    privacyEmail: 'privacy@rooftero.example',
  },
};
