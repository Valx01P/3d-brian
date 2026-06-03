import torch
from PIL import Image
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel

OUT = "/workspace/poses/raw"
ref = Image.open("/workspace/brian_src.png").convert("RGB")

print("loading SDXL + ControlNet + IP-Adapter...", flush=True)
controlnet = ControlNetModel.from_pretrained("xinsir/controlnet-openpose-sdxl-1.0", torch_dtype=torch.float16)
pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    controlnet=controlnet, torch_dtype=torch.float16, variant="fp16", use_safetensors=True,
).to("cuda")
pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter_sdxl.bin")
pipe.set_ip_adapter_scale(0.6)  # a touch higher -> identity closer to the original

ACTION = "a man jumping in the air, knees bent, holding a black pistol"
TAIL = "white collared shirt, khaki pants, white sneakers, full body, side view, plain light gray background, photorealistic, sharp"
NEG = "cropped, cut off, extra limbs, extra arms, deformed hands, missing limbs, blurry, lowres, text, watermark, multiple people"
SEED = 9133

g = torch.Generator(device="cuda")
for i in (1, 2, 3):
    control = Image.open(f"/workspace/poses/pose/jump_{i}.png").convert("RGB")
    img = pipe(
        prompt=f"{ACTION}, {TAIL}", negative_prompt=NEG,
        image=control, ip_adapter_image=ref,
        controlnet_conditioning_scale=0.92, num_inference_steps=34, guidance_scale=6.0,
        width=832, height=1216, generator=g.manual_seed(SEED),
    ).images[0]
    img.save(f"{OUT}/jump_{i}.png")
    print(f"saved jump_{i}", flush=True)
print("DONE jump", flush=True)
