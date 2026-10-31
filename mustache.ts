import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from 'fs';
import Handlebars from 'handlebars';
import {createHash} from 'crypto';
import Jimp from 'jimp';
import type {Product, ProductImage} from './transform';

const origin = 'https://www.holzwerkskunst.de';
const products: Product[] = JSON.parse(
  readFileSync('dist/bootstrap/produkt/products.json', 'utf-8'),
);
products.sort((a, b) => a.name.localeCompare(b.name, 'de'));
for (const product of products) product.images.sort(sortImages);
const tags = [...new Set(products.flatMap((product) => product.tags))].sort((a, b) =>
  a.localeCompare(b, 'de'),
);
// Keep the homepage image independent of product image ordering.
const heroSource = 'src/assets/werkstatt.png';
const heroImage = '/assets/hero-werkstatt-768.jpg';
const heroSocialImage = '/assets/hero-werkstatt-1440.jpg';
const heroWidths = [480, 768, 1024, 1440];
const heroJpegSrcset = heroWidths
  .map((width) => `/assets/hero-werkstatt-${width}.jpg ${width}w`)
  .join(', ');
const logoSource = 'src/assets/logo.png';
const categoryIcons: Record<string, string> = {
  Geschenk: 'heart',
  Hochzeit: 'gift',
  Geburtstag: 'balloon',
  Kommunion: 'christian-cross',
  Geburt: 'baby',
  Taufe: 'fish-symbol',
  Muttertag: 'flower-2',
  Vatertag: 'hand-heart',
  Schule: 'graduation-cap',
  Home: 'house',
  Dankeschön: 'heart-handshake',
  'Vereine & Firmen': 'users-round',
  Weihnachten: 'tree-pine',
  Silvester: 'party-popper',
};
const categoryOrder = [
  'Geschenk',
  'Hochzeit',
  'Geburtstag',
  'Kommunion',
  'Geburt',
  'Taufe',
  'Muttertag',
  'Vatertag',
  'Schule',
  'Home',
  'Dankeschön',
  'Vereine & Firmen',
  'Weihnachten',
  'Silvester',
];
const categoryLabel = (tag: string) => (tag === 'Home' ? 'Zuhause' : tag);
Handlebars.registerHelper('categoryLabel', categoryLabel);
const categoryFilters = [...tags]
  .sort((a, b) => {
    const order = (tag: string) => (categoryOrder.includes(tag) ? categoryOrder.indexOf(tag) : 100);
    return order(a) - order(b) || a.localeCompare(b, 'de');
  })
  .map((tag) => ({
    tag,
    label: tag === 'Geschenk' ? 'Geschenke' : categoryLabel(tag),
    icon: categoryIcons[tag] || 'gift',
  }));
