"""小说业务逻辑层 — 基于 .novel 单文件存储"""

from datetime import datetime

from app.models import NovelCreate
from app.storage import (
    list_novel_names, load_novel, save_novel,
    delete_novel_file,
)


def list_novels() -> list[dict]:
    """获取所有小说概要列表"""
    results = []
    for name in list_novel_names():
        data = load_novel(name)
        if data is None:
            continue
        meta = data["novel"]
        chapters = data.get("chapters", [])
        total_words = sum(ch.get("word_count", 0) for ch in chapters)
        results.append({
            "name": name,
            "title": meta.get("title", name),
            "author": meta.get("author", ""),
            "description": meta.get("description", ""),
            "created_at": meta.get("created_at", ""),
            "updated_at": meta.get("updated_at", ""),
            "chapter_count": len(chapters),
            "total_words": total_words,
        })
    return results


def _build_novel_response(name: str, data: dict,
                           include_summary: bool = False) -> dict:
    """从原始 novel 数据构建统一响应结构"""
    meta = data["novel"]
    chapters = data.get("chapters", [])
    chapter_list = []
    total_words = 0
    for ch in chapters:
        total_words += ch.get("word_count", 0)
        entry = {"id": ch["id"], "title": ch["title"],
                 "order": ch["order"],
                 "word_count": ch.get("word_count", 0)}
        if include_summary:
            entry["summary"] = ch.get("summary", "")
        chapter_list.append(entry)
    return {
        "name": name,
        "title": meta.get("title", name),
        "author": meta.get("author", ""),
        "description": meta.get("description", ""),
        "created_at": meta.get("created_at", ""),
        "updated_at": meta.get("updated_at", ""),
        "chapters": chapter_list,
        "chapter_count": len(chapter_list),
        "total_words": total_words,
        "settings": data.get("settings", {}),
    }


def get_novel(name: str) -> dict | None:
    """获取小说详情（含章节列表，不含正文与概要）"""
    data = load_novel(name)
    if data is None:
        return None
    return _build_novel_response(name, data, include_summary=False)


def get_novel_overview(name: str) -> dict | None:
    """获取小说目录概览（章节列表 + 每章的概要）"""
    data = load_novel(name)
    if data is None:
        return None
    return _build_novel_response(name, data, include_summary=True)


def create_novel(data: NovelCreate) -> dict | None:
    """创建新小说"""
    name = data.title.strip()
    if load_novel(name) is not None:
        return None  # 已存在
    now = datetime.now().isoformat(timespec="seconds")
    novel_data = {
        "format_version": "1.0",
        "novel": {
            "title": data.title,
            "author": data.author or "",
            "description": data.description or "",
            "created_at": now,
            "updated_at": now,
        },
        "chapters": [],
        "settings": {},
    }
    save_novel(name, novel_data)
    return {
        "name": name,
        **novel_data["novel"],
        "chapter_count": 0,
        "total_words": 0,
    }


def update_novel(name: str, data: NovelCreate) -> dict | None:
    """修改小说元信息（改名时自动迁移文件）"""
    novel_data = load_novel(name)
    if novel_data is None:
        return None
    meta = novel_data["novel"]
    meta["title"] = data.title or meta["title"]
    meta["author"] = data.author or meta.get("author", "")
    meta["description"] = data.description or meta.get("description", "")
    meta["updated_at"] = datetime.now().isoformat(timespec="seconds")

    new_name = name
    if data.title and data.title != name:
        new_name = data.title
        delete_novel_file(name)
    save_novel(new_name, novel_data)
    return {"name": new_name, **meta}


def delete_novel(name: str) -> bool:
    """删除小说"""
    return delete_novel_file(name)
