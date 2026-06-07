"""数据访问层 — 每部小说 = 一个 .novel JSON 文件"""

import json
from pathlib import Path

from app.config import DATA_DIR


def novel_file_path(name: str) -> Path:
    """返回 .novel 文件的路径"""
    return DATA_DIR / f"{name}.novel"


def list_novel_names() -> list[str]:
    """列出所有小说名（不含 .novel 后缀）"""
    return sorted([p.stem for p in DATA_DIR.glob("*.novel")])


def load_novel(name: str) -> dict | None:
    """加载整部小说的 JSON 数据"""
    path = novel_file_path(name)
    if not path.exists():
        return None
    return json.loads(path.read_text("utf-8"))


def save_novel(name: str, data: dict):
    """保存整部小说的 JSON 数据"""
    path = novel_file_path(name)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")


def delete_novel_file(name: str) -> bool:
    """删除 .novel 文件"""
    path = novel_file_path(name)
    if path.exists():
        path.unlink()
        return True
    return False


def word_count(text: str) -> int:
    """统计中文字数 + 英文字母数"""
    count = 0
    for ch in text:
        if '一' <= ch <= '鿿' or '　' <= ch <= '〿':
            count += 1
        elif ch.isascii() and ch.isalpha():
            count += 1
    return count
