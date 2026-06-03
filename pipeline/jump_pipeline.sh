#!/usr/bin/env bash
set -e
cd /workspace
source vidvenv/bin/activate
echo "=== generating jump images ==="
python gen_jump.py
echo "=== background-removing ==="
python rembg_poses.py
deactivate
echo "=== hunyuan jump meshes ==="
/usr/bin/python3 hunyuan_jump.py
echo "ALLDONE jump pipeline"
