import uuid
from pathlib import Path

import torch
from diffusers import StableDiffusionPipeline

from .image_prompts import IMAGE_PROMPT_TEMPLATE


class ImageGenerator:

    def __init__(self):
        self.model_id = "stable-diffusion-v1-5/stable-diffusion-v1-5"
        self.output_dir = Path("generated_images")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.pipeline = None

    def load_model(self):
        if self.pipeline is not None:
            return

        if torch.backends.mps.is_available():
            device = "mps"
            dtype = torch.float16
        elif torch.cuda.is_available():
            device = "cuda"
            dtype = torch.float16
        else:
            device = "cpu"
            dtype = torch.float32

        print(f"Loading Stable Diffusion on {device}...")

        self.pipeline = StableDiffusionPipeline.from_pretrained(
            self.model_id,
            torch_dtype=dtype
        )

        self.pipeline = self.pipeline.to(device)
        self.pipeline.enable_attention_slicing()

        print("Stable Diffusion loaded.")

    def build_prompt(self, project_data: dict) -> str:
        image_data = project_data.get("image_generation", {})

        visual_elements = image_data.get("visual_elements", [])

        return IMAGE_PROMPT_TEMPLATE.format(
            project_name=project_data.get("project_name", ""),
            problem_statement=project_data.get("problem_statement", ""),
            proposed_solution=project_data.get("proposed_solution", ""),
            visual_elements=", ".join(visual_elements),
            environment=image_data.get("environment", ""),
            style=image_data.get("style", "")
        )

    def generate_image(self, project_data: dict):
        if not isinstance(project_data, dict):
            raise ValueError("Project data must be a dictionary.")

        self.load_model()

        prompt = self.build_prompt(project_data)

        image_id = str(uuid.uuid4())
        image_path = self.output_dir / f"{image_id}.png"

        result = self.pipeline(
            prompt=prompt,
            negative_prompt=(
                "blurry, distorted objects, low quality, "
                "watermark, unnecessary text, deformed objects"
            ),
            num_inference_steps=20,
            guidance_scale=7.5,
            width=512,
            height=512
        )

        result.images[0].save(image_path)

        return {
            "image_id": image_id,
            "image_path": str(image_path),
            "filename": image_path.name
        }