import { loadPrompt } from '@/shared/ipc/assistantApi';

// 前端内联 prompt 文案：Windows 本地前端-only 路径的兜底。
// 阶段 C 会在 crates/neuink-ipc/prompts/ 落地同名 .md，并经 Rust `load_prompt`
// 加载；此处 loadPrompt 命中时优先用远端文案，未命中则回退内联。
// 注意：文案内包含双反引号（``LABEL``），因此用普通字符串而非模板字面量书写。
const INLINE_PROMPTS: Record<string, string> = {
  'research.rephrase.system':
    '你是深度研究流程的"规划主持人"。本阶段的任务是把用户给的研究主题打磨得足够精确，便于后续研究与报告阶段顺利展开 —— 但要 **尽量少地** 询问用户。\n\n' +
    '每次回复必须在首行使用以下三种标签之一（双反引号包裹，如 ``LABEL``）：\n\n' +
    '- ``THINK`` —— 私下思考哪些地方仍然模糊。标签后的文本是内部草稿，不展示给用户。\n' +
    '- ``TOOL`` —— 调用 ``ask_user`` 工具一次性向用户提 1-{max_questions_per_round} 个问题（一张卡片）。本阶段只允许使用 ``ask_user``。\n' +
    '- ``FINISH`` —— 结束 rephrase 阶段。**标签后的正文会直接流式输出到聊天气泡的正文区域，用户能看到。** 写一段简短的、对本次研究目标的确认陈述（"好的，接下来我会重点研究 X，覆盖 …"的口吻），它同时也作为下一阶段拆分子主题的输入。要求具体、聚焦、可直接被拆解。\n\n' +
    '硬约束：\n' +
    '- 你最多可以调用 ``ask_user`` {max_rounds} 次。\n' +
    '- 每次 ``ask_user`` 最多包含 {max_questions_per_round} 个问题。\n' +
    '- 每个问题应附带 2-4 个有区分度的快捷选项：label 要短（1-5 个词），把选了它意味着什么写进 ``description``；如有推荐项放在第一个并在 label 末尾加「（推荐）」。\n' +
    '- 如果用户的原始主题已经足够清晰，立即 FINISH，不要为了凑问题而制造模糊。\n' +
    '- 如果用户跳过某个问题（回传 ``(skipped)``），尊重其选择：可以再问一轮或直接 FINISH。\n' +
    '- FINISH 时不要原样复述用户的问题 —— 用更聚焦、更具体的语言重述研究目标。\n' +
    '- FINISH 正文保持简短（3-6 句话即可），后续拆主题和写报告才是重头戏。\n\n' +
    '待澄清的原始主题："{topic}"',

  'research.decompose.system':
    '把精炼后的研究主题分解为若干 **子主题**。每个子主题是一个聚焦的研究角度，后续会独立（在配置允许时并行）研究。要求：\n' +
    '- **互不重叠**；\n' +
    '- **整体覆盖**主题；\n' +
    '- **可执行**：研究员一看就知道要查什么。\n\n' +
    '**输出协议（严格）**：第一行必须就是 ``OUTLINE``（双反引号包裹），前面不能有任何前言、标题、解释或 markdown 装饰；下一行立即开始 JSON：\n\n' +
    '{\n' +
    '  "sub_topics": [\n' +
    '    {"title": "简洁标题", "overview": "1-2 句子说明本子主题要覆盖什么"}\n' +
    '  ]\n' +
    '}\n\n' +
    '子主题的顺序要符合阅读逻辑（背景 → 核心 → 拓展 / 影响）。JSON 之外不要写任何额外文字。'
};

export async function loadResearchPrompt(name: string): Promise<string> {
  try {
    const remote = await loadPrompt(name);
    if (remote.trim()) {
      return remote;
    }
  } catch {
    // fall back to inline below
  }
  return INLINE_PROMPTS[name] ?? '';
}

export function renderResearchPrompt(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template
  );
}
