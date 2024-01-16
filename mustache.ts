import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'fs';
import Handlebars from 'handlebars';
import {Product, ProductImage} from './transform';

const ogSiteName = 'Holzwerkskunst.de';

interface MetaAttributes {
  ogImage: string;
  ogTitle: string;
  ogType: string;
  ogUrl: string;
  ogSiteName: string;
  ogDescription: string;
}

interface Page {
  tags: string[];
  mainTemplate: () => string;
  metaAttributes: MetaAttributes;
}

const products: Product[] = JSON.parse(
  readFileSync('dist/bootstrap/produkt/products.json', 'utf-8'),
);
products.sort((p1, p2) => p1.name.localeCompare(p2.name));
for (const product of products) {
  product.images.sort(sortImages);
}

const tags = [...new Set(([] as string[]).concat(...products.map((p) => p.tags)))].sort();

Handlebars.registerPartial('home', getTemplate('src/home.html.mustache'));
Handlebars.registerPartial('product', getTemplate('src/product.html.mustache'));
Handlebars.registerPartial('category', getTemplate('src/category.html.mustache'));
Handlebars.registerPartial('preview', getTemplate('src/preview.html.mustache'));
Handlebars.registerPartial('impressum', getTemplate('src/impressum.html.mustache'));
Handlebars.registerPartial('data-protection', getTemplate('src/data-protection.html.mustache'));

const pageTemplate = Handlebars.compile(readFileSync('src/index.html.mustache', 'utf-8'));

/** HOME */
interface PageHome extends Page {
  products: Product[];
}
const homeModel: PageHome = {
  tags: tags,
  products: products,
  mainTemplate: () => 'home',
  metaAttributes: {
    ogImage: products[0].images[0].large,
    ogSiteName,
    ogTitle: 'Schöne Bastelsachen aus Holz- und Papier. Holzwerkskunst.de',
    ogDescription: 'Hier findest du Bastelsachen aus Holz- und Papier',
    ogType: 'website',
    ogUrl: 'https://www.holzwerkskunst.de',
  },
};
writeFileSync('dist/bootstrap/index.html', pageTemplate(homeModel), 'utf-8');

/** Products */
interface PageProduct extends Page {
  product: Product;
}
for (let product of products) {
  const productModel: PageProduct = {
    tags: tags,
    product: product,
    mainTemplate: () => 'product',
    metaAttributes: {
      ogDescription: product.description,
      ogImage: product.images[0].large,
      ogSiteName,
      ogTitle: product.name,
      ogType: 'website',
      ogUrl: `https://www.holzwerkskunst.de/produkt/${product.id}/`,
    },
  };

  const productTemplate = Handlebars.compile(getTemplate('src/index.html.mustache'));
  writeFileSync(
    `dist/bootstrap/produkt/${product.id}/index.html`,
    productTemplate(productModel),
    'utf-8',
  );
}

/** Kategorien */
interface PageCategory extends Page {
  tag: string;
  products: Product[];
}
for (let tag of tags) {
  const categoryModel: PageCategory = {
    tags: tags,
    tag: tag,
    products: products.filter((p) => p.tags.includes(tag)),
    mainTemplate: () => 'category',
    metaAttributes: {
      ogDescription: `Alles zum Thema ${tag}`,
      ogImage: products[0].images[0].large,
      ogSiteName,
      ogTitle: `Kategorie ${tag}`,
      ogType: 'website',
      ogUrl: `https://www.holzwerkskunst.de/kategorie/${tag}.html`,
    },
  };
  if (!existsSync(`dist/bootstrap/kategorie`)) {
    mkdirSync(`dist/bootstrap/kategorie`);
  }
  const productTemplate = Handlebars.compile(getTemplate('src/index.html.mustache'));
  writeFileSync(`dist/bootstrap/kategorie/${tag}.html`, productTemplate(categoryModel), 'utf-8');
}

/** Impressum */
const impressumModel: Page = {
  tags: tags,
  mainTemplate: () => 'impressum',
  metaAttributes: {
    ogDescription: 'Impressum',
    ogImage: products[0].images[0].large,
    ogSiteName,
    ogTitle: 'Impressum',
    ogType: 'website',
    ogUrl: `https://www.holzwerkskunst.de/impressum.html`,
  },
};
writeFileSync('dist/bootstrap/impressum.html', pageTemplate(impressumModel), 'utf-8');

/** Datenschutz */
const dataProtectionModel: Page = {
  tags: tags,
  mainTemplate: () => 'data-protection',
  metaAttributes: {
    ogDescription: 'Datenschutzerklärung',
    ogImage: products[0].images[0].large,
    ogSiteName,
    ogTitle: 'Datenschutzerklärung',
    ogType: 'website',
    ogUrl: `https://www.holzwerkskunst.de/datenschutz.html`,
  },
};
writeFileSync('dist/bootstrap/datenschutz.html', pageTemplate(dataProtectionModel), 'utf-8');

function getTemplate(file: string) {
  const template = readFileSync(file, 'utf-8');
  return template;
}

function sortImages(i1: ProductImage, i2: ProductImage): number {
  const getSort = (path: string) => {
    try {
      /**
       * small: kugeln/100__PXL_120232.jpg
       */
      const imageName = path.split('/')[1];
      const sort = Number.parseInt(imageName.split('__')[0]);
      if (isNaN(sort)) {
        throw Error('NAN');
      }
      return sort;
    } catch {
      return 10000;
    }
  };

  return getSort(i1.small) - getSort(i2.small);
}
