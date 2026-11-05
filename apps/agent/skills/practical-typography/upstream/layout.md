# Layout and document structure

Load this reference for paragraph systems, headings, lists, block quotations, tables, styles, pagination, columns, or grids. Numeric values are starting ranges unless the rule explicitly describes a semantic requirement.

## Body text and paragraphs `[TYPE-001] [TYPE-002] [TYPE-003]`

For English-language running prose, start with 15–25 px on the web or 10–12 pt in print, line spacing of 120–145%, and about 45–90 actual characters per rendered line. Font metrics and reading conditions matter, so adjust in the smallest visible increments and compare rendered alternatives. If size shrinks, reevaluate line spacing and measure too.

Signal paragraphs with either a first-line indent or paragraph space, not both. Do not indent the first paragraph after a heading or other obvious break. Avoid centered running prose. Justification is conditional: use it only when the language, line-breaking engine, hyphenation or other script-appropriate behavior, and column width produce even spacing without harming comprehension.

## Headings `[TYPE-004]`

Use as few heading levels as the structure needs. Create hierarchy with the smallest visible combination of position, weight, size, font, and spacing that works; no modular ratio is required. Space above should ordinarily exceed space below, and headings should remain with the following text. Avoid underlining, fake small caps, and excessive capitalization. Use automatic hierarchical numbering when numbering is necessary.

## Automated lists `[LAYOUT-001]`

Use the application's list feature or semantic HTML rather than typed bullets, tabs, or manual numbering. Align wrapped lines with the list text, keep punctuation and capitalization consistent, and avoid a list when ordinary prose would be clearer. Restart or continue numbering through list controls, not by editing visible numerals.

## Paragraph and character styles `[LAYOUT-002]`

Encode repeated roles as paragraph, character, or semantic styles. Equivalent elements should be identical and different roles materially distinct. Do not repair a system with repeated local formatting. Direct formatting is acceptable for isolated exceptions, not for the underlying hierarchy.

## Block quotations `[LAYOUT-003]`

Distinguish a block quotation structurally with indentation, spacing, a rule, or another restrained device; do not stack bold, italic, tint, and oversized quotation marks. Remove redundant quotation marks around a true block quotation. When editorial authority permits, quote only what is necessary, edit with proper attribution conventions, or integrate short quotations into prose.

## Tables `[MEDIA-005]`

Typography should expose the data's logic. Align quantities by their numeric meaning, identifiers according to how they are read, and labels only after the data columns work. Use appropriate numeric features, adequate cell padding, and thin rules or whitespace rather than decoration. Do not force an arbitrary scale ratio; calibrate type so labels and values remain readable in the delivery format.

## Pagination and page flow `[LAYOUT-004]`

Use keep-with-next on headings and apply widow/orphan control when the actual pages need it. Create page breaks with a single page-break control, never stacked returns. Use spacing properties rather than empty paragraphs. In multi-column layouts, keep baselines and paragraph spacing coherent when the design requires alignment, and inspect every final page.

## Columns, grids, rules, and whitespace `[LAYOUT-005]`

Let rendered measure determine column width. Relate new elements to existing alignments and use a grid where it clarifies those relationships. Prefer whitespace before borders; when a rule is needed, keep it subordinate to the text. Asymmetry should look intentional, not accidental. Work outward from the text instead of inward from arbitrary page edges.
