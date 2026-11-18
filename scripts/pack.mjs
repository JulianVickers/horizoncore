/*
 * Pack the HorizonCore plugin: inline the engine into index.html, assemble
 * the flat plugin folder, and zip it the way Super Productivity expects
 * (manifest.json at the top level of the ZIP).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist', 'horizoncore');

const engine = readFileSync(join(root, 'src', 'engine.js'), 'utf8');
const template = readFileSync(join(root, 'src', 'index.html'), 'utf8');
if (!template.includes('/*__ENGINE__*/')) {
  throw new Error('src/index.html is missing the /*__ENGINE__*/ marker');
}
const indexHtml = template.replace('/*__ENGINE__*/', () => engine);

rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join(root, 'plugin', 'manifest.json'), join(dist, 'manifest.json'));
copyFileSync(join(root, 'plugin', 'plugin.js'), join(dist, 'plugin.js'));
copyFileSync(join(root, 'plugin', 'icon.svg'), join(dist, 'icon.svg'));
writeFileSync(join(dist, 'index.html'), indexHtml);

const zipPath = join(root, 'dist', 'horizoncore.zip');
execSync(
  `python3 -m zipfile -c ${JSON.stringify(zipPath)} manifest.json plugin.js index.html icon.svg`,
  { cwd: dist, stdio: 'inherit' }
);
const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
console.log('built', zipPath);
console.log('sha256', sha);
