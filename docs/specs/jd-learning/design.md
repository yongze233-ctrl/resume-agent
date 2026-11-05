# 岗位与学习：对话右侧工作区与 AI 推荐

当前主入口在 AI 对话：点击课程链接、支持的岗位链接，或侧栏「岗位与学习」，在同一聊天页面的右侧打开工作区，不新增标签、不改变 URL。左侧对话与输入草稿保持可用。右侧可切换课程、练习、路线、Skill、笔记记录和岗位，也能切回设计画布。独立路由 `/dashboard/learning` 保留作为直接访问及分享入口。

右侧工作区和设计共用现有舞台布局与宽度动效。OpenPencil 和实时画布切换时保持挂载，避免丢失未保存修改；工作区隐藏后也保留正在使用的课程/笔记工具状态。小屏幕由工作区接管内容区，关闭后回到对话，原画布内容仍可重新打开。

## 已实现流程

1. 用户点击对话中的课程链接，右侧直接打开该节课；点击侧栏则在右侧浏览完整目录，不需要再向 AI 询问如何打开。
2. 页面按照角色、方向或能力关键词，关联真实课程目录并读取企业公开招聘源。
3. 用户直接在右侧选课、阅读演示、做题、写笔记，或者切到岗位筛选。链接仍保留准确的 `lesson` ID，明确使用浏览器新标签操作时可打开独立页。
4. 右侧「问 AI」直接通过当前对话的发送与排队逻辑继续沟通；打开资源、做练习与写笔记本身不触发模型调用。独立资源页仍通过内存 handoff 回到关联简历对话，不在导航 URL 中携带简历正文。
5. Agent 调用 `find_learning_courses` / `find_matching_jobs`，拿到实际来源链接后，以 Markdown 超链接回复。课程链接由渲染器附加当前 `resumeId`，普通点击在当前简历的右侧展开。旧回复中的小山课程链接同样处理。腾讯、OpenAI、Anthropic 的支持职位链接在右侧查看摘要与相关岗位；用户可明确点击「企业招聘原文」打开外部来源。
6. Agent 通过 `read_learning_lesson` 读取实际课程正文后讲解；推荐工具只返回本站课程 URL，不提供向上游导流的链接。

交互状态使用不持久化的 `useResourceWorkspaceStore`，按 resumeId 隔离，只包含视图、课程 ID、查询和岗位链接。链接解析不接受任意外部页作为工作区内容；`workspaceTarget` 限制课程为本站路由、岗位为已支持招聘源。资源视图加入 `StageOccupant`，不再把右舞台等同于设计画布。课件使用嵌入式 section，不开启会盖住对话的原生 modal。

页面是资源发现入口，个人匹配需要在对话里结合允许读取的简历证据核对。关键词关联不等于掌握度或个人适配分数。Ask 模式不读取简历；共创/教练沿用原有权限，不因进入资源页而升级权限。

## 页面设计

沿用当前工作台的浅色底、蓝色重点和细边框。顶部以「学习 → 能力线索 → 岗位机会」路线组织视觉，主按钮直接返回 AI。主导航为「为你发现 / 学习课程 / 学习路线 / 练习与测试 / 实践 Skill / 学习记录 / 相关岗位」，URL 中的 view 可直接打开对应视图。

课程与岗位都保留真实超链接；对话中的普通点击使用右侧工作区，浏览器明确的新标签操作仍可用。加载、无结果、来源失败和重试均有独立状态；减少动态效果设置生效。工作区保留轻量标题与内容切换，课程内的阅读、练习、笔记直接操作。

## 小山学堂内容

固定源仓库 `itshen/learn-ai`，提交 `ab023c8540c462c00f3db5b0262b3ddaa5e00633`。用户已明确确认项目开源并取得接入授权，保留源协议、作者和 NOTICE。

- 454 条真实课程目录，来自该提交的 `slides/course-data.js`。
- 22 个能力簇，来自核对后的线上 `skills-map.js` 快照。
- 454 份课件全部内置。445 份演示页面保留原交互，9 个考试入口使用本站考试组件。
- 350 道题，保留原始答案、解析和课程引用，使用本站组件完成选择、提交、判分与错题复习。
- 39 份实践 Skill：完整正文、复制、下载和交给当前 AI 对话练习。
- 97 份图片资源内嵌为 data URI；演示、样式和共用组件均在本地运行。

## 本站实现的学习功能

| 功能       | 实现与边界                                                         |
| ---------- | ------------------------------------------------------------------ |
| 完整目录   | 454 节，按标题/主题/篇章搜索，筛选篇章或收藏，继续加载后续课程     |
| 阅读与演示 | 自建阅读器、章节目录、上一节/下一节、分享本站链接、原课件交互演示  |
| 课后练习   | 独立作答后查看原始参考答案和解析；题目链接回本站对应课程           |
| 综合考试   | 七章各抽五题，共 35 题；交卷后统一计分，明确未作答计为未答对       |
| 错题复习   | 按最近一次提交结果保存错题，重新作答更新理解记录                   |
| 学习路线   | 根据 JD 关联 22 个能力主题；再由 AI 核对简历证据与学习重点         |
| 实践 Skill | 39 份完整正文，支持复制、下载和在当前 AI 对话中实践                |
| 笔记与收藏 | 本地自动保存，刷新后恢复；学习记录页集中查看                       |
| 学习记录   | 用户主动标记完成；保存答题与考试记录，可导出 JSON                  |
| AI 答疑    | 使用现有 BYOK Agent，读取当前课正文后解释或带练，遵守 Ask 权限边界 |

