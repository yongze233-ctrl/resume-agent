import assert from 'node:assert/strict';
import test from 'node:test';
import { findCourses } from '../src/career/catalog.js';
import { readLearningLesson } from '../src/career/lessons.js';
import { findJobs, findJob, type JobsFetch } from '../src/career/jobs.js';
import { fixture } from './helpers.js';

const ashbyJob = {
  id: 'agents',
  title: 'Product Manager, API Agents',
  location: 'San Francisco',
  jobUrl: 'https://jobs.ashbyhq.com/openai/agents',
  descriptionPlain: 'Build AI agent products.',
  publishedAt: '2026-11-01T00:00:00Z',
};
const greenhouseJob = {
  id: 42,
  title: 'Product Manager, AI',
  location: { name: 'New York' },
  absolute_url: 'https://job-boards.greenhouse.io/anthropic/jobs/42',
  content: '<p>AI agent products</p>',
  updated_at: '2026-11-02T00:00:00Z',
};
const tencentJob = {
  PostId: '123',
  RecruitPostName: 'Agent Harness 产品经理',
  LocationName: '深圳',
  Responsibility: 'AI 产品与评测',
  LastUpdateTime: '2026-11-02',
  IsValid: true,
};
const sourceFixture =
  (failures: string[] = [], requests: string[] = []): JobsFetch =>
  async (url, init) => {
    requests.push(url);
    init.signal?.throwIfAborted();
    assert.equal(init.redirect, 'error');
    if (failures.some((host) => url.includes(host)))
      return new Response('', { status: 503 });
    const data = url.includes('ashbyhq.com')
      ? {
          jobs: [
            ashbyJob,
            { ...ashbyJob, id: 'hidden', isListed: false },
            { ...ashbyJob, id: 'unsafe', jobUrl: 'https://evil.example/job' },
          ],
        }
      : url.includes('greenhouse.io')
        ? { jobs: [greenhouseJob] }
        : {
            Data: {
              Posts: [
                tencentJob,
                { ...tencentJob, PostId: 'inactive', IsValid: false },
              ],
            },
          };
    return Response.json(data);
  };

test('course search returns traceable lesson hyperlinks and no invented fallback', () => {
  const courses = findCourses('RAG 检索增强', 4);
  assert.ok(courses.length > 0 && courses.length <= 4);
  assert.ok(
    courses.every(
      (course) =>
        course.url ===
        `/dashboard/learning?lesson=${encodeURIComponent(course.id)}`,
    ),
  );
  assert.ok(courses.every((course) => course.author && course.version));
  assert.ok(
    !JSON.stringify(courses).includes('https://xueai'),
    'recommended learning links stay inside the product',
  );
  assert.deepEqual(findCourses('zzzx_nonexistent_98765'), []);
  assert.deepEqual(
    findCourses('storage'),
    [],
    'RAG must not match inside storage',
  );
});

test('lesson tutoring reads actual built-in text, including lessons outside the original four', () => {
  const result = readLearningLesson('taste-4');
  assert.ok('text' in result && result.text.length > 100);
  assert.equal(
    'url' in result && result.url,
    '/dashboard/learning?lesson=taste-4',
  );
  assert.deepEqual(readLearningLesson('../../private'), {
    error: 'lesson_not_found',
  });
  assert.deepEqual(readLearningLesson('__proto__'), {
    error: 'lesson_not_found',
  });
});

test('exact job details resolve by the supported URL, independent of the link label or keyword ranking', async () => {
  let requested = '';
  const fetcher: JobsFetch = async (url) => {
    requested = url;
    return Response.json({
      Data: { ...tencentJob, Requirement: '具备产品设计和效果评测经验。' },
    });
  };
  const tencent = await findJob(
    'https://careers.tencent.com/jobdesc.html?postId=123',
    undefined,
    fetcher,
  );
  assert.equal(tencent.status, 'ok');
  assert.ok(
    'job' in tencent && tencent.job.description.includes('效果评测经验'),
  );
  assert.ok(
    requested.startsWith(
      'https://careers.tencent.com/tencentcareer/api/post/ByPostId?',
    ),
  );
  const ashby = await findJob(ashbyJob.jobUrl, undefined, sourceFixture());
  assert.equal(ashby.status, 'ok');
  let calls = 0;
  const reject: JobsFetch = async () => {
    calls++;
    throw new Error('must not fetch caller URLs');
  };
  for (const url of [
    'http://127.0.0.1/private',
    'https://jobs.ashbyhq.com/other-company/job',
    'https://user@careers.tencent.com/jobdesc.html?postId=123',
  ])
    assert.equal((await findJob(url, undefined, reject)).status, 'invalid');
  assert.equal(calls, 0);
});

