# 第三方内容与许可

本仓库包含应用代码、课程、设计参考和字体。请按使用的组件保留版权声明及许可文本。以下链接指向本次发布使用的来源或仓库内的原始声明。

| 组件 | 来源及本项目的使用方式 | 许可 |
| --- | --- | --- |
| Magic Resume | 林陌青川与贡献者。工作台与 Agent 从 [f633c10](https://github.com/Magic-Resume/Magic-Resume/tree/f633c101a4ba5996f82168a386ff01c9baebcbd1) 演进，保留原包命名与版权声明。 | [MIT](LICENSE) |
| OpenPencil | Danila Poyarkov 与贡献者。安装脚本获取 [3a5e3fe](https://github.com/open-pencil/open-pencil/tree/3a5e3fe989191f75f77c94c11bf290849b34407a)，再应用 [canvas/overlay](canvas/overlay)，加入编辑器嵌入、Agent 桥接与审阅等修改。 | [MIT](canvas/LICENSE)，上游单项资产保留各自声明 |
| 小山学堂 | 洛小山 / 米羊科技，[learn-ai 原始版本](https://github.com/itshen/learn-ai/tree/ab023c8540c462c00f3db5b0262b3ddaa5e00633)。课件、题库与目录经过本地化、格式转换及导航适配。内容快照在 [Web 资源目录](apps/web/public/learning/xueai) 和 [Agent 课程索引](apps/agent/resources)。 | [AGPL-3.0](apps/web/public/learning/xueai/LICENSE) · [改动说明](apps/web/public/learning/xueai/NOTICE.txt) |
| Vibe Resume | KevinYoung-Kw（水的离子积），[上游技能与模板](https://github.com/KevinYoung-Kw/vibe-resume-skill)。上游材料用于版式参考，本项目增加了面向原生画布的使用说明。 | [CC BY-NC 4.0](apps/agent/skills/vibe-resume/upstream/LICENSE)。商业使用这些材料需向原作者取得许可。 |
| Practical Typography | danium 的排版指导，本项目随原始资料保留署名。 | [MIT](apps/agent/skills/practical-typography/upstream/LICENSE) |
| Typography Layout Systems | Jason Poindexter 的布局指导，本项目随原始资料保留署名。 | [MIT](apps/agent/skills/typography-layout-systems/upstream/LICENSE) |
| Magic UI | 评估界面的部分动画改编自 Magic UI。 | [MIT 声明及来源](apps/web/src/app/dashboard/edit/_components/ai/evaluation/motion/THIRD_PARTY_LICENSES.txt) |
| 中文字体 | 思源、Noto、霞鹜文楷等字体文件随附各自的声明。 | [Web 字体](apps/web/public/fonts/full) · [画布字体](canvas/overlay/public/resume-fonts) |

岗位信息由代码在运行时向公开招聘接口检索，出处见岗位原文。README 中的岗位和分数为测试画面中的示例。
