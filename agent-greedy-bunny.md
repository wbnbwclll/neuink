# Deep Research 功能迁移方案

## Context

将 DeepTutor 的 `deep_research`（Level 2 Capability，多阶段深度调研）能力迁移到 Neuink 项目中。参考文档：[DEEP_RESEARCH.md](D:\coding\neuink\DeepTutor\DEEP_RESEARCH.md)。

### 源功能核心特征

DeepTutor deep_research 是一个 **4 阶段 agentic pipeline**：
1. **Rephrase** — 澄清用户意图（mini agentic 循环，最多 3 轮提问）
2. **Decompose** — 拆分主题为子话题列表，**弹出大纲让用户确认**（两段式 UX）
3. **Researching** — 并行+串行混合调度子话题研究循环（每个 block 内有 TOOL/APPEND/FINISH 标签协议）
4. **Reporting** — 生成结构化报告（outline → intro → sections → conclusion → references）

**核心设计模式**：
- **DynamicTopicQueue** — 可动态扩展的队列（APPEND 标签在研究中插入新子话题）
- **CitationManager** — 独立引用编号系统（CIT-x-yy），持久化到 citations.json
- **Note-agent** — 将原始工具结果（可达 50KB）压缩为 ≤1500 token 摘要再喂给模型
- **LoopHost 协议** — 通用 agentic 循环抽象（11 个回调），deep_research 是其中一个"宿主"
- **Section Coverage Repair** — 确定性修复 LLM 输出的章节-block 映射，确保无遗漏

### Neuink 现有基础设施

**可直接复用（无需修改）：**
- Agent 主循环：`streamText()` + ToolSet（[qna.ts](apps/desktop/src/modules/assistant/sdk/qna.ts)）
- 循环守卫：`AgentLoopGuard`（[cycleGuard.ts](apps/desktop/src/modules/assistant/agent-core/cycleGuard.ts)）
- 来源标记系统：`[Sx]` + `sourceByMarker` + `normalizeCitedSources()`
- 搜索工具：`search_segments`（混合搜索）、`read_entry_assistant_context`、`read_segment_content`
- 子 Agent 运行时：`runSubagentTask()` → Rust `run_agent_subagent_task_impl()`（证据收集 + LLM 调用）
- Skill 系统：`skill.search` / `skill.load` + SkillPackage 注册表
- MCP 工具支持：`mcp.{serverId}.{toolName}` + Rust 进程通信
- LLM Profile 管理：OpenAI-compatible 多 Profile 配置
- 提案系统：Note/Entry/Tag proposal（可审查、用户确认）
- Agent Run 记录：`agent_run_registry.rs`（可扩展用于研究追踪）
- Sciverse 工具：学术论文搜索（已有 6 个工具）

**需要扩展/修改：**
- `AgentToolId` 类型 — 添加 `task.run_deep_research`
- `load_prompt` — 添加 4 个新 prompt 模板
- `AgentRuntimeSettings` — 添加 `DeepResearchConfig`
- 工具系统 — 添加深度研究入口工具和新的 `research.*` 后端工具

**完全缺失需要新建：**
- 多阶段 pipeline 编排器（前端的核心）
- CitationManager（独立引用编号）
- DynamicTopicQueue（动态队列）
- Note-agent 摘要模式（工具结果压缩）
- Web 搜索工具（需要新增，当前没有任何 web 搜索能力）
- 报告生成 pipeline
- 两段式 UX 交互

---

## 架构决策

