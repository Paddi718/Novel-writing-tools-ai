"""小说导出/下载路由 — 支持 TXT / Markdown 格式"""

import io
import zipfile

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from app.storage import load_novel


class ExportSelection(BaseModel):
    chapter_ids: list[str]
    format: str = 'txt'  # 'txt' | 'md'


router = APIRouter(prefix="/api/novels/{name}", tags=["导出"])


def _filename(s: str) -> str:
    """过滤文件名中的非法字符"""
    return "".join(c if c.isalnum() or c in (" ", "-", "_", ".") else "_" for c in s)


def _chapter_content(meta_title: str, ch, fmt: str = 'txt') -> str:
    """根据格式生成章节内容"""
    if fmt == 'md':
        return f"# 第{ch['order'] + 1}章  {ch['title']}\n\n{ch.get('content', '')}"
    return f"第{ch['order'] + 1}章  {ch['title']}\n\n{ch.get('content', '')}"


def _chapter_filename(ch, fmt: str = 'txt') -> str:
    """生成章节文件名（含扩展名）"""
    ext = 'md' if fmt == 'md' else 'txt'
    return _filename(f"第{ch['order'] + 1:03d}章_{ch['title']}.{ext}")


def _media_type(fmt: str = 'txt') -> str:
    return 'text/markdown; charset=utf-8' if fmt == 'md' else 'text/plain; charset=utf-8'


# ──────────────────────────────────────────────
# 全部导出 ZIP
# ──────────────────────────────────────────────

@router.get("/export/zip")
def export_novel_zip(name: str, format: str = Query('txt', pattern='^(txt|md)$')):
    """导出全部章节为 ZIP（每章一个独立文件）"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")

    meta = data["novel"]
    chapters = data.get("chapters", [])
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 小说信息文件始终为 .txt
        info_lines = [
            f"《{meta['title']}》",
            f"作者：{meta.get('author', '未知')}",
            f"章节数：{len(chapters)}",
            f"简介：{meta.get('description', '无')}",
        ]
        zf.writestr("00_小说信息.txt", "\n".join(info_lines))

        for ch in chapters:
            content = _chapter_content(meta['title'], ch, format)
            fn = _chapter_filename(ch, format)
            zf.writestr(fn, content)

    buf.seek(0)
    fn = _filename(f"{name}.zip")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


# ──────────────────────────────────────────────
# 选择导出 ZIP
# ──────────────────────────────────────────────

@router.post("/export/zip-selected")
def export_selected_zip(name: str, selection: ExportSelection):
    """导出选中的章节为 ZIP"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")

    fmt = selection.format
    chapters = data.get("chapters", [])
    selected = [ch for ch in chapters if ch["id"] in selection.chapter_ids]
    if not selected:
        raise HTTPException(400, "未选择任何章节")

    meta = data["novel"]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ch in selected:
            content = _chapter_content(meta['title'], ch, fmt)
            fn = _chapter_filename(ch, fmt)
            zf.writestr(fn, content)

    buf.seek(0)
    fn = _filename(f"{name}_selected.zip")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )


# ──────────────────────────────────────────────
# 单章下载
# ──────────────────────────────────────────────

@router.get("/chapters/{chapter_id}/download")
def download_chapter(name: str, chapter_id: str, format: str = Query('txt', pattern='^(txt|md)$')):
    """下载单个章节"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")

    chapter = next(
        (ch for ch in data.get("chapters", []) if ch["id"] == chapter_id),
        None,
    )
    if chapter is None:
        raise HTTPException(404, "章节不存在")

    meta = data["novel"]
    fmt = format
    content = _chapter_content(meta['title'], chapter, fmt)
    fn = _chapter_filename(chapter, fmt)
    return PlainTextResponse(
        content,
        media_type=_media_type(fmt),
        headers={"Content-Disposition": f'attachment; filename="{fn}"'},
    )
