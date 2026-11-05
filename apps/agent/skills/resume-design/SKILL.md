---
name: resume-design
description: Create or redesign an editable resume canvas from existing documents, attachments or facts supplied in conversation, with real rendering and visual checks. Includes designing a new resume from scratch.
allowed-tools: read_resume design_resume openpencil_edit openpencil_inspect openpencil_review write_todos request_form ask_choice
---

# Resume design

## Starting from conversation facts

“给我设计一份简历，我叫小明，大三，找 AI 产品实习” is a design request even when the current resume is empty. The deliverable is a native editable canvas, not just a JSON proposal. Read the current source once; reuse facts from conversation, attachments and submitted forms. Do not browse other creation/optimization/parsing workflows to replace this deliverable.

When source content is empty, compose a conservative draft from the supplied facts. Ask one concise optional question or form only when it materially improves the draft; do not re-ask the known name, stage or target role. A skipped field remains unknown. Omit unknown optional entries or label necessary gaps “待补充”; never invent an employer, project, skill, achievement, contact detail or date. An empty date range such as “ - 至今” is missing information, not a verified date. Facts may be organized into readable blocks without adding new claims.

After collection or a skipped form, continue with design_resume → native composition → openpencil_review. Plans must include composition and checking, not just collection. Only mark all design steps completed after ready:true; even then, call an incomplete-content result a “可编辑草稿” and name the outstanding factual gaps. Do not describe it as ready to submit or stop at writing /workspace/resume.json.

## Installed visual skills

This entrypoint already includes the combined native print rules. For an ordinary resume, proceed from these rules directly; read ONE of the following references only when a concrete visual decision needs it. Do not serially load all three packages and full HTML templates before drawing:
1. `/skills/practical-typography/SKILL.md` — readable type, leading and useful whitespace.
2. `/skills/typography-layout-systems/SKILL.md` — deliberate page composition and alignment.
3. `/skills/vibe-resume/SKILL.md` — authorized resume style references, density, portrait and export QA.

The full upstream packages are installed beside these project adapters. Load only references needed for the selected print workflow. Use this visual scope: preserve supplied words, all facts, source section/entry order and the real portrait. Do not rank, select, rewrite or remove content. The original theme color is not a fixed brand requirement. Avoid repeating a large black-orange header for every composition.

Every edit script receives `visual`, a measured native toolkit:
`visual.text(parent, text, {x,y,width,size:9.5,leading:1.35,bold:false,color:'#20262a',role:'body'})` returns a native TextNode with automatic height. Advance the next y by its actual `height` plus your gap. `visual.box(parent,{x,y,width,height,color})` creates a shape. `visual.photo(parent,imageHash,{x,y,width,height})` places the supplied real portrait. `visual.stack(parent,items,{x,y,width,size,leading,gap})` flows strings or `{text,bold,size,gap}` blocks and returns `{nodes,bottom}`. `visual.paragraphs(sourceSummary)` gives preserved original paragraphs. Use these helpers instead of probing text height or calling resize after HEIGHT.

Choose a restrained composition with a quiet identity/photo zone, explicit alignment axes and differentiated section/entry/paragraph gaps. The deliverable is ONE A4 page. Measure all content and budget its vertical space before drawing. Use an efficient header, 18–28pt margins, deliberate column widths and tighter gaps for dense resumes; body type must stay at least 9pt. Fit the whole resume on this page, never split sections into a second or third page to make the layout look airy. Never crop overflow, scale the entire page down, or silently delete/rewrite content to fit. If it truly cannot fit legibly, keep the draft and tell the user what needs shortening before changing words. A style reference guides visual decisions; it is never a reason to invent facts or claim upstream HTML scripts were executed.

Compose all content in one coherent pass, then inspect and target corrections. Keep the last useful frame while preparing a replacement. After the complete one-page replacement passes review, remove only superseded draft frames created in this task. Leave existing alternate versions intact; do not create alternate versions unless requested.

