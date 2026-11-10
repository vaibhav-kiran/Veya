from .prisma import GnaniPrisma
from .transcription import TranscriptionOutput


class STTPipeline:

    def __init__(self):

        self.prisma = GnaniPrisma()

    async def transcribe(

        self,

        audio_path: str,

        language_code: str = "indic-auto"

    ) -> dict:

        try:

            response = await self.prisma.transcribe(

                audio_path,

                language_code

            )

            return {

                "success": response.get("success", True),

                "transcription": response.get("transcript"),

                "language": response.get("detected_language_code"),

                "model": response.get("model"),

                "error": None

            }

        except Exception as e:

            return {

                "success": False,

                "transcription": None,

                "language": None,

                "model": None,

                "error": str(e)

            }