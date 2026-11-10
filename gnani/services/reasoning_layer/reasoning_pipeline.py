import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from services.perception_layer.schemas import ProjectUnderstanding
from services.reasoning_layer.prompts import (
    REASONING_SYSTEM_PROMPT,
    VISUAL_GENERATION_INSTRUCTIONS
)
from tools import load_tools, execute_tool


load_dotenv()


class ReasoningPipeline:

    # =====================================================
    # INITIALIZATION
    # =====================================================

    def __init__(self):

        self.client = OpenAI(
            base_url=os.getenv(
                "OLLAMA_BASE_URL",
                "http://localhost:11434/v1"
            ),
            api_key=os.getenv(
                "OLLAMA_API_KEY",
                "ollama"
            )
        )

        self.model = os.getenv("OLLAMA_MODEL")

        if not self.model:
            raise ValueError("OLLAMA_MODEL is missing from .env")

        self.required_fields = {
            "response",
            "action",
            "reasoning_summary",
            "follow_up_questions",
            "project_updates",
            "project_name",
            "project_prompt",
            "visual_generation"
        }

        # Resolve project root.
        # reasoning_pipeline.py -> reasoning_layer -> services -> gnani

        self.project_root = Path(__file__).resolve().parents[2]

        self.readme_directory = self.project_root / "readme"

    # =====================================================
    # TOOL CALLING
    # =====================================================

    def run_with_tools(self, messages):
        """
        Send messages to Ollama with available tools.
        Execute requested tools and return the final model response.
        """

        available_tools = load_tools()

        max_tool_rounds = 5

        for _ in range(max_tool_rounds):

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=available_tools,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=5000,
                extra_body={
                    "options": {
                        "repeat_penalty": 1.2,
                        "repeat_last_n": 128,
                        "num_ctx": 16384
                    }
                }
            )

            assistant_message = response.choices[0].message

            # Model has completed its response.
            if not assistant_message.tool_calls:
                return assistant_message.content

            # Preserve assistant tool-call message.
            messages.append(
                assistant_message.model_dump(exclude_none=True)
            )

            # Execute requested tools.
            for tool_call in assistant_message.tool_calls:

                tool_name = tool_call.function.name

                try:

                    arguments = json.loads(
                        tool_call.function.arguments
                    )

                    print(f"Executing tool: {tool_name}")
                    print(f"Arguments: {arguments}")

                    result = execute_tool(
                        tool_name,
                        arguments
                    )

                except Exception as error:

                    result = {
                        "success": False,
                        "error": str(error)
                    }

                # Return tool result to model.
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(
                        result,
                        ensure_ascii=False,
                        default=str
                    )
                })

        # Tool-calling limit reached.
        messages.append({
            "role": "system",
            "content": (
                "You have reached the tool-calling limit. "
                "Do not request or execute any more tools. "
                "Use the tool results already available in the conversation "
                "and provide the best possible final response. "
                "Mention any information that could not be retrieved."
            )
        })

        final_response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.2,
            max_tokens=3000,
            extra_body={
                "options": {
                    "repeat_penalty": 1.5,
                    "repeat_last_n": 128,
                    "num_ctx": 16384
                }
            }
        )

        return final_response.choices[0].message.content

    # =====================================================
    # PROJECT NAME GENERATION
    # =====================================================

    def generate_project_name(
        self,
        project: ProjectUnderstanding
    ) -> str:

        prompt = f"""
Generate a short, memorable and professional name for this project.

Problem statement:
{project.problem_statement}

Proposed solution:
{project.proposed_solution}

Requirements:
- Generate a name relevant to the actual project.
- Prefer one to three words.
- Make it unique and memorable.
- Avoid generic names.
- Return only the project name.
- Do not include explanations or quotation marks.
"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional product naming assistant."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=50
        )

        name = response.choices[0].message.content

        if not name:
            return ""

        return name.strip().strip('"').strip("'")

    # =====================================================
    # README GENERATION
    # =====================================================

    def save_project_readme(
        self,
        project_name: str,
        content: str
    ) -> Path:

        self.readme_directory.mkdir(
            parents=True,
            exist_ok=True
        )

        readme_path = (
            self.readme_directory /
            f"{project_name}_README.md"
        )

        readme_path.write_text(
            content,
            encoding="utf-8"
        )

        print("\n========== README GENERATED ==========")
        print("README saved at:", readme_path)
        print("======================================\n")

        return readme_path

    # =====================================================
    # VISUAL GENERATION VALIDATION
    # =====================================================

    def validate_visual_generation(
        self,
        visual_generation: dict
    ):

        if not isinstance(visual_generation, dict):
            raise ValueError(
                "visual_generation must be a dictionary."
            )

        required_visual_fields = {
            "problem_statement",
            "proposed_solution",
            "technologies",
            "implementation_steps",
            "image_generation",
            "diagram_generation"
        }

        missing_fields = (
            required_visual_fields - visual_generation.keys()
        )

        if missing_fields:
            raise ValueError(
                f"Missing visual generation fields: {missing_fields}"
            )

        if not isinstance(visual_generation["technologies"], list):
            raise ValueError("Visual technologies must be a list.")

        if not isinstance(visual_generation["implementation_steps"], list):
            raise ValueError("Implementation steps must be a list.")

        image_data = visual_generation["image_generation"]

        diagram_data = visual_generation["diagram_generation"]

        if not isinstance(image_data, dict):
            raise ValueError("image_generation must be a dictionary.")

        if not isinstance(diagram_data, dict):
            raise ValueError("diagram_generation must be a dictionary.")

        if not isinstance(image_data.get("visual_elements"), list):
            raise ValueError("visual_elements must be a list.")

        if not isinstance(diagram_data.get("components"), list):
            raise ValueError("diagram components must be a list.")

        if not isinstance(diagram_data.get("connections"), list):
            raise ValueError("diagram connections must be a list.")

        for connection in diagram_data["connections"]:

            if not isinstance(connection, dict):
                raise ValueError(
                    "Each diagram connection must be an object."
                )

            if (
                not connection.get("from")
                or not connection.get("to")
            ):
                raise ValueError(
                    "Each diagram connection must contain from and to."
                )

    # =====================================================
    # MAIN REASONING FUNCTION
    # =====================================================

    def reason(
        self,
        project: ProjectUnderstanding,
        user_message: str = None,
        conversation_history: list = None
    ):

        conversation_history = conversation_history or []

        project_context = project.model_dump()

        # =============================================
        # DETERMINE WHETHER THIS IS A PROJECT REQUEST
        # =============================================

        project_intents = {
            "develop_new_project_idea",
            "improve_existing_project"
        }

        intent = project_context.get("intent")

        if hasattr(intent, "value"):
            intent = intent.value

        requires_visual_generation = (
            intent in project_intents
        )

        # =============================================
        # INITIAL MESSAGES
        # =============================================

        messages = [
            {
                "role": "system",
                "content": REASONING_SYSTEM_PROMPT
            },
            {
                "role": "system",
                "content": (
                    "CURRENT PROJECT CONTEXT:\n"
                    + json.dumps(
                        project_context,
                        indent=2,
                        ensure_ascii=False
                    )
                )
            }
        ]

        messages.extend(conversation_history)

        if user_message:

            messages.append({
                "role": "user",
                "content": user_message
            })

        else:

            messages.append({
                "role": "user",
                "content": (
                    "Analyse the provided project context. "
                    "Generate a complete explanation covering all "
                    "nine responsibilities and create the project README."
                )
            })

        try:

            # ==========================================
            # STEP 1: TOOL EXECUTION
            # ==========================================

            print("\n========== TOOL EXECUTION ==========")

            tool_response = self.run_with_tools(messages)

            if tool_response:

                messages.append({
                    "role": "assistant",
                    "content": tool_response
                })

            # ==========================================
            # STEP 2: FINAL STRUCTURED JSON
            # ==========================================

            print("\n========== FINAL REASONING ==========")

            final_messages = [
                *messages
            ]

            # Add visual instructions only for project requests.
            if requires_visual_generation:

                final_messages.append({
                    "role": "system",
                    "content": VISUAL_GENERATION_INSTRUCTIONS
                })

            final_prompt = """
