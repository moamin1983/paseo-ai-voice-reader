# Copyright (C) 2026 Mohamed Tawfik Amin
# SPDX-License-Identifier: GPL-2.0-only

"""Private stdio worker for the native plugin RPC, not a standalone timeline reader.
No files containing narration or audio are written. Never print request text or vendor errors.
"""
import asyncio
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import wave
from array import array

# ONNX CPU inference only. Avoid loading CUDA or using many CPU threads.
os.environ.setdefault("OMP_NUM_THREADS", "2")
engine = None
engine_dir = None


def probe(req):
    root = Path(req["modelDir"])
    model = all((root / f).exists() for f in ("model.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"))
    return {"edge": importlib.util.find_spec("edge_tts") is not None,
            "kokoro": importlib.util.find_spec("sherpa_onnx") is not None,
            "model": model, "detail": "Kokoro uses CPU and local model files. Edge requires internet and Microsoft cloud consent."}


async def edge(req):
    import edge_tts
    rate = f'{round((req["speed"] - 1) * 100):+d}%'
    data = bytearray()
    async for chunk in edge_tts.Communicate(req["text"], req["voice"], rate=rate).stream():
        if chunk["type"] == "audio":
            data.extend(chunk["data"])
            if len(data) > 8_000_000:
                raise ValueError("audio limit")
    if not data:
        raise ValueError("empty audio")
    return {"base64": base64.b64encode(data).decode("ascii"), "mimeType": "audio/mpeg"}


def kokoro(req):
    global engine, engine_dir
    import sherpa_onnx
    if engine is None or engine_dir != req["modelDir"]:
        root = Path(req["modelDir"])
        config = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=str(root / "model.onnx"),
                voices=str(root / "voices.bin"), tokens=str(root / "tokens.txt"),
                data_dir=str(root / "espeak-ng-data")), num_threads=2, provider="cpu", debug=False),
            max_num_sentences=1)
        if not config.validate():
            raise ValueError("Invalid local model")
        engine = sherpa_onnx.OfflineTts(config)
        engine_dir = req["modelDir"]
    audio = engine.generate(req["text"], sid=int(req["voice"]), speed=req["speed"])
    pcm = array("h", (max(-32768, min(32767, int(float(s) * 32767))) for s in audio.samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(audio.sample_rate)
        wav.writeframes(pcm.tobytes())
    return {"base64": base64.b64encode(out.getvalue()).decode("ascii"), "mimeType": "audio/wav"}


for line in sys.stdin:
    try:
        req = json.loads(line)
        if req.get("op") == "probe":
            result = probe(req)
        elif req["backend"] == "edge":
            result = asyncio.run(asyncio.wait_for(edge(req), timeout=40))
        else:
            result = kokoro(req)
        print(json.dumps({"ok": True, "result": result}), flush=True)
    except Exception:
        print(json.dumps({"ok": False, "error": "TTS failed. Check backend dependencies, local model paths, voice, and network availability."}), flush=True)
