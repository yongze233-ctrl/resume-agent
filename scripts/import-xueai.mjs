/** Import an authorized, pinned XueAI checkout as data; never evaluate upstream JavaScript. */
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { bundleLessons } from './lib/xueai-bundle.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(resolve(root, 'apps/web/package.json'));
const ts = require('typescript');
const args = process.argv.slice(2);
const argument = (key) => args[args.indexOf(key) + 1];
if (!args.includes('--source') || !args.includes('--skills'))
  throw new Error('Use --source <learn-ai checkout> --skills <skills-map.js>');
const source = await realpath(argument('--source'));
const skillsPath = await realpath(argument('--skills'));
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const upstream = 'https://github.com/itshen/learn-ai';

function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property))
          throw new Error('Only literal properties are accepted');
        return [property.name.text, literal(property.initializer)];
      }),
    );
  throw new Error(
    'Upstream data contains an executable expression; review before importing',
  );
}
async function assignment(file, target) {
  const text = await readFile(file, 'utf8');
  const ast = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  for (const statement of ast.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isBinaryExpression(statement.expression)
    )
      continue;
    if (statement.expression.left.getText(ast) === target)
      return literal(statement.expression.right);
  }
  throw new Error(`Missing ${target} in ${file}`);
}

const course = await assignment(
  join(source, 'slides/course-data.js'),
  'window.COURSE',
);
const lessons = course.parts.flatMap((part) =>
  part.topics.flatMap((topic) =>
    topic.lessons.map((lesson) => ({
      id: lesson.file.replace(/\.html$/, ''),
      file: lesson.file,
      title: lesson.title,
      tag: lesson.tag ?? '知识点',
      part: part.title,
      topic: topic.title,
      url: `https://xueai.miyang.cn/slides/learn.html#${encodeURIComponent(lesson.file)}`,
    })),
  ),
);
const known = new Set(lessons.map((lesson) => lesson.file));
const abilities = (await assignment(skillsPath, 'window.JD_SKILLS')).map(
  (ability) => ({
    ...ability,
    lessons: ability.lessons.filter((file) => known.has(file)),
  }),
);
const questions = [];
for (let part = 1; part <= 7; part++) {
  const file = join(source, `slides/exam-data-${part}.js`);
  const bank = await assignment(file, 'window.EXAM_BANK');
  const topics = await assignment(file, 'window.EXAM_TOPICS_PART');
  bank.forEach((question, index) =>
    questions.push({
      id: `xueai-${part}-${index + 1}`,
      part,
      type: question.type,
      question: question.q,
      options: question.opts ?? ['正确', '错误'],
      answers: (Array.isArray(question.ans)
        ? question.ans
        : [question.ans]
      ).map((answer) =>
        typeof answer === 'boolean' ? (answer ? 0 : 1) : answer,
      ),
      explanation: question.exp,
      lessonFile: topics[question.g]?.file ?? null,
      topic: topics[question.g]?.name ?? '',
    }),
  );
}

// Import the entire pinned catalog, with local interactions and all referenced assets.
const embedded = lessons.map((lesson) => lesson.file);
const publicDir = resolve(root, 'apps/web/public/learning/xueai');
await mkdir(publicDir, { recursive: true });
const bundled = await bundleLessons({ source, lessons, output: publicDir });

// Extract only string arrays joined by a literal separator; never evaluate upstream JS.
const skillSource = await readFile(
  join(source, 'slides/skill-data.js'),
  'utf8',
);
const skillAst = ts.createSourceFile(
  'skill-data.js',
  skillSource,
  ts.ScriptTarget.Latest,
  true,
);
const skillTexts = {};
let skillMeta = {},
  skillRegistry = {};
function visitSkills(node) {
  if (
    ts.isBinaryExpression(node) &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.expression.getText(skillAst) === 'SKILLS'
  ) {
    const value = node.right;
    if (
      !ts.isCallExpression(value) ||
      !ts.isPropertyAccessExpression(value.expression) ||
      value.expression.name.text !== 'join' ||
      !ts.isArrayLiteralExpression(value.expression.expression)
    )
      throw new Error('Review nonliteral skill data');
    skillTexts[node.left.name.text] = literal(value.expression.expression).join(
      value.arguments.length ? literal(value.arguments[0]) : ',',
    );
  }
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    ['META', 'REG'].includes(node.name.getText(skillAst))
  ) {
    const value = literal(node.initializer);
    if (node.name.getText(skillAst) === 'META') skillMeta = value;
    else skillRegistry = value;
  }
  ts.forEachChild(node, visitSkills);
}
visitSkills(skillAst);
const skills = Object.entries(skillTexts).map(([id, text]) => ({
  id,
  text,
  title: skillMeta[id]?.cap ?? id,
  description: skillMeta[id]?.sub ?? '',
  lessonIds: Object.entries(skillRegistry)
    .filter(
      ([, value]) => (typeof value === 'string' ? value : value.skill) === id,
    )
    .map(([key]) => key)
    .filter((key) => known.has(`${key}.html`)),
}));
const manifest = {
  name: '小山学堂',
  author: '洛小山 / 米羊科技',
  upstream,
  commit,
  license: 'AGPL-3.0',
  importedAt: new Date().toISOString(),
  catalogSource: `slides/course-data.js@${commit}`,
  mappingSource: 'https://xueai.miyang.cn/jd/skills-map.js',
  mappingSha256: createHash('sha256')
    .update(await readFile(skillsPath))
    .digest('hex'),
  counts: {
    lessons: lessons.length,
    abilities: abilities.length,
    questions: questions.length,
    embeddedLessons: embedded.length,
    skills: skills.length,
    localAssets: bundled.assets,
  },
  embeddedLessons: embedded,
  modifications: [
    'Literal data normalized to JSON',
    'Shared lesson stylesheet inlined for standalone reading',
    'Embedded lessons omit upstream authentication, navigation and tracking; original in-page interactions retained',
    'All catalog lessons and local demo dependencies bundled; images embedded as data URIs',
    'Navigation, AI tutoring, quizzes, notes and progress implemented by Resume Agent',
  ],
};
const dataDir = resolve(root, 'apps/web/src/data/learning');
await mkdir(dataDir, { recursive: true });
await writeFile(
  join(dataDir, 'xueai.json'),
  `${JSON.stringify({ manifest, lessons, abilities, questions, skills }, null, 2)}\n`,
);
await writeFile(
  join(dataDir, 'lesson-ids.json'),
  `${JSON.stringify(lessons.map((lesson) => lesson.id))}\n`,
);
const agentResources = resolve(root, 'apps/agent/resources');
await mkdir(agentResources, { recursive: true });
await writeFile(
  join(agentResources, 'learning-catalog.json'),
  `${JSON.stringify({ manifest, lessons, abilities }, null, 2)}\n`,
);
await writeFile(
  join(agentResources, 'learning-lessons.json'),
  `${JSON.stringify(bundled.contents)}\n`,
);
await writeFile(
  join(publicDir, 'LICENSE'),
  await readFile(join(source, 'LICENSE')),
);
await writeFile(
  join(publicDir, 'NOTICE.txt'),
  `小山学堂 · 洛小山 / 米羊科技\nSource: ${upstream}\nCommit: ${commit}\nLicense: AGPL-3.0 (included as LICENSE)\n${manifest.modifications.join('\n')}\n`,
);
console.log(JSON.stringify(manifest, null, 2));
