"""How evidence is shown to the model: compact, numbered, no URLs to copy."""

from app.schemas.evidence import Evidence

SOURCE_LABELS = {
    "web_page": "web", "news": "news", "github_repository": "github repo", "github_issue": "github issue",
    "academic_paper": "paper", "mock": "MOCK",
}


def format_evidence(items: list[Evidence], *, excerpt_chars: int = 400) -> str:
    if not items:
        return "(no sources found)"
    lines = []
    for item in items:
        meta = []
        if item.published_date:
            meta.append(item.published_date[:10])
        if item.metadata.get("stars") is not None and item.source_type == "github_repository":
            meta.append(f"{item.metadata['stars']} stars")
        if item.metadata.get("last_pushed"):
            meta.append(f"last update {item.metadata['last_pushed']}")
        excerpt = " ".join(item.excerpt.split())[:excerpt_chars]
        lines.append(f"[{item.evidence_id}] ({SOURCE_LABELS.get(item.source_type, item.source_type)}"
                     f"{', ' + ', '.join(meta) if meta else ''}) {item.title}\n    {excerpt}")
    return "\n".join(lines)


def unique(items: list[Evidence]) -> list[Evidence]:
    seen, result = set(), []
    for item in items:
        if item.evidence_id not in seen:
            seen.add(item.evidence_id)
            result.append(item)
    return result
