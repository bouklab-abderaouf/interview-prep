"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Avatar3DProps {
  isSpeaking: boolean;
  tone?: "warm" | "neutral" | "skeptical";
  /** Live output loudness (0–1) of the interviewer's voice. Drives the mouth,
   * so it moves with what's actually being said rather than on a loop. */
  getLevel?: () => number;
  /** Stable per-persona string (e.g. its name). Picks the look, so the same
   * interviewer always looks the same. Deliberately not used to guess a
   * gender or anything else about the persona — only as a random seed. */
  seed?: string;
  className?: string;
}

const TONE_RIM: Record<NonNullable<Avatar3DProps["tone"]>, number> = {
  warm: 0xf59e0b,
  neutral: 0x3b82f6,
  skeptical: 0x8b5cf6,
};

const SKIN = [0xf1d3bd, 0xe3bc9c, 0xc99470, 0x9c6748, 0x6f4632];
const HAIR = [0x2b2118, 0x4a3222, 0x7b5234, 0x161616, 0xa8998a];
const SUIT = [0x1e293b, 0x2a2f3a, 0x3a2f2c, 0x1f3533, 0x33304a];
const IRIS = [0x4a3526, 0x2f5d7c, 0x3f6b3a, 0x5a4632];

// Head ellipsoid radii. Features are placed on its surface with surfaceZ(),
// which is what keeps eyes and mouth from sinking into the face or floating
// in front of it — the old avatar's hair cap sat in front of its own eyes.
const HEAD = { rx: 0.46, ry: 0.56, rz: 0.5 };
function surfaceZ(x: number, y: number): number {
  const v = 1 - (x / HEAD.rx) ** 2 - (y / HEAD.ry) ** 2;
  return HEAD.rz * Math.sqrt(Math.max(0, v));
}

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function Avatar3D({ isSpeaking, tone = "neutral", getLevel, seed = "interviewer", className = "" }: Avatar3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const isSpeakingRef = useRef(isSpeaking);
  const getLevelRef = useRef(getLevel);
  const toneRef = useRef(tone);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    getLevelRef.current = getLevel;
    toneRef.current = tone;
  }, [isSpeaking, getLevel, tone]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const random = seededRandom(seed);
    const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
    const look = {
      skin: pick(SKIN),
      hair: pick(HAIR),
      suit: pick(SUIT),
      iris: pick(IRIS),
      longHair: random() < 0.45,
      glasses: random() < 0.3,
      tie: random() < 0.5,
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = reducedMotion ? 0.3 : 1;

    // ── Scene ──────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0.62, 3.6);
    camera.lookAt(0, 0.56, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a35, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-2, 1, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(TONE_RIM[toneRef.current], 2.4);
    rim.position.set(-2.5, 2, -2.5);
    scene.add(rim);
    let rimTone = toneRef.current;

    const mat = (color: number, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
    const skin = mat(look.skin, 0.55);
    const hair = mat(look.hair, 0.75);
    const suit = mat(look.suit, 0.85);
    const shirt = mat(0xf3f4f6, 0.7);
    const dark = mat(0x1a1010, 0.9);
    const lip = mat(new THREE.Color(look.skin).multiplyScalar(0.72).getHex(), 0.5);
    const white = mat(0xf8f8f6, 0.3);
    const iris = mat(look.iris, 0.3);
    const black = mat(0x0a0a0a, 0.2);
    const brow = mat(new THREE.Color(look.hair).multiplyScalar(0.8).getHex(), 0.9);

    const sphere = (r: number, material: THREE.Material, w = 32, h = 24) =>
      new THREE.Mesh(new THREE.SphereGeometry(r, w, h), material);

    const avatar = new THREE.Group();
    scene.add(avatar);

    // ── Body ───────────────────────────────────────────────────
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.5, 8, 32), suit);
    torso.scale.set(1.55, 1, 0.62);
    torso.position.y = -0.45;
    avatar.add(torso);

    const shirtV = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 3), shirt);
    shirtV.rotation.set(0, Math.PI / 3, Math.PI);
    shirtV.position.set(0, 0.1, 0.27);
    shirtV.scale.z = 0.4;
    avatar.add(shirtV);

    if (look.tie) {
      const tie = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), mat(0x7f1d1d, 0.6));
      tie.position.set(0, 0.02, 0.305);
      tie.scale.z = 0.4;
      avatar.add(tie);
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.42, 24), skin);
    neck.position.y = 0.3;
    avatar.add(neck);

    // ── Head ───────────────────────────────────────────────────
    const head = new THREE.Group();
    head.position.y = 0.78;
    avatar.add(head);

    const skull = sphere(1, skin, 48, 32);
    skull.scale.set(HEAD.rx, HEAD.ry, HEAD.rz);
    head.add(skull);

    // Rounds the jaw from inside the skull; only its lower edge shows.
    const chin = sphere(0.2, skin);
    chin.scale.set(1.1, 0.75, 0.8);
    chin.position.set(0, -0.4, 0.15);
    head.add(chin);

    for (const side of [-1, 1]) {
      const ear = sphere(0.09, skin, 16, 12);
      ear.scale.set(0.45, 1, 0.7);
      ear.position.set(side * HEAD.rx, 0, 0.02);
      head.add(ear);
    }

    // Hair: a cap over the top whose front edge is the hairline, above the
    // brows, plus a shell that comes down the sides and back with an opening
    // cut out for the face. Sphere slices hugging the skull, so nothing hangs
    // in front of the eyes — the old avatar's hair did exactly that.
    const hairScale = new THREE.Vector3(HEAD.rx + 0.03, HEAD.ry + 0.03, HEAD.rz + 0.03);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.3), hair);
    cap.scale.copy(hairScale);
    head.add(cap);
    // phi = π/2 faces the camera; leave ±0.95 rad around it open for the face.
    const faceOpening = 0.95;
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        48,
        24,
        Math.PI / 2 + faceOpening,
        Math.PI * 2 - faceOpening * 2,
        0,
        Math.PI * (look.longHair ? 0.72 : 0.56),
      ),
      hair,
    );
    shell.scale.copy(hairScale);
    head.add(shell);
    if (look.longHair) {
      const fall = sphere(0.5, hair);
      fall.scale.set(1.02, 1.05, 0.5);
      fall.position.set(0, -0.3, -0.22);
      head.add(fall);
    }

    // Eyes: white, iris, pupil and a catchlight, each in a group so blinking
    // is one scale and gaze moves iris+pupil together.
    const irises: THREE.Group[] = [];
    const eyes: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const x = side * 0.165;
      const y = 0.05;
      const eye = new THREE.Group();
      eye.position.set(x, y, surfaceZ(x, y) - 0.02);
      head.add(eye);
      eyes.push(eye);

      const ball = sphere(0.062, white, 24, 16);
      ball.scale.set(1, 0.72, 0.55);
      eye.add(ball);

      const irisGroup = new THREE.Group();
      irisGroup.position.z = 0.03;
      eye.add(irisGroup);
      irises.push(irisGroup);
      const irisMesh = sphere(0.032, iris, 20, 12);
      irisMesh.scale.z = 0.3;
      irisGroup.add(irisMesh);
      const pupil = sphere(0.015, black, 12, 8);
      pupil.position.z = 0.008;
      irisGroup.add(pupil);
      const glint = sphere(0.006, white, 8, 6);
      glint.position.set(0.01, 0.01, 0.012);
      irisGroup.add(glint);
    }

    const brows: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.1, 4, 8), brow);
      const x = side * 0.17;
      b.position.set(x, 0.165, surfaceZ(x, 0.165) + 0.004);
      b.rotation.z = Math.PI / 2 + side * 0.08;
      b.scale.z = 0.5;
      head.add(b);
      brows.push(b);
    }
    const browRestY = 0.165;

    if (look.glasses) {
      const frame = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.3 });
      for (const side of [-1, 1]) {
        const x = side * 0.165;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 8, 32), frame);
        ring.scale.set(1.1, 0.8, 1);
        ring.position.set(x, 0.05, surfaceZ(x, 0.05) + 0.045);
        head.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.08, 4, 8), frame);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 0.07, surfaceZ(0, 0.07) + 0.04);
      head.add(bridge);
    }

    const nose = sphere(0.055, skin, 20, 16);
    nose.scale.set(0.75, 1.25, 0.9);
    nose.position.set(0, -0.06, surfaceZ(0, -0.06) - 0.005);
    head.add(nose);

    // Mouth: a dark opening between two lips; the opening and lower lip move
    // with the voice level.
    const mouthY = -0.21;
    const mouthZ = surfaceZ(0, mouthY);
    const opening = sphere(0.065, dark, 24, 12);
    opening.position.set(0, mouthY, mouthZ - 0.02);
    opening.scale.set(1, 0.1, 0.35);
    head.add(opening);
    const upperLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.1, 4, 12), lip);
    upperLip.rotation.z = Math.PI / 2;
    upperLip.scale.z = 0.6;
    upperLip.position.set(0, mouthY + 0.012, mouthZ - 0.004);
    head.add(upperLip);
    const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.09, 4, 12), lip);
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.scale.z = 0.6;
    lowerLip.position.set(0, mouthY - 0.014, mouthZ - 0.006);
    head.add(lowerLip);
    const lowerLipRestY = lowerLip.position.y;
    const chinRestY = chin.position.y;

    // ── Size to the tile, not the window ───────────────────────
    // The tile changes size without any window resize — captions toggling,
    // the camera tile appearing — so a window listener left the canvas stale.
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // Keep the shoulders in frame on narrow (portrait/mobile) tiles.
      camera.position.z = w / h < 0.9 ? 3.6 * (0.9 / (w / h)) ** 0.6 : 3.6;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // ── Animation ──────────────────────────────────────────────
    const clock = new THREE.Clock();
    let frame = 0;
    let mouthOpen = 0;
    let energy = 0;
    let nextBlink = 1.5 + random() * 3;
    let blinkUntil = -1;
    let nextSaccade = 0.8;
    const gaze = new THREE.Vector2();
    const gazeTarget = new THREE.Vector2();

    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.elapsedTime;

      if (toneRef.current !== rimTone) {
        rimTone = toneRef.current;
        rim.color.setHex(TONE_RIM[rimTone]);
      }

      // Voice level → mouth. Speech RMS sits around 0.03–0.2; the fast attack
      // and slower release read as syllables rather than flapping.
      const measured = getLevelRef.current?.();
      const level =
        measured !== undefined
          ? measured
          : isSpeakingRef.current
            ? 0.06 + 0.05 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 4.3))
            : 0;
      const target = Math.min(1, Math.max(0, (level - 0.012) * 7));
      mouthOpen += (target - mouthOpen) * (target > mouthOpen ? 0.55 : 0.22);
      energy += ((isSpeakingRef.current ? 1 : 0) * Math.min(1, level * 8) - energy) * 0.05;

      opening.scale.y = 0.1 + mouthOpen * 0.75;
      opening.position.y = mouthY - mouthOpen * 0.02;
      lowerLip.position.y = lowerLipRestY - mouthOpen * 0.045;
      chin.position.y = chinRestY - mouthOpen * 0.02;

      // Idle life: breathing, a slow head drift, and small nods while talking.
      avatar.position.y = Math.sin(t * 1.6) * 0.006 * motion;
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.006 * motion;
      head.rotation.y = (Math.sin(t * 0.45) * 0.06 + gaze.x * 1.5) * motion;
      head.rotation.x = (Math.sin(t * 0.37) * 0.025 - energy * 0.04 * Math.max(0, Math.sin(t * 3.1))) * motion;
      head.rotation.z = Math.sin(t * 0.29) * 0.02 * motion;

      for (const b of brows) b.position.y = browRestY + energy * mouthOpen * 0.02;

      // Blinks at irregular intervals, now and then a double blink.
      if (t >= nextBlink) {
        blinkUntil = t + 0.12;
        nextBlink = t + (random() < 0.15 ? 0.25 : 2.2 + random() * 3.5);
      }
      const lid = t < blinkUntil ? 0.08 : 1;
      for (const eye of eyes) eye.scale.y += (lid - eye.scale.y) * 0.6;

      // Saccades: small, quick gaze shifts that mostly return to the camera.
      if (t >= nextSaccade) {
        const away = random() < 0.35;
        gazeTarget.set(away ? (random() - 0.5) * 0.024 : 0, away ? (random() - 0.5) * 0.012 : 0);
        nextSaccade = t + 0.6 + random() * 2.2;
      }
      gaze.lerp(gazeTarget, 1 - Math.pow(0.001, dt));
      for (const irisGroup of irises) irisGroup.position.set(gaze.x, gaze.y, 0.03);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          materials.add(object.material as THREE.Material);
        }
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [seed]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />
      {isSpeaking && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-blue-500/50 ring-offset-2 ring-offset-zinc-950 transition-all duration-300" />
      )}
    </div>
  );
}
