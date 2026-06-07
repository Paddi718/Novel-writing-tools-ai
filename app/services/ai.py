"""AI 服务层 — system prompt 构建、用户消息构建、概要生成/缓存管理

分层职责：
  build_system_context  → 构造系统提示（身份 + 模式规则 + 上下文）
  build_user_message   → 构造用户消息（纯内容，不含指令）
  get_or_generate_*    → 概要生成与缓存
"""

from app.config import load_settings
from app.storage import load_novel, save_novel
from app.ai_writer import AIWriter


# ══════════════════════════════════════════════════════════════════════
# 用户消息构建（前端只发数据，不发指令）
# ══════════════════════════════════════════════════════════════════════

def build_user_message(data) -> str:
    """根据模式构建发送给 AI 的用户消息正文（纯内容，不含指令）"""
    if data.mode == "continue":
        # 续写：所有指令在 system prompt 中，用户消息无需内容
        return ""
    if data.mode == "split":
        # 拆分：同上，system prompt 处理
        return ""
    if data.mode in ("polish", "expand", "condense", "rewrite"):
        # 编辑类模式：只传选中的文本，不加任何引导语
        return (data.selected_text or "").strip()
    # chat / 其他：用户原始输入
    return data.message


# ══════════════════════════════════════════════════════════════════════
# System prompt 构建
# ══════════════════════════════════════════════════════════════════════

def _mode_instruction(data, custom_instruction: str) -> str:
    """构建模式指令层——核心提示词"""
    mode = data.mode

    # ── 基础身份（所有模式共用） ──
    identity = "你是专业的小说写作助手，精于情节设计、人物塑造和文笔打磨。"

    # ── 用户自定义指令 ──
    custom = ""
    if custom_instruction:
        custom = f"【用户自定义要求】\n{custom_instruction}\n"

    # ── 模式规则 ──
    rules = ""

    if mode == "continue":
        rules = (
            "【续写模式】\n"
            "只输出小说续写正文，绝不输出任何解释、引导语或备注。\n"
            "规则：\n"
            "- 不要以「好的」「当然」「以下」「我来」「这是」等任何引导词开头\n"
            "- 直接输出续写正文，不要反问或征求意见\n"
            "- 严格保持角色人设、语气和性格\n"
            "- 延续当前的叙事视角（不切换人称和时态）\n"
            "- 保持行文风格、描写密度和节奏\n"
            "- 不要重复已写过的内容\n"
            "- 与已有内容无缝衔接，不出现跳跃感\n"
            "- 情节紧凑，直接推进主线，减少无关描写\n"
            "- 对话简洁有力，去掉废话\n"
            "- 输出前自查：去掉所有开头引导语后再发送\n"
        )
        if data.target_length and data.target_length > 0:
            rules += f"\n- 严格控制字数在 {data.target_length} 字左右，达到目标字数后自然收尾。"

    elif mode == "polish":
        rules = (
            "【润色模式】\n"
            "对以下原文进行润色处理。只输出处理后的结果，不添加任何解释。\n"
            "规则：\n"
            "- 只输出润色后的文本，不要以「好的」「以下」「这是」「润色后」等开头\n"
            "- 保持原文风格、叙事视角和基本结构\n"
            "- 不改动人称、时态和段落顺序\n"
            "- 不改变情节核心和人物关系\n"
            "- 修正语病、优化表达流畅度、提升画面感\n"
            "- 如果原文已经很好，只做最小幅度的调整\n"
            "- 不要对原文进行扩写或缩写，保持字数基本不变\n"
        )
        if data.selected_text:
            rules += f"\n待润色文本：\n{data.selected_text}"

    elif mode == "expand":
        rules = (
            "【扩写模式】\n"
            "在保留原文骨架和风格的前提下进行扩写。只输出扩写后的结果。\n"
            "规则：\n"
            "- 只输出扩写后的文本，不要以「好的」「以下」「扩写后」等开头\n"
            "- 在关键场景增加细节描写：环境、动作、心理、感官\n"
            "- 不添加新情节分支或引入新角色\n"
            "- 保持原文叙事视角和语气\n"
            "- 扩写幅度控制在原字数的 1.5~2 倍\n"
        )
        if data.selected_text:
            rules += f"\n待扩写文本：\n{data.selected_text}"

    elif mode == "condense":
        rules = (
            "【缩写模式】\n"
            "精简以下文字，保留核心情节和关键对话。只输出缩写后的结果。\n"
            "规则：\n"
            "- 只输出缩写后的文本，不要以「好的」「以下」「缩写后」等开头\n"
            "- 保留核心情节、关键对话和人物行动线\n"
            "- 删除修饰性描述、冗余修辞和次要细节\n"
            "- 保持逻辑连贯，不因删减影响叙事节奏\n"
            "- 精简幅度控制在原字数的 40%~60%\n"
        )
        if data.selected_text:
            rules += f"\n待缩写文本：\n{data.selected_text}"

    elif mode == "rewrite":
        rules = (
            "【重写模式】\n"
            "以不同的风格重写以下文字，保留情节骨架。只输出重写后的结果。\n"
            "规则：\n"
            "- 只输出重写后的文本，不要以「好的」「以下」「重写后」等开头\n"
            "- 彻底改写表达方式，但保留核心情节和人物行动\n"
            "- 可调整叙事节奏、句式结构和描写角度\n"
            "- 不改变故事的基本走向和角色设定\n"
            "- 保持字数与原文本基本相当\n"
        )
        if data.selected_text:
            rules += f"\n待重写文本：\n{data.selected_text}"

    elif mode == "split":
        rules = (
            "【拆分章节模式】\n"
            "分析当前章节内容，给出最佳拆分方案。\n"
            "规则：\n"
            "- 只输出一个 JSON 对象，格式严格如下（不要加任何其他文字）：\n"
            '  { "split_point": 1234, "new_title": "新章节标题", "reason": "此处是情节转折点" }\n'
            "- split_point：拆分位置的字符数（必须为正整数，在 0 和总字数之间）\n"
            "- new_title：新章节的标题，简洁有力\n"
            "- reason：一句话说明为什么在这里拆分（情节转折/字数均衡/悬念位置）"
        )

    else:  # chat / 自由对话
        rules = (
            "【自由对话】\n"
            "用户会提出写作相关的问题，请结合当前小说章节内容回答。\n"
            "规则：\n"
            "- 回答简洁直接，不啰嗦\n"
            "- 如果用户询问标题、角色名、设定等建议，只输出建议本身，不用改写正文\n"
            "- 只有当用户明确要求「续写」「写一段」「创作一段」时，才输出小说正文\n"
            "- 如果用户的问题与当前章节无关，可以基于自身知识回答，但礼貌引导回写作主题\n"
        )

    return f"{identity}\n\n{custom}{rules}"


