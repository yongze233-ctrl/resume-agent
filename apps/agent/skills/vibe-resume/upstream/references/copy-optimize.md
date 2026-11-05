# Content Polish (`optimize` mode)

Dedicated **writing** pass. Layout, templates, and one-page QA stay in `SKILL.md`. Use this file when the user asks to 打磨 / 润色 / 优化内容 / 针对 JD / match keywords / rewrite bullets.

This is not a web editor. Select from `raw.data.yaml`, write one `resume.data.yaml`, show the selection, wait, then apply that resume YAML to a template.

## When to run

Run this pass when exporting a job-specific resume from raw, or when the user says 打磨 / 润色 / 针对 JD.

- Input: `raw.data.yaml` (and a JD or target role).
- Output: one `resume.data.yaml` for that job.
- Then apply `resume.data.yaml` to a template.

Do not polish inside HTML. Do not create `*.polished.data.yaml`.

排版、改模板可用日常编程模型。**润色正文**用写作向模型：Claude Fable 5 / Claude Opus 4.6–4.7（或 Opus 5）/ Kimi K3 / GLM-5.1–5.3-max / Qwen 3.8 Max。不要用 GPT-5.6 Terra / Luna，也不要用 GPT-5.5 默认 / Instant。其余不限定。

If raw is empty, finish collecting facts first.

## Hard gates (content)

These stack on top of the Content Preservation & Deletion Gate and the no-invention rule.

1. **No invented metrics.** Do not add percentages, counts, money, rankings, or "约 30%" guesses. If a number would help, **ask**. If the user does not know, use a verifiable substitute already in the facts: shipped / 已上线 / 评审通过 / 覆盖 N 个场景 / 试用人数 / 作品集链接. Never fill a hole with a plausible number.
2. **No invented employers, titles, dates, awards, tools, or skills.** A JD keyword the candidate did not use stays in `optimize.notes` as `missing-ask` or `missing-do-not-claim`. It does not enter `skills` or bullets.
3. **No silent deletion.** Reordering bullets and tightening syntax is allowed. Dropping a company, project, metric, or user-authored fact is a proposed removal — ask first.
4. **`jd` and `optimize` never print.** Same as `notes`. Do not render them in HTML.
5. **YAML before HTML.** Do not "polish" by rewriting sentences only inside `resume.html`. The polished file is the source of truth for apply.

## Files

| File | Meaning |
|------|---------|
| `raw.data.yaml` | 履历库. Keep adding. Never print. |
| `resume.data.yaml` | This job. Copied from raw, then polished. Apply this. |

Demo: `examples/raw.data.yaml` (has frontend / 社团 / 视觉, unused on the AI-product page) → `examples/demo.data.yaml` (the export).

A second job = a second resume.data.yaml. Same raw.

## Schema fields for this pass

Write these on the polished file (see `schema/resume.schema.json`):

- `target_role`: this application's title. When present, prefer it over `title` for summary / skill order. Do not print a second headline unless the user asks.
- `jd`: pasted job description, raw.
- `optimize.status`: `draft` | `polished` | `jd-matched`
- `optimize.source`: path of the draft YAML
- `optimize.notes`: keyword hits, questions to ask, weak-verb fixes. Private.

## Workflow

### 1. Snapshot the draft

Read the current YAML. If the user pasted a JD, store it in `jd` and set `target_role` from the posting title (or ask). Do not start HTML work.

### 2. JD coverage (only if a JD exists)

Build three lists in `optimize.notes` and show them in chat:

- **covered** — JD phrase already present in a real bullet or skill (same meaning, not necessarily the same word).
- **ask** — JD phrase the candidate might have, but it is not in the YAML. Ask one short question. Do not add it yet.
- **do-not-claim** — JD phrase with no evidence. Leave it out.

Do not invent a 0–100 match score. A three-column list is the product.

Weave **covered** phrases into existing bullets only where they truthfully describe the work (检索 / 评测 / PRD, not a tool they never used). Prefer the JD's own term when the user's fact already matches ("敏捷" → "Scrum" only if they actually used Scrum).