Preserving source text does not mean preserving accidental PDF/Word line breaks. Short contact fields, skill labels and award metadata can share a row with clear separators; preserve every original phrase and its reading order. Avoid wasting a full-height paragraph on each tiny label. Keep substantial project paragraphs distinct and align dates consistently. Do not spend half the page on the identity/photo zone and then move the actual experience to later pages.

Read the exact current resume with read_resume. The user's JD and preferences describe the design target, never new career facts.

For a requested design, create a brief 3-step plan with write_todos, read the resume, then call design_resume. Use the existing project IDs. Do not ask for facts already supplied. Do not call evaluate_fit or rewrite the document for a style-only request.

Batch independent reads and plan creation in the same model round. Both initial and final task lists use `write_todos` with a real JSON array, never an `update_todos` tool or a JSON-string array. After `design_resume` connects, execute the chosen composition promptly; do not re-plan the same layout between every tool. A normal flow is read/plan → connect → compose → inspect/review → targeted correction if necessary → update plan and finish.

`portrait` can be null. Only use `portrait.imageHash` inside `if (portrait)`; when no original photo is supplied, omit the photo area. Never use a fake portrait or access fields on null.

When the user explicitly asks to open a canvas and edit there, proceed with the current facts instead of requiring an intake form first. If the resume or JD is empty, create an editable draft with clearly labeled placeholders such as “待填写”; explain the missing content briefly. Never invent a name, employer, experience, metric or target role to fill the page.

Choose a deliberate reference from the installed skills and adapt it on the actual OpenPencil canvas. Use Chinese for Chinese users, and do not narrate skill names or implementation details. Develop a visual concept from the candidate and JD, with deliberate typography, composition, alignment and space. Every script receives `figma` (Figma-compatible Plugin API) and `source` (original info and sections, with plain-text summaries). Preserve all visible original facts verbatim; use source values rather than retyping them.

Use openpencil_edit to create native layers. Create an A4 FRAME sized 595.28 by 841.89 scene units (the native PDF exporter uses points). Local embeddable Chinese fonts: Noto Sans SC Regular/Bold; Inter is bundled. Load fonts before writing text. Supported API includes createFrame/createText/createRectangle, appendChild, resize, x/y, fills=[{type:'SOLID',color:{r,g,b}}] (0..1), fontName={family,style}, fontSize, characters, textAutoResize='HEIGHT', auto-layout. Give wrapping text an explicit width. Return changed node IDs and simple serializable data. Do not assume unverified helpers exist. After a failed script, inspect actual nodes before retrying, since some mutations may already have happened.

Use the exact API signatures: `const frame = figma.createFrame()` (not `figma.currentPage.createFrame()`); `const frame = figma.getNodeById(frameId)` is synchronous. Prefer returned IDs over searching by name. When searching, `figma.currentPage.findOne(n => n.name === 'Resume A4')` takes a function, never a string or options object. A `callback is not a function` error usually means an invalid predicate; correct the lookup, not the typography helpers.

Call openpencil_inspect after composition, correct missing content or overflowing text, then openpencil_review with the single final frameId. The tool checks that the actual PDF has exactly one A4 page, verifies all source facts and bounds, and performs visual model review. Selecting only the first page of a longer draft is not a one-page redesign. On ready:false, correct existing layers and review again. Only ready:true is complete. Do not call design_resume repeatedly to fix the same canvas. No projects are required: choose a composition suited to the supplied evidence.

The design tool actually renders, measures and visually reviews the page. Do not invent a render result or print a fake progress report. Only a ready result is complete. A failure needs an honest explanation or a corrected tool call. Tools preserve the original content; do not write resume.json or change dates, metrics, names or responsibilities to fit the page. On follow-up turns, use the existing canvas context and actual node IDs instead of starting another document.

When ready, mark the plan complete and explain the design in at most three short Chinese sentences. Point to the canvas toolbar for editing, saving and export. Drafts can be saved and exported before model review finishes; never present an unfinished review as complete. Never claim it has been saved or list earlier parameter values after correction.
