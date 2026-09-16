import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const schemaUrl = new URL('../schema/annotation-schema.json', import.meta.url);

export function resolvePath(data, expression) {
  if (expression === '$') return data;
  if (!expression.startsWith('$.')) throw new Error(`Unsupported source path: ${expression}`);
  const tokens = expression.slice(2).match(/[^.\[\]]+|\[(\d+)\]/g) ?? [];
  let value = data;
  for (const token of tokens) {
    const key = token.startsWith('[') ? Number(token.slice(1, -1)) : token;
    if (value === null || value === undefined || !(key in Object(value))) return undefined;
    value = value[key];
  }
  return value;
}

function resolveDataScope(data, spec, userId) {
  const scopePath = spec.form.dataScope?.path;
  if (!scopePath) return data;
  if (scopePath.includes('{userId}') && !userId) throw new Error('A userId is required by form.dataScope.path');
  const resolvedPath = scopePath.replaceAll('{userId}', userId ?? '');
  const scoped = resolvePath(data, resolvedPath);
  if (scoped === undefined) throw new Error(`Data scope not found: ${resolvedPath}`);
  return scoped;
}

export function formatValue(value, render) {
  if (render.type === 'checkbox') {
    const checked = render.checkedWhen === undefined ? Boolean(value) : value === render.checkedWhen;
    // Keep the MVP font-portable: standard PDF fonts do not reliably encode
    // Unicode checkbox glyphs. Tax forms conventionally accept an X mark.
    return checked ? 'X' : '';
  }
  if (value === null || value === undefined) return '';
  if (render.type === 'date') {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
    return render.dateFormat === 'yyyy-MM-dd'
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
      : `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
  }
  if (['number', 'currency'].includes(render.type)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`Invalid number: ${value}`);
    const decimals = render.decimalPlaces ?? (render.type === 'currency' ? 2 : 0);
    let result = Math.abs(numeric).toFixed(decimals);
    if (render.thousandsSeparator !== false) result = result.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (numeric < 0) result = render.negativeStyle === 'parentheses' ? `(${result})` : `-${result}`;
    return render.type === 'currency' ? `${render.currencySymbol ?? '$'}${result}` : result;
  }
  return String(value);
}

function validateSpec(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(specSchema);
  if (!validate(spec)) throw new Error(`Invalid annotation specification:\n${ajv.errorsText(validate.errors)}`);
}

let specSchema;
export async function loadSchema() { specSchema ??= JSON.parse(await fs.readFile(schemaUrl, 'utf8')); return specSchema; }

export async function renderPdf({ data, spec, inputPdf, outputPdf, userId }) {
  await loadSchema();
  validateSpec(spec);
  const pdf = await PDFDocument.load(await fs.readFile(inputPdf));
  const form = pdf.getForm();
  const scopedData = resolveDataScope(data, spec, userId);
  for (const annotation of spec.annotations) {
    const raw = resolvePath(scopedData, annotation.source.path);
    if (raw === undefined && annotation.required) throw new Error(`${annotation.id}: required path not found: ${annotation.source.path}`);
    if (raw === undefined || raw === null) continue;
    const render = annotation.render;
    const text = formatValue(raw, render);
    if (annotation.target.fieldName) {
      try {
        if (render.type === 'checkbox') {
          const checkbox = form.getCheckBox(annotation.target.fieldName);
          const checked = render.checkedWhen === undefined ? Boolean(raw) : raw === render.checkedWhen;
          checked ? checkbox.check() : checkbox.uncheck();
        } else {
          form.getTextField(annotation.target.fieldName).setText(text);
        }
      } catch (error) {
        throw new Error(`${annotation.id}: native PDF field "${annotation.target.fieldName}" could not be filled (${error.message})`);
      }
      continue;
    }
    const page = pdf.getPage(annotation.target.page - 1);
    if (!page) throw new Error(`${annotation.id}: page ${annotation.target.page} does not exist`);
    const { x, y, width, height } = annotation.target.box;
    const { width: pageWidth, height: pageHeight } = page.getSize();
    if (x + width > pageWidth || y + height > pageHeight) throw new Error(`${annotation.id}: target box is outside page bounds`);
    const font = await pdf.embedFont(StandardFonts[render.font ?? 'Helvetica']);
    let size = render.fontSize ?? Math.min(12, height * 0.8);
    const maxWidth = width - 2;
    if (render.overflow === 'error' && font.widthOfTextAtSize(text, size) > maxWidth) throw new Error(`${annotation.id}: rendered value does not fit target box`);
    if (render.overflow === 'shrink-to-fit') while (size > 4 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
    const textWidth = font.widthOfTextAtSize(text, size);
    const tx = render.horizontalAlign === 'right' ? x + width - textWidth - 1 : render.horizontalAlign === 'center' ? x + (width - textWidth) / 2 : x + 1;
    const ty = render.verticalAlign === 'top' ? y + height - size - 1 : render.verticalAlign === 'bottom' ? y + 1 : y + (height - size) / 2 + 1;
    page.drawText(text, { x: tx, y: ty, size, font, color: rgb(0, 0, 0), maxWidth });
  }
  form.updateFieldAppearances();
  if (spec.form.flatten === true) form.flatten();
  await fs.mkdir(path.dirname(outputPdf), { recursive: true });
  await fs.writeFile(outputPdf, await pdf.save());
}
