import time, torch
from PIL import Image
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.postprocessors import FloaterRemover, DegenerateFaceRemover, FaceReducer
from hy3dgen.texgen import Hunyuan3DPaintPipeline

MODEL = 'tencent/Hunyuan3D-2'
IMG = '/workspace/input2.png'
OUT_SHAPE = '/workspace/model_shape.glb'
OUT_FINAL = '/workspace/model.glb'

t0 = time.time()
# input is RGBA with a real alpha (already background-removed) -> feed directly, skip rembg
image = Image.open(IMG).convert('RGBA')
print('loaded image', image.size, image.mode, flush=True)

print('loading shapegen pipeline...', flush=True)
shapegen = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MODEL)

print('generating mesh (geometry)...', flush=True)
mesh = shapegen(image=image, num_inference_steps=30, octree_resolution=256,
                generator=torch.manual_seed(12345))[0]
print(f'raw mesh: {len(mesh.vertices)} verts, {len(mesh.faces)} faces', flush=True)

# clean up the mesh
mesh = FloaterRemover()(mesh)
mesh = DegenerateFaceRemover()(mesh)
mesh = FaceReducer()(mesh, max_facenum=40000)
mesh.export(OUT_SHAPE)
print(f'shape-only saved -> {OUT_SHAPE} ({time.time()-t0:.0f}s)', flush=True)

print('loading texture pipeline...', flush=True)
texgen = Hunyuan3DPaintPipeline.from_pretrained(MODEL)
print('painting texture...', flush=True)
mesh = texgen(mesh, image=image)
mesh.export(OUT_FINAL)
print(f'DONE -> {OUT_FINAL} (total {time.time()-t0:.0f}s)', flush=True)
