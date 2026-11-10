from pathlib import Path
from services.text_to_speech.timber import GnaniTimbre


class TTSPipeline:

    def __init__(self):
        self.timbre = GnaniTimbre()

    async def synthesize(
        self,
        text: str,
        language: str = "en-IN",
        voice: str = "Nalini",
        sample_rate: int = 48000
    ) -> bytes:
        """
        Return the generated WAV audio as bytes.

        Nothing is written to disk, so several conversations can
        generate speech at the same time without overwriting each other.

        A lower sample_rate (for example 24000) is generated faster
        by Gnani and is still clear for speech.
        """

        return await self.timbre.generate_speech(
            text=text,
            language=language,
            voice=voice,
            sample_rate=sample_rate
        )

    async def speak(
        self,
        text: str,
        language: str = "en-IN",
        voice: str = "Nalini"
    ):

        audio_data = await self.synthesize(
            text=text,
            language=language,
            voice=voice
        )

        output_path = Path("greeting.wav")
        output_path.write_bytes(audio_data)

        return str(output_path)
