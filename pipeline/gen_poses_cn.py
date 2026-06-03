import os, glob, torch
from PIL import Image
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel

OUT = "/workspace/poses/raw"
os.makedirs(OUT, exist_ok=True)
ref = Image.open("/workspace/brian_src.png").convert("RGB")

print("loading ControlNet(openpose) + SDXL + IP-Adapter...", flush=True)
controlnet = ControlNetModel.from_pretrained(
    "xinsir/controlnet-openpose-sdxl-1.0", torch_dtype=torch.float16
)
pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    controlnet=controlnet, torch_dtype=torch.float16,
    variant="fp16", use_safetensors=True,
).to("cuda")
pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter_sdxl.bin")
pipe.set_ip_adapter_scale(0.55)

ACTION = {
    "run": "a man running fast, holding a black pistol",
    "shoot": "a man aiming a black pistol forward with arms extended",
    "jump": "a man jumping in the air, holding a black pistol",
}
TAIL = "white collared shirt, khaki pants, white sneakers, full body, side view, plain light gray background, photorealistic, sharp"
NEG = "cropped, cut off, extra limbs, extra arms, deformed hands, missing limbs, blurry, lowres, text, watermark, multiple people"

# fixed seed PER ANIMATION: all 3 frames share base noise + prompt, only the pose
# skeleton differs -> same character/clothing/lighting across the cycle.
SEED = {"run": 7007, "shoot": 8042, "jump": 9133}

poses = sorted(glob.glob("/workspace/poses/pose/*.png"))
g = torch.Generator(device="cuda")
for i, pp in enumerate(poses):
    name = os.path.splitext(os.path.basename(pp))[0]
    anim = name.split("_")[0]
    prompt = f"{ACTION[anim]}, {TAIL}"
    control = Image.open(pp).convert("RGB")
    img = pipe(
        prompt=prompt, negative_prompt=NEG,
        image=control, ip_adapter_image=ref,
        controlnet_conditioning_scale=0.92,
        num_inference_steps=34, guidance_scale=6.0,
        width=832, height=1216,
        generator=g.manual_seed(SEED[anim]),
    ).images[0]
    img.save(f"{OUT}/{name}.png")
    print(f"[{i+1}/9] saved {name} (seed {SEED[anim]})", flush=True)
print("DONE poses", flush=True)