categoryFilters.push({tag: '', label: 'Alle Kategorien', icon: 'ellipsis'});
const categorySvgs = new Map(
  [...new Set(categoryFilters.map((category) => category.icon))].map((name) => [
    name,
    readFileSync(
      name === 'christian-cross'
        ? 'src/assets/icons/christian-cross.svg'
        : `src/assets/icons/lucide/${name}.svg`,
      'utf-8',
    ).replace(
      '<svg',
      `<svg class="icon category-icon" data-icon="${
        name === 'christian-cross' ? 'custom' : 'lucide'
      }-${name}" aria-hidden="true" focusable="false"`,
    ),
  ]),
);
Handlebars.registerHelper('categoryIcon', (name: string) => {
  const svg = categorySvgs.get(name) || categorySvgs.get('gift');
  const credit = name === 'christian-cross' ? '' : '<!-- Lucide: /assets/licenses/lucide.txt -->';
  return new Handlebars.SafeString(`${credit}${svg}`);
});
// Add an authentic photo here later; no invented portrait is shown in its absence.
const aboutPhotoSource = 'src/about-photo.jpg';
const aboutPhoto = existsSync(aboutPhotoSource) ? '/assets/about-photo.jpg' : undefined;
Handlebars.registerHelper(
  'categoryUrl',
  (tag: string) => `/kategorie/${encodeURIComponent(tag)}.html`,
);
Handlebars.registerHelper('json', (value: unknown) => JSON.stringify(value));
Handlebars.registerHelper('excerpt', (description: string) => {
  const text = description.replace(/\s+/g, ' ').trim();
  return text.length > 145 ? `${text.slice(0, 142).trimEnd()}…` : text;
});
Handlebars.registerHelper('inquiryUrl', (product?: Product | Handlebars.HelperOptions) => {
  // Handlebars passes its helper options as the first argument when no product is given.
  const hasProduct =
    product &&
    'id' in product &&
    typeof product.id === 'string' &&
    typeof product.name === 'string';
  const subject = hasProduct ? `Anfrage: ${product.name}` : 'Meine individuelle Geschenkidee';
  const body = hasProduct
    ? `Hallo Alexandra und Matthias,\n\nich interessiere mich für „${product.name}“.\n${origin}/produkt/${product.id}/\n\nMeine Wünsche (Motiv, Name, Datum, Stückzahl, Wunschtermin):\n\n`
    : 'Hallo Alexandra und Matthias,\n\nmeine Idee (Produkt, Motiv, Name, Datum, Stückzahl, Wunschtermin):\n\n';
  return `mailto:mnick86@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    body,
  )}`;
});
const icons: Record<string, string> = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a3.5 3.5 0 0 0-5-5L4 14Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  chat: '<path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.3-5a10 10 0 0 1-.8-4.5 8.8 8.8 0 0 1 17.5 0Z"/>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10.5 6-4M9 13.5l6 4"/>',
  chevron: '<path d="m8 4 8 8-8 8"/>',
  leaf: '<path d="M20 3C9 2 2 7 5 15c8 5 16-1 15-12ZM4 21 16 8"/>',
};
Handlebars.registerHelper(
  'icon',
  (name: string) =>
    new Handlebars.SafeString(
      `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
        icons[name] || icons['arrow']
      }</svg>`,
    ),
);
for (const name of [
  'home',
  'hero',
  'personalization',
  'product',
  'category',
  'preview',
  'catalog',
  'category-nav',
  'about-photo',
  'about',
  'header',
  'footer',
  'brand',
  'impressum',
  'data-protection',
  '404',
]) {
  Handlebars.registerPartial(name, readFileSync(`src/${name}.html.mustache`, 'utf-8'));
}
const template = Handlebars.compile(readFileSync('src/index.html.mustache', 'utf-8'));
const assetVersions = {
  css: createHash('sha256').update(readFileSync('src/site.css')).digest('hex').slice(0, 12),
  js: createHash('sha256').update(readFileSync('src/site.js')).digest('hex').slice(0, 12),
  logo: createHash('sha256').update(readFileSync(logoSource)).digest('hex').slice(0, 12),
};
const common = {tags, aboutPhoto, assetVersions, year: new Date().getFullYear()};
function render(
  file: string,
  partial: string,
  title: string,
  description: string,
  url: string,
  model: Record<string, unknown> = {},
  image = heroSocialImage,
) {
  writeFileSync(
    `dist/bootstrap/${file}`,
    template({
      ...common,
      ...model,
      categoryFilters: categoryFilters.map((category) => ({
        ...category,
        active: category.tag === (model['tag'] || ''),
      })),
      mainTemplate: () => partial,
      metaAttributes: {
        ogTitle: `${title} | Holzwerkskunst`,
        ogDescription: description.replace(/\s+/g, ' ').trim(),
        ogImage: image.startsWith('/') ? `${origin}${image}` : `${origin}/produkt/${image}`,
        ogSiteName: 'Holzwerkskunst.de',
        ogType: 'website',
        ogUrl: `${origin}${url}`,
      },
    }),
    'utf-8',
  );
}
render(
  'index.html',
  'home',
  'Persönliche Geschenke. Mit Liebe gemacht.',
  'Individuelle Holzgravuren und liebevoll gestaltete Geschenkideen aus Niederbayern. Entdecke personalisierbare Geschenke aus Holz und Papier.',
  '/',
  {products, heroImage, heroJpegSrcset},
  heroSocialImage,
);
for (const product of products) {
  const related = products
    .filter((candidate) => candidate.id !== product.id)
    .map((candidate) => ({
      candidate,
      score: candidate.tags.filter((tag) => product.tags.includes(tag)).length,
    }))
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({candidate}) => candidate);
  render(
    `produkt/${product.id}/index.html`,
    'product',
    product.name,
    product.description,
    `/produkt/${product.id}/`,
    {product, related, hasGallery: product.images.length > 1},
    product.images[0].large,
  );
}
mkdirSync('dist/bootstrap/kategorie', {recursive: true});
// Remove pages for categories that no longer occur in the product specifications.
const categoryFiles = new Set(tags.map((tag) => `${tag}.html`));
for (const file of readdirSync('dist/bootstrap/kategorie')) {
  if (file.endsWith('.html') && !categoryFiles.has(file)) {
    unlinkSync(`dist/bootstrap/kategorie/${file}`);
  }
}
for (const tag of tags) {
  const selection = products.filter((product) => product.tags.includes(tag));
  render(
    `kategorie/${tag}.html`,
    'category',
    `Geschenkideen: ${categoryLabel(tag)}`,
    `Entdecke persönliche Geschenkideen zum Thema ${categoryLabel(
      tag,
    )}. Individuelle Gravuren und handgemachte Produkte von Holzwerkskunst.`,
    `/kategorie/${encodeURIComponent(tag)}.html`,
    {
      tag,
      products: products.map((product) => ({
        ...product,
        initiallyHidden: !product.tags.includes(tag),
      })),
    },
    selection[0].images[0].large,
  );
}
render(
  'ueber-uns.html',
  'about',
  'Über uns',
  'Mit Holz, Herz und vielen Ideen. Persönliche Geschenkideen von Holzwerkskunst aus Niederbayern.',
  '/ueber-uns.html',
);
render(
  'impressum.html',
  'impressum',
  'Impressum',
  'Impressum und Kontaktdaten von Holzwerkskunst – Alexandra Wiesmann & Matthias Nick, Ergolding.',
  '/impressum.html',
  {legal: true},
);
render(
  'datenschutz.html',
  'data-protection',
  'Datenschutzerklärung',
  'Informationen zum Datenschutz auf Holzwerkskunst.de.',
  '/datenschutz.html',
  {legal: true},
);
render(
  '404.html',
  '404',
  'Seite nicht gefunden',
  'Diese Seite wurde nicht gefunden. Entdecke die Geschenkideen von Holzwerkskunst.',
  '/404.html',
  {noindex: true},
);
mkdirSync('dist/bootstrap/assets', {recursive: true});
mkdirSync('dist/bootstrap/assets/licenses', {recursive: true});
copyFileSync('src/assets/icons/lucide/LICENSE', 'dist/bootstrap/assets/licenses/lucide.txt');
for (const file of ['site.css', 'site.js', 'paper-mask.svg'])
  copyFileSync(`src/${file}`, `dist/bootstrap/assets/${file}`);