def _chapter_context(name: str, chapter_id: str, data, novel_data: dict) -> str:
    """构建章节上下文层——前情提要、本章概要、前一章全文"""
    chapters = novel_data.get("chapters", [])
    chapter = next((ch for ch in chapters if ch["id"] == chapter_id), None)
    if chapter is None:
        return ""

    chapter_title = chapter.get("title", "")
    summary_text = chapter.get("summary", "").strip()

    info = [f"当前章节：{chapter_title}"]

    # 前情提要（从已有的章节概要中提取）
    prev_summaries = []
    for i, ch in enumerate(chapters):
        if ch["id"] == chapter_id:
            break
        text = ch.get("summary", "").strip()
        if text and not text.startswith("（空）"):
            prev_summaries.append(f"第{i+1}章 {ch['title']}：\n{text}")

    if prev_summaries:
        info.append("【前情提要】\n" + "\n\n".join(prev_summaries))

    if summary_text:
        info.append(f"【本章概要】\n{summary_text}")

    # 前一章全文（仅非 chat 模式提供，chat 模式下用概要就够了）
    if data.mode != "chat":
        prev_ch = None
        for i, ch in enumerate(chapters):
            if ch["id"] == chapter_id and i > 0:
                prev_ch = chapters[i - 1]
                break
        if prev_ch:
            prev_text = prev_ch.get("content", "").strip()
            if prev_text:
                info.append(f"前一章（{prev_ch['title']}）全文：\n{prev_text}")

    return "【章节信息】\n" + "\n".join(info)


def _existing_content(name: str, chapter_id: str, data, novel_data: dict) -> str:
    """构建已有内容层——当前章节正文"""
    chapters = novel_data.get("chapters", [])
    chapter = next((ch for ch in chapters if ch["id"] == chapter_id), None)
    if chapter is None:
        return ""

    full_content = chapter.get("content", "").strip()
    if not full_content or data.mode not in ("continue", "chat"):
        return ""

    parts = [
        f"以下是你当前正在创作的章节全文（共 {len(full_content)} 字）：\n{full_content}"
    ]

    if data.mode == "continue":
        recent_len = min(2000, len(full_content))
        recent = full_content[-recent_len:]
        parts.append(
            f"【紧接上文——请从这里开始续写】\n"
            f"（以下 {recent_len} 字是紧接着续写点的前文）\n"
            f"{recent}"
        )

    return "\n\n".join(parts)


def build_system_context(name: str, chapter_id: str, data) -> str:
    """构建带章节上下文的 system prompt

    分层结构：
      Layer 1 — 身份定义 + 用户自定义指令 + 模式规则（含 few-shot）
      Layer 2 — 章节背景信息
      Layer 3 — 已有内容（续写/聊天模式）
    """
    novel_data = load_novel(name)
    if novel_data is None:
        return "小说不存在"

    chapter = next(
        (ch for ch in novel_data.get("chapters", []) if ch["id"] == chapter_id),
        None,
    )
    if chapter is None:
        return "章节不存在"

    settings = load_settings()
    custom_instruction = (settings.get("writing_instruction") or "").strip()

    # ── Layer 1：身份 + 指令 ──
    layer1 = _mode_instruction(data, custom_instruction)

    # ── Layer 2：章节上下文（chat 模式跳过前一章全文以节省上下文） ──
    layer2 = _chapter_context(name, chapter_id, data, novel_data)

    # ── Layer 3：已有内容（仅续写和聊天模式） ──
    layer3 = _existing_content(name, chapter_id, data, novel_data)

    parts = [layer1, layer2]
    if layer3:
        parts.append(layer3)

    return "\n\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# 概要生成