Prepare your final response using the required JSON structure.

Include these fields:

- response
- action
- reasoning_summary
- follow_up_questions
- project_updates
- project_name
- project_prompt
- visual_generation

For new project ideas and substantial project improvements,
visual_generation MUST be a fully populated JSON object containing:

- problem_statement
- proposed_solution
- technologies
- implementation_steps
- image_generation
- diagram_generation

The image_generation object must contain:
- visual_elements
- environment
- style

The diagram_generation object must contain:
- components
- connections

Each connection must contain:
- from
- to
- label

For unrelated general questions, visual_generation must be null.

Do not call more tools.
Use actual project context and tool results.
Return valid JSON only.
"""

            final_messages.append({
                "role": "user",
                "content": final_prompt
            })

            final_result = self.client.chat.completions.create(
                model=self.model,
                messages=final_messages,
                temperature=0.2,
                max_tokens=5000,
                response_format={
                    "type": "json_object"
                },
                extra_body={
                    "options": {
                        "repeat_penalty": 1.2,
                        "repeat_last_n": 128,
                        "num_ctx": 16384
                    }
                }
            )

            response_text = (
                final_result.choices[0].message.content
            )

            if not response_text:
                raise ValueError(
                    "The model returned an empty response."
                )

            reasoning_result = json.loads(response_text)

        except json.JSONDecodeError as error:

            raise ValueError(
                f"Invalid JSON returned by model: {error}"
            ) from error

        except Exception as error:

            raise RuntimeError(
                f"Reasoning model request failed: {error}"
            ) from error

        # =============================================
        # STEP 3: BASIC RESPONSE VALIDATION
        # =============================================

        if not isinstance(reasoning_result, dict):

            raise ValueError(
                "Reasoning response must be a JSON object."
            )

        missing_fields = (
            self.required_fields - reasoning_result.keys()
        )

        if missing_fields:

            raise ValueError(
                f"Missing fields: {missing_fields}\n"
                f"Raw response:\n"
                f"{json.dumps(reasoning_result, indent=2)}"
            )

        if not isinstance(reasoning_result["response"], str):
            raise ValueError("response must be a string.")

        if not isinstance(reasoning_result["project_prompt"], str):
            raise ValueError("project_prompt must be a string.")

        if not isinstance(reasoning_result["project_name"], str):
            raise ValueError("project_name must be a string.")

        if not isinstance(reasoning_result["follow_up_questions"], list):
            raise ValueError("follow_up_questions must be a list.")

        if not isinstance(reasoning_result["project_updates"], dict):
            raise ValueError("project_updates must be a dictionary.")

        if len(reasoning_result["follow_up_questions"]) > 2:
            raise ValueError(
                "Maximum two follow-up questions allowed."
            )

        # =============================================
        # STEP 4: VISUAL GENERATION VALIDATION
        # =============================================

        visual_generation = reasoning_result.get(
            "visual_generation"
        )

        if requires_visual_generation:

            if visual_generation is None:

                raise ValueError(
                    "Qwen did not generate visual_generation. "
                    "Check the final model prompt."
                )

            self.validate_visual_generation(
                visual_generation
            )

        elif visual_generation is not None:

            # Validate if the model supplies visuals anyway.
            self.validate_visual_generation(
                visual_generation
            )

        # =============================================
        # STEP 5: DEBUG OUTPUT
        # =============================================

        print("\n========== QWEN RESPONSE FIELDS ==========")

        print(list(reasoning_result.keys()))

        print("\n========== VISUAL GENERATION JSON ==========")

        print(
            json.dumps(
                visual_generation,
                indent=2,
                ensure_ascii=False
            )
        )

        print("============================================\n")

        # =============================================
        # STEP 6: PROJECT NAME
        # =============================================

        project_name = reasoning_result["project_name"].strip()

        if not project_name:

            project_name = self.generate_project_name(
                project
            )

        if not project_name:

            raise ValueError(
                "Unable to generate a project name."
            )

        # Sanitize project name for filename.
        filename = re.sub(
            r"[^a-zA-Z0-9_-]",
            "",
            project_name.replace(" ", "")
        )

        if not filename:

            raise ValueError(
                "Invalid project filename."
            )

        reasoning_result["project_name"] = filename

        # =============================================
        # STEP 7: SAVE README
        # =============================================

        readme_path = self.save_project_readme(
            project_name=filename,
            content=reasoning_result["project_prompt"]
        )

        reasoning_result["readme_path"] = str(readme_path)

        print("\nReasoning pipeline completed successfully.")

        return reasoning_result