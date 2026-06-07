"""小说 CRUD 路由"""

from fastapi import APIRouter, HTTPException

from app.models import NovelCreate, NovelSettings
from app.services import novel as service
from app.storage import load_novel, save_novel
from app.config import load_settings
from app.ai_writer import AIWriter

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


@router.get("/{name}/search")
def search_novel(name: str, q: str = "", scope: str = "all", chapter_id: str = ""):
    """搜索全文（scope=all）或当前章节（scope=chapter）"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")
    if not q.strip():
        return {"results": []}

    query = q.strip().lower()
    chapters = data.get("chapters", [])
    if scope == "chapter" and chapter_id:
        chapters = [ch for ch in chapters if ch["id"] == chapter_id]

    results = []
    for ch in chapters:
        content = ch.get("content", "")
        if query not in content.lower():
            continue
        # 找到匹配位置，截取上下文
        idx = content.lower().index(query)
        start = max(0, idx - 30)
        end = min(len(content), idx + len(query) + 60)
        snippet = content[start:end]
        if start > 0:
            snippet = "…" + snippet
        if end < len(content):
            snippet = snippet + "…"

        results.append({
            "chapter_id": ch["id"],
            "chapter_title": ch["title"],
            "chapter_order": ch["order"],
            "snippet": snippet,
            "match_count": content.lower().count(query),
        })

    return {"results": results, "query": q}


@router.get("/{name}/novel-summary")
async def get_novel_summary(name: str):
    """获取/生成全文梗概（汇总所有章节概要）"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")

    # 检查是否已有缓存
    existing = data.get("novel", {}).get("novel_summary", "")
    if existing:
        return {"summary": existing, "cached": True}

    chapters = data.get("chapters", [])
    summaries = []
    for ch in chapters:
        s = ch.get("summary", "").strip()
        if s and s != "（空）":
            summaries.append(f"第{ch['order']+1}章 {ch['title']}：\n{s}")

    if not summaries:
        return {"summary": "", "cached": False}

    # AI 合成全文梗概
    prompt = (
        "以下是一部小说的各章节概要，请综合为一段通顺完整的「全文梗概」，"
        "概括核心故事线、主要角色成长和结局走向。语言简洁连贯，不分点列表。\n\n"
        + "\n\n".join(summaries)
    )
    ai = AIWriter(load_settings())
    summary = ""
    async for chunk in ai.chat(
        "你是一个专业的文学摘要助手。根据各章概要生成连贯的全文梗概。",
        prompt,
    ):
        summary += chunk
    summary = summary.strip().strip('"').strip('「').strip('」')
    # 去掉 AI 生成的 "# 全文梗概" 等标题行
    summary = '\n'.join(
        line for line in summary.split('\n')
        if not line.strip().startswith('# ') or '梗概' not in line
    ).strip()

    if summary:
        data.setdefault("novel", {})["novel_summary"] = summary
        save_novel(name, data)

    return {"summary": summary, "cached": False}


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


@router.put("/{name}/settings")
def update_novel_settings(name: str, settings: NovelSettings):
    """保存小说 UI 配置"""
    data = load_novel(name)
    if data is None:
        raise HTTPException(404, "小说不存在")
    data["settings"] = settings.model_dump()
    save_novel(name, data)
    return {"ok": True}