### 推荐方案：前端 Pipeline + 后端 Block 执行（Hybrid）

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (TypeScript) — Pipeline Orchestrator               │
│                                                              │
│  ResearchOrchestrator                                        │
│  ├── Phase 1: rephrase (mini agentic loop w/ AI SDK)        │
│  ├── Phase 2: decompose (single generateText + parse)       │
│  ├── [USER CONFIRMATION PAUSE]                               │
│  ├── Phase 3: researching                                    │
│  │   ├── DynamicTopicQueue (frontend state)                  │
│  │   ├── CitationManager (frontend, CIT-x-yy tracking)       │
│  │   ├── ResearchBlockLoop (per-block multi-turn)            │
│  │   │   ├── streamText() w/ tools (AI SDK)                 │
│  │   │   ├── Note-agent: summarizeToolResult() via LLM       │
│  │   │   └── APPEND detection → DynamicTopicQueue.add()      │
│  │   └── _drive_queue: parallel blocks (Promise.all, max 3)  │
│  └── Phase 4: reporting                                      │
│       ├── Report outline generation (single call)            │
│       ├── Section-by-section streaming generation            │
│       └── Reference list rendering                           │
└─────────────────────────────────────────────────────────────┘
```

**为什么选择这个方案：**
1. **复用现有工具系统** — 搜索/读取工具已在 AI SDK 中注册，研究循环直接用
2. **流式输出** — AI SDK `streamText` 天然支持流式，报告生成可以边写边展示
3. **Citation 管理** — `sourceByMarker` Map 已在前端管理，CitationManager 是其自然扩展
4. **两段式 UX** — 前端 pipeline 可以自然地暂停等待用户确认
5. **调试方便** — TypeScript 比 Rust 更易迭代和调试 pipeline 逻辑
6. **Web 搜索** — 通过 MCP 工具集成，前端直接调用

**Rust 后端的角色（有限扩展）：**
- 添加 **web search MCP 工具的参考实现**（可选，用户可自行配置 MCP 服务器）
- 扩展 `agent_run_registry` 以记录 research 运行
- 添加新的 prompt 模板（compile-time embedding）
- 搜索/读取/Sciverse 等已有工具保持不变

---

## 实施计划（4 个阶段）

### Phase 1: 基础设施（类型、Prompt、CitationManager）

**目标**：为 pipeline 打好基础，不涉及具体研究逻辑。

#### 1.1 新增类型定义

**文件**：[agentRuntime.ts](apps/desktop/src/shared/types/agentRuntime.ts)

新增类型：
```typescript
// 深度研究执行策略（类比 DeepTutor 的 depth/mode → runtime_config）
type DeepResearchMode = 'report' | 'notes' | 'comparison' | 'learning_path';
type DeepResearchDepth = 'quick' | 'standard' | 'deep' | 'manual';
type DeepResearchBlockStatus = 'pending' | 'running' | 'completed' | 'failed';

type DeepResearchConfig = {
  mode: DeepResearchMode;
  depth: DeepResearchDepth;
  manualSubtopics?: number;
  enabledTools: AgentToolId[];  // web_search, paper_search, code_execution 等
  maxIterationsPerBlock?: number;  // 手动深度时允许自定义
};

type ResearchTopicBlock = {
  id: string;              // "block_1"
  title: string;
  overview: string;
  status: DeepResearchBlockStatus;
  knowledge: string;       // 累积的研究知识
  toolTraces: ToolTrace[]; // 工具调用追溯
  parentBlockId?: string;  // APPEND 扩展时记录父块
  citationIds: string[];   // 与此块关联的 CIT ID
};

type ToolTrace = {
  toolName: string;
  input: unknown;
  outputSummary: string;   // Note-agent 压缩后的摘要
  citationId: string;      // CIT-3-01
  rawOutputSize: number;
};

type DeepResearchState = {
  config: DeepResearchConfig;
  refinedTopic: string;    // rephrase 后的定稿主题
  outline: SubTopicItem[]; // decompose 后的子话题列表
  queue: ResearchTopicBlock[];
  citations: CitationEntry[];
  phase: 'rephrase' | 'decompose' | 'awaiting_confirmation' | 'researching' | 'reporting' | 'done';
};

