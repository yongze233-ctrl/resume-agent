# International and mixed-script typography

Load this reference whenever content is not exclusively English-language Latin text, or when language and script are unknown. The project's detailed punctuation and spacing rules are validated only for English in the Latin script `[INTL-001]`.

## Establish language and direction `[INTL-001]`

Identify the language, script, and direction for each meaningful run. Require correct metadata where the format supports it, such as document language, HTML `lang`, and directionality. Metadata enables pronunciation, hyphenation, line breaking, quotation marks, justification, and font fallback; visual appearance alone is not enough.

Do not infer language solely from script. Preserve personal names, loanwords, and mixed-language runs. Confirm editorial conventions when regional or house styles differ.

## Script-sensitive stop conditions `[INTL-002]`

Do not apply English rules for capitalization, word spaces, line breaking, hyphenation, justification, punctuation, quotation marks, emphasis, or letterspacing to an unfamiliar language or script. In particular:

- CJK line breaking and justification are not Latin word-spacing problems.
- Arabic and related scripts depend on joining and shaping; arbitrary tracking or character substitution can break words.
- Hebrew and Arabic mixed with Latin or numbers require bidirectional inspection, not source-order guesses.
- Thai, Khmer, Lao, and other scripts may not mark word boundaries with spaces.
- Accents, combining marks, emoji sequences, and variation selectors must remain intact.

Preserve unknown conventions, state the skill's limitation, and route to language-specific editorial guidance plus the W3C Internationalization layout index or another authoritative source. Render representative text with the chosen font and shaping engine before approving it.

## Mixed-script checks `[INTL-002]`

Verify glyph coverage, baseline and x-height compatibility, punctuation ownership, numeric style, fallback behavior, line breaking, justification, and direction at actual sizes. Use language-aware hyphenation only for correctly tagged languages. Never require global `hyphens: auto` as a universal fix for justified mixed-script text.