if (aboutPhoto) copyFileSync(aboutPhotoSource, 'dist/bootstrap/assets/about-photo.jpg');
copyFileSync('src/robots.txt', 'dist/bootstrap/robots.txt');
Jimp.read(logoSource)
  .then((image) =>
    Promise.all([
      image
        .clone()
        .resize(144, Jimp.AUTO)
        .deflateLevel(9)
        .writeAsync('dist/bootstrap/assets/logo.png'),
      image
        .clone()
        .resize(288, Jimp.AUTO)
        .deflateLevel(9)
        .writeAsync('dist/bootstrap/assets/about-logo.png'),
      image
        .clone()
        .resize(48, Jimp.AUTO)
        .deflateLevel(9)
        .writeAsync('dist/bootstrap/assets/favicon.png'),
    ]),
  )
  .then(() => Jimp.read(heroSource))
  .then((image) =>
    Promise.all(
      heroWidths.map((width) =>
        image
          .clone()
          .resize(Math.min(width, image.getWidth()), Jimp.AUTO)
          .quality(80)
          .writeAsync(`dist/bootstrap/assets/hero-werkstatt-${width}.jpg`),
      ),
    ),
  )
  .then(() => {
    for (const width of heroWidths) {
      const obsolete = `dist/bootstrap/assets/hero-werkstatt-${width}.webp`;
      if (existsSync(obsolete)) unlinkSync(obsolete);
    }
    console.log(
      `Generated ${products.length} products, ${tags.length} categories and shared pages.`,
    );
  })
  .catch((error: Error) => {
    console.error(`Asset generation failed: ${error.message}`);
    process.exitCode = 1;
  });

function sortImages(a: ProductImage, b: ProductImage): number {
  const order = (image: ProductImage) => {
    const value = Number.parseInt(image.small.split('/').pop() || '', 10);
    return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
  };
  return order(a) - order(b) || a.small.localeCompare(b.small, 'de');
}
