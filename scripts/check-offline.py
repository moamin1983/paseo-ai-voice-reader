# Copyright (C) 2026 Mohamed Tawfik Amin
# SPDX-License-Identifier: GPL-2.0-only

"""Verify Kokoro initialization and generation with all Python network entrypoints denied."""
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
code = '''
import atexit, runpy, socket, sys
attempts=[]
def denied(*args,**kwargs):
    attempts.append(True)
    raise RuntimeError("Network is forbidden in offline verification")
socket.socket.connect=denied
socket.socket.connect_ex=denied
socket.socket.sendto=denied
socket.create_connection=denied
socket.getaddrinfo=denied
atexit.register(lambda: print("NETWORK_ATTEMPTS="+str(len(attempts)),file=sys.stderr))
runpy.run_path(sys.argv[1],run_name="__main__")
'''
request = {"backend":"kokoro", "text":"Offline speech stays on this computer.",
    "speed":1, "voice":0, "modelDir":os.environ.get("KOKORO_MODEL_DIR", str(Path.home()/".paseo/models/local-speech/kokoro-en-v0_19"))}
result = subprocess.run([str(root / '.venv/bin/python'), '-c', code, str(root / 'server/tts_worker.py')],
    input=json.dumps(request)+'\n', capture_output=True, text=True, timeout=60)
reply = json.loads(result.stdout)
assert result.returncode == 0 and reply['ok'], 'Kokoro failed with network disabled'
assert 'NETWORK_ATTEMPTS=0' in result.stderr, 'Offline backend attempted a network operation'
summary = {'passed':True,'network_attempts':0,'audio_mime':reply['result']['mimeType'],
    'test_text':'Public canned text only','method':'Deny socket connect, connect_ex, sendto, create_connection and DNS in a fresh worker'}
(root/'evidence').mkdir(exist_ok=True)
(root/'evidence/offline-network.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
