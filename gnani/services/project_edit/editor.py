"""
Change a saved project's plan (its README) by voice or text.

The student says what to change ("use Firebase instead of PostgreSQL", "add
a dark mode feature", "we only have one week now"). The model returns only
the README sections that change, in full; the code swaps them in, so
everything the student did not ask about stays exactly as it was and the
answer stays short enough for the local model.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from services.language_layer.language_pipeline import strip_code_fence

logger = logging.getLogger(__name__)

MAX_README_CHARS = 60_000

EDIT_SYSTEM = """You edit a student's project plan, a Markdown README with "## " sections, exactly as they ask.

Return JSON with exactly these keys:
{
  "understood": true or false,
  "summary": "1-2 sentences for the student: what you changed",
  "edits": [{"heading": "...", "content": "..."}]
}

Rules:
- "heading": copy the EXACT "## " heading line of the section you change (for example "## 4. Technology Stack"). To add a new section, give a new "## " heading.
- "content": the COMPLETE new Markdown of that section, starting with its heading line. Inside it, keep everything the student did not ask to change exactly as it was (same wording, code and tables). Use "" to remove a section only if the student asked to remove it.
- Change EVERY section the request affects so the plan stays consistent. For example, a new database changes the technology stack, the project structure, the backend, the data section and the build steps; a shorter deadline changes the timeline and maybe the features.
- Only return sections that change. Do not return unchanged sections.
- Write the plan in English, in the same style as the rest of it.
- If the request is unclear, or is not a change to this plan, set "understood" to false, "edits" to [], and make "summary" a short question asking what they want to change.
- "summary" is written in {language}."""


class ProjectEditError(Exception):
    def __init__(self, user_message: str):
        super().__init__(user_message)
        self.user_message = user_message


@dataclass
class EditResult:
    readme_markdown: str
    summary: str
    changed_sections: list[str] = field(default_factory=list)

    @property
    def changed(self) -> bool:
        return bool(self.changed_sections)


# ---------------------------------------------------------
# README sections
# ---------------------------------------------------------

def split_sections(markdown: str) -> list[tuple[Optional[str], str]]:
    """
    [(heading line or None for the top part, the section's full text)], split
    at "## " headings (not "###", and not inside code blocks).
    """
    sections: list[tuple[Optional[str], list[str]]] = [(None, [])]
    in_fence = False
    for line in markdown.replace("\r\n", "\n").split("\n"):
        if line.strip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and re.match(r"^##\s+\S", line) and not line.startswith("###"):
            sections.append((line.strip(), [line]))
        else:
            sections[-1][1].append(line)
    result = [(heading, "\n".join(lines).strip("\n")) for heading, lines in sections]
    return [(heading, text) for heading, text in result if heading is not None or text.strip()]


def _key(heading: str) -> str:
    """'## 4. Technology Stack' and '4) technology stack' match."""
    text = re.sub(r"^#+\s*", "", heading.strip())
    text = re.sub(r"^\d+(\.\d+)*[.)]?\s*", "", text)
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def apply_edits(markdown: str, edits: list[dict[str, Any]]) -> tuple[str, list[str]]:
    """Swap in the changed sections. Returns the new README and the headings that changed."""
    sections = split_sections(markdown)
    changed: list[str] = []
    for edit in edits:
        if not isinstance(edit, dict):
            continue
        heading = str(edit.get("heading") or "").strip()
        content = str(edit.get("content") if edit.get("content") is not None else "").strip("\n")
        if not heading:
            continue
        if not heading.startswith("#"):
            heading = f"## {heading}"
        if content and not content.lstrip().startswith("#"):
            content = f"{heading}\n{content}"

        # The top part (project title) is the "# " heading.
        if re.match(r"^#\s", heading):
            if sections and sections[0][0] is None and content:
                if sections[0][1].strip() != content.strip():
                    sections[0] = (None, content)
                    changed.append(heading.lstrip("# ").strip())
            continue

        index = next((i for i, (h, _) in enumerate(sections) if h and _key(h) == _key(heading)), None)
        if index is None:
            if content:
                sections.append((heading, content))
                changed.append(_title(heading))
        elif not content:
            changed.append(_title(sections[index][0] or heading))
            sections.pop(index)
        elif sections[index][1].strip() != content.strip():
            sections[index] = (sections[index][0], content)
            changed.append(_title(heading))

    readme = "\n\n".join(text for _, text in sections).strip() + "\n"
    return readme, changed


def _title(heading: str) -> str:
    return re.sub(r"^#+\s*", "", heading).strip()


# ---------------------------------------------------------
# The model
# ---------------------------------------------------------

def edit_readme(llm_client: Any, model: str, title: str, markdown: str, instruction: str, language: str = "English") -> EditResult:
    """Ask the model for the changed sections and apply them. Raises ProjectEditError."""

    instruction = instruction.strip()
    if not instruction:
        raise ProjectEditError("I didn't catch what to change. Please try again.")
    if not markdown.strip():
        raise ProjectEditError("This project has no plan file to change yet.")
    if len(markdown) > MAX_README_CHARS:
        raise ProjectEditError("This plan is too long to change by voice.")

    user = f"Project: {title}\n\nWhat the student wants changed:\n{instruction}\n\nThe current README:\n\n{markdown}"
    try:
        response = llm_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": EDIT_SYSTEM.replace("{language}", language or "English")},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=8000,
            response_format={"type": "json_object"},
            extra_body={"options": {"num_ctx": 16384}},
        )
        data = json.loads(strip_code_fence(response.choices[0].message.content or ""))
    except Exception as error:
        logger.warning("Project edit failed: %s", str(error)[:300])
        raise ProjectEditError("I couldn't make that change right now. Please try again.") from error

    if not isinstance(data, dict):
        raise ProjectEditError("I couldn't make that change right now. Please try again.")

    summary = str(data.get("summary") or "").strip()
    edits = data.get("edits") if isinstance(data.get("edits"), list) else []
    if data.get("understood") is False or not edits:
        return EditResult(markdown, summary or "I'm not sure what to change. Could you say it another way?")

    readme, changed = apply_edits(markdown, edits)
    if not changed:
        return EditResult(markdown, "The plan already says that, so nothing changed.")
    return EditResult(readme, summary or f"Updated: {', '.join(changed)}.", changed)