# ──────────────────────────────────────────────────────────────────────

async def get_or_generate_summary(name: str, chapter_id: str) -> dict:
    """获取章节概要（优先读缓存，没有则 AI 生成）"""
    novel_data = load_novel(name)
    if novel_data is None:
        return {"summary": "", "cached": False}

    chapter = next(
        (ch for ch in novel_data.get("chapters", []) if ch["id"] == chapter_id),
        None,
    )
    if chapter is None:
        return {"summary": "", "cached": False}

    summary = chapter.get("summary", "").strip()
    if summary and summary != "（空）":
        return {"summary": summary, "cached": True}

    # 没有缓存 → AI 生成
    content = chapter.get("content", "")
    if not content.strip():
        return {"summary": "", "cached": False}

    ai = AIWriter(load_settings())
    prompt = (
        "为以下小说章节生成结构化概要，使用固定格式：\n"
        "\n"
        "【概要】2-3句话概括本章核心情节（必填）\n"
        "【人物】主要角色及其状态变化（必填）\n"
        "【情节】按时间顺序列出关键事件（必填）\n"
        "【设定】本章揭示的新设定或背景信息（如无可省略）\n"
        "【伏笔】本章埋下的悬念或暗示（如无可省略）\n"
        "\n"
        "要求：\n"
        "- 语言简洁，每项不超过 3 条\n"
        "- 只输出内容，不要评价好坏\n"
        "- 格式示例：\n"
        "【概要】林渊在练武场测试修为时戒指异动，被林震山察觉，三叔出面解围。\n"
        "【人物】林渊（炼气二层）、林震山（炼气七层，执法长老）\n"
        "【情节】测试修为→戒指灵力外泄→林震山逼问→三叔公开口解围\n"
        "\n"
        f"{content[:4000]}"
    )
    summary_text = ""
    async for chunk in ai.chat(
        "你是一个专业的网文章节摘要助手。为章节生成结构化概要，字段完整，语言简洁。",
        prompt,
    ):
        summary_text += chunk
    summary_text = summary_text.strip().strip('"').strip('「').strip('」')
    if not summary_text:
        summary_text = "（空）"

    # 写回 .novel 文件
    chapter["summary"] = summary_text
    save_novel(name, novel_data)

    return {"summary": summary_text, "cached": False}


async def regenerate_summary(name: str, chapter_id: str) -> dict:
    """强制重新生成概要"""
    novel_data = load_novel(name)
    if novel_data is None:
        return {"summary": "", "cached": False}
    chapter = next(
        (ch for ch in novel_data.get("chapters", []) if ch["id"] == chapter_id),
        None,
    )
    if chapter is None:
        return {"summary": "", "cached": False}
    chapter["summary"] = ""
    save_novel(name, novel_data)
    return await get_or_generate_summary(name, chapter_id)


# ──────────────────────────────────────────────────────────────────────
# 全文梗概
# ──────────────────────────────────────────────────────────────────────

async def get_or_generate_novel_summary(name: str) -> dict:
    """获取/生成全文梗概（汇总所有章节概要）"""
    novel_data = load_novel(name)
    if novel_data is None:
        return {"summary": "", "cached": False}

    existing = novel_data.get("novel", {}).get("novel_summary", "")
    if existing:
        return {"summary": existing, "cached": True}

    chapters = novel_data.get("chapters", [])
    summaries = []
    for ch in chapters:
        s = ch.get("summary", "").strip()
        if s and s != "（空）":
            summaries.append(f"第{ch['order']+1}章 {ch['title']}：\n{s}")

    if not summaries:
        return {"summary": "", "cached": False}

    prompt = (
        "以下是一部小说的各章节概要。\n"
        "请综合为一段通顺的「全文梗概」，要求：\n"
        "- 概括核心故事线和主要角色成长弧\n"
        "- 语言简洁连贯，不分点、不编号\n"
        "- 保留故事的情感脉络和重要转折\n"
        "- 字数控制在 500 字以内\n\n"
        + "\n\n".join(summaries)
    )
    ai = AIWriter(load_settings())
    summary = ""
    async for chunk in ai.chat(
        "你是一个专业的文学摘要助手。根据各章概要生成连贯的全文梗概。",
        prompt,
    ):
        summary += chunk
    summary = summary.strip().strip('"').strip('「').strip('」')
    summary = '\n'.join(
        line for line in summary.split('\n')
        if not line.strip().startswith('# ') or '梗概' not in line
    ).strip()

    if summary:
        novel_data.setdefault("novel", {})["novel_summary"] = summary
        save_novel(name, novel_data)

    return {"summary": summary, "cached": False}
