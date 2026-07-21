#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = [
#   "kokoro==0.9.4",
#   "misaki[en]>=0.9.4",
#   "soundfile>=0.13.1",
# ]
# ///
"""Generate the fixed, privacy-safe guided workout coach packs.

Run from the repository root:
  UV_CACHE_DIR=/tmp/workout-uv-cache uv run scripts/generate-coach-audio.py

Only the allow-listed phrases below are generated. Exercise names, weights,
user notes, and PT technique cues are deliberately excluded.
"""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "public" / "audio" / "coaches"
COACHES = {
    "maya": {"voice": "af_heart", "language": "a", "speed": 1.02},
    "alex": {"voice": "am_michael", "language": "a", "speed": 0.98},
    "jordan": {"voice": "bf_emma", "language": "b", "speed": 1.04},
    "kai": {"voice": "am_fenrir", "language": "a", "speed": 1.10},
}
FIXED_PHRASES = {
    "get-ready": "Get ready.",
    "lower": "Lower.",
    "hold": "Hold.",
    "up": "Up.",
    "halfway": "Halfway.",
    "last-rep": "Last rep.",
    "rest-halfway": "Rest halfway.",
    "rest-complete": "Rest complete.",
}
PHRASES = {
    **FIXED_PHRASES,
    **{f"rep-{number}": f"{number}." for number in range(1, 51)},
}


def synthesize(pipeline: KPipeline, text: str, voice: str, speed: float) -> np.ndarray:
    chunks: list[np.ndarray] = []
    for _, _, audio in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
        if hasattr(audio, "detach"):
            audio = audio.detach().cpu().numpy()
        chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        raise RuntimeError(f"Kokoro returned no audio for {text!r}")
    return np.concatenate(chunks)


def encode_mp3(audio: np.ndarray, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as temporary:
        sf.write(temporary.name, audio, 24_000, subtype="PCM_16")
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", temporary.name,
                "-af",
                "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB:"
                "stop_periods=1:stop_duration=0.04:stop_threshold=-48dB,"
                "apad=pad_dur=0.06,loudnorm=I=-18:TP=-2:LRA=7",
                "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", "24000", "-ac", "1",
                str(destination),
            ],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--coach", action="append", choices=sorted(COACHES), dest="coaches")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    selected = args.coaches or list(COACHES)
    pipelines: dict[str, KPipeline] = {}

    for coach in selected:
        config = COACHES[coach]
        language = str(config["language"])
        pipeline = pipelines.setdefault(language, KPipeline(lang_code=language))
        for cue, text in PHRASES.items():
            destination = args.output / coach / f"{cue}.mp3"
            if destination.exists() and not args.force:
                continue
            print(f"{coach:>6}  {cue}", flush=True)
            audio = synthesize(pipeline, text, str(config["voice"]), float(config["speed"]))
            encode_mp3(audio, destination)


if __name__ == "__main__":
    main()
