# Tax Form Annotation Specification

Version 1.0

## Purpose

This specification describes a mapping between structured tax data and a known PDF form. It does not calculate taxes or attempt to model tax law.

The renderer consumes three inputs:

```text
source data + annotation document + PDF template = filled PDF
```

The source data belongs to the calling application. The annotation document describes how to locate and present values. The PDF template supplies the visual layout.

## Document structure

An annotation document contains `specVersion`, `form`, and `annotations`. The `form` identifies the exact output template. Each annotation is one independent mapping from one source value to one destination.

## Form metadata

```json
{
  "formId": "f1040",
  "revision": "2025",
  "template": "forms/f1040.pdf",
  "coordinateSystem": { "unit": "pt", "origin": "bottom-left", "pageNumbering": "one-based" },
  "flatten": false
}
```

Coordinates use PDF points and a bottom-left origin. Native PDF field names are preferred because the PDF already defines the exact box. Rectangle coordinates are supported for static PDFs and use the same coordinate convention. The template revision is part of the contract because names and positions can change between revisions.

## Annotation structure

```json
{
  "id": "1040.line1a.wages",
  "label": "Line 1a from W-2 box 1",
  "source": { "path": "$.w2local[0].box1" },
  "target": { "page": 1, "fieldName": "topmostSubform[0].Page1[0].f1_47[0]" },
  "render": { "type": "number", "decimalPlaces": 0, "thousandsSeparator": true },
  "required": true
}
```

`id` is a stable identifier used in logs and errors. `source.path` identifies the source value. `target` identifies exactly one PDF destination. `render` defines the field type and presentation. `required` controls missing-value behavior.

## Source path syntax

The MVP supports a safe, limited JSONPath-like syntax:

- `$` means the root object.
- `.property` accesses an object property.
- `[0]` accesses an array element.

Examples:

```text
$.taxpayer.name.first
$.w2local[0].box1
$.scheduleB.partI.line4TaxableInterest
$.computed.form1040.line11aAdjustedGrossIncome
```

Missing required values stop rendering with an error containing the annotation ID and path. Missing optional values are skipped. Arbitrary code, filters, wildcards, and expressions are excluded from version 1.0.

## Targets and rendering

For a fillable PDF, use an exact `fieldName` taken from that PDF revision. For a static PDF, use a rectangle:

```json
{ "page": 1, "box": { "x": 72, "y": 600, "width": 100, "height": 18 } }
```

The rectangle provides size for alignment and overflow decisions. Native fields are more reliable because their position is maintained by the template.

Supported render types are `text`, `number`, `currency`, `date`, and `checkbox`. Formatting includes decimal places, thousands separators, currency symbols, negative-number style, font size, alignment, and overflow behavior. A checkbox is checked when its source is truthy or equals `checkedWhen`.

## Source-data coupling

An annotation pack is intentionally coupled to a source-data contract through its paths. Changing `$.w2local[0].box1` to `$.income.wages` requires changing the annotation or adapting the input data.

The schema remains generic because it does not prescribe either path:

```text
annotation-schema.json       reusable grammar
1040_annotation.json          2025 Form 1040 mapping
taxpayer-dataset.json         many source-data instances
```

One Form 1040 pack may read W-2, Schedule 1, Schedule B, Schedule C, Schedule E, Schedule F, and computed values. Separate packs are only needed when those PDFs themselves are output documents.

For a multi-user dataset, the form declares a parameterized scope:

```json
{ "dataScope": { "path": "$.users[{userId}].1040_form", "parameters": ["userId"] } }
```

The renderer receives `userId` at runtime. Annotation paths remain relative to the selected `1040_form`, so the annotation file contains no hardcoded user identifier.

## Implementation contract

An implementation should validate the annotation document, verify the PDF template revision, resolve each path, format each value, confirm the target exists, write the PDF, and report annotation-level errors. The reference implementation in `src/renderer.js` is deliberately small and can be replaced by proprietary code while retaining the same annotation files.

## Scope

Tax calculations, tax-law validation, OCR, automatic field discovery, arbitrary expressions, and repeated rows are outside version 1.0. Future versions could add template hashes, repeat groups for dependents, conditional visibility, reusable styles, and aggregation for multiple W-2 records.
