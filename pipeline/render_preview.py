import os
os.environ['PYOPENGL_PLATFORM'] = 'egl'
import numpy as np, trimesh, pyrender
from PIL import Image

scene_tm = trimesh.load('/workspace/model.glb')
mesh = trimesh.util.concatenate(tuple(scene_tm.geometry.values())) if hasattr(scene_tm, 'geometry') else scene_tm

# normalize: center, scale to fit
mesh.apply_translation(-mesh.bounding_box.centroid)
scale = 1.6 / mesh.extents.max()
mesh.apply_scale(scale)

W = H = 512
views = {'front': 0, 'right': 90, 'back': 180, 'left': 270}
tiles = []
for name, ang in views.items():
    scene = pyrender.Scene(bg_color=[0.1, 0.1, 0.12, 1.0], ambient_light=[0.35, 0.35, 0.35])
    scene.add(pyrender.Mesh.from_trimesh(mesh, smooth=False))
    a = np.radians(ang)
    cam = pyrender.PerspectiveCamera(yfov=np.pi / 4.0)
    dist = 2.4
    cpose = np.array([
        [ np.cos(a), 0, np.sin(a), dist*np.sin(a)],
        [ 0,         1, 0,         0.0],
        [-np.sin(a), 0, np.cos(a), dist*np.cos(a)],
        [ 0,         0, 0,         1.0]])
    scene.add(cam, pose=cpose)
    # key + fill lights following camera
    light = pyrender.DirectionalLight(color=np.ones(3), intensity=3.0)
    scene.add(light, pose=cpose)
    scene.add(pyrender.DirectionalLight(color=np.ones(3), intensity=1.5),
              pose=np.array([[1,0,0,0],[0,1,0,3],[0,0,1,0],[0,0,0,1]], float))
    r = pyrender.OffscreenRenderer(W, H)
    color, _ = r.render(scene)
    r.delete()
    tiles.append(Image.fromarray(color))
    print('rendered', name)

grid = Image.new('RGB', (W*4, H), (20, 20, 25))
for i, t in enumerate(tiles):
    grid.paste(t, (i*W, 0))
grid.save('/workspace/preview.png')
print('saved /workspace/preview.png')
