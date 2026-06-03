# Asset pipeline — Brian vs the Ops

How every 3D/video asset in `client/public/models/` was generated from single images,
on an NVIDIA RTX 4090 (24 GB). Three model families are involved:

- **Hunyuan3D-2** — single image → textured `.glb`
- **SDXL + ControlNet (OpenPose) + IP-Adapter** — one photo → the same person in new action poses
- **LTX-Video** — one photo → a short img-to-video clip

> Heads-up: most scripts use hardcoded `/workspace/...` paths from the dev pod. They're kept
> as a record of how the assets were made; adjust paths to reproduce.

## What's in `client/public/models/`
- `brian.glb` — the hero/player, from a frontal photo (see "Image → 3D" below).
- `anim/{run,shoot,jump}_{1,2,3}.glb` — 9 action-pose meshes used as stop-motion animation frames.
- `guy2.glb` — the enemy ("Agent"), a suit-clad rifleman from a model-sheet crop.
- `brian_dance.mp4` — a short LTX-Video dance clip (not currently shown in the app).

## 1. Image → 3D (hero)  — `gen.py`
Frontal background-removed A-pose → Hunyuan3D-2 → cleanup → 40k-face reduce → texture bake.
See the "Reproduce" block below. ~3 min on a 4090.

## 2. Action poses (run / shoot / jump)
The player's animation frames. Pipeline:
1. `build_skeletons.py` — renders parametric **OpenPose** stick-figure skeletons for each frame
   (tight, consistent cycles so the 3 frames of each action read as one motion).
2. `gen_poses_cn.py` — **SDXL + ControlNet-OpenPose + IP-Adapter**: the skeleton forces the pose,
   IP-Adapter carries Brian's identity/clothing. Fixed seed per animation → consistent frames.
3. `rembg_poses.py` — background-removes each generated pose to a clean RGBA cutout.
4. `hunyuan_batch.py` — Hunyuan3D-2 over all 9 cutouts → `anim/*.glb` (geometry pass, then texture pass).
5. `gen_jump.py` / `gen_jump2.py` + `hunyuan_jump.py` / `hunyuan_one.py` — the jump frames were
   regenerated for consistency (the first pass drifted; a stronger white-shirt prompt + seed search fixed it).
6. `jump_pipeline.sh` — orchestrates the jump regen end-to-end.

## 3. Enemy (Agent)  — `gen_guy2.py`
Crop the "hero aiming pose" from a character model-sheet → rembg → Hunyuan3D-2 → `guy2.glb`.

## 4. Dance video  — `gen_video.py` + `vid_setup.sh`
LTX-Video image-to-video from the source photo → `brian_dance.mp4`. `vid_setup.sh` builds an
isolated venv with a newer diffusers so it doesn't disturb the Hunyuan stack.

## Reproduce the hero (Hunyuan3D-2)
On a CUDA machine (tested: torch 2.4.1+cu124, Python 3.11):

```bash
git clone https://github.com/Tencent/Hunyuan3D-2.git
# pin a compatible stack (unpinned install pulls transformers 5.x which breaks on torch 2.4):
pip install "transformers==4.46.3" "diffusers==0.30.0" "huggingface_hub==0.25.2" "tokenizers<0.21"
bash setup.sh          # reqs + builds custom_rasterizer / differentiable_renderer CUDA exts
python3 gen.py         # input2.png -> model.glb (+ model_shape.glb)
python3 render_preview.py
```

For the pose pipeline you also need (in a venv, to avoid clashing with Hunyuan):
`diffusers>=0.32`, the `xinsir/controlnet-openpose-sdxl-1.0` ControlNet, `h94/IP-Adapter`, and `rembg`.

## Files
- `setup.sh`, `gen.py`, `render_preview.py`, `input2.png` — original hero image→3D
- `build_skeletons.py`, `gen_poses_cn.py`, `rembg_poses.py`, `hunyuan_batch.py` — action poses
- `gen_jump.py`, `gen_jump2.py`, `hunyuan_jump.py`, `hunyuan_one.py`, `jump_pipeline.sh` — jump regen
- `gen_guy2.py` — enemy model
- `gen_video.py`, `vid_setup.sh` — dance video
