# Composition and safe character handling

Load this reference for punctuation, spaces, emphasis, or any character transformation. These rules are validated primarily for English prose in the Latin script. Route other language or script work through [international.md](international.md).

## Classify before transforming `[AUDIT-002]`

Divide text into prose, code, command, URL, email address, identifier, measurement, legal reference, and data. Only transform prose with clear intent. Preserve source spelling and characters in unknown or mixed regions.

Never normalize inside code spans or blocks, shell commands, markup syntax, filenames, paths, URLs, email addresses, IDs, serialized data, or quoted strings whose exact bytes matter. Do not turn `!=`, `=>`, `--flag`, straight programming quotes, or backticks into typographic glyphs. Disable programming ligatures and character substitutions in reader-facing code when they obscure the typed characters `[FONT-004]`.

## Quotes and apostrophes `[COMP-001]`

- Use language-appropriate curly quotation marks and apostrophes in eligible prose.
- Apostrophes point down in contractions and omissions: `don't`, `’70s`, and `rock ’n’ roll` after conversion.
- Preserve straight marks used for feet and inches, straight characters required by code or data, and unfamiliar quotation conventions.
- A leading apostrophe, single closing quote, and prime mark are distinct characters; infer from meaning, not adjacency alone.

## Hyphens and dashes `[COMP-002]`

- Use an em dash for a prose break where the house style calls for it. Butterick sets it closed; another house style may space it consistently.
- Use an en dash for numeric ranges and paired names when appropriate, but write `from 1880 to 1912`, not `from 1880–1912`.
- Keep hyphens in compounds and phrasal adjectives where grammar requires them. Do not replace syntax hyphens or minus signs.

## Ellipses `[COMP-003]`

Use the ellipsis character in eligible prose and keep the adjacent spacing consistent with the house style. When an ellipsis separates words, use nonbreaking spaces where needed to keep the three-part construction together. Preserve three literal periods in code, filenames, commands, data, and APIs.

## Symbols, measurements, and ordinals `[COMP-004]`

- Use ©, ™, and ® only when the author intended those symbols. Do not convert `(c)`, `(r)`, or `(tm)` mechanically; `Section 12(c)` is a legal reference, not a copyright mark.
- Keep the mark attached to its owner and use a nonbreaking space in constructions such as `© 2026` when line breaking requires it.
- Distinguish the multiplication sign from the letter `x`, and a mathematical minus from a hyphen, only when semantics are clear.
- Preserve straight foot and inch marks when they encode measurement, or replace them with prime and double-prime characters only when the target system and authorial intent support that distinction.
- Use true ordinal forms only when the font supports them and the language calls for them; never synthesize them by shrinking arbitrary letters.

## Whitespace `[COMP-005]`

- Use one word space between sentences in composed prose.
- Use nonbreaking spaces to keep required tokens together, including section or paragraph marks with their references and short figure labels with their numbers.
- Do not manufacture spacing with repeated spaces, tabs, or empty paragraphs. Use paragraph, layout, or table controls.
- Preserve whitespace in preformatted text, code, commands, and data.

## Alternate figures and accents `[COMP-006]`

Choose lining or oldstyle and proportional or tabular figures according to role: tables and aligned quantities generally need tabular figures; running prose may benefit from proportional or oldstyle figures if the font supplies them. Preserve accented characters in names and words; do not strip diacritics to fit a font. A missing glyph is a font-selection failure, not permission to alter the text.

## Parentheses, brackets, and braces `[COMP-007]`

Use parentheses for ordinary prose asides, brackets for editorial material inside quotations or for nested delimiters when necessary, and braces mainly for mathematical or technical notation. Keep pairs balanced, avoid piling nested asides into unreadable sentences, and preserve every delimiter in code, identifiers, legal references, and data. Apply surrounding punctuation according to the sentence's grammar rather than moving marks mechanically.

## Emphasis and caps `[TYPE-005]`

Use bold or italic as a single, restrained signal. Avoid bold-italic stacking and paragraph-length emphasis unless meaning requires it. Underlining is for links or a domain-specific convention, not generic emphasis. Use real small caps; for all-caps or small-caps runs, add modest tracking by visual calibration and keep long passages out of caps. Never letterspace lowercase prose as a generic effect.
