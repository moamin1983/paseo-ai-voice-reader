#!/usr/bin/env bash
# Copyright (C) 2026 Mohamed Tawfik Amin
# SPDX-License-Identifier: GPL-2.0-only

set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements.lock.txt

printf '\nEnter these paths in AI Voice Reader → Python and local model paths:\n'
printf 'Python executable: %s/.venv/bin/python\n' "$PWD"
printf 'Plugin TTS worker: %s/server/tts_worker.py\n' "$PWD"
printf 'Kokoro model directory: the absolute path to your existing local model\n'
