import os
from typing import AsyncGenerator

from openai import AsyncOpenAI

client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)

MODELS = {
    "agent": "deepseek-chat",
    "fast": "deepseek-chat",
    "learning": "deepseek-chat",
}

GEO_AGENT_SYSTEM_PROMPT = (
    "You are GeoLearn AI, a geospatial analysis agent. Produce concise, accurate answers "
    "and prefer reproducible, step-by-step guidance."
)

TUTOR_SYSTEM_PROMPT = (
    "You are GeoLearn AI, an expert GIS tutor specializing in QGIS, ArcGIS, "
    "Remote Sensing, and Nigerian geospatial data. Give clear step-by-step answers."
)


async def chat_stream(
    messages: list[dict[str, str]],
    task_type: str = "fast",
) -> AsyncGenerator[str, None]:
    model = MODELS.get(task_type, MODELS["fast"])
    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
        stream=True,
    )

    async for chunk in stream:
        piece = chunk.choices[0].delta.content if chunk.choices else None
        if piece:
            yield piece


async def chat_complete(
    messages: list[dict[str, str]],
    task_type: str = "fast",
) -> str:
    model = MODELS.get(task_type, MODELS["fast"])
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
    )

    content = response.choices[0].message.content if response.choices else None
    if not content or not content.strip():
        raise RuntimeError("DeepSeek returned an empty response.")
    return content.strip()
