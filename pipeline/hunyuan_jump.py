import torch, gc
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.postprocessors import FloaterRemover, DegenerateFaceRemover, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline

MODEL = "tencent/Hunyuan3D-2"
OUT = "/workspace/3d-brian/client/public/models/anim"
names = ["jump_1", "jump_2", "jump_3"]

shapegen = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MODEL)
items = []
for n in names:
    image = Image.open(f"/workspace/poses/rgba/{n}.png").convert("RGBA")
    mesh = shapegen(image=image, num_inference_steps=30, octree_resolution=256, generator=torch.manual_seed(12345))[0]
    mesh = FloaterRemover()(mesh); mesh = DegenerateFaceRemover()(mesh); mesh = FaceReducer()(mesh, max_facenum=30000)
    items.append((n, image, mesh)); print("shape", n, flush=True)
del shapegen; gc.collect(); torch.cuda.empty_cache()

texgen = Hunyuan3DPaintPipeline.from_pretrained(MODEL)
for n, image, mesh in items:
    tm = texgen(mesh, image=image)
    tm.export(f"{OUT}/{n}.glb"); print("tex", n, flush=True)
print("DONE jump hunyuan", flush=True)
