# Fonts

Load this reference for selecting, pairing, validating, loading, or licensing fonts. The lists below are a selective working shortlist, not the full live Practical Typography font tables. Source-derived names were last checked on 2026-08-22; consult the linked registry before describing a current list as complete.

## Source shortlist `[FONT-001]`

Practical Typography treats professional fonts as a high-leverage upgrade and judges fonts in context rather than by serif versus sans alone.

- Useful system starting points named favorably by the source include Charter, Athelas, Avenir, Bell, Book Antiqua, Century Schoolbook, Franklin Gothic, Garamond, Gill Sans, Helvetica, Hoefler Text, Iowan Old Style, Optima, Palatino, Seravek, and Sitka.
- Source-endorsed free families include Charter, Source Serif, Source Code, Cooper Hewitt, IBM Plex, and Fira Mono.
- The source strongly discourages overexposed defaults and novelty or script faces for professional body text. Times New Roman, Arial, Comic Sans, Papyrus, and similar defaults should trigger a contextual review, not an automatic content-independent rejection.
- Screen-oriented faces can be appropriate on screen even when they are poor print choices. PDF typography should be evaluated for its likely viewing and printing contexts.

For the complete current system-font grades and professional alternatives, follow the Practical Typography pages recorded in [provenance.md](provenance.md).

## Validate the actual family `[FONT-002]`

A recommendation passes only after checking what the artifact requires:

- glyph repertoire for every language, symbol, accent, and emoji policy in the content;
- genuine weights, italics, and small caps where those styles are used;
- required OpenType behavior, including kerning and appropriate proportional, tabular, lining, oldstyle, fraction, or ordinal figures;
- legibility and metrics at the actual size, medium, and rendering engine;
- compatibility of fallback families, including line breaks and control dimensions;
- support in the target browser, office application, renderer, printer, or export path;
- the applicable desktop, web, app, redistribution, and document-embedding rights.

Do not strip accents, substitute characters, synthesize a missing style, or silently accept tofu to make a font pass. If PDF embedding is prohibited or technically unavailable, choose an embeddable alternative or an explicitly compliant delivery workflow.

## Pairing `[FONT-003]`

One family with a capable range is often enough. Two families are a practical maximum for most artifacts; add another only when a distinct role such as code requires it. Give each family a consistent role and switch at semantic boundaries. Contrast can come from structure and metrics, not merely serif versus sans. Families by the same designer or within a superfamily are a useful starting point, not a guarantee.

## Monospaced and code text `[FONT-004]`

Use monospaced type for code or genuinely columnar character data, not running body prose. Confirm that punctuation and confusable characters remain distinct. In reader-facing code, disable discretionary or programming ligatures and any substitution that conceals the typed sequence; preserving `!=`, `=>`, quotes, slashes, and backticks outranks stylistic joining. Standard prose ligatures are optional: consider them when the selected font has an actual collision, and never type ligature code points merely to force the effect.

## Project-authored screening rubric `[FONT-002]`

When a font is absent from the source, investigate its designer or foundry, family completeness, real styles, glyph and feature coverage, rendering quality, exposure in the intended context, licensing, and delivery support. Named contemporary families are examples to test, not endorsements. “Inter passes” and similar unconditional verdicts are retired because a family can pass one context and fail another.
