import json
import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_PATH = BASE_DIR / "project_state.db"


def initialise_database():
    """Create project state table."""

    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS project_state (
                project_name TEXT PRIMARY KEY,
                project_data TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)


def update_project_state(project_name: str, updates: dict):
    """Update confirmed project information."""

    initialise_database()

    try:
        with sqlite3.connect(DATABASE_PATH) as connection:

            row = connection.execute(
                "SELECT project_data FROM project_state WHERE project_name = ?",
                (project_name,)
            ).fetchone()

            current_data = json.loads(row[0]) if row else {}

            current_data.update(updates)

            connection.execute("""
                INSERT INTO project_state (project_name, project_data)
                VALUES (?, ?)
                ON CONFLICT(project_name)
                DO UPDATE SET
                    project_data = excluded.project_data,
                    updated_at = CURRENT_TIMESTAMP
            """, (
                project_name,
                json.dumps(current_data, ensure_ascii=False)
            ))

        return {
            "success": True,
            "project_name": project_name,
            "project_data": current_data
        }

    except Exception as error:
        return {"success": False, "error": str(error)}


def get_project_state(project_name: str):
    """Retrieve saved project information."""

    initialise_database()

    with sqlite3.connect(DATABASE_PATH) as connection:
        row = connection.execute(
            "SELECT project_data FROM project_state WHERE project_name = ?",
            (project_name,)
        ).fetchone()

    if not row:
        return {"success": False, "message": "Project not found."}

    return {
        "success": True,
        "project_name": project_name,
        "project_data": json.loads(row[0])
    }