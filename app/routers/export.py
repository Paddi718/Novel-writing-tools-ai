"""小说导出/下载路由 — 支持 TXT / Markdown 格式

注意：路由职责限定为 HTTP 响应组装，导出业务逻辑委派给 services/export.py
"""

import io
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from app.services import export as export_service


class ExportSelection(BaseModel):
    chapter_ids: list[str]
    format: str = 'txt'  # 'txt' | 'md'


router = APIRouter(prefix="/api/novels/{name}", tags=["导出"])


def _content_disposition(fn: str) -> str:
    """生成兼容中文的 Content-Disposition（RFC 5987）"""
    ascii_name = fn.encode("ascii", errors="replace").decode("ascii")
    if ascii_name == fn:
        return f'attachment; filename="{fn}"'
    # 包含非 ASCII 字符 → 用 filename* 编码
    return f"attachment; filename*=UTF-8''{quote(fn)}"


# ──────────────────────────────────────────────
# 全部导出 ZIP
# ──────────────────────────────────────────────

@router.get("/export/zip")
def export_novel_zip(name: str, format: str = Query('txt', pattern='^(txt|md)$')):
    """导出全部章节为 ZIP（每章一个独立文件）"""
    package = export_service.get_export_package(name, fmt=format)
    if package is None:
        raise HTTPException(404, "小说不存在")

    meta, chapters, fmt = package
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
            content = export_service.chapter_content(meta['title'], ch, fmt)
            fn = export_service.chapter_filename(ch, fmt)
            zf.writestr(fn, content)

    buf.seek(0)
    fn = export_service.sanitize_filename(f"{name}.zip")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": _content_disposition(fn)},
    )


# ──────────────────────────────────────────────
# 选择导出 ZIP
# ──────────────────────────────────────────────

@router.post("/export/zip-selected")
def export_selected_zip(name: str, selection: ExportSelection):
    """导出选中的章节为 ZIP"""
    fmt = selection.format
    package = export_service.get_export_package(name, selection.chapter_ids, fmt)
    if package is None:
        raise HTTPException(404, "小说不存在或未选择任何章节")

    meta, chapters, fmt = package
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ch in chapters:
            content = export_service.chapter_content(meta['title'], ch, fmt)
            fn = export_service.chapter_filename(ch, fmt)
            zf.writestr(fn, content)

    buf.seek(0)
    fn = export_service.sanitize_filename(f"{name}_selected.zip")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": _content_disposition(fn)},
    )


# ──────────────────────────────────────────────
# 单章下载
# ──────────────────────────────────────────────

@router.get("/chapters/{chapter_id}/download")
def download_chapter(name: str, chapter_id: str, format: str = Query('txt', pattern='^(txt|md)$')):
    """下载单个章节"""
    package = export_service.get_export_package(name, fmt=format)
    if package is None:
        raise HTTPException(404, "小说不存在")

    meta, chapters, fmt = package
    chapter = next((ch for ch in chapters if ch["id"] == chapter_id), None)
    if chapter is None:
        raise HTTPException(404, "章节不存在")

    content = export_service.chapter_content(meta['title'], chapter, fmt)
    fn = export_service.chapter_filename(chapter, fmt)
    mt = export_service.media_type(fmt)
    return PlainTextResponse(
        content,
        media_type=mt,
        headers={"Content-Disposition": _content_disposition(fn)},
    )
