"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Avatar3DProps {
  isSpeaking: boolean;
  tone?: "warm" | "neutral" | "skeptical";
  className?: string;
}

export function Avatar3D({ isSpeaking, tone = "neutral", className = "" }: Avatar3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const isSpeakingRef = useRef(isSpeaking);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 3.2);

    // 2. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(2, 3, 3);
    scene.add(keyLight);

    // Tone-based accent rim light
    const rimColor = tone === "warm" ? 0xf59e0b : tone === "skeptical" ? 0x8b5cf6 : 0x3b82f6;
    const rimLight = new THREE.DirectionalLight(rimColor, 1.8);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    // 4. Avatar Group & Meshes
    const avatarGroup = new THREE.Group();
    scene.add(avatarGroup);

    // Head Material (warm matte finish)
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8cfb8,
      roughness: 0.5,
      metalness: 0.05,
    });

    // Suit/Clothing Material
    const suitMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
    });

    const hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d251e,
      roughness: 0.6,
    });

    // Head
    const headGeo = new THREE.SphereGeometry(0.55, 32, 32);
    headGeo.scale(1, 1.15, 1);
    const head = new THREE.Mesh(headGeo, skinMaterial);
    head.position.y = 0.45;
    avatarGroup.add(head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.58, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairGeo.scale(1.02, 1.16, 1.02);
    const hair = new THREE.Mesh(hairGeo, hairMaterial);
    hair.position.set(0, 0.52, -0.02);
    avatarGroup.add(hair);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.07, 16, 16);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.035, 16, 16);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x18181b });

    const leftEye = new THREE.Group();
    const rightEye = new THREE.Group();

    const leftEyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    const rightEyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    leftEyeWhite.scale.set(1, 0.85, 0.4);
    rightEyeWhite.scale.set(1, 0.85, 0.4);

    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.z = 0.04;
    rightPupil.position.z = 0.04;

    leftEye.add(leftEyeWhite, leftPupil);
    rightEye.add(rightEyeWhite, rightPupil);

    leftEye.position.set(-0.2, 0.55, 0.5);
    rightEye.position.set(0.2, 0.55, 0.5);
    avatarGroup.add(leftEye, rightEye);

    // Glasses / Eyebrows for professional executive presence
    const browGeo = new THREE.BoxGeometry(0.18, 0.025, 0.02);
    const browMat = new THREE.MeshBasicMaterial({ color: 0x27272a });
    const leftBrow = new THREE.Mesh(browGeo, browMat);
    const rightBrow = new THREE.Mesh(browGeo, browMat);
    leftBrow.position.set(-0.2, 0.65, 0.52);
    rightBrow.position.set(0.2, 0.65, 0.52);
    leftBrow.rotation.z = tone === "skeptical" ? 0.15 : 0.02;
    rightBrow.rotation.z = tone === "skeptical" ? -0.1 : -0.02;
    avatarGroup.add(leftBrow, rightBrow);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.06, 0.18, 16);
    const nose = new THREE.Mesh(noseGeo, skinMaterial);
    nose.position.set(0, 0.45, 0.56);
    nose.rotation.x = -Math.PI * 0.08;
    avatarGroup.add(nose);

    // Mouth / Jaw (reactive to speech)
    const mouthGeo = new THREE.BoxGeometry(0.16, 0.03, 0.04);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x883838 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 0.28, 0.52);
    avatarGroup.add(mouth);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 24);
    const neck = new THREE.Mesh(neckGeo, skinMaterial);
    neck.position.y = -0.05;
    avatarGroup.add(neck);

    // Torso / Shoulders
    const torsoGeo = new THREE.CylinderGeometry(0.5, 0.75, 0.8, 32);
    torsoGeo.scale(1.4, 1, 0.75);
    const torso = new THREE.Mesh(torsoGeo, suitMaterial);
    torso.position.y = -0.55;
    avatarGroup.add(torso);

    // Collar / Tie
    const collarGeo = new THREE.ConeGeometry(0.25, 0.3, 3);
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.position.set(0, -0.15, 0.35);
    collar.rotation.z = Math.PI;
    avatarGroup.add(collar);

    // 5. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();
    let blinkTimer = 0;
    let isBlinking = false;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Subtle breathing motion
      avatarGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.02;

      // Natural subtle head roaming
      head.rotation.y = Math.sin(elapsedTime * 0.7) * 0.06;
      head.rotation.x = Math.sin(elapsedTime * 0.5) * 0.03;

      // Blinking mechanism (every ~3.5 seconds for 150ms)
      blinkTimer += 0.016;
      if (blinkTimer > 3.5 && !isBlinking) {
        isBlinking = true;
        leftEye.scale.y = 0.1;
        rightEye.scale.y = 0.1;
      }
      if (blinkTimer > 3.65 && isBlinking) {
        isBlinking = false;
        blinkTimer = Math.random() * 0.8; // randomize next blink interval
        leftEye.scale.y = 1;
        rightEye.scale.y = 1;
      }

      // Mouth Movement when speaking
      if (isSpeakingRef.current) {
        // Multi-frequency oscillation simulating speech phonemes
        const speakFactor =
          Math.abs(Math.sin(elapsedTime * 14)) * 0.6 +
          Math.abs(Math.sin(elapsedTime * 22)) * 0.4;

        mouth.scale.y = 1 + speakFactor * 3.2;
        mouth.scale.x = 1 + speakFactor * 0.3;
        mouth.position.y = 0.28 - speakFactor * 0.02;

        // Subtle head nod on speech emphasis
        head.rotation.x = Math.sin(elapsedTime * 6) * 0.04;
      } else {
        mouth.scale.y = 1;
        mouth.scale.x = 1;
        mouth.position.y = 0.28;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 6. Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    // 7. Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      headGeo.dispose();
      hairGeo.dispose();
      eyeGeo.dispose();
      pupilGeo.dispose();
      mouthGeo.dispose();
      torsoGeo.dispose();
      neckGeo.dispose();
      skinMaterial.dispose();
      suitMaterial.dispose();
      hairMaterial.dispose();
      eyeWhiteMat.dispose();
      pupilMat.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [tone]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div ref={mountRef} className="h-full w-full" />
      {/* Active speaking indicator glow */}
      {isSpeaking && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-blue-500/50 ring-offset-2 ring-offset-zinc-950 transition-all duration-300" />
      )}
    </div>
  );
}