type SubTopicItem = { title: string; overview: string };
type CitationEntry = {
  id: string;              // "CIT-3-01"
  blockId: string;         // 来源 block
  source: ConversationSourceLink;
  summary: string;         // Note-agent 摘要
};
```

也需要在 `AgentToolId` 中添加 `'task.run_deep_research'`。

#### 1.2 CitationManager

**新文件**：`apps/desktop/src/modules/assistant/research/citationManager.ts`

职责：
- 生成 `CIT-{blockIndex}-{seq}` 格式的引用 ID
- 维护 `Map<string, CitationEntry>` 的引用库
- 在报告生成时按首次出现顺序重新编号
- `linkifyReportCitations()` — 将 `[CIT-3-01]` 替换为 `[3](#ref-cit-3-01)`
- `renderReferenceList()` — 生成参考文献列表（Markdown `<details>` 折叠块）

复用现有：[sourceByMarker](apps/desktop/src/modules/assistant/sdk/qna.ts) 的 marker 追踪模式。

#### 1.3 Prompt 模板

**新文件**（在 `crates/neuink-ipc/prompts/`）：
- `deep_research_rephrase.md` — 澄清问题 prompt
- `deep_research_decompose.md` — 拆分主题 prompt
- `deep_research_block.md` — 研究单个 block 的 system prompt
- `deep_research_report.md` — 报告生成 prompt

**修改文件**：[assistant.rs](crates/neuink-ipc/src/commands/assistant.rs#L529) — 在 `load_prompt` 的 match 中添加 4 个新 prompt。

#### 1.4 Web 搜索（MCP 参考实现）

**当前状态**：Neuink **没有任何 web 搜索工具**。

**方案 A（推荐）**：编写一个 Neuink MCP Web Search Server 的参考实现（Rust binary），用户自己配置 MCP 服务器指向它。搜索后端可以对接 Bing/Google/SerpAPI/DuckDuckGo 等。

**新文件**：`crates/neuink-mcp-web-search/` — 新 crate
- `main.rs` — stdin/stdout JSON-RPC 循环
- 支持环境变量配置搜索引擎 API key
- 命令行：`neuink-web-search-mcp --engine duckduckgo`

**方案 B（备选）**：直接作为内置 Rust 工具，在 `list_tools()` 中注册。不推荐，因为需要硬编码搜索引擎 API key。

前端通过 `mcpToolDescriptors()` 自动发现 web 搜索工具 — **无需修改前端代码**。

#### 1.5 AgentRunRegistry 扩展

**修改文件**：[agent_run_registry.rs](crates/neuink-ipc/src/commands/assistant/agent_run_registry.rs)

在 `AgentRunRecord` 中添加 `run_kind: Option<String>` 字段，用于区分 `"deep_research"` 和普通 agent run。在 `AgentRunRecordSummary` 中添加 `block_count`、`completed_block_count`、`failed_block_count`。

---

### Phase 2: 研究 Pipeline 核心

**目标**：实现 4 阶段 pipeline 编排器，这是整个功能的核心。

#### 2.1 ResearchOrchestrator

**新文件**：`apps/desktop/src/modules/assistant/research/orchestrator.ts`

核心类，近似 DeepTutor 的 `ResearchPipeline`，但适配 Neuink 的 AI SDK 模式：

```typescript
class ResearchOrchestrator {
  constructor(
    config: DeepResearchConfig,
    context: {
      root: string;
      scope: ScopeSnapshot;
      settings: LlmProfile;
      contextSnapshot?: AssistantContextSnapshot;
      onProgress: (event: ResearchProgressEvent) => void;
      abortSignal?: AbortSignal;
    }
  )

  async run(topic: string, confirmedOutline?: SubTopicItem[]): Promise<DeepResearchResult> {
    // Phase 1: rephrase
    const refinedTopic = await this.rephrase(topic);
    // Phase 2: decompose + pause
    if (!confirmedOutline) {
      const outline = await this.decompose(refinedTopic);
      return { phase: 'awaiting_confirmation', outline }; // 两段式暂停
    }
    // Phase 3: research
    const queue = this.buildQueue(confirmedOutline);
    const researched = await this.driveQueue(queue);
    // Phase 4: report
    const report = await this.writeReport(researched);
    return { phase: 'done', report, citations: this.citationManager.entries };
  }
}
```

**方法分解**：

1. **`rephrase(topic)`** — 最多 3 轮澄清循环：
   - 使用 `generateText` 单轮调用
   - 唯一工具：`ask_user`（实现为返回澄清问题并等待用户回答）
   - 在 Neuink 中：用自然语言反问用户，复用现有的 conversation 机制

2. **`decompose(refinedTopic)`** — 单次 LLM 调用：
   - 使用 `generateText` + JSON 输出
   - 解析成 `SubTopicItem[]`
   - 返回 `{ outline }` 触发前端展示大纲预览

3. **`buildQueue(outline)`** — 创建 `DynamicTopicQueue`

4. **`driveQueue(queue)`** — 调度器（见 2.3）

5. **`writeReport(blocks)`** — 报告生成（见 Phase 4）

#### 2.2 DynamicTopicQueue

**新文件**：`apps/desktop/src/modules/assistant/research/topicQueue.ts`

```typescript
class DynamicTopicQueue {
  private blocks: Map<string, ResearchTopicBlock>;
  private order: string[];
  maxLength: number;  // 从 config.depth 计算

  addBlock(title: string, overview: string, parentId?: string): string;
  getPendingBlocks(): ResearchTopicBlock[];
  isFull(): boolean;
  findSimilar(title: string): ResearchTopicBlock | null;  // 模糊查重
  markCompleted(blockId: string, knowledge: string): void;
  markFailed(blockId: string, error: string): void;
  appendChild(parentId: string, title: string, overview: string): string | null;
  getStats(): { total, pending, completed, failed };
}
```

查重算法：简易词干化 + Jaccard 相似度（阈值 0.85），参考 DeepTutor 的 `find_similar`。

#### 2.3 研究循环（Block Loop）

**新文件**：`apps/desktop/src/modules/assistant/research/blockLoop.ts`

每个 block 的研究循环，类比 DeepTutor 的 `_research_block` + `_BlockLoopHost`：

```typescript
async function researchBlock(
  block: ResearchTopicBlock,
  context: ResearchContext,
  orchestrator: ResearchOrchestrator
): Promise<ResearchTopicBlock>
```

**核心机制**：

**a) Block Agent Loop：**
使用 `streamText()` 带完整的工具集（search_segments, read_segment_content, read_entry_assistant_context, web_search 等），类似主 Agent 循环。最大迭代 = config.maxIterationsPerBlock。

**b) Note-agent 摘要：**
每个工具调用后，对 `CITABLE_TOOLS`（search_segments, web_search, read_entry_assistant_context）的结果：
1. 原始输出截断到 8000 字符
2. 调 `generateText` 压缩为 ≤1500 token 摘要
3. 生成 `CIT-{blockIndex}-{seq}` 引用 ID
4. 存入 CitationManager
5. **替换工具消息内容**为 `[CIT-x-yy] {摘要}`（防止上下文爆炸的关键设计）

