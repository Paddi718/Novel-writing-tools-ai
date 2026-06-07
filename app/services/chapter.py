"""章节业务逻辑层 — 基于 .novel 单文件存储"""

from datetime import datetime

from app.models import ChapterCreate, ChapterUpdate
from app.storage import load_novel, save_novel, word_count


def _next_chapter_id(chapters: list[dict]) -> str:
    existing = {ch["id"] for ch in chapters}
    idx = 1
    while f"ch_{idx:03d}" in existing:
        idx += 1
    return f"ch_{idx:03d}"


def list_chapters(name: str) -> list[dict] | None:
    """获取章节列表"""
    data = load_novel(name)
    if data is None:
        return None
    return [
        {"id": ch["id"], "title": ch["title"],
         "order": ch["order"], "word_count": ch.get("word_count", 0)}
        for ch in data.get("chapters", [])
    ]


def get_chapter(name: str, chapter_id: str) -> dict | None:
    """获取单个章节（含正文）"""
    data = load_novel(name)
    if data is None:
        return None
    for ch in data.get("chapters", []):
        if ch["id"] == chapter_id:
            return {
                "id": ch["id"],
                "title": ch["title"],
                "order": ch["order"],
                "content": ch.get("content", ""),
                "word_count": ch.get("word_count", 0),
            }
    return None


def create_chapter(name: str, ch_data: ChapterCreate) -> dict | None:
    """新建章节"""
    novel_data = load_novel(name)
    if novel_data is None:
        return None
    chapters = novel_data.setdefault("chapters", [])
    ch_id = _next_chapter_id(chapters)
    now = datetime.now().isoformat(timespec="seconds")
    chapter = {
        "id": ch_id,
        "title": ch_data.title,
        "order": len(chapters),
        "content": "",
        "summary": "",
        "word_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    chapters.append(chapter)
    novel_data["novel"]["updated_at"] = now
    save_novel(name, novel_data)
    return {"id": ch_id, "title": ch_data.title, "order": chapter["order"]}


def update_chapter(name: str, chapter_id: str, ch_data: ChapterUpdate) -> dict | None:
    """更新章节信息或内容"""
    novel_data = load_novel(name)
    if novel_data is None:
        return None
    chapter = next(
        (ch for ch in novel_data.get("chapters", []) if ch["id"] == chapter_id),
        None,
    )
    if chapter is None:
        return None

    now = datetime.now().isoformat(timespec="seconds")
    if ch_data.title is not None:
        chapter["title"] = ch_data.title
    if ch_data.content is not None:
        chapter["content"] = ch_data.content
        chapter["word_count"] = word_count(ch_data.content)
    chapter["updated_at"] = now
    novel_data["novel"]["updated_at"] = now
    save_novel(name, novel_data)

    return {
        "id": chapter["id"],
        "title": chapter["title"],
        "order": chapter["order"],
        "content": chapter.get("content", ""),
        "word_count": chapter.get("word_count", 0),
    }


def delete_chapter(name: str, chapter_id: str) -> bool:
    """删除章节"""
    novel_data = load_novel(name)
    if novel_data is None:
        return False
    chapters = novel_data.get("chapters", [])
    new_chapters = [ch for ch in chapters if ch["id"] != chapter_id]
    if len(new_chapters) == len(chapters):
        return False
    for i, ch in enumerate(new_chapters):
        ch["order"] = i
    novel_data["chapters"] = new_chapters
    novel_data["novel"]["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_novel(name, novel_data)
    return True


def reorder_chapters(name: str, order: list[str]) -> list[dict] | None:
    """调整章节顺序"""
    novel_data = load_novel(name)
    if novel_data is None:
        return None
    ch_map = {ch["id"]: ch for ch in novel_data.get("chapters", [])}
    new_order = []
    for i, ch_id in enumerate(order):
        if ch_id in ch_map:
            ch = ch_map[ch_id]
            ch["order"] = i
            new_order.append(ch)
    novel_data["chapters"] = new_order
    save_novel(name, novel_data)
    return [
        {"id": ch["id"], "title": ch["title"],
         "order": ch["order"], "word_count": ch.get("word_count", 0)}
        for ch in new_order
    ]


def split_chapter(name: str, chapter_id: str,
                  split_point: int, new_title: str) -> dict | None:
    """从 split_point 处拆分章节为两章"""
    novel_data = load_novel(name)
    if novel_data is None:
        return None
    chapter = next(
        (ch for ch in novel_data.get("chapters", []) if ch["id"] == chapter_id),
        None,
    )
    if chapter is None:
        return None

    content = chapter.get("content", "")
    if split_point <= 0 or split_point >= len(content):
        return None

    part1 = content[:split_point].rstrip()
    part2 = content[split_point:].lstrip()

    now = datetime.now().isoformat(timespec="seconds")
    chapter["content"] = part1
    chapter["word_count"] = word_count(part1)
    chapter["updated_at"] = now

    new_id = _next_chapter_id(novel_data["chapters"])
    new_chapter = {
        "id": new_id,
        "title": new_title.strip() or f"{chapter['title']}（续）",
        "order": chapter["order"] + 1,
        "content": part2,
        "summary": "",
        "word_count": word_count(part2),
        "created_at": now,
        "updated_at": now,
    }
    for ch in novel_data["chapters"]:
        if ch["order"] > chapter["order"]:
            ch["order"] += 1
    novel_data["chapters"].insert(chapter["order"] + 1, new_chapter)
    novel_data["novel"]["updated_at"] = now
    save_novel(name, novel_data)

    return {
        "old_chapter": {
            "id": chapter["id"], "title": chapter["title"],
            "order": chapter["order"], "word_count": word_count(part1),
        },
        "new_chapter": {
            "id": new_id, "title": new_chapter["title"],
            "order": new_chapter["order"], "word_count": word_count(part2),
        },
    }
