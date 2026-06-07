"""章节 CRUD + 排序 + 拆分路由

注意路由注册顺序：具体路径（/reorder, /split）在参数路径（/{chapter_id}）之前。
"""

from fastapi import APIRouter, HTTPException

from app.models import ChapterCreate, ChapterUpdate, ChapterReorder, ChapterSplitRequest
from app.services import chapter as service

router = APIRouter(prefix="/api/novels/{name}/chapters", tags=["章节"])


@router.put("/reorder")
def reorder_chapters(name: str, data: ChapterReorder):
    """调整章节顺序（必须注册在 /{chapter_id} 之前）"""
    result = service.reorder_chapters(name, data.order)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.get("")
def list_chapters(name: str):
    """获取章节列表"""
    result = service.list_chapters(name)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.post("")
def create_chapter(name: str, data: ChapterCreate):
    """新建章节"""
    result = service.create_chapter(name, data)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.get("/{chapter_id}")
def get_chapter(name: str, chapter_id: str):
    """获取章节内容"""
    result = service.get_chapter(name, chapter_id)
    if result is None:
        raise HTTPException(404, "小说不存在或章节不存在")
    return result


@router.put("/{chapter_id}")
def update_chapter(name: str, chapter_id: str, data: ChapterUpdate):
    """更新章节信息或内容"""
    result = service.update_chapter(name, chapter_id, data)
    if result is None:
        raise HTTPException(404, "小说不存在或章节不存在")
    return result


@router.delete("/{chapter_id}")
def delete_chapter(name: str, chapter_id: str):
    """删除章节"""
    if not service.delete_chapter(name, chapter_id):
        raise HTTPException(404, "小说或章节不存在")
    return {"ok": True}


@router.post("/{chapter_id}/split")
def split_chapter(name: str, chapter_id: str, data: ChapterSplitRequest):
    """从 split_point 处拆分章节为两章"""
    result = service.split_chapter(name, chapter_id, data.split_point, data.new_title)
    if result is None:
        raise HTTPException(404, "小说不存在或章节不存在")
    return result
