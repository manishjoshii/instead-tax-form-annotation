import fs from 'node:fs/promises';
import path from 'node:path';
import { renderPdf } from './renderer.js';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const root = process.cwd();
const dataPath = path.resolve(root, args.get('data') ?? args.get('taxpayer') ?? 'examples/taxpayer-dataset.json');
const specPath = path.resolve(root, args.get('annotations') ?? args.get('spec') ?? 'annotations/1040_annotation.json');
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const inputPdf = path.resolve(root, args.get('input') ?? spec.form.template);
const outputPdf = path.resolve(root, args.get('output') ?? 'output/filled-form.pdf');
const userId = args.get('user') ?? 'user1';
try {
  await renderPdf({ data: JSON.parse(await fs.readFile(dataPath, 'utf8')), spec, inputPdf, outputPdf, userId });
  console.log(`Rendered ${spec.annotations.length} annotations for ${userId ?? 'root data'} to ${path.relative(root, outputPdf)}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
