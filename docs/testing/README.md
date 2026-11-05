# 回归测试

这里收录工作台与原生画布的测试入口，以及已完成的实测报告。

- [画布与对话回归：2026-11-05](canvas-regression-2026-11-05.md)：测试矩阵、真实模型运行、导出效果及已知限制。
- [网络故障排查：2026-11-05](network-incident-2026-11-05.md)：Agent 进程退出的原因与修复验证。

## 运行前提

按[仓库首页](../../README.md#本地启动)安装依赖与 Playwright Chromium，再启动 Web（3000）、Agent（4000）和 OpenPencil（1420）。以下命令均在仓库根目录执行。

新增的六组 UI 脚本使用独立、临时的浏览器上下文和合成数据，面向未开启登录限制的本地开发环境；不会读取日常浏览器里的简历。模型输出采用受控响应，默认不调用付费模型。附件测试仍会向本地 Agent 上传仓库中的测试 DOC / DOCX；关闭浏览器不会删除 Agent 保存的测试附件，建议使用专用测试数据目录。

## 六组 UI 回归

| 脚本 | 验证内容 |
| --- | --- |
| `test-chat-attachments.mjs` | 上传失败时阻止发送、重试、首条消息附件交接、附件名称保留 |
| `test-chat-display-and-review-cancel.mjs` | 工具调用前后的正文保留；关闭评估中止请求；忽略迟到结果；保留无关任务 |
| `test-native-tool-message.mjs` | 隐藏异常 DSML / XML 工具标记，保留正文，明确提示工具没有执行 |
| `test-sidebar-conversation-status.mjs` | 侧栏运行、等待输入、完成、停止、失败、刷新状态与减少动态效果偏好 |
| `test-speech-input.mjs` | 语音权限失败提示、重试、草稿保留、最终文字去重、停止录音；识别事件为模拟，不测试真实麦克风 |
| `test-task-continuation.mjs` | 失败时保留部分输出与任务进度、刷新恢复、继续原会话、更新原任务卡 |

```sh
node scripts/test-chat-attachments.mjs
node scripts/test-chat-display-and-review-cancel.mjs
node scripts/test-native-tool-message.mjs
node scripts/test-sidebar-conversation-status.mjs
node scripts/test-speech-input.mjs
node scripts/test-task-continuation.mjs
```

脚本失败时返回非零退出码；截图与 JSON 结果写到仓库相邻的 `../evaluation/` 下，各脚本使用独立子目录。默认的受控测试验证交互和状态处理，不证明模型服务可用或生成内容正确。

附件脚本另有可选真实模型模式：设置 `QA_REAL_MODEL=1` 和 `QA_MODEL_CONFIG_READER`。后者是本地 Python 脚本路径，其标准输出应为包含 `provider`、`baseUrl`、`model`、`apiKey` 的 JSON 配置。该模式会上传合成简历并产生模型调用费用；密钥配置脚本和运行产物不应提交到仓库。

## 画布与输入排队

这两组脚本也使用独立浏览器上下文：

```sh
node --import ./apps/agent/node_modules/tsx/dist/loader.mjs scripts/test-canvas-tools.mjs
node scripts/test-chat-queue.mjs
```

画布脚本检查原生图层操作、错误边界、PDF / FIG 导出和刷新恢复，使用仓库内合成 DOCX。支持 `QA_WEB_URL`、`QA_CANVAS_URL`、`QA_OUTPUT_DIR`；需要登录时设置 `QA_LOGIN_USERNAME` / `QA_LOGIN_PASSWORD`。排队脚本通过受控流检查 FIFO、立即处理、暂停和刷新恢复。

2026-11-06 本次同步补齐已有六组 UI 脚本并检查语法，没有重新执行完整模型与浏览器测试矩阵。此前运行结果和覆盖边界见上面的 2026-11-05 报告。
