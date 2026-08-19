# Assistant Module

## 职责

- 将用户消息、完整对话、`@` 附件和显式 UI 上下文作为 Agent observation；
- 由模型策略在统一 Agent Loop 中决定直接回答、自然追问、加载 Skill 或调用原子 Tool；
- 在最终文本、来源和 Proposal 展示前执行 Verifier；
- 维护 Conversation message parts、TaskState、AgentRun 和 Proposal 审核 UI。

## 不负责

- 模型不能直接写入 Workspace；
- 前端不通过正则解析意图、文件名、标题、重试短语或固定澄清槽位；
- 命名、总结、措辞、规划和是否追问属于模型原生认知，不包装成 Tool；
- Conversation 存储不负责调用 LLM。

## 输入

- 用户消息与有序 `@` attachments；
- `[C1]` 等标记对应的 Typed Mention Map（Entry/Note/Tag/Segment 的真实 id 与名称）；
- Workspace context snapshot；
- LLM profile、Agent permissions、Skills、Tools 与 MCP allowlist。

## 输出

- 已验证的 Markdown 聊天回答和 Evidence 来源；
- 不可变 Verified Note/Segment Note/Entry Meta/Tag Proposal；
- 可恢复的 TaskState、AgentLoopState 和 AgentRun。
- 已完成/失败任务后的自然语言续接会重放历史 Typed Mention Map，并合并会话 scope；不依赖“恢复任务”或 retry 正则。

## 模块边界

两个并列 agent（chat / research）共享同一套平台层，只有 pipeline 不同（对齐 DeepTutor `agents/chat` + `agents/research` + `core/agentic`）。

- `shared/`（平台，两个 agent 复用，零 agent 依赖）：
  - `agent-core/`：turn/tool 预算、循环与无进展保护（`AgentLoopGuard`）；
  - `sdk/`：Provider、`createAssistantTools` 工具注册表（含 `summarizeToolResult` 侧车）、MCP 工具描述、上下文预算、Entry Meta 工具实现；
  - `harness/runState.ts`：AgentRun 节点、`errorMessage`/`isAbortError` 等运行状态；
  - `runtime/`：TaskState 状态机、Evidence Ledger、Subagent 任务执行；
  - `scope.ts`：`buildScopeContext`（ScopeSnapshot → 模型只读上下文文本）。
- `chat/`（主助手）：面板与对话 UI（`components/`）、主助手 pipeline（`sdk/qna.ts` 模型循环、`harness/` 上下文 hydration/执行合同/Verifier/澄清、`runtime/` 澄清与 Verified Proposal）以及 Note/Tag/Entry Meta 的 Proposal/Draft capability。
- `research/`（研究助手）：深度研究 pipeline（改写→分解→队列研究→引文报告）与大纲 UI，后续阶段落地。

`create_entry` 是明确授权的原子副作用，并在单次 Agent run 内按参数幂等。`read_note(entry_id, note_id)` 允许 Agent 读取任意明确引用的 Note，不依赖 UI 正则预选 current note。Note、Entry Meta 和 Tag 修改仍只生成可审核 Proposal；真实 Note 写盘只允许 UI 调用 `apply_note_proposal`。后端按 `taskId + proposalId` 读取持久化 Verified Proposal，执行 digest、基础内容 Hash、幂等和 journal recovery 校验。
