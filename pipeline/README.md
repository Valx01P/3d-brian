# Image → 3D pipeline

How `client/public/models/brian.glb` was generated from a single photo, using
[Hunyuan3D-2](https://github.com/Tencent/Hunyuan3D-2) on an NVIDIA RTX 4090 (24 GB).

## Output
- `brian.glb` — textured model (24k verts / 40k faces, PBR baseColor texture @ 2048²). ~3.3 MB.
- `brian_shape.glb` — untextured geometry only.
- `brian_preview.png` — 4-view render (front / right / back / left).

Generation took ~3 min on a 4090 (≈52 s geometry + ≈2 min texture bake).

## Reproduce
On a CUDA machine (tested: torch 2.4.1+cu124, Python 3.11):

```bash
git clone https://github.com/Tencent/Hunyuan3D-2.git
# pin a compatible stack (the unpinned install pulls transformers 5.x which breaks on torch 2.4):
pip install "transformers==4.46.3" "diffusers==0.30.0" "huggingface_hub==0.25.2" "tokenizers<0.21"
bash setup.sh          # installs reqs + builds the custom_rasterizer / differentiable_renderer CUDA ext
python3 gen.py         # input2.png -> model.glb (+ model_shape.glb)
python3 render_preview.py   # -> preview.png (offscreen EGL render)
```

`input2.png` is the source image — a clean, background-removed frontal A-pose, which is
the ideal input for single-image 3D.

## Files
- `setup.sh` — dependency install + CUDA extension build
- `gen.py` — shape gen → mesh cleanup → 40k-face reduction → texture bake → `.glb`
- `render_preview.py` — headless 4-view preview render (pyrender + EGL)
- `input2.png` — source photo
