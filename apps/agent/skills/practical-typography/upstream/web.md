# Web typography

Load this reference for browser-rendered text, responsive layouts, webfonts, variable fonts, or accessibility verification. Combine it with [composition.md](composition.md) for literal text and [international.md](international.md) for non-English or mixed-script content.

## Declarations are not outcomes `[WEB-001]`

Record the strongest evidence available:

1. authored HTML/CSS;
2. computed styles and the font actually used for representative glyphs;
3. rendered lines at supported viewport widths and states;
4. captured or exported delivery evidence.

A declared family does not prove that the font loaded. A CSS width does not prove readable measure. A valid layout at one viewport does not prove responsive behavior. Label source-only findings provisional.

## Responsive measure `[WEB-002]`

For English running prose, use about 45–90 actual characters per rendered line as the Practical Typography benchmark. `ch` measures the advance width of `0`, so `max-width: 60ch` is a convenient initial estimate, not evidence of 60 characters. Count representative rendered lines at material breakpoints or use the lowercase alphabet test: roughly two to three alphabets per line.

Check narrow, typical, and wide supported viewports; also inspect enlarged text and fallback-font states. Prevent prose from running edge to edge merely because a viewport is wide. Display headings, navigation, code, and tables have different measure requirements.

## Accessibility resilience `[WEB-003] [WEB-004]`

Accessibility outranks aesthetic tuning. Verify that content and functionality survive at least the WCAG 2.2 text-spacing test values without clipping, overlap, truncation, obscuring controls, or loss of information:

- line height at least 1.5 times the font size;
- paragraph spacing at least 2 times the font size;
- letter spacing at least 0.12 times the font size;
- word spacing at least 0.16 times the font size.

These are override test values, not mandatory default styling. Also test relevant contrast, browser zoom or text enlargement, reflow, overflow, focus visibility around styled links, and user preference settings. Do not solve overflow by disabling zoom, hiding text, or forcing an unreadably small size.

## Fonts, fallbacks, and stability `[WEB-005]`

- Verify network success, font decoding, and the actual face used for body, emphasis, headings, symbols, and required scripts.
- Choose a loading policy appropriate to the content. Report disruptive flashes, invisible text, late swaps, or layout shift when they materially affect reading.
- Build a metrically compatible fallback stack where practical; compare line breaks, control sizes, and cumulative layout shift in fallback and loaded states.
- For variable fonts, verify required axes and instance ranges. If an optical-size axis exists, confirm that automatic `font-optical-sizing` or an explicit setting is suitable at the rendered sizes.
- Confirm that synthetic bold or italic is not silently replacing required genuine styles.

## Interaction conventions `[WEB-004]`

Keep links identifiable without relying on color alone, and avoid styling noninteractive text so it is easily mistaken for a link. Preserve selectable, searchable text. Typography must not hide status, validation, or control labels.
