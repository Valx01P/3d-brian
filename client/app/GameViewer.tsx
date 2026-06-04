"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Keys = Record<string, boolean>;

// animation frames -> glb basenames under /models/anim
const ANIM: Record<"run" | "shoot" | "jump", string[]> = {
  run: ["run_1", "run_2", "run_3"],
  shoot: ["shoot_1", "shoot_2", "shoot_3"],
  jump: ["jump_1", "jump_2", "jump_3"],
};
const CHAR_HEIGHT = 1.8;
// action-pose meshes are reconstructed from side-on (facing -X) images; rotate them so
// the character visually faces +Z (movement forward). idle (front photo) keeps 0.
const ANIM_YAW = Math.PI / 2;

// Skyrim/Fallout-style camera presets — cycle with C
type CamPreset = { name: string; shoulder: number; height: number; dist: number; look: number; aim: number; fp: boolean };
const CAM_PRESETS: CamPreset[] = [
  { name: "Shoulder R", shoulder: 0.85, height: 1.75, dist: 4.6, look: 8, aim: 1.2, fp: false },
  { name: "Shoulder L", shoulder: -0.85, height: 1.75, dist: 4.6, look: 8, aim: 1.2, fp: false },
  { name: "Far", shoulder: 0, height: 2.8, dist: 7.5, look: 6, aim: 1.1, fp: false },
  { name: "Close", shoulder: 0.55, height: 1.55, dist: 3.0, look: 9, aim: 1.25, fp: false },
  { name: "First-person", shoulder: 0, height: 1.62, dist: 0, look: 10, aim: 1.62, fp: true },
];
// zoom multipliers — cycle with Z/I
const ZOOM_LEVELS = [0.7, 1.0, 1.4, 2.0];

// rear-view picture-in-picture (bottom-left), in CSS px
const PIP_W = 230, PIP_H = 150, PIP_M = 16;

// you aim entirely with the arrow keys: ←/→ swing your facing, ↑/↓ tilt the gun.
// movement (WASD) never changes where you look, and looking never moves you.
const AIM_PITCH_UP = 0.55;    // how far up you can aim (radians)
const AIM_PITCH_DOWN = 0.6;   // how far down you can aim (radians)
const PITCH_SPEED = 1.8;      // ↑/↓ aim tilt rate (radians/sec, scaled by sensitivity)

// enemy (the suit-clad rifleman) tuning
const ENEMY_HEIGHT = 1.85;
const ENEMY_COUNT = 3;
const ENEMY_SPEED = 2.7;
const ENEMY_STANDOFF = 9;   // stops advancing once within this range
const ENEMY_SIGHT = 32;     // will fire if player within this range
const ENEMY_FIRE_CD = 1.7;  // seconds between shots
const ENEMY_HP = 3;
const ENEMY_DMG = 12;
const PLAYER_LIVES = 1;

