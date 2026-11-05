# Medium-specific typography

Load only the section matching the artifact. Combine this file with [layout.md](layout.md), [fonts.md](fonts.md), [web.md](web.md), or [international.md](international.md) when those concerns are material.

## Print documents `[MEDIA-001]`

- Start with 10–12 pt body text, 120–145% line spacing, black text, and a print-suitable font; judge the rendered page rather than the nominal point size alone.
- Let line length determine margins. On US Letter, 1-inch side margins are often too small for 12 pt proportional body text, but any inch value is subordinate to rendered measure and the binding or production context.
- Use two or three columns only when the content, page, and reading order support them. Inspect baseline and paragraph-spacing behavior rather than enforcing a universal grid.
- Use keep-with-next for headings, apply widow/orphan control where actual page flow needs it, and create breaks and spacing with document controls rather than empty returns.
- Fit a page by revisiting spacing, measure, editing, and structure together. Never reduce type until the text technically fits without inspecting readability.

## Presentations `[MEDIA-002]`

Slides are viewed at distance and must be calibrated in the actual room or a realistic preview.

- Select a stable base size by fitting roughly 12–15 lines as a calibration test, then place far less text on each real slide. Keep equivalent roles consistent, disable automatic shrinking, and edit content when it does not fit.
- Prefer short, left-aligned text blocks and generous empty space. Centering can suit a single short statement but not paragraph-like slide copy.
- In dark rooms, begin with a genuinely dark background and raise text luminance only as far as legibility and contrast require; inspect the projector because screen colors do not predict projected light. In lit rooms, reduce glare while maintaining required contrast.
- Use a small set of roles such as title, body, and attribution. Exact pixel sizes, title ratios, and tracking values are project calibration choices, not source mandates.

## Email and collaborative documents `[MEDIA-003]`

Email rendering and font availability are unpredictable. Prefer robust system stacks and simple spacing, or plain text when reliability matters more than styling. Contact information should remain selectable text. In collaborative or editable documents, a widely available system font can be the correct choice even when a professional font would look better locally; editability and faithful interchange outrank exclusivity.

## Resumes `[MEDIA-004]`

Do not cram a resume merely to force one page. Put decisive information early, keep labels subordinate to substance, use calm lists, and verify the exported PDF. Delivery requirements may impose a page count, applicant-tracking constraints, or a mandated template; honor those constraints before aesthetic preferences. Proofread content separately from the typography audit.

## Tables of numbers `[MEDIA-005]`

- Use tabular figures where vertically aligned digits need equal advances; choose lining or oldstyle figures according to the surrounding role.
- Align quantities so equal numeric places line up. Preserve meaningful leading and trailing zeros and use locale-appropriate grouping and decimal separators.
- Treat identifiers such as postal codes differently from quantities. Do not imply arithmetic meaning through alignment or padding.
- Format labels after the data columns work. Use adequate padding and restrained rules so the data, not decoration, dominates.
- Type size, rule weight, and cell ratios must be calibrated in the delivery medium; previous exact supporting-element ratios are retired as unsupported precision.

## PDF production `[MEDIA-006]`

Prefer direct PDF generation or a controlled export path over printing through an incidental driver. At final delivery, verify:

- every page is visually complete at normal and enlarged inspection;
- text intended as text remains searchable, selectable, and correctly ordered;
- required fonts are embedded or validly substituted, with licenses permitting the chosen workflow;
- links, bookmarks, tags, language metadata, and accessibility structure survive when required;
- color, transparency, image resolution, page boxes, and print behavior suit the destination;
- no reflow, missing glyph, fallback, clipping, blank page, widow, or orphan appeared during export.

An editable source or successful export command is not final-PDF evidence. Inspect the delivered file itself.

## General layout maxims `[CORE-001]`

Start with body text. Make foreground and background roles clear. Adjust in the smallest visible increments and compare alternatives. Keep equivalent elements consistent and different elements visibly different. Relate new elements to an existing alignment system. Prefer simplicity and useful whitespace. Learn from typography that succeeds in the same medium, then work outward from the text.
