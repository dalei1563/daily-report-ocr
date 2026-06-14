import json
import asyncio
import time
from pathlib import Path

import httpx

from ..config import Settings


class PaddleOCRQueueFull(RuntimeError):
    pass


def _response_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:500]
    message = payload.get("msg") or payload.get("message") or payload.get("errorMsg")
    if message:
        return str(message)
    return json.dumps(payload, ensure_ascii=False)[:500]


def _is_queue_full(response: httpx.Response) -> bool:
    if response.status_code != 400:
        return False
    try:
        payload = response.json()
    except ValueError:
        return False
    message = str(payload.get("msg") or payload.get("message") or "")
    return payload.get("code") == 10010 or "队列已满" in message


async def run_paddle_ocr(settings: Settings, file_path: str, raw_dir: Path) -> tuple[str, str, str]:
    if not settings.paddle_ocr_token:
        raise RuntimeError("PADDLE_OCR_TOKEN is not configured")
    headers = {"Authorization": f"bearer {settings.paddle_ocr_token}"}
    optional_payload = {
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useChartRecognition": False,
    }
    data = {"model": settings.paddle_ocr_model, "optionalPayload": json.dumps(optional_payload)}
    async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
        submit_attempts = 3
        for attempt in range(submit_attempts):
            with open(file_path, "rb") as f:
                files = {"file": (Path(file_path).name, f)}
                job_resp = await client.post(settings.paddle_ocr_job_url, headers=headers, data=data, files=files)
            if _is_queue_full(job_resp):
                if attempt < submit_attempts - 1:
                    await asyncio.sleep(5)
                    continue
                raise PaddleOCRQueueFull("PaddleOCR queue is full, please retry later")
            try:
                job_resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                message = _response_message(job_resp)
                raise RuntimeError(f"PaddleOCR submit failed ({job_resp.status_code}): {message}") from exc
            break
        job_id = job_resp.json()["data"]["jobId"]

        jsonl_url = ""
        start = time.time()
        while time.time() - start < 600:
            status_resp = await client.get(f"{settings.paddle_ocr_job_url}/{job_id}", headers=headers)
            status_resp.raise_for_status()
            payload = status_resp.json()["data"]
            state = payload["state"]
            if state == "done":
                jsonl_url = payload["resultUrl"]["jsonUrl"]
                break
            if state == "failed":
                raise RuntimeError(payload.get("errorMsg") or "PaddleOCR job failed")
            await asyncio.sleep(5)
        if not jsonl_url:
            raise TimeoutError("PaddleOCR job timed out")

        jsonl_resp = await client.get(jsonl_url)
        jsonl_resp.raise_for_status()
        raw_text = jsonl_resp.text

    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"{Path(file_path).stem}.jsonl"
    raw_path.write_text(raw_text, encoding="utf-8")

    markdown_parts: list[str] = []
    for line in raw_text.strip().splitlines():
        if not line.strip():
            continue
        result = json.loads(line)["result"]
        for res in result.get("layoutParsingResults", []):
            markdown_parts.append(res.get("markdown", {}).get("text", ""))
    markdown = "\n\n".join(part for part in markdown_parts if part)
    md_path = raw_dir / f"{Path(file_path).stem}.md"
    md_path.write_text(markdown, encoding="utf-8")
    return markdown, raw_text, str(raw_path)
