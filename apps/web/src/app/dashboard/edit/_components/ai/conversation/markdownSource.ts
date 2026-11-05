/**
 * 丢掉只有 Markdown 列表标记、还没有正文的行。
 *
 * 流式响应经常会把 `- ` 和后面的文字拆成两个 chunk。ReactMarkdown 若先看到前半个
 * chunk，会立刻画出一个空圆点；连续几个前导标记就会留下空列表项，最后的写入光标还会
 * 被塞进空 `<li>`。空列表项本身没有可读信息，完成态同样不该保留。
 */
export function normalizeMarkdownSource(
  source: string,
  nativeToolFallback = '',
): string {
  // Older saved turns may contain provider-native tool output. Rendering it does not
  // execute a tool; show an honest error instead of a fake plan or raw protocol.
  if (source.trimStart().startsWith('<｜DSML｜')) {
    const closed =
      /^\s*<｜DSML｜\s*(calls|function_calls)\s*>[\s\S]*?<\/｜DSML｜\s*\1\s*>\s*/.exec(
        source,
      );
    source = closed
      ? source.slice(closed[0].length).trim() || nativeToolFallback
      : nativeToolFallback;
  }
  // Historical Agnes turns may have prose before a native call. Never execute
  // saved text on render. Preserve prose and fenced/quoted examples, and make
  // the unexecuted step explicit instead of silently hiding it.
  let fence: { character: string; size: number } | undefined;
  let inCall = false;
  const lines: string[] = [];
  for (const line of source.split('\n')) {
    if (!inCall) {
      const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (delimiter) {
        if (!fence)
          fence = { character: delimiter[1][0], size: delimiter[1].length };
        else if (
          delimiter[1][0] === fence.character &&
          delimiter[1].length >= fence.size &&
          !delimiter[2].trim()
        )
          fence = undefined;
        lines.push(line);
        continue;
      }
      if (fence || !/^ {0,3}<tool_call>/.test(line)) {
        lines.push(line);
        continue;
      }
      inCall = true;
      if (nativeToolFallback) lines.push(nativeToolFallback);
    }
    const close = line.lastIndexOf('</tool_call>');
    if (close >= 0) {
      inCall = false;
      const suffix = line.slice(close + '</tool_call>'.length).trim();
      if (suffix) lines.push(suffix);
    }
  }
  source = lines.join('\n');
  const withoutEmptyItems = source
    .split('\n')
    .filter((line) => {
      const item = /^\s*(?:[-+*]|\d+[.)])(?:\s+(.*))?\s*$/.exec(line);
      if (!item) return true;
      const body = (item[1] ?? '').replace(/\s/g, '');
      // chunk 可能停在 `- **` / `- __` / `- [ ]`：它们解析后同样只有 marker，
      // 等下一块正文到达再显示整行，避免半成品闪一下。
      return body !== '' && !/^(?:[*_~`]+|\[[xX]?\])+$/.test(body);
    })
    .join('\n');

  // 去掉末尾空行，让流式光标紧跟最后一个有意义的 token，而不是单独掉到下一行。
  return withoutEmptyItems.replace(/\n(?:[ \t]*\n)*[ \t]*$/, '');
}
