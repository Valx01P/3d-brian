import os, glob
from rembg import remove, new_session
from PIL import Image

SRC = "/workspace/poses/raw"
OUT = "/workspace/poses/rgba"
os.makedirs(OUT, exist_ok=True)

session = new_session("u2net")
for p in sorted(glob.glob(f"{SRC}/*.png")):
    name = os.path.basename(p)
    img = Image.open(p).convert("RGBA")
    cut = remove(img, session=session)  # RGBA with alpha matte
    cut.save(f"{OUT}/{name}")
    print("cut", name, flush=True)
print("DONE rembg", flush=True)
