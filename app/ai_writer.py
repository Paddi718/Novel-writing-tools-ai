"""AI 写作引擎 — 支持 Claude CLI / OpenAI / Anthropic 三种后端"""

import asyncio
import codecs
import json
import os
import platform
import shutil
import subprocess
from typing import AsyncGenerator, Optional


class AIWriter:
    """AI 写作引擎"""

    def __init__(self, settings: dict):
        self.provider = settings.get("provider", "claude")
        self.api_key = settings.get("api_key", "")
        self.api_base = settings.get("api_base", "").rstrip("/")
        self.model = settings.get("model", "")
        self.max_tokens = settings.get("max_tokens", 4096)
        self.temperature = settings.get("temperature", 0.7)

    # ------------------------------------------------------------------
    # 对外接口
    # ------------------------------------------------------------------
    async def chat(self, system: str, user_input: str) -> AsyncGenerator[str, None]:
        """通用聊天 — system=系统提示, user_input=用户消息正文"""
        async for chunk in self._stream(system, user_input):
            yield chunk

    # ------------------------------------------------------------------
    # 流式调用
    # ------------------------------------------------------------------
    async def _stream(self, system: str, user_input: str) -> AsyncGenerator[str, None]:
        try:
            if self.provider == "claude":
                async for chunk in self._stream_claude(system, user_input):
                    yield chunk
            elif self.provider == "openai":
                async for chunk in self._stream_openai(system, user_input):
                    yield chunk
            elif self.provider == "anthropic":
                async for chunk in self._stream_anthropic(system, user_input):
                    yield chunk
            else:
                yield f"[错误] 不支持的 AI 提供商：{self.provider}"
        except FileNotFoundError:
            yield "[错误] 未找到 Claude CLI，请确认已安装"
        except Exception as e:
            yield f"[错误] {str(e)}"

    # ------------------------------------------------------------------
    # Claude CLI
    # ------------------------------------------------------------------
    async def _stream_claude(
        self, system: str, user_input: str
    ) -> AsyncGenerator[str, None]:
        cmd = self._find_claude()
        if not cmd:
            yield "[错误] 未找到 Claude CLI。请确认已安装：npm install -g @anthropic-ai/claude-code"
            return

        process = await asyncio.create_subprocess_exec(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # 拼合 prompt（Claude CLI 需要一次性发送）
        prompt = f"{system}\n\n{user_input}\n\n"
        process.stdin.write(prompt.encode("utf-8"))
        await process.stdin.drain()
        process.stdin.close()

        # 使用增量解码器，确保多字节 UTF-8 不被拆散
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        while True:
            raw = await process.stdout.read(256)
            if not raw:
                break
            text = decoder.decode(raw, final=False)
            if text:
                yield text
        # flush
        remaining = decoder.decode(b"", final=True)
        if remaining:
            yield remaining

        stderr = await process.stderr.read()
        if stderr:
            err = stderr.decode("utf-8", errors="replace").strip()
            if err:
                yield f"\n[stderr] {err}"
        await process.wait()

    @staticmethod
    def _find_claude() -> Optional[str]:
        claude = shutil.which("claude")
        if claude:
            return claude
        if platform.system() == "Windows":
            for ext in [".cmd", ".bat", ".exe"]:
                c = shutil.which("claude" + ext)
                if c:
                    return c
            # 常见 npm 安装位置
            for d in [
                os.path.expanduser("~\\AppData\\Roaming\\npm"),
                os.environ.get("APPDATA", "") + "\\npm",
                "C:\\Program Files\\nodejs",
            ]:
                for name in ["claude.cmd", "claude.bat", "claude"]:
                    p = os.path.join(d, name)
                    if os.path.isfile(p):
                        return p
        return None

    # ------------------------------------------------------------------
    # OpenAI 兼容 API
    # ------------------------------------------------------------------
    async def _stream_openai(
        self, system: str, user_input: str
    ) -> AsyncGenerator[str, None]:
        import httpx

        model = self.model or "gpt-4o"
        url = f"{self.api_base or 'https://api.openai.com/v1'}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_input},
            ],
            "stream": True,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST", url, json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    yield f"[HTTP {resp.status_code}] {err_body.decode()[:200]}"
                    return
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            pass

    # ------------------------------------------------------------------
    # Anthropic API
    # ------------------------------------------------------------------
    async def _stream_anthropic(
        self, system: str, user_input: str
    ) -> AsyncGenerator[str, None]:
        import httpx

        model = self.model or "claude-sonnet-4-6-20250514"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "system": system,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": [{"role": "user", "content": user_input}],
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers=headers,
            ) as resp:
                if resp.status_code != 200:
                    err_body = await resp.aread()
                    yield f"[HTTP {resp.status_code}] {err_body.decode()[:200]}"
                    return
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        try:
                            data = json.loads(data_str)
                            if data.get("type") == "content_block_delta":
                                delta = data.get("delta", {})
                                text = delta.get("text", "")
                                if text:
                                    yield text
                        except json.JSONDecodeError:
                            pass