export default function GameViewer({ src = "/models/brian.glb" }: { src?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [score, setScore] = useState(0);
  const [loadedFrames, setLoadedFrames] = useState(0);
  const [camName, setCamName] = useState(CAM_PRESETS[0].name);
  const [zoomLabel, setZoomLabel] = useState("1.0×");
  const [health, setHealth] = useState(100);
  const [deaths, setDeaths] = useState(0);
  const [enemyAlive, setEnemyAlive] = useState(0);
  const [hitFlash, setHitFlash] = useState(false);
  const [sens, setSens] = useState(1);
  const sensRef = useRef(1); // live look-sensitivity multiplier read inside the loop
  const [freeLook, setFreeLook] = useState(false);
  const [armed, setArmed] = useState(false); // enemies stay passive until the player is Ready
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [best, setBest] = useState(0);
  const [objective, setObjective] = useState<string | null>(null);
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  const bestRef = useRef(0);
  const apiRef = useRef<{ start: () => void; togglePause: () => void; restart: () => void } | null>(null);

  // load best score from localStorage once
  useEffect(() => {
    const v = parseInt(localStorage.getItem("bvto_best") || "0", 10) || 0;
    bestRef.current = v;
    setBest(v);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.Fog(0x0b0d12, 45, 95);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false; // we render the main view + a rear-view PiP each frame
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 200);
    const pipCam = new THREE.PerspectiveCamera(68, PIP_W / PIP_H, 0.1, 200); // rear-view

    // lights
    scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x202028, 1.0));
    // back/rim fill: single-image 3D leaves the unseen back darker, so lift it
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.3);
    rim.position.set(-6, 8, -10);
    scene.add(rim);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // arena
    const ARENA = 50;
    const floorTex = makeGridTexture();
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(ARENA / 2, ARENA / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA, ARENA),
      new THREE.MeshStandardMaterial({ map: floorTex, color: 0x6b7280, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const colliders: THREE.Object3D[] = []; // walls the camera should not clip through
    for (const [x, z, sx, sz] of [
      [0, -ARENA / 2, ARENA, 1], [0, ARENA / 2, ARENA, 1],
      [-ARENA / 2, 0, 1, ARENA], [ARENA / 2, 0, 1, ARENA],
    ] as const) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, 3, sz), wallMat);
      w.position.set(x, 1.5, z);
      w.castShadow = true; w.receiveShadow = true;
      scene.add(w);
      colliders.push(w);
    }

    // ---- character rig: a set of swappable pose models ----
    const rig = new THREE.Group();
    scene.add(rig);
    const frames: Record<string, THREE.Object3D> = {}; // key -> normalized model (visible toggled)
    let idleModel: THREE.Object3D | null = null;
    let currentObj: THREE.Object3D | null = null;

    function normalize(model: THREE.Object3D, yaw = 0): THREE.Object3D {
      const holder = new THREE.Group();
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scl = CHAR_HEIGHT / (size.y || 1);
      model.scale.setScalar(scl);
      model.position.x -= center.x * scl;
      model.position.z -= center.z * scl;
      model.position.y -= box.min.y * scl;
      holder.add(model);
      holder.rotation.y = yaw;
      holder.visible = false;
      return holder;
    }

    const loader = new GLTFLoader();
    function loadGLB(url: string): Promise<THREE.Object3D> {
      return new Promise((resolve, reject) =>
        loader.load(url, (g) => resolve(g.scene), undefined, reject)
      );
    }

    // load idle (required) then the optional animation frames
    let frameCount = 0;
    loadGLB(src)
      .then((m) => {
        idleModel = normalize(m);
        idleModel.visible = true;
        rig.add(idleModel);
        frames["idle"] = idleModel;
        currentObj = idleModel;
        setStatus("ready");

        // background-load animation frames; missing ones fall back to idle
        const all = [...ANIM.run, ...ANIM.shoot, ...ANIM.jump];
        all.forEach((key) => {
          loadGLB(`/models/anim/${key}.glb`)
            .then((fm) => {
              const norm = normalize(fm, ANIM_YAW);
              rig.add(norm);
              frames[key] = norm;
              frameCount += 1;
              setLoadedFrames(frameCount);
            })
            .catch(() => { frames[key] = idleModel!; }); // fallback
        });
      })
      .catch((err) => {
        console.error("idle GLB load error:", err);
        setError(String((err as ErrorEvent)?.message || err));
        setStatus("error");
      });

    function show(key: string) {
      const next = frames[key] ?? frames["idle"];
      if (!next || next === currentObj) return;
      if (currentObj) currentObj.visible = false;
      next.visible = true;
      currentObj = next;
    }

    // ---- player state ----
    let heading = 0;
    let vy = 0;
    let grounded = true;
    const GRAVITY = -22, JUMP_V = 9, MOVE_SPEED = 7, TURN_SPEED = 2.6;
    let runPhase = 0;     // advances while moving
    let shootTimer = 0;   // >0 while in shoot anim window
    let camPreset = 0;    // index into CAM_PRESETS (C cycles)
    let zoomIdx = 1;      // index into ZOOM_LEVELS, default 1.0x (Z/I cycles)
    let camPitch = 0;     // vertical aim angle (↑/↓ arrows, clamped)
    let freeLookOn = false; // X: decouple look/aim from movement (run one way, shoot another)
    let moveHeading = 0;    // movement direction (frozen while free-looking)

    // ---- targets ----
    type Target = { mesh: THREE.Mesh; alive: boolean };
    const targets: Target[] = [];
    const targetGeo = new THREE.BoxGeometry(1, 1, 1);
    function spawnTarget(t?: Target) {
      const m = t?.mesh ?? new THREE.Mesh(targetGeo, new THREE.MeshStandardMaterial());
      (m.material as THREE.MeshStandardMaterial).color.setHSL(Math.random(), 0.7, 0.55);
      const r = 6 + Math.random() * (ARENA / 2 - 9);
      const a = Math.random() * Math.PI * 2;
      m.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
      m.castShadow = true; m.receiveShadow = true;
      if (!t) { scene.add(m); targets.push({ mesh: m, alive: true }); }
      else { t.alive = true; m.visible = true; }
    }
    for (let i = 0; i < 8; i++) spawnTarget();

    // ---- projectiles ----
    type Bullet = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
    const bullets: Bullet[] = [];
    const bulletGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const bulletMat = new THREE.MeshStandardMaterial({
      color: 0xffe066, emissive: 0xffaa00, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4,
    });
    let scoreLocal = 0, cooldown = 0;
    function shoot() {
      if (cooldown > 0) return;
      cooldown = 0.1;    // ~10 rounds/sec — full auto while the fire key is held
      shootTimer = 0.42; // trigger shoot animation window
      // fire from the gun toward the cursor's world aim point (accurate in any camera POV)
      const muzzle = new THREE.Vector3().copy(rig.position).add(new THREE.Vector3(0, CHAR_HEIGHT * 0.6, 0));
      const aim = new THREE.Vector3().subVectors(aimPoint, muzzle);
      if (aim.lengthSq() < 1e-4) aim.set(Math.sin(heading), 0, Math.cos(heading));
      aim.normalize();
      const m = new THREE.Mesh(bulletGeo, bulletMat);
      m.castShadow = true;
      m.position.copy(muzzle).addScaledVector(aim, 0.7);
      scene.add(m);
      bullets.push({ mesh: m, vel: aim.clone().multiplyScalar(40), life: 2.5 });
      const flash = new THREE.PointLight(0xffcc66, 6, 6, 2);
      flash.position.copy(m.position);
      scene.add(flash);
      setTimeout(() => scene.remove(flash), 60);
    }

    // ---- enemies: the suit-clad rifleman (guy2.glb) hunts the player ----
    type Enemy = { obj: THREE.Object3D; alive: boolean; hp: number; cd: number };
    const enemies: Enemy[] = [];
    let enemyRaw: THREE.Object3D | null = null;
    let health = 100;
    let deathsLocal = 0;
    let invuln = 0;

    function makeEnemyMesh(): THREE.Object3D {
      const model = (enemyRaw as THREE.Object3D).clone(true);
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scl = ENEMY_HEIGHT / (size.y || 1);
      model.scale.setScalar(scl);
      model.position.x -= center.x * scl;
      model.position.z -= center.z * scl;
      model.position.y -= box.min.y * scl;
      const holder = new THREE.Group();
      holder.add(model);
      return holder;
    }
    function placeEnemy(e: Enemy) {
      const a = Math.random() * Math.PI * 2;
      const r = ARENA / 2 - 4;
      e.obj.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      e.obj.visible = true;
      e.alive = true; e.hp = ENEMY_HP; e.cd = 1.2 + Math.random() * 1.5;
    }
    function countEnemies() { setEnemyAlive(enemies.filter((e) => e.alive).length); }
    loadGLB("/models/guy2.glb")
      .then((m) => {
        enemyRaw = m;
        for (let i = 0; i < ENEMY_COUNT; i++) {
          const e: Enemy = { obj: makeEnemyMesh(), alive: false, hp: ENEMY_HP, cd: 0 };
          scene.add(e.obj);
          placeEnemy(e);
          enemies.push(e);
        }
        countEnemies();
      })
      .catch((e) => console.warn("enemy model failed to load", e));

    // enemy bullets (red)
    const eBullets: Bullet[] = [];
    const eBulletGeo = new THREE.SphereGeometry(0.14, 10, 10);
    const eBulletMat = new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff2200, emissiveIntensity: 1.7 });
    function enemyShoot(e: Enemy) {
      const from = e.obj.position.clone().add(new THREE.Vector3(0, ENEMY_HEIGHT * 0.62, 0));
      const target = rig.position.clone().add(new THREE.Vector3(0, CHAR_HEIGHT * 0.5, 0));
      const dir = target.sub(from).normalize();
      dir.x += (Math.random() - 0.5) * 0.07;
      dir.y += (Math.random() - 0.5) * 0.04;
      dir.z += (Math.random() - 0.5) * 0.07;
      dir.normalize();
      const m = new THREE.Mesh(eBulletGeo, eBulletMat);
      m.position.copy(from); m.castShadow = true; scene.add(m);
      eBullets.push({ mesh: m, vel: dir.multiplyScalar(28), life: 3 });
      const flash = new THREE.PointLight(0xff6633, 5, 5, 2);
      flash.position.copy(from); scene.add(flash);
      setTimeout(() => scene.remove(flash), 60);
    }
    function damagePlayer(d: number) {
      if (invuln > 0 || !startedRef.current) return;
      health = Math.max(0, health - d);
      setHealth(health);
      setHitFlash(true);
      setTimeout(() => setHitFlash(false), 140);
      if (health <= 0) {
        deathsLocal += 1; setDeaths(deathsLocal);
        if (deathsLocal >= PLAYER_LIVES) {
          // out of lives -> game over; agents go passive and you restart from Ready
          startedRef.current = false;
          gameOverRef.current = true;
          setGameOver(true);
        } else {
          rig.position.set(0, 0, 0); heading = 0;
          health = 100; setHealth(100);
          invuln = 1.6;
          for (const e of enemies) if (e.alive) placeEnemy(e); // scatter enemies on respawn
        }
      }
    }

    // ---- input ----
    const keys: Keys = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Slash", "KeyO", "KeyP"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyF" || e.code === "KeyE" || e.code === "KeyK") { keys["fire"] = true; shoot(); }       // F/E/K = shoot
      if (e.code === "KeyG" || e.code === "KeyR" || e.code === "KeyL" || e.code === "Slash") { if (grounded) { vy = JUMP_V; grounded = false; } }  // G/R/L/ / = jump
      if (e.code === "Space") { keys["fire"] = true; shoot(); }  // Space = shoot
      if (e.code === "KeyC") {       // C = cycle camera position
        camPreset = (camPreset + 1) % CAM_PRESETS.length;
        setCamName(CAM_PRESETS[camPreset].name);
      }
      if (e.code === "KeyZ" || e.code === "KeyI") {       // Z/I = cycle zoom in/out
        zoomIdx = (zoomIdx + 1) % ZOOM_LEVELS.length;
        setZoomLabel(ZOOM_LEVELS[zoomIdx].toFixed(1) + "×");
      }
      if (e.code === "KeyX") {       // X = toggle free-look (movement locks, aim stays free)
        freeLookOn = !freeLookOn;
        if (!freeLookOn) { heading = moveHeading; camPitch = 0; } // exit: view returns to movement dir
        setFreeLook(freeLookOn);
      }
      if (e.code === "Escape") apiRef.current?.togglePause();  // Esc = pause
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
      if (e.code === "KeyF" || e.code === "KeyE" || e.code === "KeyK" || e.code === "Space") keys["fire"] = false;
    };
    // aim is keyboard-driven (arrow keys) and shots fire toward the center crosshair, so the
    // mouse is optional — left-click is just an alternate trigger for Space.
    const canvasEl = renderer.domElement;
    const onMouseDown = (e: MouseEvent) => { if (e.button === 0) { keys["fire"] = true; shoot(); } };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) keys["fire"] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvasEl.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // ---- game flow (called from the React overlays / keys) ----
    const OBJECTIVES = [
      "🎯 NEW OBJECTIVE: Survive — the ops did NOT come to chat",
      "🎯 NEW OBJECTIVE: Don’t get bodied by men in suits",
      "🎯 NEW OBJECTIVE: Stay breathing. That’s it. That’s the mission.",
    ];
    function startFight() {
      if (startedRef.current) return;
      startedRef.current = true;
      setArmed(true);
      setObjective(OBJECTIVES[deathsLocal % OBJECTIVES.length]);
      setTimeout(() => setObjective(null), 4200);
    }
    function togglePause() {
      if (!startedRef.current || gameOverRef.current) return;
      pausedRef.current = !pausedRef.current;
      setPaused(pausedRef.current);
    }
    function restart() {
      scoreLocal = 0; setScore(0);
      deathsLocal = 0; setDeaths(0);
      health = 100; setHealth(100);
      rig.position.set(0, 0, 0);
      heading = 0; moveHeading = 0; camPitch = 0;
      vy = 0; grounded = true;
      freeLookOn = false; setFreeLook(false);
      for (const b of bullets) scene.remove(b.mesh); bullets.length = 0;
      for (const b of eBullets) scene.remove(b.mesh); eBullets.length = 0;
      for (const e of enemies) placeEnemy(e);
      countEnemies();
      startedRef.current = false;
      pausedRef.current = false; setPaused(false);
      gameOverRef.current = false; setGameOver(false);
      setArmed(false); // back to the passive Ready phase
    }
    apiRef.current = { start: startFight, togglePause, restart };

    // ---- loop ----
    const clock = new THREE.Clock();
    let frame = 0;
    const camPos = new THREE.Vector3(0, 4, -8);
    const tmp = new THREE.Vector3();
    const camRay = new THREE.Raycaster();
    const aimRay = new THREE.Raycaster();
    const aimNdc = new THREE.Vector2();
    const aimPoint = new THREE.Vector3(0, 1, 5); // world point under the cursor (updated each frame)

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (pausedRef.current) return; // frozen while paused (last frame stays on screen)
      cooldown = Math.max(0, cooldown - dt);
      shootTimer = Math.max(0, shootTimer - dt);

      // arrow keys are your aim: ←/→ swing your facing, ↑/↓ tilt the gun. you never move
      // from looking around. (O/P duplicate ←/→.) sensitivity slider scales the aim rate.
      const turn = TURN_SPEED * sensRef.current;
      const pitch = PITCH_SPEED * sensRef.current;
      if (keys["ArrowLeft"] || keys["KeyO"]) heading += turn * dt;
      if (keys["ArrowRight"] || keys["KeyP"]) heading -= turn * dt;
      if (keys["ArrowUp"]) camPitch = Math.min(AIM_PITCH_UP, camPitch + pitch * dt);
      if (keys["ArrowDown"]) camPitch = Math.max(-AIM_PITCH_DOWN, camPitch - pitch * dt);
      const viewYaw = heading; // camera, body, and shots all share your aim direction
      // movement follows the look direction, UNLESS free-looking (X) — then it stays locked
      if (!freeLookOn) moveHeading = heading;
      const fwd = new THREE.Vector3(Math.sin(moveHeading), 0, Math.cos(moveHeading));
      const strafeR = new THREE.Vector3(Math.cos(moveHeading), 0, -Math.sin(moveHeading)); // player's right
      let mF = 0, mS = 0;
      if (keys["KeyW"]) mF += 1;
      if (keys["KeyS"]) mF -= 1;
      if (keys["KeyD"]) mS += 1;  // strafe right
      if (keys["KeyA"]) mS -= 1;  // strafe left
      const moveVec = new THREE.Vector3().addScaledVector(fwd, mF).addScaledVector(strafeR, mS);
      if (moveVec.lengthSq() > 1e-6) {
        moveVec.normalize();
        rig.position.addScaledVector(moveVec, MOVE_SPEED * dt);
      }
      const lim = ARENA / 2 - 1.5;
      rig.position.x = THREE.MathUtils.clamp(rig.position.x, -lim, lim);
      rig.position.z = THREE.MathUtils.clamp(rig.position.z, -lim, lim);

      vy += GRAVITY * dt;
      rig.position.y += vy * dt;
      if (rig.position.y <= 0) { rig.position.y = 0; vy = 0; grounded = true; }
      rig.rotation.y = viewYaw;
      if (keys["fire"]) shoot();

      const moving = mF !== 0 || mS !== 0;
      if (moving) runPhase += dt * 9; else runPhase = 0;

      // ---- choose animation frame ----
      let key = "idle";
      if (!grounded) {
        // jump phases by vertical velocity
        key = vy > 3 ? ANIM.jump[0] : vy > -3 ? ANIM.jump[1] : ANIM.jump[2];
      } else if (shootTimer > 0) {
        const idx = Math.min(2, Math.floor((0.42 - shootTimer) / 0.42 * 3));
        key = ANIM.shoot[idx];
      } else if (moving) {
        key = ANIM.run[Math.floor(runPhase) % 3];
      }
      show(key);

      // bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.vel.y += GRAVITY * 0.25 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.life -= dt;
        let hit = false;
        for (const t of targets) {
          if (!t.alive) continue;
          if (b.mesh.position.distanceTo(t.mesh.position) < 0.85) {
            t.alive = false; t.mesh.visible = false; hit = true;
            scoreLocal += 1; setScore(scoreLocal);
            setTimeout(() => spawnTarget(t), 900);
            break;
          }
        }
        if (!hit) for (const e of enemies) {
          if (!e.alive) continue;
          const dx = b.mesh.position.x - e.obj.position.x;
          const dz = b.mesh.position.z - e.obj.position.z;
          if (dx * dx + dz * dz < 0.95 * 0.95 && b.mesh.position.y > 0.1 && b.mesh.position.y < ENEMY_HEIGHT + 0.1) {
            e.hp -= 1; hit = true;
            if (e.hp <= 0) {
              e.alive = false; e.obj.visible = false;
              scoreLocal += 5; setScore(scoreLocal);
              countEnemies();
              setTimeout(() => { placeEnemy(e); countEnemies(); }, 3500);
            }
            break;
          }
        }
        if (hit || b.life <= 0 || b.mesh.position.y < -1) { scene.remove(b.mesh); bullets.splice(i, 1); }
      }
      for (const t of targets) if (t.alive) t.mesh.rotation.y += dt * 1.2;

      // ---- enemies: advance toward the player into firing range, then shoot ----
      invuln = Math.max(0, invuln - dt);
      if (startedRef.current) for (const e of enemies) {
        if (!e.alive) continue;
        const dx = rig.position.x - e.obj.position.x;
        const dz = rig.position.z - e.obj.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        e.obj.rotation.y = Math.atan2(dx, dz); // gun-forward (+Z) faces the player
        if (dist > ENEMY_STANDOFF) {            // close the gap until in range
          e.obj.position.x += (dx / dist) * ENEMY_SPEED * dt;
          e.obj.position.z += (dz / dist) * ENEMY_SPEED * dt;
        }
        e.cd -= dt;
        if (e.cd <= 0 && dist < ENEMY_SIGHT) {
          e.cd = ENEMY_FIRE_CD * (0.8 + Math.random() * 0.5);
          enemyShoot(e);
        }
      }
      // enemy bullets — damage the player on contact
      for (let i = eBullets.length - 1; i >= 0; i--) {
        const b = eBullets[i];
        b.vel.y += GRAVITY * 0.15 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.life -= dt;
        const px = rig.position.x, py = rig.position.y + CHAR_HEIGHT * 0.5, pz = rig.position.z;
        const dd = (b.mesh.position.x - px) ** 2 + (b.mesh.position.y - py) ** 2 + (b.mesh.position.z - pz) ** 2;
        let hit = false;
        if (dd < 0.6 * 0.6) { damagePlayer(ENEMY_DMG); hit = true; }
        if (hit || b.life <= 0 || b.mesh.position.y < -1) { scene.remove(b.mesh); eBullets.splice(i, 1); }
      }

      // persist best score
      if (scoreLocal > bestRef.current) {
        bestRef.current = scoreLocal;
        setBest(scoreLocal);
        try { localStorage.setItem("bvto_best", String(scoreLocal)); } catch { /* ignore */ }
      }

      // camera: active preset (C) + zoom (Z/I) + mouse-look pitch, with wall collision.
      const preset = CAM_PRESETS[camPreset];
      const zoom = ZOOM_LEVELS[zoomIdx];
      const cpz = Math.cos(camPitch), spz = Math.sin(camPitch);
      // unit look direction (yaw + pitch) — camera and aim share this
      const lookDir = new THREE.Vector3(Math.sin(viewYaw) * cpz, spz, Math.cos(viewYaw) * cpz);
      const right = new THREE.Vector3(Math.cos(viewYaw), 0, -Math.sin(viewYaw));
      const pivot = tmp.copy(rig.position).add(new THREE.Vector3(0, CHAR_HEIGHT * 0.85, 0));
      if (preset.fp) {
        rig.visible = false;
        camPos.lerp(new THREE.Vector3().copy(pivot).addScaledVector(lookDir, 0.15), 1 - Math.pow(1e-6, dt));
        camera.position.copy(camPos);
        camera.lookAt(new THREE.Vector3().copy(camPos).addScaledVector(lookDir, 10));
      } else {
        rig.visible = true;
        const dist = preset.dist * zoom;
        // ideal camera offset: behind along -lookDir, plus shoulder
        const offset = new THREE.Vector3().copy(lookDir).multiplyScalar(-dist).addScaledVector(right, preset.shoulder);
        const len = offset.length();
        const dir = offset.clone().normalize();
        // wall collision: if a wall sits between the player and the ideal camera spot, pull in
        camRay.set(pivot, dir);
        camRay.far = len;
        const hits = camRay.intersectObjects(colliders, false);
        const camDist = hits.length ? Math.max(0.6, hits[0].distance - 0.3) : len;
        const desired = new THREE.Vector3().copy(pivot).addScaledVector(dir, camDist);
        if (desired.y < 0.4) desired.y = 0.4;
        // snap in fast when a wall forces us closer; otherwise glide
        const t = camDist < len - 0.05 ? 0.5 : 1 - Math.pow(0.0001, dt);
        camPos.lerp(desired, t);
        camera.position.copy(camPos);
        camera.lookAt(new THREE.Vector3().copy(pivot).addScaledVector(lookDir, preset.look));
      }

      // the screen-center crosshair is your aim/shoot target (enemies first, then ground)
      {
        camera.updateMatrixWorld();
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        aimNdc.set(0, 0); // dead-center: you aim where the camera/gun points
        aimRay.setFromCamera(aimNdc, camera);
        const objs: THREE.Object3D[] = [floor];
        for (const e of enemies) if (e.alive) objs.push(e.obj);
        const hits = aimRay.intersectObjects(objs, true);
        if (hits.length) aimPoint.copy(hits[0].point);
        else aimRay.ray.at(60, aimPoint);
      }

      // rear-view camera: mounted at the head, looking BEHIND the look direction
      const headPos = new THREE.Vector3().copy(rig.position).add(new THREE.Vector3(0, CHAR_HEIGHT * 0.92, 0));
      const backDir = new THREE.Vector3(-Math.sin(viewYaw), -0.12, -Math.cos(viewYaw)).normalize();
      pipCam.position.copy(headPos).addScaledVector(backDir, -0.15);
      pipCam.lookAt(new THREE.Vector3().copy(headPos).addScaledVector(backDir, 10));

      // ---- render: full-screen main view, then the rear-view PiP (bottom-left) ----
      const VW = mount.clientWidth, VH = mount.clientHeight;
      renderer.clear();
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, VW, VH);
      renderer.render(scene, camera);

      renderer.setScissorTest(true);
      renderer.setViewport(PIP_M, PIP_M, PIP_W, PIP_H);
      renderer.setScissor(PIP_M, PIP_M, PIP_W, PIP_H);
      renderer.clear();
      renderer.render(scene, pipCam);
      renderer.setScissorTest(false);
    };
    animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvasEl.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [src]);

  return (
    <div ref={mountRef} className="absolute inset-0 cursor-crosshair">
      {status === "ready" && (
        <>
          {/* damage flash */}
          {hitFlash && <div className="pointer-events-none absolute inset-0 bg-red-600/30" />}

          {/* center crosshair — you fire toward this; aim it with the arrow keys */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative h-5 w-5">
              <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-white/80" />
              <div className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-white/80" />
              <div className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-white/80" />
              <div className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-white/80" />
              <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-400" />
            </div>
          </div>

          {/* passive phase — explore freely; a small Start control sits on the left */}
          {!armed && !gameOver && (
            <button
              onClick={() => apiRef.current?.start()}
              className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg bg-rose-600/95 px-6 py-2 text-base font-bold text-white shadow-lg shadow-rose-900/40 ring-1 ring-rose-300/50 transition hover:scale-[1.03] hover:bg-rose-500"
            >
              ▶ Start Fight
            </button>
          )}

          {/* objective toast */}
          {objective && (
            <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-md bg-black/70 px-5 py-2 text-center shadow-lg">
              <div className="text-sm font-bold text-amber-300">{objective}</div>
            </div>
          )}

          {/* pause overlay */}
          {paused && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 text-center backdrop-blur-sm">
              <h2 className="text-4xl font-black tracking-tight text-white drop-shadow">PAUSED</h2>
              <button
                onClick={() => apiRef.current?.togglePause()}
                className="mt-5 rounded-full bg-rose-600 px-9 py-2.5 text-base font-bold text-white transition hover:scale-105 hover:bg-rose-500"
              >
                Resume
              </button>
              <p className="mt-3 text-xs text-zinc-400">press Esc to resume</p>
            </div>
          )}

          {/* game over overlay */}
          {gameOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 text-center backdrop-blur-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400">You got bodied</div>
              <h2 className="mt-1 text-5xl font-black tracking-tight text-white drop-shadow">GAME OVER</h2>
              <p className="mt-3 text-sm font-medium text-zinc-200">
                Score <span className="font-bold text-amber-300">{score}</span> · Best{" "}
                <span className="font-bold text-amber-300">{best}</span>
              </p>
              <button
                onClick={() => apiRef.current?.restart()}
                className="mt-6 rounded-full bg-rose-600 px-10 py-3 text-lg font-bold text-white shadow-lg shadow-rose-900/40 transition hover:scale-105 hover:bg-rose-500"
              >
                ↻ Play Again
              </button>
            </div>
          )}

          {/* aim-speed slider — scales how fast the arrow keys swing/tilt your aim */}
          <div className="pointer-events-auto absolute left-4 top-16 w-44 select-none rounded-md bg-black/55 px-3 py-2">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-300">
              <span>Aim speed</span><span className="tabular-nums">{sens.toFixed(2)}×</span>
            </div>
            <input
              type="range" min={0.25} max={3} step={0.05} value={sens}
              onChange={(e) => { const v = parseFloat(e.target.value); setSens(v); sensRef.current = v; }}
              className="mt-1 w-full accent-emerald-400"
            />
          </div>

          <div className="pointer-events-none absolute right-4 top-4 rounded-md bg-black/60 px-3 py-1.5 text-right">
            <div className="text-2xl font-bold tabular-nums text-amber-300 drop-shadow">{score}</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-400">score · best {best}</div>
            <div className="mt-1 text-[10px] text-rose-300">🔫 enemies: {enemyAlive} · ☠ lives: {Math.max(0, PLAYER_LIVES - deaths)}/{PLAYER_LIVES}</div>
            <div className="text-[10px] text-zinc-400">📷 {camName} · {zoomLabel}</div>
            <div className="text-[10px] text-zinc-500">{loadedFrames}/9 anim frames</div>
          </div>

          {/* health bar (top-left, under the sensitivity slider) */}
          <div className="pointer-events-none absolute left-4 top-32 w-44">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-300">
              <span>Health</span><span className="tabular-nums">{health}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{ width: `${health}%`, background: health > 50 ? "#34d399" : health > 25 ? "#fbbf24" : "#ef4444" }}
              />
            </div>
          </div>

          {/* rear-view PiP frame + label (the live view is rendered into the canvas behind this) */}
          <div
            className={`pointer-events-none absolute bottom-4 left-4 overflow-hidden rounded-md shadow-lg ring-1 ${freeLook ? "ring-amber-400/80" : "ring-white/25"}`}
            style={{ width: PIP_W, height: PIP_H }}
          >
            <div className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-zinc-200">
              rear view
            </div>
          </div>

          {/* free-look badge */}
          {freeLook && (
            <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold text-black shadow">
              🔄 FREE-LOOK — movement locked, aim free (X to exit)
            </div>
          )}

          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-4 py-2 text-center text-xs text-zinc-200">
            <span className="font-semibold text-white">W/A/S/D</span> move ·{" "}
            <span className="font-semibold text-white">←/→</span> aim turn ·{" "}
            <span className="font-semibold text-white">↑/↓</span> aim up/down ·{" "}
            <span className="font-semibold text-white">Space</span> shoot ·{" "}
            <span className="font-semibold text-white">L</span> jump ·{" "}
            <span className="font-semibold text-white">C</span> cam ·{" "}
            <span className="font-semibold text-white">I</span> zoom ·{" "}
            <span className="font-semibold text-white">Esc</span> pause
          </div>
        </>
      )}
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-black/60 px-3 py-1.5 text-sm text-zinc-200">
            {status === "loading" ? "Loading game…" : `Failed to load: ${error}`}
          </span>
        </div>
      )}
    </div>
  );
}

function makeGridTexture(): THREE.Texture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6b7280"; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 4; ctx.strokeRect(0, 0, s, s);
  ctx.strokeStyle = "#525a66"; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((s / 4) * i, 0); ctx.lineTo((s / 4) * i, s);
    ctx.moveTo(0, (s / 4) * i); ctx.lineTo(s, (s / 4) * i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
