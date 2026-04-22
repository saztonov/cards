import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');
const outFile = path.join(publicDir, 'theme-default.js');

const theme = (process.env.DEFAULT_THEME || 'modern').trim();
if (!['modern', 'legacy'].includes(theme)) {
  console.error(`[theme] invalid DEFAULT_THEME="${theme}" (expected modern|legacy)`);
  process.exit(1);
}

const body = `window.__CARDS_DEFAULT_THEME__=${JSON.stringify(theme)};\n`;
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outFile, body, 'utf8');
console.log(`[theme] wrote ${outFile} → ${theme}`);
