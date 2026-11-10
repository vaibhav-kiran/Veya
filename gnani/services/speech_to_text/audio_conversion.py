"""
Audio conversion used before sending recordings to Gnani STT.

The browser records WebM/Opus. Gnani receives a 16 kHz mono 16-bit WAV.
This is the same ffmpeg command the /transcribe endpoint always used,
moved here so the conversation endpoints can reuse it.
"""

import subprocess
from pathlib import Path


class AudioConversionError(Exception):
    """ffmpeg could not convert the recording."""

    def __init__(self, message: str, ffmpeg_output: str = ""):
        super().__init__(message)
        self.ffmpeg_output = ffmpeg_output


# Audio formats we accept, mapped to the ffmpeg demuxer that must read them.
# Forcing the demuxer stops ffmpeg from treating an upload as a playlist
# (HLS / concat), which could make it fetch URLs or read local files.
AUDIO_DEMUXERS: dict[str, str] = {
    ".webm": "matroska",
    ".mkv": "matroska",
    ".m4a": "mov",
    ".mp4": "mov",
    ".mov": "mov",
    ".3gp": "mov",
    ".caf": "caf",
    ".wav": "wav",
    ".ogg": "ogg",
    ".opus": "ogg",
    ".mp3": "mp3",
    ".aac": "aac",
    ".amr": "amr",
}


def is_supported_audio(path: Path) -> bool:
    return path.suffix.lower() in AUDIO_DEMUXERS


def convert_to_wav(input_path: Path, output_path: Path, timeout_seconds: float = 60) -> Path:
    """Convert an uploaded audio file to 16 kHz mono PCM WAV. Blocking call."""

    demuxer = AUDIO_DEMUXERS.get(input_path.suffix.lower())
    if demuxer is None:
        raise AudioConversionError("Unsupported audio format.")

    try:
        conversion = subprocess.run(
            [
                "ffmpeg",
                "-y",
                # Only the local file itself: no network or other protocols.
                "-protocol_whitelist", "file",
                "-f", demuxer,
                "-i", str(input_path),
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except FileNotFoundError as error:
        raise AudioConversionError("ffmpeg is not installed.") from error
    except subprocess.TimeoutExpired as error:
        raise AudioConversionError("Audio conversion timed out.") from error

    if conversion.returncode != 0:
        raise AudioConversionError("Audio conversion failed.", conversion.stderr)

    # A WAV header alone is 44 bytes, so anything that small has no audio.
    if not output_path.exists() or output_path.stat().st_size <= 44:
        raise AudioConversionError("Converted WAV file is empty.")

    return output_path
