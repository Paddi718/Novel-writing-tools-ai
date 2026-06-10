#!/usr/bin/env python3
"""小说写作工具 — 启动入口"""

import sys

import uvicorn
from app.config import DATA_DIR

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"小说写作工具启动：http://127.0.0.1:8001")
    print(f"数据目录：{DATA_DIR}")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=False)
