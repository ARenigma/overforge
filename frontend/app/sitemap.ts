import type { MetadataRoute } from 'next';

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : 'https://finiteinterview.com');

// Public marketing routes only — auth/dashboard/interview are gated.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/product', '/how-it-works', '/pricing', '/about', '/privacy', '/terms'];

  return routes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: route === '' ? 1 : 0.8,
  }));
}
