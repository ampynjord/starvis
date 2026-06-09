import type { MetadataRoute } from 'next';
import { PUBLIC_SITE_URL } from '@/lib/server-config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/profile', '/api/', '/report-bug', '/search'],
    },
    sitemap: `${PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
