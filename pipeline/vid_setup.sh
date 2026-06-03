#!/usr/bin/env bash
set -e
cd /workspace
echo "=== creating venv (system-site-packages to reuse torch) ==="
python3 -m venv --system-site-packages /workspace/vidvenv
source /workspace/vidvenv/bin/activate
echo "=== upgrading diffusers stack (isolated in venv) ==="
pip install -q -U "diffusers>=0.32.0" "transformers>=4.46" accelerate imageio imageio-ffmpeg sentencepiece protobuf
echo "=== diffusers version ==="
python -c "import diffusers; print('diffusers', diffusers.__version__)"
echo "=== running generation ==="
python /workspace/gen_video.py
echo "=== ALL DONE ==="
