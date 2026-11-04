# 模型消息抓取（开发模式）

本目录集中管理内置助手每轮 SDK 请求／响应、HTTP 请求／响应的抓取。仅 Vite 开发模式启用，Vitest 和生产构建不发送抓取请求。现有范围保持为主／子 Agent 的 `agentDriver` 模型轮次，不额外抓取摘要、核验等独立模型任务。

- `client.ts`：每个 driver 独立的轮次计数、请求元数据、响应配对和抓取 transport。
- `promptDump.ts`：工具 schema 转换及开发服务器投递，失败不影响模型调用。
- `wireCapture.ts`：HTTP 克隆、凭据头脱敏、JSON／SSE 可读化，不消耗 SDK 原始流。
- `vitePlugin.ts`：只在开发服务器接收并落盘，不可从 renderer 入口导出或引入。

跨分支移植时复制整个目录，仅在以下三处接入：

1. `src/modules/assistant/sdk/provider.ts`：`createNeuinkModel` 接受可选 fetch，默认仍用 Tauri HTTP；provider 不导入抓取模块。
2. `src/modules/assistant/sdk/agentDriver.ts`：每个 driver 创建一个 `createModelCapture()`；发送前传入实际请求，以返回的 fetch 创建模型；在业务完成检查前记录标准化响应。
3. `vite.config.ts`：注册 `promptDumpPlugin()`，从本目录的 `vitePlugin.ts` 导入。

接口不依赖压缩、工具上下文或会话持久化实现，移植时无需连带这些功能。生产行为仍使用默认 transport。

文件仍写入 `D:\Users\新建文件夹`，由 `vitePlugin.ts` 的 `OUTPUT_DIRECTORY` 设置。四类前缀保持 `sdk-req`、`wire-req`、`wire-res`、`sdk-res`，同轮共享 capture id，内容为 UTF-8 格式化 JSON。原始提示词、正文与工具结果属于用户主动启用的本地开发抓取，不应作为常规日志或提交进仓库。

验证：`npm --workspace apps/desktop run test:frontend -- model-capture --maxWorkers 4`。
