import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentEntryStore } from './useAgentEntryStore';
import type { StagedAttachment } from '../app/dashboard/edit/_components/ai/lib/attachments';

test('a first-message handoff is isolated by document and consumed once across rerenders', () => {
  const store = createAgentEntryStore();
  const first = { text: '请按品牌内容运营岗位修改我的简历。' };
  const second = { text: '这是一份独立对话。' };
  store.getState().queue('first', first);
  store.getState().queue('second', second);
  assert.equal(store.getState().take('unrelated'), undefined);
  assert.equal(store.getState().take('first'), first);
  assert.equal(store.getState().take('first'), undefined);
  assert.equal(store.getState().take('second'), second);
  assert.deepEqual(store.getState().pending, {});
});

test('first navigation retains the original staged file and backend reference', () => {
  const store = createAgentEntryStore();
  const attachment: StagedAttachment = {
    id: 'first-file',
    file: new File(['example'], 'resume.png', { type: 'image/png' }),
    kind: 'image',
    status: 'ready',
    stored: { key: 'attachment-example', filename: 'resume.png', contentType: 'image/png' },
  };
  store.getState().queue('resume', { text: '请参考这份原稿。', attachments: [attachment] });
  const entry = store.getState().take('resume');
  assert.equal(entry?.attachments?.[0].file, attachment.file);
  assert.deepEqual(entry?.attachments?.[0].stored, attachment.stored);
  assert.equal(store.getState().take('resume'), undefined);
});
