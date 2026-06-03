import sys, torch, gc
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.postprocessors import FloaterRemover, DegenerateFaceRemover, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline

name = sys.argv[1]
MODEL = "tencent/Hunyuan3D-2"
OUT = f"/workspace/3d-brian/client/public/models/anim/{name}.glb"
image = Image.open(f"/workspace/poses/rgba/{name}.png").convert("RGBA")

shapegen = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MODEL)
mesh = shapegen(image=image, num_inference_steps=30, octree_resolution=256, generator=torch.manual_seed(12345))[0]
mesh = FloaterRemover()(mesh); mesh = DegenerateFaceRemover()(mesh); mesh = FaceReducer()(mesh, max_facenum=30000)
del shapegen; gc.collect(); torch.cuda.empty_cache()
print("shape done", flush=True)

texgen = Hunyuan3DPaintPipeline.from_pretrained(MODEL)
mesh = texgen(mesh, image=image)
mesh.export(OUT)
print(f"DONE {OUT}", flush=True)
