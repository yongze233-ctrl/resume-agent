---
name: practical-typography
description: "Visual typography for resume design: font roles, readable size, leading, measure, whitespace and rendered PDF inspection. Preserves supplied wording and order."
allowed-tools: read_resume design_resume openpencil_edit openpencil_inspect openpencil_review write_todos
---

# Practical typography — OpenPencil integration

This is the native visual-only integration of the installed Practical Typography skill. Full upstream instructions and references remain in `upstream/UPSTREAM-SKILL.md`.

For resume typography read `upstream/layout.md` and the **Resumes** and **PDF production** sections of `upstream/media.md`; for Chinese read `upstream/international.md`. Apply principles in the actual print context, not CSS pixel defaults.

Keep original wording, numbers, section/entry order and emphasis content. Design roles such as name, section title, entry title, body and date may have different visual styles. Use few styles. Start with readable body type; establish leading and column measure together. Space above headings exceeds space below. Space between sections exceeds space inside entries. Prefer useful whitespace to repeated borders.

The native `visual.text` helper fixes width before enabling automatic height. Use returned text height for flow. Never compress characters or use a fixed tiny text box to fake fitting. When dense, change geometry and remove abnormal gaps before reducing type. Preserve the real portrait. Inspect the final artifact at actual size before declaring success.
