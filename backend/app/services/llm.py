import json
import re
from typing import Any

import httpx

from ..config import Settings
from ..models import Template
from ..services.templates import template_to_dict


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if match:
            return json.loads(match.group(0))
        raise


def validate_structured(data: dict[str, Any], template: Template) -> dict[str, Any]:
    tpl = template_to_dict(template)
    header_fields = [f for f in tpl["fields"] if f["area"] == "header"]
    row_fields = [f for f in tpl["fields"] if f["area"] == "table"]
    header_codes = {f["code"] for f in header_fields}
    row_codes = {f["code"] for f in row_fields}
    header = {k: v for k, v in (data.get("header") or {}).items() if k in header_codes}
    rows = []
    for row in data.get("rows") or []:
        if isinstance(row, dict):
            cleaned = {k: v for k, v in row.items() if k in row_codes}
            if any(str(value).strip() for value in cleaned.values() if value is not None):
                rows.append(cleaned)
    warnings = list(data.get("warnings") or [])
    for field in header_fields:
        if field["required"] and not header.get(field["code"]):
            warnings.append(f"表头字段缺失：{field['name']}")
    return {
        "header": header,
        "rows": rows,
        "warnings": warnings,
    }


async def structure_markdown(settings: Settings, template: Template, markdown: str) -> tuple[dict[str, Any], str]:
    if not settings.llm_api_key:
        raise RuntimeError("LLM_API_KEY is not configured")
    tpl = template_to_dict(template)
    prompt = f"""
你是日报表 OCR 结构化抽取助手。请严格按模板字段把 OCR Markdown 转为 JSON。
只输出 JSON，不要解释，不要 Markdown 代码块。
目标格式：
{{"header":{{}},"rows":[],"warnings":[]}}

模板：
{json.dumps(tpl, ensure_ascii=False)}

OCR Markdown：
{markdown}
"""
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": "你只输出可解析 JSON。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
        resp = await client.post(
            settings.llm_base_url.rstrip("/") + "/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            json=payload,
        )
        resp.raise_for_status()
        raw = resp.text
        content = resp.json()["choices"][0]["message"]["content"]
        parsed = extract_json(content)
        return validate_structured(parsed, template), raw