### 3. Rewrite in this order

1. `summary` — 2–4 short sentences aimed at `target_role` or `title`. Evidence from the YAML only.
2. Each `experience[].items[]` — keep `title`; rewrite `body`.
3. Each `projects[].bullets` — one tight line per bullet unless the user wrote a required two-line story.
4. `skills` — **reorder** groups and items toward the JD. Do not add a skill that is not already true. Do not drop a skill unless the user agrees (one-page later may propose cuts).

Education, contacts, dates, org names, GPA, honors stay unless the user asked to change them.

### 4. Line checklist (every bullet / body)

A line is done when most of these hold. Missing a metric is OK if you asked and the user has none.

- Starts with a specific verb, not 负责 / 参与 / 协助 / 具备 / 帮助 / 学习了 / Responsible for / Helped / Worked on.
- Has a scene or constraint (面对… / 针对… / 为解决…).
- Has a personal action and a method or artifact (PRD、原型、评测表、看板、链路).
- Has a result that is already in the facts, or a shipped/adopted/reviewed substitute.
- One to two lines. Cut repeated 负责/完成/进行.
- Recruiter Chinese (or the user's requested language). No slogan tone, no 赋能/闭环/抓手 unless the user talks that way.

Compact STAR (do not spell S/T/A/R as labels on the page):

`面对 [场景]，通过 [动作+方法] 交付 [产物]，结果 [已有事实]。`

English equivalent when the resume is English: Google X-Y-Z only if X and Y are already in the YAML — `Did [X] as measured by [Y] by [Z]`. If Y is unknown, stop at X + Z and ask.

### 5. Show before / after, then wait

Show the selected entry ids and the full `resume.data.yaml`. Raw stays untouched.

Wait for: paste-back, "apply", "就用打磨版", or an edit. Then go to Mandatory Workflow step 3 (copy official template) using the **accepted** YAML.

Also surface:

- `retained` / `compressed without fact loss` / `proposed removal` (existing ledger)
- the covered / ask / do-not-claim keyword lists
- any metric you still want the user to confirm

### 6. One-page is later

Polish may shorten text (good) or add JD wording (may grow). Density and cuts happen after apply + PDF export, under the existing one-page and preservation gates. Do not pre-delete facts "so it will fit".

## Weak verbs → ask, don't decorate

Replace empty verbs only when the rest of the line already names the real action.

| Avoid | Prefer only if true |
|-------|---------------------|
| 负责、参与、协助、跟进 | 设计、搭建、拆解、推动、交付、复盘 |
| 具备较强能力、学习能力强 | delete; put a tool or result instead |
| 负责部分事项、相关工作 | name the artifact |
| Helped with, Worked on | Led / Built / Shipped — only if ownership is real |

If ownership is unclear, ask 「独立做的还是协作？你交付了哪一份文档/功能？」 rather than upgrading 参与 → 主导.

## Quantification without fiction

Look for numbers already in the source (时间、人数、Case 数、通过率、时长). Keep them exact: `72% → 86%`, `4h → 40min`, `300+`, `20+`, `30 人`.

If a line has no number:

1. Ask for one concrete figure (before/after, volume, time saved, users).
2. If none, keep a qualitative result that is still checkable in an interview.
3. Never write `约 30%` / `~40%` / `$2M` from a competitor example.

## Example prompts (give these to the user if they are stuck)

```text
先打磨这份 resume.data.yaml，不要套模板。给我 before/after，数字不够就问我。
```

```text
针对下面 JD 优化 YAML：紧句、强动词、STAR；不准编指标或技能。打磨完先给 YAML。
```

```text
只改「智能检索助手」这一条，按 JD 把检索/引用/评测写进去，事实不动。
```

```text
从 examples/raw.data.yaml 按这份 JD 导出 resume.data.yaml，先列出选了哪些 id。
```

## What this skill does not do

- Live web editor, MCP server, phrase bank, cover letter, LinkedIn, interview pack, auto-apply.
- Fake ATS / 匹配度 scores.
- Copying wording from other resume skills or commercial templates.
- Editing `assets/templates/` during polish.
