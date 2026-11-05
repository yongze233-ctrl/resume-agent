import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMarkdownSource } from './markdownSource';

const native =
  '<tool_call>\n<function=openpencil_review>\n<parameter=frameId>780950035:5</parameter>\n</function>\n</tool_call>';
const notice = '模型返回了异常的工具调用格式，这一步未执行，请重试。';

test('historical Agnes calls are not presented as successful review or leaked as XML', () => {
  assert.equal(
    normalizeMarkdownSource('正在审查。\n\n' + native, notice),
    '正在审查。\n\n' + notice,
  );
  assert.equal(normalizeMarkdownSource(native, notice), notice);
  assert.equal(
    normalizeMarkdownSource(native + '\n后面的文字。', notice),
    notice + '\n后面的文字。',
  );
  assert.equal(normalizeMarkdownSource(native.slice(0, -15), notice), notice);
  assert.equal(
    normalizeMarkdownSource('正文。\n' + native.slice(0, -15)),
    '正文。',
  );
});

test('explicit protocol examples are preserved in fenced, inline, indented and quoted Markdown', () => {
  for (const example of [
    '```xml\n' + native + '\n```',
    '~~~xml\n' + native + '\n~~~',
    '`' + native.replaceAll('\n', '') + '`',
    '    ' + native.replaceAll('\n', ''),
    '> ' + native.replaceAll('\n', ''),
  ])
    assert.equal(normalizeMarkdownSource(example, notice), example);
  assert.equal(
    normalizeMarkdownSource('```xml\n' + native + '\n```\n' + native, notice),
    '```xml\n' + native + '\n```\n' + notice,
  );
});
