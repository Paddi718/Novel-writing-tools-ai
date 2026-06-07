"""小说写作工具 — FastAPI 应用组装"""

from pathlib import Path

from fastapi import FastAPI, Request

from app.routers import novels, chapters, ai, settings, export

# ---------------------------------------------------------------------------
# 应用实例
# ---------------------------------------------------------------------------
app = FastAPI(title="小说写作工具", version="1.0.0")

# ---------------------------------------------------------------------------
# 注册路由（顺序敏感：具体路径 > 参数路径）
# ---------------------------------------------------------------------------
app.include_router(novels.router)
app.include_router(chapters.router)
app.include_router(ai.router)
app.include_router(settings.router)
app.include_router(export.router)


# ---------------------------------------------------------------------------
# 调试
# ---------------------------------------------------------------------------
@app.post("/api/debug/echo")
async def debug_echo(request: Request):
    """回显请求信息"""
    body = await request.body()
    return {
        "method": request.method,
        "path": request.url.path,
        "headers": dict(request.headers),
        "body": body.decode("utf-8", errors="replace")[:500],
    }


# ---------------------------------------------------------------------------
# 静态文件服务（必须最后挂载，避免抢断 API 路由）
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    from starlette.staticfiles import StaticFiles as _SMF

    class _NoCacheSMF(_SMF):
        async def get_response(self, path: str, scope):
            resp = await super().get_response(path, scope)
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            return resp

    app.mount("/", _NoCacheSMF(directory=str(STATIC_DIR), html=True), name="static")
