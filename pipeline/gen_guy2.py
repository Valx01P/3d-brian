import time, torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.postprocessors import FloaterRemover, DegenerateFaceRemover, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline

MODEL = "tencent/Hunyuan3D-2"
IMG = "/workspace/guy2_rgba.png"
OUT = "/workspace/3d-brian/client/public/models/guy2.glb"

t0 = time.time()
image = Image.open(IMG).convert("RGBA")
print("loaded", image.size, flush=True)

shapegen = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MODEL)
mesh = shapegen(image=image, num_inference_steps=30, octree_resolution=256,
                generator=torch.manual_seed(2024))[0]
mesh = FloaterRemover()(mesh)
mesh = DegenerateFaceRemover()(mesh)
mesh = FaceReducer()(mesh, max_facenum=40000)
print(f"shape done ({time.time()-t0:.0f}s)", flush=True)

texgen = Hunyuan3DPaintPipeline.from_pretrained(MODEL)
mesh = texgen(mesh, image=image)
mesh.export(OUT)
print(f"DONE guy2 -> {OUT} (total {time.time()-t0:.0f}s)", flush=True)