学习记录独立存储于 IndexedDB 的 `learning-progress:v2`，不写入简历。读过、答对和实际做过之间不互相推断。原站的导航、认证和服务端 AI 客户端由本站功能替代，课程使用流程不依赖小山服务器。

导入命令：

```powershell
node scripts/import-xueai.mjs --source <learn-ai-checkout> --skills <skills-map.js>
```

脚本使用 TypeScript AST 解析字面量，不执行上游 JS；同时生成 web 目录和 agent `resources/learning-catalog.json`。后端构建发布包含 resources，避免被 checkpoint 数据卷覆盖。

本地课件移除原站登录、埋点和导航依赖，保留互动内容及样式；使用 `allow-scripts allow-downloads` 的隔离 iframe 与 CSP，无法读取父页面或简历 IndexedDB，禁止外部服务连接。演示只获得隔离的临时 storage，持久化学习数据由本站组件处理。

只有经过核对的演示助手脚本被内联；图片与 CSS 在导入时打包，保留第三方脚本许可说明。课件点击通过消息桥连接阅读器，验证消息来自当前 iframe，并校验课程 ID；动态生成的课程链接也转为本站导航。论文、官方文档等参考资料可从阅读器单独打开，小山站点不作为课程使用入口。

生成数据包括 web 的课程、题库、Skill，以及 agent 的课程目录和 `resources/learning-lessons.json` 正文，用于实际内容答疑。

## 岗位来源与边界

当前接入腾讯官方招聘、OpenAI 的 Ashby job board、Anthropic 的 Greenhouse job board。每次读取固定公开端点，限制时间、禁止重定向并校验岗位链接域名。成功结果缓存 5 分钟，保留实际读取时间 `checkedAt`。发布日期 `publishedAt` 与源内容更新时间 `updatedAt` 分开存储，避免把编辑时间冒充发布时间。

招聘源只接收固定角色类别参数，不接收简历、用户姓名或整份 JD。Agent 本地使用请求中的方向与能力词排序，不把主题关联当作个人匹配结论。招聘描述属于外部材料，不具有指令权限。

来源暂不可用时明确显示失败，不用历史职位快照兜底。只表示「已从招聘源读到」，是否仍可投递以企业原页面为准。当前覆盖三家公司，暂不代表全市场职位搜索。

浏览器经 `/api/career/jobs` 请求；Next BFF 使用现有 `lib/ai/backend.ts`，转发到 agent `/api/resources/jobs`，不暴露后端地址。

点击具体职位时经 `/api/career/job` → `/api/resources/job` 按已校验的岗位 URL 定位原记录，避免链接标题写成「这个岗位」就找不到详情。腾讯使用固定 ByPostId 端点，OpenAI/Anthropic 从对应固定 job board 定位；不抓取调用者提供的任意 URL。岗位查询与具体详情独立，来源失败时保留明确状态和企业原文入口。

## 验证

```powershell
# apps/agent
node --import tsx --test test/career-resources.test.ts
node --import tsx ../../scripts/test-learning-links.mjs
node --import tsx ../../scripts/test-resource-workspace.mjs
node --import tsx ../../scripts/test-builtin-learning.mjs

# apps/web
node --import tsx --test src/app/dashboard/_components/learning/workspaceTarget.test.ts src/app/dashboard/_components/learning/links.test.ts src/app/dashboard/_components/learning/model.test.ts src/app/dashboard/_components/learning/quiz.test.ts
pnpm exec tsc --noEmit -p tsconfig.build.json

# repository root: all 445 standalone demos + structural checks for every imported file
node scripts/test-builtin-lessons.mjs
```

端到端检查使用隔离浏览器、虚构简历及脚本模型，不读取用户 API key；执行真实 Agent 工具。原推荐链路另读取实际企业招聘源。全量演示扫描检查 445 页渲染、脚本异常、图片和外部请求；原生学习流程检查交互滑块、笔记刷新恢复、收藏与已读、错题复习、35 题考试判分、Skill 复制/下载、JD 路线、旧链接重写、AI 正文工具和手机布局。截图及结果在工作区 `evaluation/builtin-learning/` 和 `evaluation/learning-links/`。脚本模型验证链路，不代表真实供应商模型每次的答疑质量。

右侧工作区回归使用真实 OpenPencil 实例：修改未保存的节点名称，切去课程再切回，检查同一 graph 实例和修改仍然存在。同时验证不改变聊天 URL、不新增标签、不覆盖对话的 modal、未发送草稿保留、右侧练习不调用模型、受支持岗位在右侧展开、右侧答疑仍使用同一对话，以及手机关闭后回到对话。结果与截图在 `evaluation/resource-workspace/`，职位卡片使用明确的测试数据。

## 后续

继续完善 JD 逐项证据定位与实践成果审阅。阅读或答对不会自动写入简历，也不会被推断为工作经历。内容升级必须明确提交版本并重新验证演示，不能把线上数量与当前固定源码版本混用。
