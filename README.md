# Instead Tax Form Annotation Prototype

This project demonstrates a generic mapping layer between structured tax data and a PDF form. The reusable contract is separate from each form-specific annotation pack.

```text
taxpayer-dataset.json + 1040_annotation.json + form PDF + userId → filled PDF
```

## Quick start

```powershell
npm install
npm run render
```

The default command uses `examples/taxpayer-dataset.json`, selects `user1`, applies `annotations/1040_annotation.json` to the supplied 2025 `forms/f1040.pdf`, and writes `output/filled-form.pdf`.
The example uses the PDF's native AcroForm field names, so values are placed by the actual field widgets rather than guessed visual coordinates. Native field names are revision-specific and must be inspected and versioned with the PDF template.

Use another form or annotation set with:

```powershell
node src/cli.js --taxpayer examples/taxpayer-dataset.json --user user2 --annotations annotations/1040_annotation.json --input forms/f1040.pdf --output output/filled-1040-user2.pdf
```

The selection is dynamic: choose any dataset, user, annotation pack, input form, and output path with `--data`/`--taxpayer`, `--user`, `--annotations`/`--spec`, `--input`, and `--output`.

## Specification

An annotation has three independent parts:

- `source.path`: a small JSONPath-like expression relative to the selected user's `1040_form`, such as `$.w2local[0].box1`.
- `target`: one-based page number and either an exact native `fieldName` or a rectangle in PDF points.
- `render`: field type and presentation rules.

The form declares the coordinate convention: PDF points, bottom-left origin, one-based pages. This avoids ambiguity between PDF coordinates and screen coordinates. Native AcroForm fields are preferred whenever the template provides them; rectangle drawing is the fallback for static PDFs.

Supported MVP render types are `text`, `number`, `currency`, `date`, and `checkbox`. Number formatting supports decimal places, thousands separators, currency symbols, and negative values. Text supports alignment and `shrink-to-fit` overflow handling. Required missing values fail with the annotation ID and path; optional missing/null values are skipped.

The complete machine-readable contract is in [schema/annotation-schema.json](schema/annotation-schema.json). The concrete 2025 Form 1040 mapping is in [annotations/1040_annotation.json](annotations/1040_annotation.json), and the first source-data fixture is in [examples/taxpayer1.json](examples/taxpayer1.json).

The source data and annotation mapping are intentionally coupled at the path level: an annotation must know the data contract it reads. They are not coupled to one user. `form.dataScope.path` selects `$.users[{userId}].1040_form` at runtime, so the same annotation pack can be reused for user1, user2, or millions of records.

For a different output form, add another pack such as `annotations/schedule1_annotation.json` whose targets reference that exact PDF's native fields. One Form 1040 pack may legitimately read W-2, Schedule 1, Schedule B, Schedule C, Schedule E, Schedule F, and computed values because its job is to fill Form 1040. A W-2 pack is only needed when the W-2 PDF itself must also be filled.

## Design decisions and scope

Tax calculations, tax-law validation, OCR, automatic box detection, arbitrary expressions, and repeating rows are intentionally out of scope. The fixture contains multiple users, source documents (`w2local`, Schedule 1, Schedule B, Schedule C, Schedule E, and Schedule F), and explicitly labeled computed Form 1040 totals; the annotation layer maps already-computed values to a known PDF template.

The form template and revision belong in the specification because coordinates are meaningful only for a particular PDF layout. A future version could add template hashes, repeating rows, conditional visibility, named reusable styles, and PDF-native AcroForm fields.

## Renderer structure

- `src/renderer.js`: schema validation, path resolution, formatting, and PDF drawing.
- `src/cli.js`: selects the taxpayer fixture, annotation pack, input form, and output path.

The full written specification is in [docs/annotation-specification.md](docs/annotation-specification.md).
