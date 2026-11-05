import assert from 'node:assert/strict';
import test from 'node:test';

// Test the installed patched dependency used by both browser and PDF worker.
const { magicPdfHyphenationCallback: split } = await import(new URL('./pdf/hyphenation.js', import.meta.resolve('@magic-resume-kit/resume-templates/core')).href);

test('CJK break opportunities retain original text and obey punctuation boundaries', () => {
  const text = '负责公众号和小红书的日常内容，写文案、和设计同事沟通。保留“协作（非主导）”边界。';
  const parts = (split(text) as string[]).filter(Boolean);
  assert.equal(parts.join(''), text);
  assert.ok(parts.length > 5);
  for (const part of parts) {
    assert.doesNotMatch(part, /^[、。，；：？！）》】”’]/u);
    assert.doesNotMatch(part, /[（《【“‘]$/u);
  }
  assert.deepEqual(split('short-word'), ['short-word']);
  assert.deepEqual(split(' '), [' ']);
});
