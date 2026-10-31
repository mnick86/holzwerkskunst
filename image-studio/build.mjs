import {copyFile, mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Jimp from 'jimp';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Explicit allowlist: never publish .env files, credentials, tests, or Node helpers.
export const PUBLIC_FILES = [
  'index.html',
  'studio.css',
  'studio.js',
  'image-editor.js',
  'config.mjs',
  'openai.mjs',
  'costs.mjs',
  'logo.png',
  'favicon.png',
  'openai.LICENSE.txt',
];
export async function buildImageStudio(
  destination = new URL('../dist/bootstrap/image/', import.meta.url),
) {
  await mkdir(destination, {recursive: true});
  const logoSource = new URL('../src/assets/logo.png', import.meta.url);
  const logoBytes = await readFile(logoSource);
  const logoVersion = createHash('sha256').update(logoBytes).digest('hex').slice(0, 12);
  for (const file of PUBLIC_FILES.filter(
    (file) => !['openai.mjs', 'logo.png', 'favicon.png'].includes(file),
  )) {
    const source =
      file === 'openai.LICENSE.txt'
        ? new URL('./LICENSE', import.meta.resolve('openai'))
        : new URL('./public/' + file, import.meta.url);
    if (file === 'index.html') {
      const html = (await readFile(source, 'utf8')).replaceAll('__LOGO_VERSION__', logoVersion);
      await writeFile(new URL(file, destination), html);
    } else await copyFile(source, new URL(file, destination));
  }
  const logo = await Jimp.read(logoBytes);
  await Promise.all([
    logo
      .clone()
      .resize(144, Jimp.AUTO)
      .deflateLevel(9)
      .writeAsync(fileURLToPath(new URL('logo.png', destination))),
    logo
      .clone()
      .resize(48, Jimp.AUTO)
      .deflateLevel(9)
      .writeAsync(fileURLToPath(new URL('favicon.png', destination))),
  ]);
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./public/openai.mjs', import.meta.url))],
    outfile: fileURLToPath(new URL('openai.mjs', destination)),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minify: true,
    // Only explicit browser credentials/settings are supported in this bundle.
    define: {'process.env': '{}', 'globalThis.process.env': '{}'},
    metafile: true,
    write: false,
  });
  // Fail the build if the SDK introduces external runtime dependencies.
  for (const output of Object.values(result.metafile.outputs))
    if (output.imports.some((entry) => entry.external))
      throw new Error('The image studio bundle must be self-contained.');
  for (const output of result.outputFiles) await writeFile(output.path, output.contents);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildImageStudio();
  console.log('Bildstudio: dist/bootstrap/image/');
}
