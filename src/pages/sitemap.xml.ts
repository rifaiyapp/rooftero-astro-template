import type { APIRoute } from 'astro';
import { site } from '../config/site';

const routes = ['/', '/privacy/', '/terms/', '/accessibility/', '/cookies/'];

export const GET: APIRoute = () => {
  const urls = routes
    .map((path) => `  <url><loc>${new URL(path, site.url).toString()}</loc></url>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
