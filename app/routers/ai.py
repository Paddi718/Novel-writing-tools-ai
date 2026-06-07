"""AI 聊天 + 概要路由"""

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import AIChatRequest
from app.services import ai as service
from app.config import load_settings
from app.ai_writer import AIWriter
from app.storage import load_novel

router = APIRouter(prefix="/api/novels/{name}/chapters/{chapter_id}", tags=["AI"])


def _load_and_validate(name: str, chapter_id: str) -> dict:
    """加载小说并验证章节存在，返回 novel_data 或抛出 404"""
    novel_data = load_novel(name)
    if novel_data is None:
        raise HTTPException(404, "小说不存在")
    if not any(ch["id"] == chapter_id for ch in novel_data.get("chapters", [])):
        raise HTTPException(404, "章节不存在")
    return novel_data


@router.post("/ai/chat")
async def ai_chat(name: str, chapter_id: str, data: AIChatRequest):
    """AI 聊天 — 流式返回 SSE"""
    _load_and_validate(name, chapter_id)

    settings = load_settings()
    if not data.target_length:
        data.target_length = settings.get("target_length", 0)

    if data.target_length and data.target_length > 0:
        calculated = max(int(data.target_length * 1.4) + 200, 500)
        settings["max_tokens"] = min(calculated, 128000)

    system = service.build_system_context(name, chapter_id, data)
    user_message = service.build_user_message(data)
    ai = AIWriter(settings)

    async def event_stream():
        yield "event: start\ndata: {}\n\n"
        async for chunk in ai.chat(system, user_message):
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/summary")
async def get_summary(name: str, chapter_id: str):
    """获取章节概要（优先读缓存，没有则 AI 生成）"""
    _load_and_validate(name, chapter_id)
    return await service.get_or_generate_summary(name, chapter_id)


@router.post("/summary")
async def regenerate_summary(name: str, chapter_id: str):
    """强制重新生成概要"""
    _load_and_validate(name, chapter_id)
    return await service.regenerate_summary(name, chapter_id)
