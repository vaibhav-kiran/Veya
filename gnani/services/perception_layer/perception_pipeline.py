import os
from dotenv import load_dotenv
from openai import OpenAI

from services.perception_layer.schemas import ProjectUnderstanding
from services.perception_layer.prompts import PERCEPTION_SYSTEM_PROMPT

load_dotenv()


class PerceptionPipeline:

    def __init__(self):

        base_url = os.getenv("OLLAMA_BASE_URL")
        if not base_url:
            raise ValueError("OLLAMA_BASE_URL must be configured.")

        base_url = base_url.rstrip("/")
        if not base_url.endswith("/v1"):
            base_url = f"{base_url}/v1"

        self.client = OpenAI(
            base_url=base_url,
            api_key=os.getenv("OLLAMA_API_KEY")
        )

        self.model = os.getenv("OLLAMA_MODEL")

    def understand(self, user_input: str) -> ProjectUnderstanding:
        """
        Understand the user's project idea and return structured information.
        """

        if not user_input or not user_input.strip():
            raise ValueError("User input cannot be empty.")

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": PERCEPTION_SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": user_input
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )

        result = response.choices[0].message.content

        if not result:
            raise ValueError("The model returned an empty response.")

        # Validate the model's JSON against the Pydantic schema.
        understanding = ProjectUnderstanding.model_validate_json(result)

        # Preserve the exact original user input.
        understanding.raw_input = user_input

        return understanding