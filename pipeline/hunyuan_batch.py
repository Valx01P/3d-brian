import time, os, glob, torch, gc
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.postprocessors import FloaterRemover, DegenerateFaceRemover, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline

MODEL = "tencent/Hunyuan3D-2"
SRC = "/workspace/poses/rgba"
OUT = "/workspace/3d-brian/client/public/models/anim"
os.makedirs(OUT, exist_ok=True)

imgs = sorted(glob.glob(f"{SRC}/*.png"))
print("found", len(imgs), "images:", [os.path.basename(p) for p in imgs], flush=True)

# ---- phase 1: geometry for all ----
print("loading shapegen...", flush=True)
shapegen = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MODEL)
items = []
for i, p in enumerate(imgs):
    name = os.path.splitext(os.path.basename(p))[0]
    t0 = time.time()
    image = Image.open(p).convert("RGBA")
    mesh = shapegen(image=image, num_inference_steps=30, octree_resolution=256,
                    generator=torch.manual_seed(12345))[0]
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    mesh = FaceReducer()(mesh, max_facenum=30000)
    items.append((name, image, mesh))
    print(f"[shape {i+1}/{len(imgs)}] {name} {len(mesh.vertices)}v ({time.time()-t0:.0f}s)", flush=True)

del shapegen
gc.collect(); torch.cuda.empty_cache()

# ---- phase 2: texture all ----
print("loading texgen...", flush=True)
texgen = Hunyuan3DPaintPipeline.from_pretrained(MODEL)
for i, (name, image, mesh) in enumerate(items):
    t0 = time.time()
    try:
        tm = texgen(mesh, image=image)
    except Exception as e:
        print(f"[tex {i+1}] {name} FAILED ({e}); exporting shape-only", flush=True)
        tm = mesh
    out = f"{OUT}/{name}.glb"
    tm.export(out)
    print(f"[tex {i+1}/{len(items)}] {name} -> {out} ({time.time()-t0:.0f}s)", flush=True)

print("DONE hunyuan batch", flush=True)