**c) APPEND 检测：**
在 prompt 中指示模型：如果需要扩展新子话题，输出 `APPEND\n<title>\n<overview>` 标记。
在流式输出中检测此标记 → 调用 `DynamicTopicQueue.appendChild()`（含查重）。
同意/拒绝结果作为下一轮 user 消息注入。

**d) FINISH 验证：**
要求模型在 FINISH 前至少调用过一次工具（如果工具可用）。无工具调用就想 FINISH → 拒绝并提示先搜索。迭代预算耗尽 → `forceFinalize()`，用兜底文本标记 block 为 FAILED。

**e) 循环守卫：**
复用 `AgentLoopGuard` 但参数调整为：`maxTurns = config.maxIterationsPerBlock`，`maxToolCalls = maxIterationsPerBlock * 4`。

#### 2.4 并行调度

在 `driveQueue()` 中：

```typescript
async function driveQueue(queue: DynamicTopicQueue, context): Promise<ResearchTopicBlock[]> {
  const results: ResearchTopicBlock[] = [];
  while (queue.getPendingBlocks().length > 0) {
    const batch = queue.getPendingBlocks().slice(0, maxParallelBlocks);
    const batchResults = await Promise.allSettled(
      batch.map(block => researchBlock(block, context, this))
    );
    // 处理结果：completed → markCompleted, rejected → markFailed
    // APPEND 添加的新 block 在下一轮处理
    // 安全检查：max(20, queue_max_length * 4) 次迭代上限
  }
  return results;
}
```

`maxParallelBlocks` 从 config 推导：quick=1, standard=1, deep=3, manual=用户自定义。

---

### Phase 3: 报告生成

**目标**：从研究完成的 blocks 生成结构化报告。

**新文件**：`apps/desktop/src/modules/assistant/research/reportWriter.ts`

