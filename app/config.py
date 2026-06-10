"""配置管理 — 封装 settings.json 的读写和全局路径常量"""

import json
from pathlib import Path

# 全局路径常量
APP_DIR = Path(__file__).parent.parent
DATA_DIR = APP_DIR / "data"
SETTINGS_PATH = DATA_DIR / "settings.json"       # 持久化路径（挂载的卷内）
_FALLBACK_SETTINGS_PATH = APP_DIR / "settings.json"  # 备胎路径（镜像内置默认值）

DATA_DIR.mkdir(exist_ok=True)

_DEFAULT_SETTINGS = {
    "provider": "claude",
    "api_key": "",
    "api_base": "",
    "model": "",
    "max_tokens": 4096,
    "temperature": 0.7,
}


def _load_json(path: Path, default=None):
    if path.exists():
        return json.loads(path.read_text("utf-8"))
    return default if default is not None else {}


def _save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


# ---------------------------------------------------------------------------
# Settings API
# ---------------------------------------------------------------------------

def load_settings() -> dict:
    """读取 AI 配置，优先使用持久化路径，其次容器内置默认"""
    if SETTINGS_PATH.exists():
        return _load_json(SETTINGS_PATH, default=_DEFAULT_SETTINGS)
    # 首次启动：从镜像内置 settings 读取，写入持久化路径
    builtin = _load_json(_FALLBACK_SETTINGS_PATH, default=_DEFAULT_SETTINGS)
    _save_json(SETTINGS_PATH, builtin)
    return builtin


def save_settings(data: dict) -> dict:
    """合并保存 AI 配置到持久化路径"""
    saved = load_settings()
    saved.update(data)
    _save_json(SETTINGS_PATH, saved)
    return saved
