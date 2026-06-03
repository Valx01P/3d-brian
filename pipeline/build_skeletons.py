"""Render OpenPose (COCO-18) skeletons for action poses, facing LEFT (side view).
Each animation = 3 frames that are SMALL incremental deltas of one base pose
(same neck anchor, same lean, same limb lengths) so the cycle reads as one motion.
Output: /workspace/poses/pose/<name>.png  + contact sheet."""
import os, math
import numpy as np
from PIL import Image, ImageDraw

W, H = 832, 1216
OUT = "/workspace/poses/pose"
os.makedirs(OUT, exist_ok=True)

NOSE, NECK, RSHO, RELB, RWRI, LSHO, LELB, LWRI, RHIP, RKNE, RANK, LHIP, LKNE, LANK, REYE, LEYE, REAR, LEAR = range(18)
COLORS = [[255,0,0],[255,85,0],[255,170,0],[255,255,0],[170,255,0],[85,255,0],[0,255,0],
    [0,255,85],[0,255,170],[0,255,255],[0,170,255],[0,85,255],[0,0,255],[85,0,255],
    [170,0,255],[255,0,255],[255,0,170],[255,0,85]]
LIMBS = [[1,2],[1,5],[2,3],[3,4],[5,6],[6,7],[1,8],[8,9],[9,10],[1,11],[11,12],[12,13],
         [1,0],[0,14],[14,16],[0,15],[15,17]]

L_UP, L_FORE = 120, 110
L_THIGH, L_SHIN = 165, 155
NECK_NOSE, SHO_HALF, HIP_HALF, TORSO = 70, 60, 45, 215

def Dv(a):
    r = math.radians(a)
    return np.array([math.sin(r), math.cos(r)])

def build(neck, lean, arms, legs):
    P = [None]*18
    neck = np.array(neck, float)
    P[NECK] = neck
    nose = neck + Dv(180+lean)*NECK_NOSE
    P[NOSE] = nose
    P[REYE] = nose + Dv(180+lean-12)*18
    P[LEYE] = nose + Dv(180+lean+12)*18
    P[REAR] = nose + Dv(180+lean-30)*30
    P[LEAR] = nose + Dv(180+lean+30)*30
    P[LSHO] = neck + Dv(90)*SHO_HALF*0.4 + Dv(lean)*8
    P[RSHO] = neck + Dv(90)*SHO_HALF*0.4 - Dv(lean)*8
    midhip = neck + Dv(lean)*TORSO
    P[LHIP] = midhip + Dv(90)*HIP_HALF*0.4
    P[RHIP] = midhip - Dv(90)*HIP_HALF*0.4
    for side, sho, elb, wri in [("lead",LSHO,LELB,LWRI),("back",RSHO,RELB,RWRI)]:
        sa, ea = arms[side]
        P[elb] = P[sho] + Dv(sa)*L_UP
        P[wri] = P[elb] + Dv(sa+ea)*L_FORE
    for side, hip, kne, ank in [("lead",LHIP,LKNE,LANK),("back",RHIP,RKNE,RANK)]:
        ha, ka = legs[side]
        P[kne] = P[hip] + Dv(ha)*L_THIGH
        P[ank] = P[kne] + Dv(ha+ka)*L_SHIN
    return P

def render(P):
    img = Image.fromarray(np.zeros((H,W,3), np.uint8))
    d = ImageDraw.Draw(img)
    for i,(a,b) in enumerate(LIMBS):
        if P[a] is None or P[b] is None: continue
        d.line([tuple(P[a]),tuple(P[b])], fill=tuple(COLORS[i%18]), width=14)
    for i,p in enumerate(P):
        if p is None: continue
        x,y = p
        d.ellipse([x-7,y-7,x+7,y+7], fill=tuple(COLORS[i]))
    return img

# --- consistent cycles: per-animation fixed neck/lean; only limb angles step ---
NX = 430
POSES = {}

# RUN: forward lean, constant neck height; legs cycle contact->passing->extension, arms swing opposite
RUN_NECK, RUN_LEAN = (NX, 300), -15
RUN_FRAMES = [
    # (lead arm sa,ea), (back arm sa,ea), (lead leg ha,ka), (back leg ha,ka)
    dict(arms={"lead":(-48,-45),"back":(34,-55)}, legs={"lead":(-30,22),"back":(30,68)}),
    dict(arms={"lead":(-10,-55),"back":(8,-45)},  legs={"lead":(-6,42), "back":(6,58)}),
    dict(arms={"lead":(30,-50), "back":(-44,-45)},legs={"lead":(-36,12),"back":(36,52)}),
]
for i,f in enumerate(RUN_FRAMES):
    POSES[f"run_{i+1}"] = dict(neck=RUN_NECK, lean=RUN_LEAN, **f)

# SHOOT: nearly identical aiming stance, subtle recoil only (great for animation)
SH_NECK, SH_LEAN = (NX, 302), -6
SH_FRAMES = [
    dict(arms={"lead":(-90,-2),"back":(-80,-14)}, legs={"lead":(-15,12),"back":(22,16)}),
    dict(arms={"lead":(-95,2), "back":(-86,-10)}, legs={"lead":(-15,12),"back":(24,18)}),  # recoil up
    dict(arms={"lead":(-88,-4),"back":(-78,-16)}, legs={"lead":(-15,12),"back":(22,16)}),
]
for i,f in enumerate(SH_FRAMES):
    POSES[f"shoot_{i+1}"] = dict(neck=SH_NECK, lean=SH_LEAN, **f)

# JUMP: crouch -> airborne tuck -> land; neck rises then settles (kept moderate)
# keep the jump subtle + consistent with the standing original: upright body,
# arms kept close to the torso, legs progress crouch -> tuck -> land (no star-jump).
JUMP_FRAMES = [
    dict(neck=(NX,330), lean=-11, arms={"lead":(18,-42),"back":(34,-44)}, legs={"lead":(-6,78),"back":(13,82)}),
    dict(neck=(NX,302), lean=-8,  arms={"lead":(-32,-38),"back":(26,-40)}, legs={"lead":(-22,92),"back":(9,96)}),
    dict(neck=(NX,320), lean=-11, arms={"lead":(-12,-42),"back":(30,-43)}, legs={"lead":(-16,60),"back":(20,56)}),
]
for i,f in enumerate(JUMP_FRAMES):
    POSES[f"jump_{i+1}"] = f

thumbs = {}
for name, spec in POSES.items():
    P = build(spec["neck"], spec["lean"], spec["arms"], spec["legs"])
    img = render(P)
    img.save(f"{OUT}/{name}.png")
    thumbs[name] = img
    print("skeleton", name, flush=True)

tw, th = 277, 405
sheet = Image.new("RGB", (tw*3, th*3), (15,15,18))
ds = ImageDraw.Draw(sheet)
order = ["run_1","run_2","run_3","shoot_1","shoot_2","shoot_3","jump_1","jump_2","jump_3"]
for i,name in enumerate(order):
    sheet.paste(thumbs[name].resize((tw,th)), ((i%3)*tw,(i//3)*th))
    ds.text(((i%3)*tw+5,(i//3)*th+5), name, fill=(255,255,255))
sheet.save("/workspace/skeleton_contact.png")
print("saved /workspace/skeleton_contact.png", flush=True)
