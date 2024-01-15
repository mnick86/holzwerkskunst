import Jimp from 'jimp';
import * as fs from 'fs';
import YAML from 'yaml';
import path from 'path';

const PRODUCTS_FOLDER = './products/';
const DESTINATION_FOLDER = 'dist/bootstrap/produkt';

export interface ProductImage {
  small: string;
  large: string;
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
  const products: Product[] = [];

  for (const data of originalData) {
    console.log('process ' + data.folderName);
    const destinalFolder = `${DESTINATION_FOLDER}/${data.spec.id}`;
    fs.mkdirSync(destinalFolder);

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
        small: `${data.spec.id}/${smallFilename}`,
        large: `${data.spec.id}/${largeFilename}`,
      });
    }

    products.push(product);
  }

  fs.writeFileSync(`${DESTINATION_FOLDER}/products.json`, JSON.stringify(products), {
    encoding: 'utf-8',
  });
}

function transformImage(folder: string, image: Image, w: number, h: number): Promise<string> {
  const imageName = path.parse(image.name).name;
  const imageExtension = path.parse(image.name).ext;
  const destinationName = `${imageName}__${w}_${h}${imageExtension}`;
  const destinationFile = `${folder}/${destinationName}`;
  console.log(' - transform ' + image.name + ' --> ' + destinationName);
  return Jimp.read(image.path)
    .then((image) => {
      const height = image.getHeight();
      const width = image.getWidth();
      if (!is4by3(width, height)) {
        throw Error('Image is not not 4:3 > ' + width / height + ' <> ' + 4 / 3);
      }
      return image
        .contain(w, h)
        .quality(95) // set JPEG quality
        .write(`${destinationFile}`); // save
    })
    .then(() => {
      return destinationName;
    });
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
    const imagesNames = fs.readdirSync(product.folderPath).filter(isImage);
    const images: Image[] = imagesNames.map((imageName) => ({
      name: imageName,
      path: `${product.folderPath}/${imageName}`,
    }));
    product.images = images;

    const spec: Spec = YAML.parse(
      fs.readFileSync(`${product.folderPath}/spec.yaml`, {encoding: 'utf-8'}),
    );
    product.spec = spec;

    result.push(product);
  }
  return result;
}

function isImage(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png'];
  const lowercasedFilename = filename.toLowerCase();
  return imageExtensions.some((ext) => lowercasedFilename.endsWith(ext));
}

function is4by3(width: number, height: number) {
  const targetRatio = 4 / 3;
  const tolerance = 0.01; // Adjust the tolerance as needed

  const actualRatio = width / height;

  return Math.abs(actualRatio - targetRatio) < tolerance;
}

fs.rmSync(DESTINATION_FOLDER, {recursive: true, force: true});
fs.mkdirSync(DESTINATION_FOLDER, {recursive: true});

transform();
