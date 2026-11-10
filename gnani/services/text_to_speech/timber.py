import os
import httpx

from dotenv import load_dotenv

load_dotenv()


class GnaniTimbre:

    def __init__(self):

        self.api_key = os.getenv("GNANI_API_KEY")
        self.base_url = os.getenv("GNANI_BASE_URL")
        self.endpoint = os.getenv("GNANI_TTS_ENDPOINT")

        if not self.api_key:
            raise ValueError("Gnani API key is missing.")

    async def generate_speech(
        self,
        text: str,
        language: str = "en-IN",
        voice: str = "Nalini",
        sample_rate: int = 48000
    ):

        url = f"{self.base_url.rstrip('/')}/{self.endpoint.lstrip('/')}"

        headers = {
            "X-API-Key-ID": self.api_key,
            "Content-Type": "application/json"
        }

        payload = {
            "text": text,
            "voice": voice,
            "model": "timbre-v2.5",
            "language": language,
            "speed": 1,
            "audio_config": {
                "encoding": "linear_pcm",
                "container": "wav",
                "num_channels": 1,
                "sample_rate": sample_rate,
                "sample_width": 2
            }
        }

        async with httpx.AsyncClient(timeout=60) as client:

            response = await client.post(
                url,
                headers=headers,
                json=payload
            )

            response.raise_for_status()

            return response.content