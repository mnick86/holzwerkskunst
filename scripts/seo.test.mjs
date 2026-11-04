import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('ts-node/register');
const {
  absoluteUrl,
  metaDescription,
  serializeJsonLd,
  createSitemap,
  structuredData,
} = require('../seo.ts');

test('metadata preserves Unicode, collapses whitespace and truncates on word boundaries', () => {
  assert.equal(
    metaDescription('  Gravur\n für\tMatthias & Alexandra.  '),
    'Gravur für Matthias & Alexandra.',
  );
  const description = metaDescription(
    'Holzgeschenke mit einer persönlichen Gravur und einem individuellen Wunschmotiv.',
    45,
  );
  assert.equal(description, 'Holzgeschenke mit einer persönlichen Gravur…');
  assert(description.length <= 45);
  assert.equal(
    absoluteUrl('/kategorie/Vereine & Firmen.html'),
    'https://holzwerkskunst.de/kategorie/Vereine%20&%20Firmen.html',
  );
});

test('embedded structured data cannot terminate the script element and round-trips verbatim', () => {
  const value = {name: 'Gravur </script><script>alert("x")</script> & Grüße\u2028\u2029'};
  const encoded = serializeJsonLd(value);
  assert(!encoded.includes('<') && !encoded.includes('>') && !encoded.includes('&'));
  assert.deepEqual(JSON.parse(encoded), value);
});

test('sitemap URLs and image URLs are encoded and XML-escaped without invented dates', () => {
  const xml = createSitemap([
    {url: '/kategorie/Vereine & Firmen.html', images: ['/produkt/test/Gläser & Holz.png']},
  ]);
  assert(xml.includes('Vereine%20&amp;%20Firmen.html'));
  assert(xml.includes('Gl%C3%A4ser%20&amp;%20Holz.png'));
  assert(!xml.includes('<lastmod>'));
  assert.throws(() => createSitemap([{url: '/'}, {url: '/'}]), /Duplicate/);
});

test('structured navigation describes only the supplied products and known organization facts', () => {
  const products = [{id: 'gravur', name: 'Gravur'}];
  const data = structuredData({
    url: '/kategorie/Geschenk.html',
    title: 'Geschenke',
    description: 'Persönliche Geschenke.',
    image: '/test.jpg',
    imageAlt: 'Gravur',
    type: 'CollectionPage',
    products,
    breadcrumbs: [
      {name: 'Startseite', url: '/'},
      {name: 'Geschenke', url: '/kategorie/Geschenk.html'},
    ],
  });
  const collection = data['@graph'].find((item) => item['@type'] === 'CollectionPage');
  const list = data['@graph'].find((item) => item['@type'] === 'ItemList');
  assert.equal(collection.url, 'https://holzwerkskunst.de/kategorie/Geschenk.html');
  assert.equal(list.numberOfItems, 1);
  assert.equal(list.itemListElement[0].item, 'https://holzwerkskunst.de/produkt/gravur/');
  assert.equal(
    data['@graph'].find((item) => item['@type'] === 'BreadcrumbList').itemListElement.length,
    2,
  );
  const organization = data['@graph'].find((item) => item['@type'] === 'Organization');
  assert.equal(organization.name, 'Holzwerkskunst');
  assert(!('address' in organization));
  assert(!JSON.stringify(data).includes('aggregateRating'));
  assert(!JSON.stringify(data).includes('offers'));
});
