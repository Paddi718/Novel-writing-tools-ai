# 小说写作工具 📚✍️

一款面向网络小说作者的 AI 辅助写作 Web 应用。支持多部小说管理、章节编排、AI 续写/润色/扩写/缩写/重写、全文搜索、导出等功能。

## 功能

| 功能 | 说明 |
|------|------|
| **多部小说管理** | 创建、编辑、删除小说，每部小说独立存储 |
| **章节编排** | 任意增删章节，拖拽调整顺序，实时字数统计 |
| **目录概览** | 卡片/列表双视图，每章概要一目了然，支持逆序排列 |
| **AI 写作助手** | 续写、润色、扩写、缩写、重写、章节拆分 |
| **AI 设置** | 支持 Claude CLI（本地）、OpenAI 兼容 API、Anthropic API 三种后端 |
| **自定义写作指令** | 全局写作风格要求，每次 AI 请求自动带入 |
| **全文搜索** | 跨章节或当前章节内搜索，点击结果跳转定位 |
| **章节概要** | AI 自动生成结构化概要（情节/人物/伏笔），支持手动刷新 |
| **全文梗概** | 汇总所有章节概要，一键生成小说整体梗概 |
| **导出** | 单章或批量导出 TXT / Markdown，打包 ZIP 下载 |
| **专注模式** | 隐藏侧边栏和活动栏，沉浸式写作 |
| **暗色主题** | 亮色/暗色一键切换，跟随系统偏好 |
| **侧边栏** | 自由拖拽调节宽度，可折叠 |
| **UI 配置持久化** | 每部小说的视图偏好（卡片/列表、逆序）独立保存 |

## 截图

```
┌─────────┬──────────────┬──────────────────────┬──────────┐
│ 活动栏  │   侧边栏     │      编辑区          │ AI 助手  │
│  📚     │  📖 小说列表 │  ┌──────────────┐    │          │
│  🔍     │  📝 章节列表 │  │  编辑器      │    │  对话区  │
│         │              │  │              │    │          │
│         │              │  └──────────────┘    │          │
│         │              │  📋 章节概要          │          │
└─────────┴──────────────┴──────────────────────┴──────────┘
```

VS Code 风格的三栏布局：活动栏 → 侧边栏 → 主编辑区 + AI 聊天停靠区。

## 快速开始

### 前置条件

- **Python 3.13+**
- （可选）Node.js + `@anthropic-ai/claude-code`（使用 Claude CLI 本地模式时）

### 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/novel-writing-tool.git
cd novel-writing-tool

# 2. 安装依赖
pip install -r requirements.txt

# 3. 启动
python run.py
```

访问 `http://127.0.0.1:8001`。

### Docker

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f
```

访问 `http://127.0.0.1:8001`。

## 配置

### AI 后端

通过页面右上角 ⚙️ 设置按钮配置：

| 提供商 | 说明 | 需要 API Key |
|--------|------|-------------|
| Claude CLI | 本地运行，调用 `claude` 命令 | 否 |
| OpenAI 兼容 | 兼容 OpenAI / Azure / 国内中转 API | 是 |
| Anthropic API | 直接调用 Anthropic API | 是 |

**自定义写作指令**：可在设置中填写全局指令（如"故事是玄幻修仙风格，主角性格坚毅冷静"），每次 AI 请求自动带入上下文。

### 小说数据文件

每部小说存储为 `data/<书名>.novel` 的 JSON 文件，结构：

```json
{
  "format_version": "1.0",
  "novel": {
    "title": "书名",
    "author": "作者",
    "description": "简介",
    "created_at": "2025-01-01T12:00:00",
    "updated_at": "2025-01-01T12:00:00",
    "novel_summary": "全文梗概（AI 生成）"
  },
  "chapters": [
    {
      "id": "ch_001",
      "title": "第一章",
      "order": 0,
      "content": "正文…",
      "summary": "AI 生成的结构化概要",
      "word_count": 1234,
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "settings": {
    "last_chapter_id": "ch_001",
    "overview_view": "grid",
    "overview_reversed": false,
    "sidebar_reversed": false
  }
}
```

### 全局设置

`settings.json`（与 `run.py` 同级）：

```json
{
  "provider": "claude",
  "api_key": "",
  "api_base": "",
  "model": "",
  "max_tokens": 4096,
  "temperature": 0.7,
  "target_length": 0,
  "writing_instruction": ""
}
```

## 项目结构

