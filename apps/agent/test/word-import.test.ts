import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {extractDocument} from '../src/document/extract.js';
import {documentFormat} from '../src/document/input.js';
import {sniffAttachment} from '../src/document/attachment-type.js';
import {AttachmentStore} from '../src/attachments/store.js';
import {createAttachmentContext} from '../src/attachments/context.js';
import {fixture} from './helpers.js';

for(const format of ['doc','docx'] as const) {
  test(`real ${format} resumes preserve Chinese facts through upload and attachment reading`,async(t)=>{
    const bytes=await readFile(new URL(`./fixtures/word-resume.${format}`,import.meta.url));
    assert.equal(sniffAttachment(bytes),format);
    assert.equal(documentFormat('application/octet-stream',`简历.${format}`),format);
    const extracted=await extractDocument({bytes,format},new AbortController().signal);
    assert.equal(extracted.kind,'text');if(extracted.kind!=='text')return;
    for(const fact of ['陈思远','AI 产品经理','20','72%','86%','华东理工大学'])assert.ok(extracted.text.includes(fact),fact);
    const f=await fixture(t);const form=new FormData();
    form.set('file',new File([bytes],`陈思远.${format}`,{type:format==='doc'?'application/msword':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    const response=await fetch(`${f.origin}/api/uploads/attachment`,{method:'POST',body:form});assert.equal(response.status,200);
    const ref=(await response.json() as {data:{key:string;filename:string}}).data;
    const context=await createAttachmentContext(new AttachmentStore(f.settings),[{key:ref.key,name:ref.filename}],[{key:ref.key,name:ref.filename}],new AbortController().signal);
    assert.match(JSON.stringify(await context.read({key:ref.key,page:1,offset:0,limit:8000})),/陈思远/);
  });
}
test('malformed Word containers fail explicitly instead of becoming empty resumes',async()=>{
  await assert.rejects(extractDocument({bytes:Buffer.from('not a Word document'),format:'doc'},new AbortController().signal));
  const zip=Buffer.from('504b0304','hex');await assert.rejects(extractDocument({bytes:zip,format:'docx'},new AbortController().signal));
});
