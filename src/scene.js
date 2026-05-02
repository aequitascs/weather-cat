import * as THREE from "three";

export function createWeatherScene(canvas, { offSphereColour, glowFadeDurationMs }) {
  let glowTransition = null;
  const renderedGlowState = {
    color: new THREE.Color(offSphereColour),
    emissiveIntensity: 0,
    lightIntensity: 0,
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050609, 0.055);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.08, 5.8);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;

  const group = new THREE.Group();
  scene.add(group);

  const sphereGeometry = new THREE.SphereGeometry(1.35, 96, 96);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: offSphereColour,
    emissive: offSphereColour,
    emissiveIntensity: 0,
    metalness: 0.08,
    roughness: 0.28,
  });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.y = 0.79;
  group.add(sphere);

  const standMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf7f8f5,
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.92,
    clearcoatRoughness: 0.14,
  });

  const concaveStandMaterial = standMaterial.clone();
  concaveStandMaterial.side = THREE.BackSide;

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.92, 0.5, 128, 1, true), standMaterial);
  pedestal.position.y = -0.62;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  const pedestalBase = new THREE.Mesh(new THREE.CircleGeometry(0.92, 128), standMaterial);
  pedestalBase.rotation.x = -Math.PI / 2;
  pedestalBase.position.y = -0.87;
  pedestalBase.castShadow = true;
  pedestalBase.receiveShadow = true;
  group.add(pedestalBase);

  const pedestalBowl = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 128, 24, 0, Math.PI * 2, Math.PI - 0.53, 0.53),
    concaveStandMaterial,
  );
  pedestalBowl.position.y = 0.79;
  pedestalBowl.castShadow = true;
  pedestalBowl.receiveShadow = true;
  group.add(pedestalBowl);

  const coreLight = new THREE.PointLight(offSphereColour, 0, 9, 1.8);
  coreLight.position.set(0, 0.79, 0.6);
  scene.add(coreLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(-3, 4, 5);
  scene.add(keyLight);

  const fillLight = new THREE.AmbientLight(0x516070, 0.46);
  scene.add(fillLight);

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 700;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 14 + Math.random() * 24;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = radius * Math.cos(phi);
  }
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xe8f6ff,
      size: 0.035,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  function startGlowTransition(targetState) {
    glowTransition = {
      startedAt: performance.now(),
      duration: glowFadeDurationMs,
      from: {
        color: renderedGlowState.color.clone(),
        emissiveIntensity: renderedGlowState.emissiveIntensity,
        lightIntensity: renderedGlowState.lightIntensity,
      },
      to: {
        color: targetState.color.clone(),
        emissiveIntensity: targetState.emissiveIntensity,
        lightIntensity: targetState.lightIntensity,
      },
    };
  }

  function updateGlowTransition(time) {
    if (!glowTransition) {
      return;
    }

    const progress = THREE.MathUtils.clamp(
      (time - glowTransition.startedAt) / glowTransition.duration,
      0,
      1,
    );
    const easedProgress = progress * progress * (3 - 2 * progress);
    const color = new THREE.Color().lerpColors(
      glowTransition.from.color,
      glowTransition.to.color,
      easedProgress,
    );

    applyGlowState({
      color,
      emissiveIntensity: THREE.MathUtils.lerp(
        glowTransition.from.emissiveIntensity,
        glowTransition.to.emissiveIntensity,
        easedProgress,
      ),
      lightIntensity: THREE.MathUtils.lerp(
        glowTransition.from.lightIntensity,
        glowTransition.to.lightIntensity,
        easedProgress,
      ),
    });

    if (progress === 1) {
      glowTransition = null;
    }
  }

  function applyGlowState(glowState) {
    renderedGlowState.color.copy(glowState.color);
    renderedGlowState.emissiveIntensity = glowState.emissiveIntensity;
    renderedGlowState.lightIntensity = glowState.lightIntensity;

    sphereMaterial.color.copy(glowState.color);
    sphereMaterial.emissive.copy(glowState.color);
    sphereMaterial.emissiveIntensity = glowState.emissiveIntensity;
    coreLight.color.copy(glowState.color);
    coreLight.intensity = glowState.lightIntensity;
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function animate(time = 0) {
    const seconds = time * 0.001;
    group.rotation.y = seconds * 0.24;
    group.rotation.x = Math.sin(seconds * 0.45) * 0.06;
    stars.rotation.y = seconds * 0.015;
    stars.rotation.x = seconds * 0.006;
    updateGlowTransition(time);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function getRenderedHex() {
    return `#${renderedGlowState.color.getHexString()}`;
  }

  function clearGlowTransition() {
    glowTransition = null;
  }

  return {
    animate,
    applyGlowState,
    clearGlowTransition,
    getRenderedHex,
    resize,
    startGlowTransition,
  };
}
