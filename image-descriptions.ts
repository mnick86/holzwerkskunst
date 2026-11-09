import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export const isProductImage = (name: string) => /\.(jpe?g|png)$/i.test(name);

export function imageDescriptionPath(imagePath: string): string {
  return path.join(path.dirname(imagePath), `${path.parse(imagePath).name}.yaml`);
}

export function assertUniqueImageSidecars(images: string[]): void {
  const seen = new Set<string>();
  for (const image of images) {
    const sidecar = imageDescriptionPath(image).toLowerCase();
    if (path.parse(image).name.toLowerCase() === 'spec' || seen.has(sidecar)) {
      throw new Error(
        `Mehrdeutige Bildzuordnung: ${image}. Bitte eindeutige Dateinamen verwenden.`,
      );
    }
    seen.add(sidecar);
  }
}

export function readImageDescription(
  imagePath: string,
  fallback: string,
  warn: (message: string) => void = console.warn,
): string {
  const file = imageDescriptionPath(imagePath);
  if (!fs.existsSync(file)) {
    warn(`Bildbeschreibung fehlt: ${file} (Produktname als Alt-Text).`);
    return fallback;
  }
  try {
    const document = YAML.parseDocument(fs.readFileSync(file, 'utf8'), {uniqueKeys: true});
    const value = document.toJS();
    if (
      document.errors.length ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      typeof value.description !== 'string' ||
      !value.description.trim()
    ) {
      throw new Error('invalid description');
    }
    return value.description.trim().replace(/\s+/g, ' ');
  } catch {
    warn(
      `Ungültige Bildbeschreibung: ${file}. Erwartet wird nur description: "…" (Produktname als Alt-Text).`,
    );
    return fallback;
  }
}
