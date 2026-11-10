import json
from pathlib import Path

from .dataset_search import search_datasets
from .model_search import search_models
from .timeline import estimate_project_timeline
from .technology_comparison import compare_technologies
from .project_state import update_project_state, get_project_state
from .readme_generator import generate_readme


# Load tool definitions from tools.json
TOOLS_JSON = Path(__file__).parent / "tools.json"


def load_tools():
    with open(TOOLS_JSON, "r", encoding="utf-8") as file:
        return json.load(file)


# Map tool names to Python functions
TOOL_FUNCTIONS = {
    "search_datasets": search_datasets,
    "search_models": search_models,
    "estimate_project_timeline": estimate_project_timeline,
    "compare_technologies": compare_technologies,
    "update_project_state": update_project_state,
    "generate_readme": generate_readme
}


def execute_tool(tool_name: str, arguments: dict):
    """Execute a tool requested by the LLM."""

    function = TOOL_FUNCTIONS.get(tool_name)

    if function is None:
        return {
            "success": False,
            "error": f"Unknown tool: {tool_name}"
        }

    try:
        return function(**arguments)

    except Exception as error:
        return {
            "success": False,
            "error": str(error)
        }


__all__ = [
    "load_tools",
    "execute_tool",
    "search_datasets",
    "search_models",
    "estimate_project_timeline",
    "compare_technologies",
    "update_project_state",
    "get_project_state",
    "generate_readme"
]