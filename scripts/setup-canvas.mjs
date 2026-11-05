// Recreate the exact upstream editor plus the native Resume Agent integration.
// Prepare in a temporary directory so an interrupted download is safe to retry.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const revision = '3a5e3fe989191f75f77c94c11bf290849b34407a';
const target = resolve(root, 'OpenPencil');
const marker = '.resume-agent-base';
if (existsSync(target)) {
  const stamp = resolve(target, marker);
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() !== revision)
    throw new Error('OpenPencil already exists. Move your existing checkout aside before setup.');
  console.log('The pinned canvas checkout is already prepared.');
} else {
  const temporary = mkdtempSync(resolve(root, '.canvas-setup-'));
  const git = (...args) => execFileSync('git', ['-C', temporary, ...args], {
    stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' }
  });
  try {
    git('init', '--quiet');
    git('remote', 'add', 'origin', 'https://github.com/open-pencil/open-pencil.git');
    git('fetch', '--quiet', '--depth=1', 'origin', revision);
    git('checkout', '--quiet', '--detach', revision);
    cpSync(resolve(root, 'canvas/overlay'), temporary, { recursive: true });
    writeFileSync(resolve(temporary, '.env.local'), 'VITE_OPENPENCIL_CLOUD=off\n', { flag: 'wx' });
    writeFileSync(resolve(temporary, marker), revision + '\n');
    renameSync(temporary, target);
    console.log('OpenPencil is ready in ./OpenPencil');
  } finally {
    // This path was created exclusively for this invocation.
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  }
}