test('job search retains official links, source times, and distinguishes updates from publication', async () => {
  const requests: string[] = [];
  const result = await findJobs(
    'AI 产品经理 Agent RAG',
    6,
    undefined,
    sourceFixture([], requests),
  );
  assert.equal(result.status, 'ok');
  assert.equal(result.jobs.length, 3);
  assert.ok(result.sources.every((source) => source.status === 'ok'));
  assert.ok(
    result.jobs.every(
      (job) =>
        job.matchedTerms.length && !Number.isNaN(Date.parse(job.checkedAt)),
    ),
  );
  assert.equal(
    result.jobs.find((job) => job.source === 'ashby')?.publishedAt,
    ashbyJob.publishedAt,
  );
  assert.equal(
    result.jobs.find((job) => job.source === 'greenhouse')?.publishedAt,
    null,
  );
  assert.equal(
    result.jobs.find((job) => job.source === 'greenhouse')?.updatedAt,
    greenhouseJob.updated_at,
  );
  assert.equal(
    result.jobs.find((job) => job.source === 'tencent')?.url,
    'https://careers.tencent.com/jobdesc.html?postId=123',
  );
  assert.equal(requests.length, 3);
  assert.ok(
    requests.every((url) => !url.includes('RAG') && !url.includes('Agent')),
    'only a fixed role category goes to the public source',
  );
});

test('job search reports partial/total source failure and aborts without stale fallback', async () => {
  const partial = await findJobs(
    'AI',
    5,
    undefined,
    sourceFixture(['greenhouse.io']),
  );
  assert.equal(partial.status, 'ok');
  assert.equal(
    partial.sources.find((source) => source.company === 'Anthropic')?.status,
    'unavailable',
  );
  const unavailable = await findJobs(
    'AI',
    5,
    undefined,
    sourceFixture(['https://']),
  );
  assert.equal(unavailable.status, 'unavailable');
  assert.deepEqual(unavailable.jobs, []);
  assert.deepEqual(
    (await findJobs('storage', 5, undefined, sourceFixture())).jobs,
    [],
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(findJobs('AI', 5, controller.signal, sourceFixture()), {
    name: 'AbortError',
  });
});

test('an explicit product manager request prioritizes that role over more keyword-rich engineering jobs', async () => {
  const base = sourceFixture();
  const fetcher: JobsFetch = async (url, init) => {
    if (!url.includes('ashbyhq.com')) return base(url, init);
    return Response.json({
      jobs: [
        ashbyJob,
        {
          ...ashbyJob,
          id: 'engineer',
          title: 'Applied AI Engineer Agent RAG Evaluation Harness',
          jobUrl: 'https://jobs.ashbyhq.com/openai/engineer',
        },
      ],
    });
  };
  const result = await findJobs(
    'AI 产品经理 RAG Agent 评测',
    6,
    undefined,
    fetcher,
  );
  assert.equal(
    result.jobs.find((job) => job.company === 'OpenAI')?.title,
    ashbyJob.title,
  );
  assert.deepEqual(
    (await findJobs('paid', 3, undefined, sourceFixture())).jobs,
    [],
    'AI is not a substring match inside paid',
  );
});

test('the actual Agent exposes resource tools in Ask and supplies catalog URLs to its model', async (t) => {
  const course = findCourses('RAG', 1)[0];
  const f = await fixture(t, 'memory', [
    {
      calls: [
        { name: 'find_learning_courses', args: { query: 'RAG', limit: 1 } },
      ],
    },
    { text: `[${course.title}](${course.url})` },
  ]);
  const events = await f.chat(
    f.body({
      agentMode: 'ask',
      messages: [
        { role: 'user', content: '推荐 RAG 课程，给我可点击的链接。' },
      ],
    }),
  );
  const tools =
    f.fake.requests[0].tools?.map((tool) => tool.function.name) ?? [];
  assert.ok(
    tools.includes('find_learning_courses') &&
      tools.includes('find_matching_jobs'),
  );
  assert.ok(!tools.includes('read_resume'));
  const responses = f.fake.requests[1].messages.filter(
    (message) => message.role === 'tool',
  );
  assert.ok(JSON.stringify(responses).includes(course.url));
  assert.ok(
    !JSON.stringify(f.fake.requests).includes('Alex Chen'),
    'Ask never receives the fixture resume',
  );
  assert.ok(JSON.stringify(events).includes(course.url));
});
