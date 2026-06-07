"""小说 CRUD + 搜索 + 全文梗概路由

路由层职责：参数校验、HTTP 响应、错误码映射
业务逻辑委派给 services 层，数据访问委派给 storage 层
"""

from fastapi import APIRouter, HTTPException

from app.models import NovelCreate, NovelSettings
from app.services import novel as novel_service
from app.services import ai as ai_service
from app.storage import load_novel, save_novel

router = APIRouter(prefix="/api/novels", tags=["小说"])


@router.get("")
def list_novels():
    """获取所有小说列表"""
    return novel_service.list_novels()


@router.post("")
def create_novel(data: NovelCreate):
    """创建新小说"""
    result = novel_service.create_novel(data)
    if result is None:
        raise HTTPException(400, f"小说「{data.title}」已存在")
    return result


@router.get("/{name}/overview")
def get_novel_overview(name: str):
    """获取小说目录概览（含每章概要缓存）"""
    result = novel_service.get_novel_overview(name)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.get("/{name}/search")
def search_novel(name: str, q: str = "", scope: str = "all", chapter_id: str = ""):
    """搜索全文（scope=all）或当前章节（scope=chapter）"""
    result = novel_service.search_novel(name, q, scope, chapter_id)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.get("/{name}/novel-summary")
async def get_novel_summary(name: str):
    """获取/生成全文梗概（汇总所有章节概要）"""
    result = await ai_service.get_or_generate_novel_summary(name)
    # 服务层返回 {"summary": "..."}，小说不存在时也返回有效结构
    return result


@router.get("/{name}")
def get_novel(name: str):
    """获取小说详情（含章节列表）"""
    result = novel_service.get_novel(name)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.put("/{name}")
def update_novel(name: str, data: NovelCreate):
    """修改小说元信息"""
    result = novel_service.update_novel(name, data)
    if result is None:
        raise HTTPException(404, "小说不存在")
    return result


@router.delete("/{name}")
def delete_novel(name: str):
    """删除小说"""
    if not novel_service.delete_novel(name):
        raise HTTPException(404, "小说不存在")
    return {"ok": True}


@router.put("/{name}/settings")
def update_novel_settings(name: str, settings: NovelSettings):
    """保存小说 UI 配置"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")
    data["settings"] = settings.model_dump()
    save_novel(name, data)
    return {"ok": True}
