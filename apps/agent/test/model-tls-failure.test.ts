import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const exec = promisify(execFile);
const transportUrl = new URL('../src/model/transport.ts', import.meta.url).href;

// Run in a child: a TLS socket's unhandled error terminates Node, bypassing
// assert.rejects and the request-level catch. This must not kill the service.
async function probe(script: string) {
  return exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `import assert from 'node:assert/strict';
     import {createModelTransport} from ${JSON.stringify(transportUrl)};
     ${script}`], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    timeout: 20_000,
    windowsHide: true,
  });
}

test('unreachable TLS addresses reject the request without crashing Node', async () => {
  const { stdout, stderr } = await probe(`
    const t=await createModelTransport('https://model.example.com',true,
      AbortSignal.timeout(2000),async()=>[{address:'2001:db8::1',family:6}]);
    try { await assert.rejects(()=>t.fetch('https://model.example.com')); }
    finally { await t.close(); }
    await new Promise(r=>setTimeout(r,100));
    console.log('PROCESS_SURVIVED');
  `);
  assert.match(stdout, /PROCESS_SURVIVED/);
  assert.doesNotMatch(stderr, /Unhandled 'error' event/);
});

test('TLS falls back to validated IPv4 and socket failures remain request-scoped', async () => {
  const { stdout, stderr } = await probe(`
    const {createServer}=await import('node:net');let connected=0,resolutions=0;
    const server=createServer(socket=>{connected++;socket.destroy();});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const url='https://model.example.com:'+server.address().port;
    const t=await createModelTransport(url,true,AbortSignal.timeout(5000),async()=>{
      resolutions++;return [{address:'2001:db8::1',family:6},{address:'127.0.0.1',family:4}];
    });
    try { for(let i=0;i<3;i++) await assert.rejects(()=>t.fetch(url)); }
    finally { await t.close();await new Promise(r=>server.close(r)); }
    await new Promise(r=>setTimeout(r,100));
    assert.equal(connected,3);assert.equal(resolutions,1);
    console.log('FALLBACK_SURVIVED');
  `);
  assert.match(stdout, /FALLBACK_SURVIVED/);
  assert.doesNotMatch(stderr, /Unhandled 'error' event/);
});