```
├── run.py                    # 启动入口
├── requirements.txt          # Python 依赖
├── Dockerfile                # Docker 构建
├── docker-compose.yml        # Docker 编排
├── .dockerignore
├── .gitignore
├── settings.json             # AI 配置（含 API Key，已 gitignore）
├── data/                     # 小说数据（已 gitignore）
│   └── *.novel
├── app/
│   ├── main.py               # FastAPI 应用组装
│   ├── config.py             # 配置管理 + 路径常量
│   ├── models.py             # Pydantic 数据模型
│   ├── storage.py            # 数据访问层（读写 .novel 文件）
│   ├── ai_writer.py          # AI 引擎（Claude CLI / OpenAI / Anthropic）
│   ├── routers/              # 路由层
│   │   ├── novels.py         # 小说 CRUD + 搜索 + 全文梗概
│   │   ├── chapters.py       # 章节 CRUD + 排序 + 拆分
│   │   ├── ai.py             # AI 聊天 SSE 流 + 概要生成
│   │   ├── export.py         # 导出 TXT / MD / ZIP
│   │   └── settings.py       # AI 设置 CRUD
│   └── services/             # 业务逻辑层
│       ├── novel.py          # 小说管理
│       ├── chapter.py        # 章节管理
│       ├── ai.py             # System prompt 构建 + 概要生成
│       └── export.py         # 导出格式处理
└── static/                   # 前端静态文件
    ├── index.html            # SPA 入口
    ├── css/
    │   └── style.css         # 全部样式（亮色/暗色主题）
    └── js/
        ├── api.js            # API 封装（fetch + SSE 流式读取）
        ├── utils.js          # 纯工具函数（无 DOM 依赖）
        └── app.js            # 应用主逻辑（状态管理 + DOM 操作）
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存当前章节 |
| `Ctrl+F` | 搜索（打开搜索面板） |
| `Ctrl+Shift+F` | 专注模式 |
| `Ctrl+Shift+D` | 切换暗色主题 |
| `Escape` | 退出专注模式 / 关闭 AI 聊天 |
| `Enter` | AI 聊天发送消息 |
| `Shift+Enter` | AI 聊天换行 |

## 提示词工程

系统提示词采用分层结构：

```
Layer 1 — 身份定义 + 用户自定义指令
Layer 2 — 模式指令（续写/润色/扩写/缩写/重写/拆分/自由对话）
Layer 3 — 章节上下文（前情提要 + 本章概要 + 前一章全文）
Layer 4 — 已有内容（当前章节正文）
```

每种模式都有独立的规则约束和 few-shot 示例，确保输出格式一致。具体见 `app/services/ai.py`。

## API 概览

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/novels` | GET | 小说列表 |
| `/api/novels` | POST | 创建小说 |
| `/api/novels/{name}` | GET | 小说详情（含章节列表） |
| `/api/novels/{name}` | PUT | 修改小说 |
| `/api/novels/{name}` | DELETE | 删除小说 |
| `/api/novels/{name}/overview` | GET | 目录概览 |
| `/api/novels/{name}/search` | GET | 全文搜索 |
| `/api/novels/{name}/novel-summary` | GET | 全文梗概 |
| `/api/novels/{name}/settings` | PUT | UI 配置保存 |
| `/api/novels/{name}/chapters` | GET | 章节列表 |
| `/api/novels/{name}/chapters` | POST | 新建章节 |
| `/api/novels/{name}/chapters/{id}` | GET | 章节内容 |
| `/api/novels/{name}/chapters/{id}` | PUT | 更新章节 |
| `/api/novels/{name}/chapters/{id}` | DELETE | 删除章节 |
| `/api/novels/{name}/chapters/reorder` | PUT | 调整顺序 |
| `/api/novels/{name}/chapters/{id}/split` | POST | 拆分章节 |
| `/api/novels/{name}/chapters/{id}/ai/chat` | POST | AI 聊天（SSE 流式） |
| `/api/novels/{name}/chapters/{id}/summary` | GET | 章节概要 |
| `/api/novels/{name}/chapters/{id}/summary` | POST | 重新生成概要 |
| `/api/novels/{name}/chapters/{id}/download` | GET | 单章下载 |
| `/api/novels/{name}/export/zip` | GET | 全部导出 ZIP |
| `/api/novels/{name}/export/zip-selected` | POST | 选择导出 ZIP |
| `/api/settings` | GET/PUT | AI 设置 |
| `/api/debug/echo` | POST | 调试回显 |

## 许可

MIT
