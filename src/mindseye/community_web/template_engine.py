from __future__ import annotations

import html
import re
from pathlib import Path
from typing import Any, Mapping


_INCLUDE_RE = re.compile(r"\{\{\s*include:([^}]+?)\s*\}\}")
_RAW_VAR_RE = re.compile(r"\{\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}\}")
_VAR_RE = re.compile(r"\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}")


class TemplateEngine:
    def __init__(self, template_root: Path):
        self.template_root = template_root.resolve()
        self._cache: dict[str, str] = {}

    def render(self, template_name: str, context: Mapping[str, Any] | None = None) -> str:
        return self._render_text(self._load_template(template_name), dict(context or {}))

    def render_partial(self, template_name: str, context: Mapping[str, Any] | None = None) -> str:
        return self.render(template_name, context)

    def _render_text(self, text: str, context: Mapping[str, Any]) -> str:
        text = _INCLUDE_RE.sub(lambda match: self.render(match.group(1).strip(), context), text)
        text = _RAW_VAR_RE.sub(lambda match: self._stringify(self._resolve(context, match.group(1))), text)
        text = _VAR_RE.sub(lambda match: html.escape(self._stringify(self._resolve(context, match.group(1)))), text)
        return text

    def _load_template(self, template_name: str) -> str:
        normalized = template_name.strip().replace("\\", "/")
        template_path = (self.template_root / normalized).resolve()
        if self.template_root != template_path and self.template_root not in template_path.parents:
            raise ValueError(f"template path escapes root: {template_name}")
        cached = self._cache.get(normalized)
        if cached is None:
            cached = template_path.read_text(encoding="utf-8")
            self._cache[normalized] = cached
        return cached

    def _resolve(self, context: Mapping[str, Any], path: str) -> Any:
        current: Any = context
        for part in path.split("."):
            if isinstance(current, Mapping):
                current = current.get(part)
            elif isinstance(current, (list, tuple)) and part.isdigit():
                index = int(part)
                current = current[index] if 0 <= index < len(current) else None
            else:
                current = getattr(current, part, None)
            if current is None:
                break
        return current

    def _stringify(self, value: Any) -> str:
        return "" if value is None else str(value)

