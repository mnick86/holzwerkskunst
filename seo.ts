import type {Product} from './transform';

// Matches the GitHub Pages CNAME and the existing www -> apex redirect.
export const SITE_ORIGIN = 'https://holzwerkskunst.de';
export const SITE_NAME = 'Holzwerkskunst';
export const absoluteUrl = (path: string) => new URL(path, SITE_ORIGIN).href;
export const productUrl = (product: Product) => `/produkt/${encodeURIComponent(product.id)}/`;
export const categoryUrl = (tag: string) => `/kategorie/${encodeURIComponent(tag)}.html`;
export const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

export function metaDescription(value: string, limit = 160): string {
  const text = normalizeText(value);
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit - 1);
  const boundary = excerpt.lastIndexOf(' ');
  return `${excerpt.slice(0, boundary > limit / 2 ? boundary : excerpt.length).trimEnd()}…`;
}

const categorySubjects: Record<string, string> = {
  Geschenk: 'Personalisierte Geschenke',
  Hochzeit: 'Geschenke zur Hochzeit',
  Geburtstag: 'Geschenke zum Geburtstag',
  Kommunion: 'Geschenke zur Kommunion',
  Geburt: 'Geschenke zur Geburt',
  Taufe: 'Geschenke zur Taufe',
  Muttertag: 'Geschenke zum Muttertag',
  Vatertag: 'Geschenke zum Vatertag',
  Schule: 'Geschenke für Schule und Schulanfang',
  Home: 'Geschenke und Deko für Zuhause',
  Dankeschön: 'Geschenke zum Dankeschön sagen',
  'Vereine & Firmen': 'Geschenke für Vereine und Firmen',
  Weihnachten: 'Geschenke zu Weihnachten',
  Silvester: 'Geschenke zu Silvester',
};
export const categoryTitle = (tag: string) => categorySubjects[tag] || `Geschenkideen: ${tag}`;
export const categoryDescription = (tag: string, products: Product[]) =>
  metaDescription(
    `${categoryTitle(tag)} von Holzwerkskunst: ${products
      .slice(0, 3)
      .map((product) => product.name)
      .join(', ')}. Entdecke individuelle Gestaltungsmöglichkeiten.`,
  );

// JSON-LD is embedded as raw script text, not as an HTML attribute.
export const serializeJsonLd = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export interface SeoPage {
  url: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  type?: 'WebPage' | 'CollectionPage' | 'AboutPage' | 'ItemPage';
  breadcrumbs?: {name: string; url: string}[];
  products?: Product[];
}

export function structuredData(page: SeoPage) {
  const url = absoluteUrl(page.url);
  const organizationId = absoluteUrl('/#organization');
  const websiteId = absoluteUrl('/#website');
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: absoluteUrl('/assets/logo.png'),
      email: 'mnick86@gmail.com',
      telephone: '+491716447548',
      sameAs: ['https://www.instagram.com/holzwerkskunst/'],
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: SITE_NAME,
      url: absoluteUrl('/'),
      inLanguage: 'de-DE',
      publisher: {'@id': organizationId},
    },
    {
      '@type': page.type || 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      inLanguage: 'de-DE',
      isPartOf: {'@id': websiteId},
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: absoluteUrl(page.image),
        caption: page.imageAlt,
      },
      ...(page.breadcrumbs ? {breadcrumb: {'@id': `${url}#breadcrumb`}} : {}),
      ...(page.products ? {mainEntity: {'@id': `${url}#products`}} : {}),
    },
  ];
  if (page.breadcrumbs)
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: page.breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: absoluteUrl(item.url),
      })),
    });
  if (page.products)
    graph.push({
      '@type': 'ItemList',
      '@id': `${url}#products`,
      numberOfItems: page.products.length,
      itemListElement: page.products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.name,
        item: absoluteUrl(productUrl(product)),
      })),
    });
  return {'@context': 'https://schema.org', '@graph': graph};
}

export interface SitemapPage {
  url: string;
  images?: string[];
}

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function createSitemap(pages: SitemapPage[]): string {
  const seen = new Set<string>();
  const entries = pages.map((page) => {
    const url = absoluteUrl(page.url);
    if (seen.has(url)) throw new Error(`Duplicate sitemap URL: ${url}`);
    seen.add(url);
    const images = [...new Set(page.images || [])].map(
      (image) =>
        `    <image:image><image:loc>${escapeXml(absoluteUrl(image))}</image:loc></image:image>`,
    );
    return `  <url>\n    <loc>${escapeXml(url)}</loc>${
      images.length ? '\n' + images.join('\n') : ''
    }\n  </url>`;
  });
  // No lastmod: creation dates and build times do not establish real content changes.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join(
    '\n',
  )}\n</urlset>\n`;
}
