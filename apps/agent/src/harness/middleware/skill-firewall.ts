import { createMiddleware } from 'langchain';
import { ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { toolPath } from '../workspace/files.js';
import { contentText, denied } from './common.js';
export const NAME = 'SkillFirewall';
const common = new Set([
  'read_file',
  'ls',
  'glob',
  'grep',
  'write_todos',
  'read_attachment',
]);
function designWasReviewed(messages: BaseMessage[]): boolean {
  let ready = false;
  for (const message of messages) {
    if (message.getType() === 'human') ready = false;
    if (message.getType() !== 'tool' || (message as ToolMessage).status === 'error') continue;
    if (message.name === 'design_resume' || message.name === 'openpencil_edit') ready = false;
    if (message.name === 'openpencil_review') {
      try { ready = JSON.parse(contentText(message.content)).ready === true; }
      catch { ready = false; }
    }
  }
  return ready;
}
export function createSkillFirewall(
  allowlists: Map<string, { allowedTools: string[] }>,
  initialSkill?: string,
) {
  let active = initialSkill;
  const designTask = initialSkill === 'resume-design';
  return createMiddleware({
    name: NAME,
    wrapToolCall: async (request, handler) => {
      const name = request.toolCall.name;
      const path = toolPath(request.toolCall.args);
      const skill =
        name === 'read_file' && path
          ? /^\/skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1]
          : undefined;
      // Selecting a new skill replaces the active policy. Read-only skills cannot
      // gain write access by retaining the union of earlier loaded skills.
      // An explicit design task remains a design task while reading references
      // or resuming forms. Do not silently switch it into JSON-only creation.
      if (skill && allowlists.has(skill) && !designTask) active = skill;
      const todos = request.toolCall.args.todos;
      if (active === 'resume-design' && name === 'write_todos' && Array.isArray(todos) && todos.length > 0
        && todos.every((todo) => todo && typeof todo === 'object' && todo.status === 'completed')
        && !designWasReviewed(request.state.messages)) {
        return denied(request.toolCall, 'The requested canvas design has not passed review. Keep composition and review pending until openpencil_review returns ready:true for the current design. Continue with design_resume/openpencil_edit/openpencil_review; if blocked, keep the unfinished steps pending and explain the blocker. A JSON draft alone is not the requested deliverable.');
      }
      if (
        active &&
        !common.has(name) &&
        !allowlists.get(active)?.allowedTools.includes(name)
      )
        return denied(
          request.toolCall,
          `Skill ${active} does not permit ${name}. Continue within its allowed-tools or load the skill appropriate to the user's new request.`,
        );
      const result = await handler(request);
      if (designTask && skill && skill !== initialSkill && ToolMessage.isInstance(result)) {
        result.content = `${contentText(result.content)}\nReference only: the active task is still resume-design. Deliver the native canvas; do not replace it with a JSON-only proposal.`;
      }
      return result;
    },
  });
}
