import os 
import httpx

from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

class GnaniPrisma:
    def __init__(self):

        self.api_key = os.getenv("GNANI_API_KEY")
        self.base_url = os.getenv("GNANI_BASE_URL")
        self.endpoint = os.getenv("GNANI_STT_ENDPOINT")

        if not self.api_key:
            raise ValueError("Gnani API key is missing.")

        if not self.base_url or not self.endpoint:
            raise ValueError("Gnani API URL or endpoint is missing.")

    async def transcribe(
        self,
        audio_path: str,
        language_code: str = "indic-auto"
    ):
        audio_path = Path(audio_path)

        if not audio_path.is_file():
            raise FileNotFoundError("Audio file not found.")

        headers = {
            "X-API-Key-ID": self.api_key
        }

        data = {
            "model": "prisma-v3.0",
            "language_code": language_code,
            "format": "codemix"
        }

        async with httpx.AsyncClient(timeout=60) as client:

            with audio_path.open("rb") as audio:

                response = await client.post(
                    f"{self.base_url.rstrip('/')}/{self.endpoint.lstrip('/')}",
                    headers=headers,
                    files={
                        "audio_file": (
                            audio_path.name,
                            audio,
                            "application/octet-stream"
                        )
                    },
                    data=data
                )

            response.raise_for_status()

            return response.json()