import sharp from 'sharp';
import * as fs from 'fs';
import YAML from 'yaml';
import path from 'path';
import sizeOf from 'image-size';
import {
  assertUniqueImageSidecars,
  isProductImage,
  readImageDescription,
} from './image-descriptions';

const PRODUCTS_FOLDER = './products/';
const DESTINATION_FOLDER = 'dist/bootstrap/produkt';

export interface ProductImage {
  id: string;
  filename: string;
  small: string;
  large: string;
  description?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  created: string;
  tags: string[];
  images: ProductImage[];
}

interface Image {
  name: string;
  path: string;
  description: string;
}
interface OriginalData {
  folderName: string;
  folderPath: string;
  images: Image[];
  spec: Spec;
}

interface Spec {
  id: string;
  name: string;
  date: string;
  description: string;
  tags: string[];
}

async function transform() {
  const originalData = parseOriginalData();
  validateImages(originalData);

  fs.rmSync(DESTINATION_FOLDER, {recursive: true, force: true});
  fs.mkdirSync(DESTINATION_FOLDER, {recursive: true});
  const products: Product[] = [];

  for (const data of originalData) {
    console.log('process ' + data.folderName);
    const destinalFolder = `${DESTINATION_FOLDER}/${data.spec.id}`;
    fs.mkdirSync(destinalFolder, {recursive: true});

    const product: Product = {
      id: data.spec.id,
      created: data.spec.date,
      description: data.spec.description,
      name: data.spec.name,
      tags: data.spec.tags,
      images: [],
    };

    for (const image of data.images) {
      const smallFilename = await transformImage(destinalFolder, image, 400, 300);
      const largeFilename = await transformImage(destinalFolder, image, 1024, 768);
      product.images.push({
        id: path.parse(image.name).name,
        filename: image.name,
        small: `${data.spec.id}/${smallFilename}`,
        large: `${data.spec.id}/${largeFilename}`,
        description: image.description,
      });
    }

    products.push(product);
  }

  fs.writeFileSync(`${DESTINATION_FOLDER}/products.json`, JSON.stringify(products), {
    encoding: 'utf-8',
  });
}

function validateImages(products: OriginalData[]) {
  const errors: string[] = [];
  let checked = 0;
  for (const product of products) {
    for (const image of product.images) {
      checked++;
      try {
        const {width, height} = sizeOf(image.path);
        if (!width || !height) {
          errors.push(`${image.path}: Bildabmessungen konnten nicht gelesen werden.`);
        } else if (!is4by3(width, height)) {
          errors.push(`${image.path}: ${width} × ${height} Pixel, kein 4:3-Format.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${image.path}: Bild konnte nicht gelesen werden (${message}).`);
      }
    }
  }
  if (errors.length) {
    throw new Error(
      `Bildprüfung fehlgeschlagen (${errors.length} von ${checked} Bildern):\n${errors
        .map((message) => ` - ${message}`)
        .join('\n')}\nKeine Bilder wurden transformiert. Der Ausgabeordner bleibt unverändert.`,
    );
  }
  console.log(`Bildprüfung erfolgreich: ${checked} Bilder im 4:3-Format.`);
}

async function transformImage(folder: string, image: Image, w: number, h: number): Promise<string> {
  const imageName = path.parse(image.name).name;
  const destinationName = `${imageName}__${w}_${h}.webp`;
  const destinationFile = `${folder}/${destinationName}`;
  console.log(' - transform ' + image.name + ' --> ' + destinationName);
  await sharp(image.path)
    .rotate()
    .resize(w, h, {fit: 'contain', background: {r: 255, g: 255, b: 255, alpha: 0}})
    .webp({quality: 85})
    .toFile(destinationFile);
  return destinationName;
}

function parseOriginalData() {
  const result: OriginalData[] = [];
  const folders = fs.readdirSync(PRODUCTS_FOLDER);
  for (const folder of folders) {
    const product: OriginalData = {
      folderName: folder,
      folderPath: `${PRODUCTS_FOLDER}/${folder}`,
      spec: {} as Spec,
      images: [],
    };
    const spec: Spec = YAML.parse(
      fs.readFileSync(`${product.folderPath}/spec.yaml`, {encoding: 'utf-8'}),
    );
    const imagesNames = fs.readdirSync(product.folderPath).filter(isProductImage);
    assertUniqueImageSidecars(imagesNames.map((name) => path.join(product.folderPath, name)));
    const images: Image[] = imagesNames.map((imageName) => ({
      name: imageName,
      path: `${product.folderPath}/${imageName}`,
      description: readImageDescription(path.join(product.folderPath, imageName), spec.name),
    }));
    product.images = images;

    product.spec = spec;

    result.push(product);
  }
  return result;
}

function is4by3(width: number, height: number) {
  const targetRatio = 4 / 3;
  const tolerance = 0.01; // Adjust the tolerance as needed

  const actualRatio = width / height;

  return Math.abs(actualRatio - targetRatio) < tolerance;
}

transform().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
