"""AI 服务层 — system prompt 构建、概要生成/缓存管理（基于 .novel 存储）"""

from app.config import load_settings
from app.storage import load_novel, save_novel
from app.ai_writer import AIWriter


# ──────────────────────────────────────────────────────────────────────
# System prompt 构建
# ──────────────────────────────────────────────────────────────────────

def build_system_context(name: str, chapter_id: str, data) -> str:
    """构建带章节上下文的 system prompt"""
    novel_data = load_novel(name)
    if novel_data is None:
        return "小说不存在"

    settings = load_settings()
    custom_instruction = (settings.get("writing_instruction") or "").strip()

    chapters = novel_data.get("chapters", [])
    chapter = next((ch for ch in chapters if ch["id"] == chapter_id), None)
    if chapter is None:
        return "章节不存在"

    chapter_title = chapter.get("title", "")
    full_content = chapter.get("content", "")
    summary_text = chapter.get("summary", "").strip()

    # ─── 第 1 层：基础身份 + 自定义指令 ───
    parts = ["你是专业的小说写作助手。"]
    if custom_instruction:
        parts.append(f"【用户自定义写作要求】\n{custom_instruction}")

    # ─── 第 2 层：模式指令 ───
    mode_notes = []

    if data.mode == "continue":
        mode_notes.append(
            "【续写模式】\n"
            "只输出小说续写正文，绝不输出任何解释、引导语或备注。\n"
            "规则：\n"
            "- 不要以「好的」「以下」「我来」「这是」开头\n"
            "- 直接输出续写正文，不要反问或征求意见\n"
            "- 严格保持角色人设、语气和性格\n"
            "- 延续当前的叙事视角（不切换人称）\n"
            "- 保持行文风格和描写密度\n"
            "- 不要重复已写过的内容\n"
            "- 与已有内容无缝衔接\n"
            "- 情节紧凑，直接推进主线，减少无关描写\n"
            "- 对话简洁有力，去掉废话"
        )
        if data.target_length and data.target_length > 0:
            mode_notes.append(
                f"严格控制字数在 {data.target_length} 字左右，达到目标字数后立即收尾。"
            )

    elif data.mode in ("polish", "expand", "condense", "rewrite"):
        mode_map = {
            "polish": "润色", "expand": "扩写",
            "condense": "缩写", "rewrite": "重写",
        }
        mode_notes.append(
            f"【{mode_map[data.mode]}模式】\n"
            f"对以下原文进行「{mode_map[data.mode]}」处理。\n"
            "只输出处理后的结果，不添加任何解释、引导语或备注。\n"
            "不要以「好的」「以下」「这是」开头。"
        )
        if data.selected_text:
            mode_notes.append(f"原文：\n{data.selected_text}")

    else:
        mode_notes.append(
            "【自由对话】\n"
            "- 用户自由提问时，结合章节内容正常回答，提供建议和分析\n"
            "- 如果用户要求提供标题、角色名、设定建议，只输出建议本身，不要改写正文\n"
            "- 只有当用户明确要求「续写」「写一段」「创作一段」时，才输出小说正文\n"
            "- 回答简洁直接，不啰嗦"
        )

    if mode_notes:
        parts.append("\n".join(mode_notes))

    # ─── 第 3 层：章节背景信息 ───
    info = [f"当前章节：{chapter_title}"]

    # 前情提要
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
        info.append(f"本章概要：{summary_text}")

    # 前一章全文
    prev_ch = None
    for i, ch in enumerate(chapters):
        if ch["id"] == chapter_id and i > 0:
            prev_ch = chapters[i - 1]
            break
    if prev_ch:
        prev_text = prev_ch.get("content", "").strip()
        if prev_text:
            info.append(f"前一章（{prev_ch['title']}）全文：\n{prev_text}")

    if info:
        parts.append("【章节信息】\n" + "\n".join(info))

    # ─── 第 4 层：已有内容 ───
    if full_content.strip() and data.mode in ("continue", "chat"):
        parts.append(
            f"以下是本章全文（共 {len(full_content)} 字），作为背景参考：\n"
            f"{full_content}"
        )
        if data.mode == "continue":
            recent_len = min(2000, len(full_content))
            recent = full_content[-recent_len:]
            parts.append(
                f"【紧接上文——请从这里开始续写】\n"
                f"（以下 {recent_len} 字是紧接着续写点的前文）\n"
                f"{recent}"
            )

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
        "为以下小说章节生成结构化概要，包含以下字段：\n"
        "- 【概要】2-3句话概括本章核心情节（必填）\n"
        "- 【人物】本章出现的主要角色及其状态（必填）\n"
        "- 【情节】按顺序列出关键事件（必填）\n"
        "- 【设定】本章揭示的重要设定或背景信息（可选）\n"
        "- 【伏笔】本章埋下的悬念或伏笔（可选）\n\n"
        "格式示例：\n"
        "【概要】林渊在练武场测试修为时戒指异动，被林震山察觉。\n"
        "【人物】林渊（炼气二层）、林震山（炼气七层，执法长老）\n"
        "【情节】测试修为 → 戒指灵力外泄 → 林震山逼问 → 三叔公开口解围\n\n"
        f"{content[:4000]}"
    )
    summary_text = ""
    async for chunk in ai.chat(
        "你是一个专业的网络小说摘要助手。"
        "为章节生成结构化概要，字段完整，语言简洁。",
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
