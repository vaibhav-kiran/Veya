import json
from urllib.parse import quote
from urllib.request import Request, urlopen


def search_datasets(query: str, limit: int = 5):
    """Search Hugging Face for datasets related to a project."""

    limit = max(1, min(limit, 20))

    url = (
        "https://huggingface.co/api/datasets"
        f"?search={quote(query)}&limit={limit}"
    )

    try:
        request = Request(
            url,
            headers={"User-Agent": "HackMateAI/1.0"}
        )

        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        results = []

        for item in data:
            dataset_id = item.get("id")

            if not dataset_id:
                continue

            card_data = item.get("cardData") or {}

            results.append({
                "name": dataset_id,
                "description": card_data.get(
                    "description",
                    "No description provided by the dataset author."
                ),
                "tags": item.get("tags", []),
                "downloads": item.get("downloads", 0),
                "likes": item.get("likes", 0),
                "url": f"https://huggingface.co/datasets/{dataset_id}"
            })

        return {
            "success": True,
            "query": query,
            "count": len(results),
            "results": results
        }

    except Exception as error:
        return {
            "success": False,
            "query": query,
            "error": str(error),
            "results": []
        }