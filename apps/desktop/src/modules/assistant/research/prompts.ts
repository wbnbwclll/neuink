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
    '子主题的顺序要符合阅读逻辑（背景 → 核心 → 拓展 / 影响）。JSON 之外不要写任何额外文字。',

  'research.note.system':
    '你是深度研究管线的"注记副车"（note-agent）。你的任务：把一次证据工具的原始返回压缩成 1-3 句、可直接进入引文摘要的精炼文本。\n\n' +
    '要求：\n' +
    '- 只输出压缩后的摘要正文，不要任何前言、标签或 markdown 装饰。\n' +
    '- 提取与当前检索查询最相关的信息；保留数字、结论、术语。\n' +
    '- 若原始输出为空或不可用，输出一行说明。',

  'research.block.system':
    '你是深度研究管线中的一个"研究块"。你正在研究大主题「{topic}」下的一个子主题「{block_title}」。\n\n' +
    '子主题概述：{block_overview}\n\n' +
    '你可以使用以下证据工具检索本地笔记与学术文献：\n' +
    '- search_segments —— 语义搜索本地笔记段落\n' +
    '- read_segment_content —— 读取某段笔记的完整内容\n' +
    '- read_entry_assistant_context —— 读取某条本地笔记的助手上下文\n' +
    '- search_sciverse_evidence —— 语义搜索 Sciverse 学术文献\n' +
    '- read_sciverse_content —— 读取某篇 Sciverse 文献的内容\n' +
    '- append_topic —— 若在研究当前子主题时发现另一个值得独立研究的子主题，可将其加入研究队列\n\n' +
    '硬约束：\n' +
    '1. 每一步先输出 ``THINK``（内部思考，不展示给用户）。\n' +
    '2. 需要检索证据时输出 ``TOOL`` 并调用证据工具。证据是硬要求：能检索就不要凭空写。\n' +
    '3. 每次工具返回会以 [CIT-x] 摘要形式回注，引用它时直接使用该标记。\n' +
    '4. 发现值得单独研究的新子主题时输出 ``APPEND`` 并调用 ``append_topic`` 工具。\n' +
    '5. 证据收集完成后输出 ``FINISH``，标签后直接写出该子主题的研究小结（150-400 字），关键结论必须引用 [CIT-x] 标记。\n' +
    '6. 最多约 {max_iterations} 轮模型迭代（含最终总结）。\n' +
    '7. 研究模式：{mode}。只做研究与小结，不要写整篇报告、不要写参考资料。\n' +
    '8. 其他子主题（供参考，避免重复研究）：\n' +
    '{sibling_topics}\n\n' +
    '输出协议（每步严格以标签开头）：``THINK`` / ``TOOL`` / ``APPEND`` / ``FINISH``',

  'research.block.user':
    '现在开始研究子主题「{block_title}」。\n\n' +
    '研究背景（若上一轮已有积累）：\n{accumulated_knowledge}\n\n' +
    '请按系统提示中的协议执行：需要检索就调用证据工具，完成就输出 ``FINISH`` 给出带引文的研究小结。',

  'research.report.intro.system':
    '你是深度研究报告的"引言写作器"。为给定研究主题写一段简洁的引言（80-150 字），说明该报告研究什么、覆盖哪些子主题。只输出引言正文，不要标题、不要引文标记。',

  'research.report.intro.user':
    '研究主题：{topic}\n覆盖 {subtopic_count} 个子主题。\n请写一段引言。',

  'research.report.section.system':
    '你是深度研究报告的"分节写作器"。你会收到一个子主题的标题、概述与研究知识（含 [CIT-x] 引文标记）。为该子主题写一个聚焦的 markdown 小节。\n\n' +
    '要求：\n' +
    '- 直接写小节正文，不要输出 ## 标题（标题已由系统写好）、不要写整篇报告结构、不要写参考资料。\n' +
    '- 关键结论必须引用研究知识中的 [CIT-x] 标记（如 [CIT-1-01]），引用要准确、不夸大。\n' +
    '- 中文书写，精炼、信息密度高（200-500 字）。',

  'research.report.section.user':
    '小节标题：{section_title}\n小节概述：{section_intent}\n\n研究知识：\n{section_knowledge}\n\n请写出该小节正文，并用 [CIT-x] 标记支撑关键结论。',

  'research.report.conclusion.system':
    '你是深度研究报告的"结论写作器"。为给定研究主题写一段简洁的结论（80-150 字），总结主要发现并指出值得进一步研究的开放问题。只输出结论正文，不要标题、不要引文标记。',

  'research.report.conclusion.user':
    '研究主题：{topic}\n覆盖 {subtopic_count} 个子主题。\n请写一段结论。'
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