#### 3.1 Report Outline

```typescript
async function generateReportOutline(
  blocks: ResearchTopicBlock[],
  mode: DeepResearchMode,
  settings: LlmProfile
): Promise<ReportOutline>
```

单次 `generateText` 调用，输入为所有 block 的 title + knowledge 片段（首段 400 字符），输出 JSON 章节规划 `{title, sections: [{id, title, intent, block_ids}]}`。

#### 3.2 Section Coverage Repair

```typescript
function repairSectionCoverage(
  outline: ReportOutline,
  blocks: ResearchTopicBlock[]
): ReportOutline
```

**确定性修复**（不依赖 LLM）：
- block_ids 缺失/拼错 → 用 token 重叠 Jaccard 打分自动补位
- 有 block 没进任何章节 → 追加 "Additional findings" 章节
- 确保每个完成的 block 至少在一个章节中被引用

#### 3.3 逐章节流式写作

```typescript
async function* writeReportStream(
  outline: ReportOutline,
  blocks: ResearchTopicBlock[],
  citationManager: CitationManager,
  settings: LlmProfile
): AsyncGenerator<ReportStreamChunk>
```

顺序生成：INTRO → SECTION × N → CONCLUSION → REFERENCES

每个章节是独立的 `streamText` 调用，边生成边 yield：
```typescript
yield { type: 'section_start', sectionId, title };
for await (const delta of result.textStream) {
  yield { type: 'text_delta', text: delta };
}
yield { type: 'section_end', sectionId };
```

**证据输入限制**：每块最多 4000 字符，总量 12000 上限（防止上下文爆炸）。

#### 3.4 引用后处理

- `normalizeCitationIds()` — 按首次出现顺序重新编号 CIT → [1][2][3]
- `linkifyCitations()` — 转换为同页锚点 `[3](#ref-cit-3-01)`
- `renderReferenceList()` — 文末 `<details>` 参考文献列表

---

### Phase 4: UI 集成

**目标**：将 pipeline 接入到现有的 Assistant 面板中。

#### 4.1 Deep Research 工具

**修改文件**：[tools.ts](apps/desktop/src/modules/assistant/sdk/tools.ts)

在 `createAssistantTools()` 中添加 `task.run_deep_research` 工具（类似 `task.run_subagent`）：

```typescript
if (enabledToolIds.has('task.run_deep_research') && executionDepth < 2) {
  tools.task_run_deep_research = tool({
    description: 'Launch a multi-phase deep research task...',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        config: { /* DeepResearchConfig schema */ },
        topic: { type: 'string' }
      },
      required: ['config', 'topic']
    }),
    execute: async (input, options) => {
      // 触发 ResearchOrchestrator
      // 两段式：第一次返回 outline preview，第二次执行完整 pipeline
    }
  });
}
```

#### 4.2 AgentToolId 扩展

**修改文件**：[agentRuntime.ts](apps/desktop/src/shared/types/agentRuntime.ts)

在 `AgentToolId` 联合类型中添加 `'task.run_deep_research'`。
在 `DEFAULT_MAIN_TOOL_IDS` 中添加（[agentRuntimeSettings.ts](apps/desktop/src/shared/lib/agentRuntimeSettings.ts)）。

#### 4.3 Research Progress 事件

**新文件**：`apps/desktop/src/modules/assistant/research/progressEvents.ts`

定义事件类型，通过 `onToolEvent` 透传：

```typescript
type ResearchProgressEvent =
  | { type: 'phase_change'; phase: string }
  | { type: 'outline_ready'; outline: SubTopicItem[] }
  | { type: 'block_start'; blockId: string; title: string }
  | { type: 'block_progress'; blockId: string; turn: number }
  | { type: 'block_complete'; blockId: string }
  | { type: 'block_failed'; blockId: string; error: string }
  | { type: 'queue_append'; blockId: string; title: string }
  | { type: 'report_section'; sectionId: string; title: string }
  | { type: 'report_text'; text: string };
```

#### 4.4 AssistantPanel 大纲预览 UI

**修改文件**：[AssistantPanel.tsx](apps/desktop/src/modules/assistant/components/AssistantPanel.tsx) 及相关组件

