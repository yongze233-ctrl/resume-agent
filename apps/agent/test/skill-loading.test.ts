import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture } from './helpers.js';

test('the actual agent discovers skills with CRLF metadata and an empty tool list', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'resume-skill-line-endings-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  await mkdir(join(directory,'windows-skill'));
  const original='---\r\nname: windows-skill\r\ndescription: CRLF_SKILL_DISCOVERY_MARKER\r\nallowed-tools: []\r\n---\r\n# Test skill\r\n';
  await writeFile(join(directory,'windows-skill','SKILL.md'),original);
  await writeFile(join(directory,'AGENTS.md'),'Answer the user directly.');
  const f = await fixture(t,'memory',[],{AGENT_SKILLS_DIR:directory});
  await f.chat(f.body({agentMode:'ask'}));
  assert.match(JSON.stringify(f.fake.requests[0]?.messages),/CRLF_SKILL_DISCOVERY_MARKER/,'The framework must include the skill instead of silently skipping malformed metadata');
});
