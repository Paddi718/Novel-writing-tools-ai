"""小说 CRUD 路由"""

from fastapi import APIRouter, HTTPException

from app.models import NovelCreate
from app.services import novel as service

router = APIRouter(prefix="/api/novels", tags=["小说"])


@router.get("")
def list_novels():
    """获取所有小说列表"""
    return service.list_novels()


@router.post("")
def create_novel(data: NovelCreate):
    """创建新小说"""
    result = service.create_novel(data)
    if result is None:
        raise HTTPException(400, f"小说「{data.title}」已存在")
    return result


@router.get("/{name}/overview")
def get_novel_overview(name: str):
    """获取小说目录概览（含每章概要缓存）"""
    result = service.get_novel_overview(name)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.get("/{name}")
def get_novel(name: str):
    """获取小说详情（含章节列表）"""
    result = service.get_novel(name)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.put("/{name}")
def update_novel(name: str, data: NovelCreate):
    """修改小说元信息"""
    result = service.update_novel(name, data)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.delete("/{name}")
def delete_novel(name: str):
    """删除小说"""
    if not service.delete_novel(name):
        raise HTTPException(404, "小说不存在")
    return {"ok": True}