当收到 `outline_ready` 事件时，渲染大纲编辑器：
- 展示子话题列表（可编辑标题、可删除、可添加）
- "开始研究" 按钮（带配置摘要：模式、深度、并发数）
- "取消" 按钮

复用现有组件：[ProposalCard](apps/desktop/src/modules/assistant/components/ProposalCard.tsx) 的视觉效果。

#### 4.5 Research 进度详情 UI

**新文件**：`apps/desktop/src/modules/assistant/components/ResearchProgressView.tsx`

显示：
- 当前阶段指示器（4 阶段进度条）
- Block 执行状态（pending/running/completed/failed 的卡片网格）
- 每个 running block 的当前摘要
- 报告流式输出区域

#### 4.6 Skill Package 注册

**修改文件**：[featureSkills.ts](apps/desktop/src/shared/lib/featureSkills.ts)

添加 `'deep-research.default'` 到 `DEFAULT_FEATURE_SKILL_IDS`。

**新文件**：`crates/neuink-ipc/src/commands/assistant/skill_package.rs` — 添加内置 Skill。

---

### Phase 5: 错误处理与边界情况

#### 5.1 部分失败处理
- 某 block 抛异常 → `markFailed`，knowledge 为空
- 未完成 block 统计：`failed_block_count` 和 `failed_block_titles` 写入报告 metadata
- 报告照常生成，但开头添加 "⚠️ X/Y blocks completed" 警告
- 用户可重新触发研究（只重试 FAILED blocks）

#### 5.2 用户取消
- AbortSignal 贯穿所有异步操作
- 取消时：已完成 block 保留、运行中的标记 FAILED、报告不生成
- 用户可在任意阶段取消

#### 5.3 模型能力不足
- 大纲解析失败 → 兜底将整个主题作为一个子话题
- 报告章节生成失败 → 对每个 block 单独生成一段并拼接
- FINISH 验证失败 → force_finalize 机制（最多重试 3 次，仍失败则用兜底文本）

#### 5.4 上下文窗口管理
- Block 循环中：工具结果经 note-agent 压缩后进上下文
- 报告生成中：每块证据 ≤4000 字符，总量 ≤12000 字符
- CitationManager 中的原始来源信息不进入 LLM 上下文，仅用于后处理

---

## 新文件和修改文件总览

### 新文件（约 12 个）

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/modules/assistant/research/orchestrator.ts` | 4 阶段 pipeline 编排器 |
| `apps/desktop/src/modules/assistant/research/blockLoop.ts` | 单个 block 的研究循环 |
| `apps/desktop/src/modules/assistant/research/topicQueue.ts` | DynamicTopicQueue |
| `apps/desktop/src/modules/assistant/research/citationManager.ts` | CitationManager |
| `apps/desktop/src/modules/assistant/research/reportWriter.ts` | 报告生成 |
| `apps/desktop/src/modules/assistant/research/progressEvents.ts` | 进度事件类型 |
| `apps/desktop/src/modules/assistant/research/noteAgent.ts` | 工具结果摘要（note-agent 模式） |
| `apps/desktop/src/modules/assistant/research/configParser.ts` | mode/depth → runtime_config 展开 |
| `apps/desktop/src/modules/assistant/components/ResearchProgressView.tsx` | 研究进度 UI 组件 |
| `crates/neuink-mcp-web-search/src/main.rs` | Web 搜索 MCP 服务器参考实现 |
| `crates/neuink-ipc/prompts/deep_research_rephrase.md` | Rephrase prompt |
| `crates/neuink-ipc/prompts/deep_research_decompose.md` | Decompose prompt |
| `crates/neuink-ipc/prompts/deep_research_block.md` | Block research system prompt |
| `crates/neuink-ipc/prompts/deep_research_report.md` | Report generation prompt |

### 修改文件（约 8 个）

| 文件 | 修改内容 |
|------|---------|
| [agentRuntime.ts](apps/desktop/src/shared/types/agentRuntime.ts) | 添加 DeepResearch 相关类型 + `'task.run_deep_research'` 到 AgentToolId |
| [agentRuntimeSettings.ts](apps/desktop/src/shared/lib/agentRuntimeSettings.ts) | 添加 `'task.run_deep_research'` 到 DEFAULT_MAIN_TOOL_IDS |
| [tools.ts](apps/desktop/src/modules/assistant/sdk/tools.ts) | 添加 `task.run_deep_research` 工具实现 |
| [assistant.rs](crates/neuink-ipc/src/commands/assistant.rs) | `load_prompt` 添加 4 个新 prompt |
| [agent_run_registry.rs](crates/neuink-ipc/src/commands/assistant/agent_run_registry.rs) | 添加 `run_kind` 和 block 统计字段 |
| [featureSkills.ts](apps/desktop/src/shared/lib/featureSkills.ts) | 添加 `'deep-research.default'` |
| [skill_package.rs](crates/neuink-ipc/src/commands/assistant/skill_package.rs) | 添加 deep-research 内置 Skill |
| [AssistantPanel.tsx](apps/desktop/src/modules/assistant/components/AssistantPanel.tsx) | 添加大纲预览 UI 路由 |

---

## 实施顺序

```
Phase 1（基础）: 类型 + Prompt + CitationManager + Web Search MCP
  ├── 1.1 类型定义（agentRuntime.ts）            ← 无依赖
  ├── 1.2 CitationManager                        ← 依赖 1.1
  ├── 1.3 Prompt 模板                              ← 无依赖
  ├── 1.4 Web Search MCP                           ← 无依赖
  └── 1.5 AgentRunRegistry 扩展                    ← 无依赖
       ↓
