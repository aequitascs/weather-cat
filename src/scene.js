import * as THREE from "three";

export function createWeatherScene(canvas, { offSphereColour, glowFadeDurationMs }) {
  let glowTransition = null;
  let animationFrameId = null;
  const renderedGlowState = {
    color: new THREE.Color(offSphereColour),
    emissiveIntensity: 0,
    lightIntensity: 0,
  };
  const glowStateTolerance = 0.0001;

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

  function startGlowTransition(targetState) {
    if (glowStatesMatch(renderedGlowState, targetState)) {
      clearGlowTransition();
      applyGlowState(targetState);
      return;
    }

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
    requestTransitionFrame();
  }

  function requestTransitionFrame() {
    if (animationFrameId !== null) {
      return;
    }

    animationFrameId = requestAnimationFrame(renderTransitionFrame);
  }

  function renderTransitionFrame(time) {
    animationFrameId = null;
    updateGlowTransition(time);

    if (glowTransition) {
      requestTransitionFrame();
    }
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
    render();
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    render();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function getRenderedHex() {
    return `#${renderedGlowState.color.getHexString()}`;
  }

  function clearGlowTransition() {
    glowTransition = null;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function glowStatesMatch(firstState, secondState) {
    return (
      firstState.color.distanceTo(secondState.color) <= glowStateTolerance &&
      Math.abs(firstState.emissiveIntensity - secondState.emissiveIntensity) <= glowStateTolerance &&
      Math.abs(firstState.lightIntensity - secondState.lightIntensity) <= glowStateTolerance
    );
  }

  return {
    applyGlowState,
    clearGlowTransition,
    getRenderedHex,
    render,
    resize,
    startGlowTransition,
  };
}
