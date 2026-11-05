#!/usr/bin/env node
/**
 * Fail if an output resume.html is missing the official template fingerprint.
 *
 *   node scripts/check-template-id.mjs --html output/basic-a4/resume.html --template basic-a4
 *
 * A pass means the HTML still contains data-template="<id>" from a bundled
 * template. Agents that invent a layout from scratch will fail this check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWLIST = [
  "basic-a4",
  "editorial",
  "sidebar-compact",
  "timeline-grid",
  "minimal-prose",
  "mono-raw",
  "code-poetry",
  "swiss-neue",
  "bauhaus",
  "corporate-classic",
  "gov-red",
  "folio-ledger",
];

function usage(code) {
  const msg = `Usage: node scripts/check-template-id.mjs --html <resume.html> --template <id>

Allowlist: ${ALLOWLIST.join(", ")}
`;
  process.stderr.write(msg);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { html: null, template: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") usage(0);
    if (arg === "--html") {
      out.html = argv[++i];
      continue;
    }
    if (arg === "--template") {
      out.template = argv[++i];
      continue;
    }
    if (!arg.startsWith("-") && !out.html) {
      out.html = arg;
      continue;
    }
    process.stderr.write(`Unknown argument: ${arg}\n`);
    usage(2);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.html || !args.template) usage(2);

  const template = String(args.template).trim();
  if (!ALLOWLIST.includes(template)) {
    process.stderr.write(
      `FAIL: template "${template}" is not in the 12-id allowlist.\nAllowlist: ${ALLOWLIST.join(", ")}\n`,
    );
    process.exit(1);
  }

  const htmlPath = path.resolve(args.html);
  if (!fs.existsSync(htmlPath)) {
    process.stderr.write(`FAIL: HTML not found: ${htmlPath}\n`);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const matches = [...html.matchAll(/data-template\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  if (matches.length === 0) {
    process.stderr.write(
      `FAIL: ${htmlPath} has no data-template fingerprint.\nCopy assets/templates/${template}/ and edit that copy. Do not write a new HTML document.\n`,
    );
    process.exit(1);
  }

  const unique = [...new Set(matches)];
  if (unique.some((id) => id !== template)) {
    process.stderr.write(
      `FAIL: expected data-template="${template}", found ${unique.map((id) => JSON.stringify(id)).join(", ")}.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`OK: ${path.basename(htmlPath)} uses data-template="${template}"\n`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
