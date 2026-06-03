"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export default function ModelViewer({ src = "/models/brian.glb", autoRotate = false, faceAway = false }: { src?: string; autoRotate?: boolean; faceAway?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15171c);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    // image-based lighting so the PBR baseColor texture reads nicely
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 100);
    camera.position.set(0, 1, 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.7;

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    // ground that only receives shadow
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.ShadowMaterial({ opacity: 0.35 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let frame = 0;
    let disposed = false;

    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });

        // center on origin and drop onto the ground
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        scene.add(model);

        // frame the camera to the model
        const height = size.y;
        const radius = Math.max(size.x, size.z, height) * 0.5;
        const dist = radius / Math.tan((camera.fov * Math.PI) / 360) + radius;
        controls.target.set(0, height * 0.5, 0);
        // faceAway: view from behind so his back is to the camera (suspense)
        const s = faceAway ? -1 : 1;
        camera.position.set(dist * 0.5 * s, height * 0.65, dist * 1.1 * s);
        camera.near = dist / 100;
        camera.far = dist * 100;
        camera.updateProjectionMatrix();
        controls.update();

        setStatus("ready");
      },
      undefined,
      (err) => {
        console.error("GLB load error:", err);
        setError(String((err as ErrorEvent)?.message || err));
        setStatus("error");
      }
    );

    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [src, autoRotate, faceAway]);

  return (
    <div ref={mountRef} className="absolute inset-0">
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-black/60 px-3 py-1.5 text-sm text-zinc-200">
            {status === "loading" ? "Loading model…" : `Failed to load model: ${error}`}
          </span>
        </div>
      )}
    </div>
  );
}
