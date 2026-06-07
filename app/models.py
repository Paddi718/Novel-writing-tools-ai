"""Pydantic 数据模型 — 所有请求/响应 schema"""

from typing import Optional
from pydantic import BaseModel


class NovelCreate(BaseModel):
    title: str
    author: str = ""
    description: str = ""


class ChapterCreate(BaseModel):
    title: str


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class ChapterReorder(BaseModel):
    order: list[str]


class AIChatRequest(BaseModel):
    message: str
    mode: str = "chat"
    selected_text: str = ""
    cursor_pos: int = -1
    target_length: int = 0


class ChapterSplitRequest(BaseModel):
    split_point: int
    new_title: str = ""


class AISettings(BaseModel):
    provider: str = "claude"
    api_key: str = ""
    api_base: str = ""
    model: str = ""
    max_tokens: int = 4096
    temperature: float = 0.7
    target_length: int = 0
    writing_instruction: str = ""


class NovelSettings(BaseModel):
    """每部小说的独立 UI 配置"""
    last_chapter_id: str = ""
    overview_view: str = "grid"  # "grid" | "list"
    overview_reversed: bool = False
    sidebar_reversed: bool = False
