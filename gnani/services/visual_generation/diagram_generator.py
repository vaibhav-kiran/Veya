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

        component_ids = {}

        # Create nodes
        for index, component in enumerate(components):

            node_id = f"N{index}"
            component_ids[component] = node_id

            safe_label = self.escape_mermaid_text(component)

            lines.append(f'    {node_id}["{safe_label}"]')

        # Create connections
        for connection in connections:

            if isinstance(connection, dict):
                source = connection.get("from")
                target = connection.get("to")
                label = connection.get("label", "")

            elif isinstance(connection, str) and " to " in connection:
                source, target = connection.split(" to ", 1)
                label = ""

            else:
                continue

            if source not in component_ids or target not in component_ids:
                continue

            source_id = component_ids[source]
            target_id = component_ids[target]

            if label:
                safe_label = self.escape_mermaid_text(label)
                lines.append(
                    f"    {source_id} -->|{safe_label}| {target_id}"
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