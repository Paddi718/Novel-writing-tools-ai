"""AI 配置设置路由"""

from fastapi import APIRouter

from app.models import AISettings
from app.config import load_settings, save_settings

router = APIRouter(prefix="/api/settings", tags=["设置"])


@router.get("")
def get_settings():
    """获取 AI 配置"""
    return load_settings()


@router.put("")
def update_settings(data: AISettings):
    """保存 AI 配置"""
    return save_settings(data.model_dump(exclude_unset=True))
