"""The workflow diagram (Mermaid) must render whatever the model writes in labels."""

from services.visual_generation.diagram_generator import DiagramGenerator


def mermaid(components, connections) -> str:
    return DiagramGenerator().generate_mermaid({"diagram_generation": {"components": components, "connections": connections}})


def test_edge_labels_are_quoted_so_brackets_do_not_break_the_diagram():
    code = mermaid(
        ["React Native App", "FastAPI Backend"],
        [{"from": "React Native App", "to": "FastAPI Backend", "label": "REST API calls (POST /posts)"}],
    )
    assert 'N0 -->|"REST API calls (POST /posts)"| N1' in code


def test_quotes_and_pipes_in_labels_are_escaped():
    code = mermaid(["A", "B"], [{"from": "A", "to": "B", "label": 'say "hi" | wave'}])
    assert '-->|"say &quot;hi&quot; &#124; wave"|' in code


def test_names_match_loosely_and_unknown_ones_become_nodes():
    code = mermaid(
        ["FastAPI Backend", {"name": "PostgreSQL"}],
        [
            {"from": "fastapi  backend", "to": "PostgreSQL", "label": "store"},
            {"from": "FastAPI Backend", "to": "Expo Push Service"},
        ],
    )
    assert 'N0 -->|"store"| N1' in code
    assert 'N2["Expo Push Service"]' in code and "N0 --> N2" in code
