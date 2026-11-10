import json
from urllib.parse import quote
from urllib.request import Request, urlopen


def search_models(query: str, limit: int = 5):
    """Search Hugging Face for pretrained models."""

    limit = max(1, min(limit, 20))

    url = (
        f"https://huggingface.co/api/models"
        f"?search={quote(query)}&limit={limit}"
    )

    try:
        request = Request(
            url,
            headers={"User-Agent": "HackMateAI/1.0"}
        )

        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        return {
            "success": True,
            "query": query,
            "results": [
                {
                    "name": item.get("id"),
                    "downloads": item.get("downloads"),
                    "likes": item.get("likes"),
                    "pipeline_tag": item.get("pipeline_tag"),
                    "url": f"https://huggingface.co/{item.get('id')}"
                }
                for item in data
            ]
        }

    except Exception as error:
        return {"success": False, "error": str(error)}