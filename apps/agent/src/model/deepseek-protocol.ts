import { randomUUID } from 'node:crypto';
import { AgentError } from '../contracts/errors.js';

const invalid = () => new AgentError(502, 'upstream_unavailable', 'model_tool_protocol_invalid');
const decode = (text: string) => text.replace(/&(lt|gt|quot|apos|amp);/g, (_, entity: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[entity]!);

/** Only provider output is parsed, never user messages, tool results or quoted examples. */
export function parseDeepSeekCalls(text: string, allowed: ReadonlySet<string>) {
  const outer = /^<｜DSML｜\s*(calls|function_calls)\s*>([\s\S]*)<\/｜DSML｜\s*\1\s*>$/.exec(text.trim());
  if (!outer || text.length > 1_000_000) throw invalid();
  let rest = outer[2].trim();
  const calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
  while (rest) {
    const invoke = /^<｜DSML｜\s*invoke\s+name="([\w.-]+)"\s*>([\s\S]*?)<\/｜DSML｜\s*invoke\s*>/.exec(rest);
    if (!invoke || !allowed.has(invoke[1]) || calls.length >= 16) throw invalid();
    let parameters = invoke[2].trim();
    const args: Record<string, unknown> = Object.create(null);
    while (parameters) {
      const parameter = /^<｜DSML｜\s*parameter\s+name="([\w.-]+)"\s+string="(true|false)"\s*>([\s\S]*?)<\/｜DSML｜\s*parameter\s*>/.exec(parameters);
      if (!parameter || ['__proto__', 'prototype', 'constructor'].includes(parameter[1]) || Object.hasOwn(args, parameter[1])) throw invalid();
      try {
        args[parameter[1]] = parameter[2] === 'true' ? decode(parameter[3]) : JSON.parse(parameter[3]);
      } catch { throw invalid(); }
      parameters = parameters.slice(parameter[0].length).trim();
    }
    calls.push({ id: `call_dsml_${randomUUID().replaceAll('-', '')}`, type: 'function', function: { name: invoke[1], arguments: JSON.stringify(args) } });
    rest = rest.slice(invoke[0].length).trim();
  }
  if (!calls.length) throw invalid();
  return calls;
}
