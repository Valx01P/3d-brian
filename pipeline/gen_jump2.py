import torch
from PIL import Image, ImageDraw
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel

ref = Image.open("/workspace/brian_src.png").convert("RGB")
controlnet = ControlNetModel.from_pretrained("xinsir/controlnet-openpose-sdxl-1.0", torch_dtype=torch.float16)
pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    controlnet=controlnet, torch_dtype=torch.float16, variant="fp16", use_safetensors=True,
).to("cuda")
pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter_sdxl.bin")
pipe.set_ip_adapter_scale(0.62)

PROMPT = ("a man jumping in the air, knees bent, holding a black pistol, wearing a bright white "
          "collared dress shirt, khaki chino pants, white sneakers, full body, side view, "
          "plain light gray background, photorealistic, sharp")
NEG = ("beige shirt, tan shirt, cream shirt, brown, sweater, polo, dark shirt, cropped, cut off, "
       "extra limbs, deformed hands, blurry, lowres, text, watermark, multiple people")
control = Image.open("/workspace/poses/pose/jump_2.png").convert("RGB")

seeds = [9133, 7, 42, 2025]
g = torch.Generator(device="cuda")
thumbs = []
for s in seeds:
    img = pipe(prompt=PROMPT, negative_prompt=NEG, image=control, ip_adapter_image=ref,
               controlnet_conditioning_scale=0.92, num_inference_steps=34, guidance_scale=6.5,
               width=832, height=1216, generator=g.manual_seed(s)).images[0]
    img.save(f"/workspace/jump2_cand_{s}.png")
    thumbs.append((s, img)); print("seed", s, flush=True)

tw, th = 220, 320
sheet = Image.new("RGB", (tw*len(seeds), th), (20, 20, 24)); d = ImageDraw.Draw(sheet)
for i, (s, im) in enumerate(thumbs):
    sheet.paste(im.convert("RGB").resize((tw, th)), (i*tw, 0)); d.text((i*tw+6, 6), str(s), fill=(255, 230, 80))
sheet.save("/workspace/jump2_candidates.png")
print("DONE", flush=True)
