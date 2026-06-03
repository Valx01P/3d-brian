import torch
from diffusers import LTXImageToVideoPipeline
from diffusers.utils import export_to_video, load_image

print("loading LTX-Video pipeline...", flush=True)
pipe = LTXImageToVideoPipeline.from_pretrained(
    "Lightricks/LTX-Video", torch_dtype=torch.bfloat16
)
pipe.enable_model_cpu_offload()
try:
    pipe.vae.enable_tiling()
except Exception as e:
    print("tiling not available:", e, flush=True)

image = load_image("/workspace/brian_src.png")
W, H = 704, 512  # must be divisible by 32
image = image.convert("RGB").resize((W, H))

prompt = (
    "The man is energetically dancing, rhythmically moving his arms and body to music, "
    "lively dance moves, full body shot, smooth natural motion, cheerful, dynamic"
)
neg = "static, frozen, still, blurry, distorted, deformed, low quality, glitch"

print("generating frames...", flush=True)
out = pipe(
    image=image,
    prompt=prompt,
    negative_prompt=neg,
    width=W,
    height=H,
    num_frames=121,          # 8*15+1 -> ~5s @ 24fps
    num_inference_steps=40,
    guidance_scale=3.0,
).frames[0]

export_to_video(out, "/workspace/brian_dance.mp4", fps=24)
print("DONE -> /workspace/brian_dance.mp4", flush=True)