Phase 2（核心）: Research Pipeline
  ├── 2.1 ResearchOrchestrator                    ← 依赖 Phase 1
  ├── 2.2 DynamicTopicQueue                       ← 依赖 1.1
  ├── 2.3 Block Loop + Note-agent                 ← 依赖 2.1, 2.2, 1.2
  └── 2.4 并行调度（在 orchestrator 中）          ← 依赖 2.3
       ↓
Phase 3（报告）: Report Generation
  ├── 3.1 Report Outline + Coverage Repair        ← 依赖 Phase 2
  ├── 3.2 逐章节流式写作                           ← 依赖 3.1
  └── 3.3 引用后处理（使用 CitationManager）      ← 依赖 3.2, 1.2
       ↓
Phase 4（UI）: Frontend Integration
  ├── 4.1 Deep Research Tool（tools.ts）          ← 依赖 Phase 3
  ├── 4.2 AgentToolId + Defaults 更新             ← 依赖 4.1
  ├── 4.3 Progress Events                         ← 依赖 Phase 3
  ├── 4.4 大纲预览 UI                              ← 依赖 4.3
  ├── 4.5 Research Progress View                  ← 依赖 4.3
  └── 4.6 Skill Package 注册                       ← 依赖 Phase 3
       ↓
Phase 5（边界）: Error Handling
  └── 5.1-5.4 错误处理增强                         ← 依赖 Phase 4
```

---

## 验证方式

1. **单元测试**：
   - DynamicTopicQueue：添加/去重/满队列/相似检测
   - CitationManager：ID 生成/重新编号/链接化
   - configParser：mode+depth → runtime_config 正确展开
   - Note-agent：不同工具输出格式的摘要质量

2. **集成测试**：
   - 完整的 pipeline 端到端：给定 topic → rephrase → decompose → research 1 个 block → 报告
   - 并行研究：3 个 block 并行执行，验证结果正确聚合
   - APPEND 动态扩展：模拟模型输出 APPEND 标签，验证队列更新
   - 部分失败：让 1 个 block 失败，验证报告仍生成且包含警告

3. **UI 测试**：
   - 大纲预览：数据正确渲染，用户编辑（改标题/删/加）后确认
   - 进度视图：block 状态变化实时反映
   - 报告流式输出：section 逐个出现，text 边生成边显示

4. **性能验证**：
   - 单个 block 的研究循环不超过 5 轮（标准深度）
   - Note-agent 摘要延迟 < 3s
   - 并行 3 blocks 的总时间接近单个最慢 block 的时间

5. **回归测试**：
   - 运行 `npm test` 确保无破坏
   - 现有 Agent 行为不变（deep_research 是独立工具，不影响现有流程）
