import * as fs from 'fs';
const sizeOf = require('image-size');

const PRODUCTS_FOLDER = './products/';

async function check() {
  const files = fs.readdirSync(PRODUCTS_FOLDER, {recursive: true});
  const images = files.filter((image) => isImage(image as string));
  for (const image of images) {
    const imagePath = `${PRODUCTS_FOLDER}/${image}`;
    const dimensions = sizeOf(imagePath);
    if (!is4by3(dimensions.width, dimensions.height)) {
      throw Error(
        'Image ' +
          imagePath +
          ' is not not 4:3 > ' +
          dimensions.width / dimensions.height +
          ' <> ' +
          4 / 3,
      );
    }
  }
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

check();
