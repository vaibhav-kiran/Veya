import uuid
from pathlib import Path


class DiagramGenerator:

    def __init__(self):
        self.output_dir = Path("generated_diagrams")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def escape_mermaid_text(text: str) -> str:
        """Escape text used inside Mermaid labels."""
        return (
            str(text)
            .replace("&", "&amp;")
            .replace('"', "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", " ")
            .replace("|", "&#124;")
        )

    def generate_mermaid(self, project_data: dict) -> str:

        diagram_data = project_data.get("diagram_generation", {})

        components = diagram_data.get("components", [])
        connections = diagram_data.get("connections", [])

        if not components:
            raise ValueError("No diagram components provided.")

        lines = ["flowchart TD"]

        # Models write names a little differently in different places
        # ("FastAPI Backend" vs "fastapi backend"), so match loosely.
        def key(name: str) -> str:
            return " ".join(str(name).lower().split())

        def name_of(component) -> str:
            if isinstance(component, dict):
                return str(component.get("name") or component.get("label") or component.get("title") or "").strip()
            return str(component).strip()

        component_ids: dict[str, str] = {}

        def node_for(name: str) -> str:
            """The node for a component, added if a connection names one that wasn't listed."""
            if key(name) not in component_ids:
                node_id = f"N{len(component_ids)}"
                component_ids[key(name)] = node_id
                lines.append(f'    {node_id}["{self.escape_mermaid_text(name)}"]')
            return component_ids[key(name)]

        # Create nodes
        for component in components:
            name = name_of(component)
            if name:
                node_for(name)

        # Create connections
        for connection in connections:

            if isinstance(connection, dict):
                source = name_of(connection.get("from") or "")
                target = name_of(connection.get("to") or "")
                label = str(connection.get("label") or "").strip()

            elif isinstance(connection, str) and " to " in connection:
                source, target = (part.strip() for part in connection.split(" to ", 1))
                label = ""

            else:
                continue

            if not source or not target:
                continue

            source_id = node_for(source)
            target_id = node_for(target)

            if label:
                # Quoted, so brackets, slashes and colons in the label
                # ("REST API (POST /posts)") don't break the diagram.
                safe_label = self.escape_mermaid_text(label)
                lines.append(
                    f'    {source_id} -->|"{safe_label}"| {target_id}'
                )
            else:
                lines.append(
                    f"    {source_id} --> {target_id}"
                )

        return "\n".join(lines)

    def generate_diagram(self, project_data: dict):

        if not isinstance(project_data, dict):
            raise ValueError("Project data must be a dictionary.")

        mermaid_code = self.generate_mermaid(project_data)

        diagram_id = str(uuid.uuid4())

        diagram_path = self.output_dir / f"{diagram_id}.mmd"

        diagram_path.write_text(
            mermaid_code,
            encoding="utf-8"
        )

        return {
            "diagram_id": diagram_id,
            "diagram_path": str(diagram_path),
            "filename": diagram_path.name,
            "mermaid_code": mermaid_code
        }