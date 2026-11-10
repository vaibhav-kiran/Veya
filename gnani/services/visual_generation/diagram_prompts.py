DIAGRAM_PROMPT = """
Generate a technical system workflow diagram using Mermaid syntax.

Project:
{project_name}

Problem:
{problem_statement}

Proposed Solution:
{proposed_solution}

Components:
{components}

Connections:
{connections}

Implementation Steps:
{implementation_steps}

Requirements:
- Use flowchart TD.
- Represent the actual architecture and data flow.
- Use the supplied components and connections.
- Use simple node IDs such as A, B, C.
- Keep node labels concise and readable.
- Do not invent additional technologies or components.
- Return only valid Mermaid syntax.
- Do not include Markdown code fences.
"""