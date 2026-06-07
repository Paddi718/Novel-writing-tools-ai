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
