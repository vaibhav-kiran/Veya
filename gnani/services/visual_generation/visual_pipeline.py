from .image_generator import ImageGenerator
from .diagram_generator import DiagramGenerator


class VisualPipeline:

    def __init__(self):

        self.image_generator = ImageGenerator()
        self.diagram_generator = DiagramGenerator()

    def generate_visuals(self, project_data: dict):

        if not isinstance(project_data, dict):
            raise ValueError("Project data must be a dictionary.")

        if not project_data.get("project_name"):
            raise ValueError("Project name is missing.")

        image_result = self.image_generator.generate_image(
            project_data
        )

        diagram_result = self.diagram_generator.generate_diagram(
            project_data
        )

        return {
            "project_name": project_data["project_name"],
            "concept_image": image_result,
            "workflow_diagram": diagram_result
        }