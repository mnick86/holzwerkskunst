import Jimp from 'jimp';
import * as fs from 'fs';
import {Product} from './src/app/+store/product';
import YAML from 'yaml';

const PRODUCTS_FOLDER = './products/';
const DESTINATION_FOLDER = 'dist/products';
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
      const smallFilename = await transformImage(destinalFolder, image, 400);
      const largeFilename = await transformImage(destinalFolder, image, 1024);
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

function transformImage(folder: string, image: Image, size: number): Promise<string> {
  const destinationName = `thumb_${size}_${image.name}`;
  const destinationFile = `${folder}/${destinationName}`;
  console.log(' - transform ' + image.name);
  return Jimp.read(image.path)
    .then((image) => {
      return image
        .contain(size, size)
        .quality(80) // set JPEG quality
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

fs.rmSync(DESTINATION_FOLDER, {recursive: true, force: true});
fs.mkdirSync(DESTINATION_FOLDER, {recursive: true});

transform();
