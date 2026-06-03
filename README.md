# Brian vs the Ops

A browser third-person arena shooter where the player character and the enemies are **3D models
generated from single photos** (image → 3D via [Hunyuan3D-2](https://github.com/Tencent/Hunyuan3D-2),
action poses via SDXL + ControlNet + IP-Adapter). Built with Next.js + Three.js.

## Play
The app is in [`client/`](client). It's a static Next.js app.

```bash
cd client
npm install
npm run dev      # http://localhost:3000
```

`npm run build && npm start` for production. Deploys as a static/SSG Next.js app (e.g. Vercel:
set the project root to `client/`).

### Controls (in-game)
- **W / A / S / D** move / strafe · **O / P** turn
- **Mouse** aim (angles your aim within a front cone; it doesn't spin you)
- **K** shoot (hold for full-auto) · **L** jump
- **C** cycle camera (shoulder L/R, far, close, first-person) · **I** zoom · **X** free-look
- **Esc** pause · look-sensitivity slider top-left

Legacy alternate keys still work: arrows for movement/turning, Space/F/E for shoot, G/R/Slash for
jump, and Z for zoom.

Click **Start Fight** to wake the agents up. You have 1 life; best score is saved locally.

## How it works
- **Player**: `client/public/models/brian.glb` (hero) plus 9 action-pose meshes in
  `client/public/models/anim/` (run/shoot/jump × 3), swapped as stop-motion frames.
- **Enemy**: `client/public/models/guy2.glb`, a suit-clad rifleman, with simple chase-and-shoot AI.
- All meshes were produced by the scripts in [`pipeline/`](pipeline) — see its README for the full
  image→3D / pose-generation / video process.

## Layout
- `client/` — the Next.js + Three.js game (`app/page.tsx` landing, `app/GameViewer.tsx` the game,
  `app/ModelViewer.tsx` the orbit viewer).
- `pipeline/` — the asset-generation scripts (run on a CUDA GPU; not needed to run the app).
