"""Rules shared by every stage prompt."""

EVIDENCE_RULES = """
EVIDENCE RULES (strict):
- You may only cite sources by their evidence id, exactly as given: E1, E2, ...
- Never write URLs, paper titles, authors, dates, repository names or statistics
  that are not in the provided sources. Never invent sources.
- Every claim has a status:
    verified_fact          stated directly by a cited source
    reported_limitation    a limitation a source reports (e.g. an issue or a paper)
    supported_inference    your reasoning from cited sources
    unverified_hypothesis  your idea with no direct source
    contradicted_claim     a cited source contradicts it
- A lack of search results is NOT proof that something does not exist.
- Never call anything "completely novel" or "first ever".
Reply with one JSON object only.
""".strip()


def profile_block(profile_json: str, assumptions: list[str]) -> str:
    text = f"STUDENT PROFILE:\n{profile_json}"
    if assumptions:
        text += "\nASSUMPTIONS (the student did not say):\n- " + "\n- ".join(assumptions)
    return text
