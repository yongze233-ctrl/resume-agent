import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  documentImage,
  selectDocumentPortrait,
} from '../src/document/images.js';
import { extractDocument } from '../src/document/extract.js';
import { AttachmentStore } from '../src/attachments/store.js';
import { createAttachmentContext } from '../src/attachments/context.js';
import { fixture, frames, resume } from './helpers.js';

for (const [format, filename] of [
  ['docx', 'word-resume-with-photo.docx'],
  ['pdf', 'resume-with-photo.pdf'],
] as const) {
  test(`${format}: readable text and the original embedded photo survive upload independently`, async (t) => {
    const bytes = await readFile(
      new URL(`./fixtures/${filename}`, import.meta.url),
    );
    const source = await extractDocument(
      { bytes, format },
      new AbortController().signal,
    );
    assert.equal(source.kind, 'text');
    const selected = selectDocumentPortrait(source.embeddedImages);
    assert.equal(selected.status, 'available');
    assert.ok(selected.image);
    assert.equal(selected.image?.width, 100);
    assert.equal(selected.image.height, 140);
    const f = await fixture(t);
    const store = new AttachmentStore(f.settings);
    const stored = await store.save(
      { bytes, format },
      filename,
      new AbortController().signal,
    );
    const result = await f.post('/api/uploads/attachment/portrait', {
      key: stored.key,
    });
    assert.equal(result.status, 200);
    assert.match(result.headers.get('cache-control') ?? '', /private/);
    const data = (await result.json()).data;
    assert.equal(data.candidates[0].dataUrl, selected.image.dataUrl);
    const context = await createAttachmentContext(
      store,
      [{ key: stored.key, name: filename }],
      [],
      new AbortController().signal,
    );
    assert.equal((await context.portrait()).image?.id, selected.image.id);
    const text = await context.read({
      key: stored.key,
      page: 1,
      offset: 0,
      limit: 8000,
    });
    assert.ok(
      !JSON.stringify(text).includes('base64,'),
      'binary image data must not be put in text tool results',
    );
    const otherAccount = new AttachmentStore(f.settings, 'other-test-account');
    await assert.rejects(
      otherAccount.read(stored.key, new AbortController().signal),
      /attachment_not_found/,
    );
    assert.equal(
      (
        await f.post('/api/uploads/attachment/portrait', {
          key: stored.key,
          path: '/etc/passwd',
        })
      ).status,
      400,
    );
  });
}

test('image selection rejects tiny or excessive rasters, duplicates and ambiguous photo choices', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(100, 16);
  png.writeUInt32BE(140, 20);
  const image = documentImage(png);
  assert.ok(image);
  assert.equal(selectDocumentPortrait([image, image]).status, 'available');
  assert.equal(
    selectDocumentPortrait([image, { ...image, id: 'another-photo' }]).status,
    'ambiguous',
  );
  png.writeUInt32BE(20, 16);
  assert.equal(documentImage(png), undefined);
  png.writeUInt32BE(7000, 16);
  assert.equal(documentImage(png), undefined);
  assert.equal(documentImage(Buffer.from('not an image')), undefined);
});

test('a new document without a photo never inherits a different earlier document photo', async (t) => {
  const f = await fixture(t),
    store = new AttachmentStore(f.settings),
    signal = new AbortController().signal;
  const original = await store.save(
    {
      format: 'docx',
      bytes: await readFile(
        new URL('./fixtures/word-resume-with-photo.docx', import.meta.url),
      ),
    },
    'old-resume.docx',
    signal,
  );
  const next = await store.save(
    {
      format: 'docx',
      bytes: await readFile(
        new URL('./fixtures/word-resume.docx', import.meta.url),
      ),
    },
    'new-resume.docx',
    signal,
  );
  const context = await createAttachmentContext(
    store,
    [
      { key: original.key, name: original.filename },
      { key: next.key, name: next.filename },
    ],
    [],
    signal,
  );
  assert.equal((await context.portrait()).status, 'none');
});

test('direct document import preserves the embedded photo and ignores a model-invented avatar URL', async (t) => {
  const f = await fixture(t, 'memory', [
    {
      text: JSON.stringify({
        ...resume,
        info: { ...resume.info, avatar: 'https://invented.example/avatar.jpg' },
      }),
    },
  ]);
  const bytes = await readFile(
    new URL('./fixtures/word-resume-with-photo.docx', import.meta.url),
  );
  const source = await extractDocument(
    { format: 'docx', bytes },
    new AbortController().signal,
  );
  const image = selectDocumentPortrait(source.embeddedImages).image;
  assert.ok(image);
  const form = new FormData();
  form.set(
    'file',
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    'resume.docx',
  );
  form.set(
    'config',
    JSON.stringify({
      apiKey: 'example-test-key',
      baseUrl: f.fake.baseUrl,
      modelName: 'example-model',
    }),
  );
  const response = await fetch(`${f.origin}/api/pdf/parse`, {
    method: 'POST',
    body: form,
  });
  assert.equal(response.status, 200);
  const update = frames(await response.text()).find(
    (event) => event.type === 'resume_update',
  );
  assert.ok(update?.type === 'resume_update');
  assert.equal(
    (update.payload.resume.info as { avatar: string }).avatar,
    image.dataUrl,
  );
  assert.ok(
    !JSON.stringify(f.fake.requests).includes('data:image'),
    'embedded photo bytes must not become model text',
  );
});
