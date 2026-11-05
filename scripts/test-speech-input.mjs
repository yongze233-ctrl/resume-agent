/** Real composer UI with controlled browser recognition events. No microphone or model is used. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const repo = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(resolve(repo, 'apps/agent/package.json'));
const { chromium } = require('playwright');
const output = resolve(repo, '../evaluation/speech-input-fix');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1280, height: 960 },
});
await context.addInitScript(() => {
  const count = (name) =>
    sessionStorage.setItem(
      name,
      String(Number(sessionStorage.getItem(name) ?? 0) + 1),
    );
  class Recognition {
    onstart = null;
    onresult = null;
    onerror = null;
    onend = null;
    start() {
      count('speech-starts');
      const mode = sessionStorage.getItem('speech-scenario') ?? 'not-allowed';
      if (mode === 'throw') throw new Error('Recognition start failed');
      if (mode === 'hang') return;
      setTimeout(
        () => {
          if (mode === 'end') {
            this.onend?.();
            return;
          }
          if (mode === 'success' || mode === 'slow') {
            this.onstart?.();
            if (mode === 'success')
              setTimeout(() => {
                const event = {
                  resultIndex: 0,
                  results: [
                    {
                      isFinal: true,
                      0: { transcript: '请把标题放大一点' },
                      length: 1,
                    },
                  ],
                };
                this.onresult?.(event);
                this.onresult?.(event);
              }, 100);
            return;
          }
          this.onerror?.({ error: mode });
          this.onend?.();
        },
        mode === 'slow' ? 600 : 80,
      );
    }
    stop() {
      count('speech-stops');
      setTimeout(() => {
        if (sessionStorage.getItem('speech-scenario') === 'success')
          this.onresult?.({
            resultIndex: 1,
            results: [
              {
                isFinal: true,
                0: { transcript: '请把标题放大一点' },
                length: 1,
              },
              { isFinal: true, 0: { transcript: '谢谢' }, length: 1 },
            ],
          });
        this.onend?.();
      }, 30);
    }
    abort() {
      count('speech-aborts');
      this.onend?.();
    }
  }
  Object.defineProperty(window, 'SpeechRecognition', {
    value: Recognition,
    configurable: true,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: Recognition,
    configurable: true,
  });
});
const page = await context.newPage();
page.setDefaultTimeout(16000);
const browserErrors = [];
let chatRequests = 0;
page.on('pageerror', (error) => browserErrors.push(error.message));
await context.route('**/api/chat-agent', (route) => {
  chatRequests++;
  return route.abort();
});
try {
  await page.goto('http://127.0.0.1:3000/dashboard');
  const mic = () => page.getByRole('button', { name: '语音输入', exact: true });
  await mic().waitFor();
  const input = page.locator('textarea');
  const notice = page
    .getByRole('alert')
    .filter({ has: page.getByRole('button', { name: '关闭语音提示' }) });
  await input.fill('已有草稿');
  const scenarios = [
    ['not-allowed', '语音输入被浏览器阻止'],
    ['service-not-allowed', '当前浏览器未开放语音识别服务'],
    ['network', '语音识别服务连接失败'],
    ['audio-capture', '未检测到可用麦克风'],
    ['no-speech', '没有识别到语音'],
    ['throw', '语音识别启动失败'],
    ['end', '没有识别到语音'],
  ];
  for (const [mode, message] of scenarios) {
    await page.evaluate(
      (mode) => sessionStorage.setItem('speech-scenario', mode),
      mode,
    );
    const before = await page.evaluate(() =>
      Number(sessionStorage.getItem('speech-starts') ?? 0),
    );
    await mic().click();
    await notice.filter({ hasText: message }).waitFor();
    assert.equal(
      await mic().isVisible(),
      true,
      `${mode} must not remove the button`,
    );
    assert.equal(await input.inputValue(), '已有草稿');
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() =>
        Number(sessionStorage.getItem('speech-starts')),
      ),
      before + 1,
      'failed attempts do not auto-restart',
    );
  }
  await page.screenshot({ path: resolve(output, 'failure-explained.png') });
  // A user may retry after changing browser permissions; no remount or refresh is required.
  await page.evaluate(() =>
    sessionStorage.setItem('speech-scenario', 'success'),
  );
  await mic().click();
  const stop = page.getByRole('button', { name: '停止录音', exact: true });
  await stop.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea')?.value === '已有草稿 请把标题放大一点',
  );
  assert.equal(await notice.count(), 0);
  await stop.click();
  await page.waitForFunction(
    () =>
      document.querySelector('textarea')?.value ===
      '已有草稿 请把标题放大一点 谢谢',
  );
  await mic().waitFor();
  assert.equal(
    chatRequests,
    0,
    'dictation never submits a message automatically',
  );
  await page.screenshot({ path: resolve(output, 'retry-dictation.png') });
  await page.evaluate(() => sessionStorage.setItem('speech-scenario', 'slow'));
  await mic().click();
  await stop.click();
  await page.waitForTimeout(700);
  assert.equal(await mic().isVisible(), true);
  assert.equal(await notice.count(), 0, 'cancelling startup is not an error');
  await page.evaluate(() => sessionStorage.setItem('speech-scenario', 'hang'));
  await mic().click();
  await notice.filter({ hasText: '语音识别启动失败' }).waitFor();
  assert.equal(await mic().isVisible(), true);
  await page.evaluate(() => {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  await mic().click();
  await notice.filter({ hasText: '当前浏览器不支持语音输入' }).waitFor();
  assert.equal(await mic().isVisible(), true);
  assert.deepEqual(browserErrors, []);
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        passed: true,
        realComposer: true,
        simulatedRecognition: true,
        hardwareMicrophoneTested: false,
        failureCases: scenarios
          .map(([mode]) => mode)
          .concat(['hang', 'unsupported']),
        retryAfterDenial: true,
        draftsPreserved: true,
        noDuplicateTranscript: true,
        finalTextOnStop: true,
        startupCancellation: true,
        noAutomaticSubmit: true,
        browserErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Passed: real composer keeps its microphone, explains nine failures, retries after denial, preserves drafts and final text, and never sends automatically. Recognition events are simulated.',
  );
} catch (error) {
  await page
    .screenshot({ path: resolve(output, 'failure.png') })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
