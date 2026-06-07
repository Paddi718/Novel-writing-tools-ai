"""配置管理 — 封装 settings.json 的读写和全局路径常量"""

import json
from pathlib import Path

# 全局路径常量
APP_DIR = Path(__file__).parent.parent
DATA_DIR = APP_DIR / "data"
SETTINGS_PATH = APP_DIR / "settings.json"

DATA_DIR.mkdir(exist_ok=True)


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
    """从 settings.json 读取 AI 配置"""
    return _load_json(SETTINGS_PATH, default={
        "provider": "claude",
        "api_key": "",
        "api_base": "",
        "model": "",
        "max_tokens": 4096,
        "temperature": 0.7,
    })


def save_settings(data: dict) -> dict:
    """合并保存 AI 配置到 settings.json"""
    saved = load_settings()
    saved.update(data)
    _save_json(SETTINGS_PATH, saved)
    return saved
