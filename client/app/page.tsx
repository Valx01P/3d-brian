"use client";

import { useState } from "react";
import ModelViewer from "./ModelViewer";
import GameViewer from "./GameViewer";

export default function Home() {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative flex-1 overflow-hidden">
        <GameViewer src="/models/brian.glb" />
        <button
          onClick={() => setPlaying(false)}
          className="absolute left-4 top-4 z-20 rounded-md bg-black/60 px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur transition hover:bg-black/80 hover:text-white"
        >
          ← Menu
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-[#0b0d12]">
      {/* hero model in the background — facing the camera */}
      <ModelViewer src="/models/brian.glb" />

      {/* darkening gradient for legibility */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />

      {/* title + play */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <h1 className="select-none text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-7xl">
          BRIAN <span className="text-rose-500">vs</span> THE OPS
        </h1>
        <p className="mt-3 max-w-md select-none text-sm font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] sm:text-base">
          A third-person arena shooter. Strafe, take cover, and drop the suited
          agents before they drop you.
        </p>
        <button
          onClick={() => setPlaying(true)}
          className="pointer-events-auto mt-8 rounded-full bg-rose-600 px-10 py-3 text-lg font-bold text-white shadow-lg shadow-rose-900/40 transition hover:scale-105 hover:bg-rose-500 active:scale-100"
        >
          ▶ Play
        </button>
        <p className="mt-3 select-none text-xs font-semibold text-zinc-100 drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)] sm:text-sm">
          W/A/S/D move · ←/→ ↑/↓ aim · Space shoot · L jump · I zoom
        </p>
      </div>

      {/* corner brand */}
      <div className="pointer-events-none absolute left-4 top-4 select-none text-xs font-medium text-zinc-300 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
        Hunyuan3D-2 · image → 3D character
      </div>
    </div>
  );
}
