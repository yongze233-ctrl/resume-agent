---
name: vibe-resume
description: Resume-specific visual density, original portrait handling, official style references and export QA; native OpenPencil adaptation with unchanged content and order.
allowed-tools: read_resume design_resume openpencil_edit openpencil_inspect openpencil_review write_todos
---

# Vibe Resume — OpenPencil integration

The upstream package is in `upstream/`, including 12 HTML templates, QA scripts, examples and original instructions (`upstream/UPSTREAM-SKILL.md`). Keep its attribution and CC BY-NC 4.0 license. Commercial reuse of these materials requires permission from the original author.

For this project's native visual-only workflow, read `references/native-visual-rules.md`. Use the original HTML and scripts only for an explicitly requested HTML/PDF run. The user's fixed model configuration, original content/order and native editable canvas remain the task contract. Do not perform the upstream content-selection workflow or change providers.

Use an official visual reference deliberately. `swiss-neue` offers an invisible grid and restrained type; `minimal-prose` uses whitespace and type rather than bands; `editorial` uses a quiet publication grid. Match the selected reference's actual composition instead of applying the old black-orange header to every design. For native canvas work, the concise native rules are sufficient; inspect a full HTML template only when a specific visual detail is unresolved or exact reproduction is requested.

Density adaptation: loose content uses slightly larger type/leading; dense content first removes abnormal gaps. Body type has a 9pt floor; tune Chinese leading in context. Keep the original portrait in color with a stable slot and clean crop. Every final design must contain the supplied portrait.

Use the product's one-page A4 requirement. The upstream 10mm margin cap and 15% bottom-whitespace gate are template presets, not general aesthetic laws. Fit the full source through measured layout, readable type and intentional white space. Do not add pages or remove content to satisfy an aesthetic preset. Use `visual.text` so resizing cannot silently disable automatic height. Export and inspect actual PDF, picture and editable layers; source-only guesses do not prove successful design.
