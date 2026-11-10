import json
import os
from copy import deepcopy

from dotenv import load_dotenv
from openai import OpenAI

from services.language_layer.prompts import (
    INPUT_TRANSLATION_PROMPT,
    OUTPUT_TRANSLATION_PROMPT
)

load_dotenv()


class LanguagePipeline:

    def __init__(self):

        self.client = OpenAI(
            base_url=os.getenv(
                "OLLAMA_BASE_URL",
                "http://localhost:11434/v1"
            ),
            api_key=os.getenv("OLLAMA_API_KEY", "ollama")
        )

        self.model = os.getenv(
            "OLLAMA_MODEL",
            "qwen2.5:7b"
        )

    def _generate(self, system_prompt: str, user_input: str) -> str:
        """
        Send a request to the local Ollama model.
        """

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_input
                }
            ],
            temperature=0.1,
            max_tokens=3000,
            extra_body={
                "options": {
                    "repeat_penalty": 1.15,
                    "repeat_last_n": 64,
                    "num_ctx": 8192
                }
            }
        )

        return response.choices[0].message.content.strip()

    # --------------------------------------------------
    # 1. INPUT NORMALIZATION
    # --------------------------------------------------

    def normalize_input(self, user_input: str) -> str:
        """
        Translate user input from any supported language
        into English.

        The returned value should be a faithful English
        translation of the original input.
        """

        if not user_input or not user_input.strip():
            raise ValueError("User input cannot be empty.")

        translated_input = self._generate(
            system_prompt=INPUT_TRANSLATION_PROMPT,
            user_input=user_input
        )

        if not translated_input:
            raise ValueError("Input translation returned an empty result.")

        return translated_input

    # --------------------------------------------------
    # 2. OUTPUT TRANSLATION
    # --------------------------------------------------

    def translate_response(
        self,
        reasoning_result: dict,
        target_language: str
    ) -> dict:
        """
        Translate user-facing Reasoning Layer content
        while preserving the original JSON structure.

        The README (project_prompt) is never translated.
        """

        if not isinstance(reasoning_result, dict):
            raise TypeError("Reasoning result must be a dictionary.")

        if not target_language or not target_language.strip():
            raise ValueError("Target language cannot be empty.")

        # English requires no translation.
        if target_language.strip().lower() in (
            "english",
            "en",
            "en-in",
            "en-us"
        ):
            return deepcopy(reasoning_result)

        # Preserve the original reasoning response.
        translated_result = deepcopy(reasoning_result)

        # Only these fields are sent for translation.
        translatable_fields = [
            "response",
            "reasoning_summary",
            "follow_up_questions"
        ]

        content_to_translate = {}

        for field in translatable_fields:

            if field in reasoning_result:
                content_to_translate[field] = reasoning_result[field]

        if not content_to_translate:
            return translated_result

        translation_request = {
            "target_language": target_language,
            "content": content_to_translate
        }

        prompt = (
            OUTPUT_TRANSLATION_PROMPT
            + "\n\nTranslate the following JSON content into "
            + target_language
            + ".\n\n"
            + json.dumps(
                translation_request,
                ensure_ascii=False,
                indent=2
            )
        )

        translated_text = self._generate(
            system_prompt="You are a precise JSON translation engine.",
            user_input=prompt
        )

        try:
            translated_data = json.loads(translated_text)

            translated_content = translated_data.get("content")

            if not isinstance(translated_content, dict):
                raise ValueError("Invalid translated content.")

            # Update only the fields that were translated.
            for field in translatable_fields:

                if field not in content_to_translate:
                    continue

                if field not in translated_content:
                    raise ValueError(
                        f"Missing translated field: {field}"
                    )

                original_value = content_to_translate[field]
                new_value = translated_content[field]

                # Validate data types.
                if not isinstance(new_value, type(original_value)):
                    raise ValueError(
                        f"Data type changed for field: {field}"
                    )

                translated_result[field] = new_value

            return translated_result

        except (json.JSONDecodeError, ValueError, TypeError) as error:

            print(
                f"Language translation validation failed: {error}"
            )

            # Preserve the original response if translation
            # produces invalid JSON or changes the structure.
            return deepcopy(reasoning_result)