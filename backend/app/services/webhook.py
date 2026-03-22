import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx


async def dispatch_webhook(
    url: str,
    event: str,
    workspace_id: uuid.UUID,
    entity_id: uuid.UUID,
    data: dict[str, Any],
    max_retries: int = 3,
) -> None:
    payload = {
        "event": event,
        "workspace_id": str(workspace_id),
        "entity_id": str(entity_id),
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    delays = [1, 2, 4]
    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(max_retries):
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return
            except Exception:
                if attempt < max_retries - 1:
                    await asyncio.sleep(delays[attempt])


def trigger_webhook_background(
    url: str | None,
    event: str,
    workspace_id: uuid.UUID,
    entity_id: uuid.UUID,
    data: dict[str, Any],
) -> asyncio.Task | None:
    if not url:
        return None
    return asyncio.create_task(
        dispatch_webhook(url, event, workspace_id, entity_id, data)
    )
