"""导出业务逻辑层 — 与 HTTP 响应格式无关的导出数据处理"""

from app.storage import load_novel


def sanitize_filename(s: str) -> str:
    """过滤文件名中的非法字符"""
    return "".join(c if c.isalnum() or c in (" ", "-", "_", ".") else "_" for c in s)


def chapter_content(meta_title: str, ch: dict, fmt: str = 'txt') -> str:
    """根据格式生成章节内容"""
    if fmt == 'md':
        return f"# 第{ch['order'] + 1}章  {ch['title']}\n\n{ch.get('content', '')}"
    return f"第{ch['order'] + 1}章  {ch['title']}\n\n{ch.get('content', '')}"


def chapter_filename(ch: dict, fmt: str = 'txt') -> str:
    """生成章节文件名（含扩展名）"""
    ext = 'md' if fmt == 'md' else 'txt'
    return sanitize_filename(f"第{ch['order'] + 1:03d}章_{ch['title']}.{ext}")


def media_type(fmt: str = 'txt') -> str:
    """根据格式返回 MIME type"""
    return 'text/markdown; charset=utf-8' if fmt == 'md' else 'text/plain; charset=utf-8'


def get_export_package(name: str, chapter_ids: list[str] | None = None, fmt: str = 'txt'):
    """加载小说并筛选章节，返回 (meta, chapters, format) 供路由组装响应"""
    data = load_novel(name)
    if data is None:
        return None

    meta = data["novel"]
    chapters = data.get("chapters", [])
    if chapter_ids is not None:
        chapters = [ch for ch in chapters if ch["id"] in chapter_ids]
        if not chapters:
            return None  # 选中的章节都不存在

    return meta, chapters, fmt
