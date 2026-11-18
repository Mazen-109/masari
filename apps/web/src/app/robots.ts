import type { MetadataRoute } from 'next';

/** `/robots.txt`: no crawler may index any page (FR-049; every response also sends `X-Robots-Tag`). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
