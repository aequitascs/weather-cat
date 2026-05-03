import * as THREE from "three";

export function createWeatherScene(canvas, { offSphereColour, glowFadeDurationMs }) {
  let glowTransition = null;
  let animationFrameId = null;
  const renderedGlowState = {
    color: new THREE.Color(offSphereColour),
    emissiveIntensity: 0,
    lightIntensity: 0,
  };
  const glowColorTolerance = 0.01;
  const glowIntensityTolerance = 0.05;

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

  const tableTexture = createOakTexture();
  tableTexture.colorSpace = THREE.SRGBColorSpace;
  tableTexture.wrapS = THREE.RepeatWrapping;
  tableTexture.wrapT = THREE.RepeatWrapping;
  tableTexture.repeat.set(2, 1);

  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tableTexture,
    roughness: 0.72,
    metalness: 0,
  });
  const tableTop = new THREE.Mesh(
    new THREE.CylinderGeometry(8.5, 8.5, 0.18, 160),
    tableMaterial,
  );
  tableTop.position.y = -1;
  group.add(tableTop);

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
      startedAt: null,
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

    if (glowTransition.startedAt === null) {
      glowTransition.startedAt = time;
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
    }, { render: false });

    if (progress === 1) {
      glowTransition = null;
    }

    render();
  }

  function applyGlowState(glowState, { render: shouldRender = true } = {}) {
    renderedGlowState.color.copy(glowState.color);
    renderedGlowState.emissiveIntensity = glowState.emissiveIntensity;
    renderedGlowState.lightIntensity = glowState.lightIntensity;

    sphereMaterial.color.copy(glowState.color);
    sphereMaterial.emissive.copy(glowState.color);
    sphereMaterial.emissiveIntensity = glowState.emissiveIntensity;
    coreLight.color.copy(glowState.color);
    coreLight.intensity = glowState.lightIntensity;

    if (shouldRender) {
      render();
    }
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
      getColorDistance(firstState.color, secondState.color) <= glowColorTolerance &&
      Math.abs(firstState.emissiveIntensity - secondState.emissiveIntensity) <= glowIntensityTolerance &&
      Math.abs(firstState.lightIntensity - secondState.lightIntensity) <= glowIntensityTolerance
    );
  }

  function getColorDistance(firstColor, secondColor) {
    return Math.hypot(
      firstColor.r - secondColor.r,
      firstColor.g - secondColor.g,
      firstColor.b - secondColor.b,
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

function createOakTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const image = context.createImageData(size, size);
  const lightOak = [156, 106, 53];
  const darkOak = [72, 43, 22];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = (
        Math.sin(x * 0.055 + Math.sin(y * 0.018) * 8) * 0.5 +
        Math.sin(x * 0.16 + y * 0.018) * 0.24 +
        Math.sin((x + y) * 0.025) * 0.18
      );
      const ring = Math.sin((x + Math.sin(y * 0.03) * 18) * 0.018) * 0.16;
      const noise = (Math.random() - 0.5) * 0.2;
      const mix = THREE.MathUtils.clamp(0.48 + grain * 0.3 + ring * 1.25 + noise, 0, 1);
      const index = (y * size + x) * 4;

      image.data[index] = Math.round(THREE.MathUtils.lerp(darkOak[0], lightOak[0], mix));
      image.data[index + 1] = Math.round(THREE.MathUtils.lerp(darkOak[1], lightOak[1], mix));
      image.data[index + 2] = Math.round(THREE.MathUtils.lerp(darkOak[2], lightOak[2], mix));
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}
