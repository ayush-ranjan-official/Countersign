import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  buildBitcoinGeometry, COIN_CONFIG, createCrystalCoinGeometry, createRefractionBackdrop, createStudioEnvironment,
} from "./readinessCoinOptics";

export function createReadinessCoin(canvas: HTMLCanvasElement, stage: HTMLDivElement, onLost: () => void) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: "high-performance", alpha: false,
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06070a);
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 120);
  camera.position.set(1.15, .48, 7.15);

  let environment: ReturnType<typeof createStudioEnvironment>;
  try {
    environment = createStudioEnvironment(renderer);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  scene.environment = environment.texture;

  const rimKeyLight = new THREE.DirectionalLight(0xffffff, .85);
  rimKeyLight.position.set(4.5, 6, 5.5);
  const rimBackLight = new THREE.DirectionalLight(0xeef6ff, .55);
  rimBackLight.position.set(-5, -3.5, -5.5);

  const backdrop = createRefractionBackdrop();
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, ior: 1.75, thickness: 1.45, dispersion: 3.2,
    roughness: .025, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2,
    attenuationColor: new THREE.Color(0xf5fbff), attenuationDistance: 4.5,
  });
  const logoCrystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4f9ff, transmission: .92, ior: 1.80, thickness: .55, dispersion: 2.6,
    roughness: .16, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 2.2,
    attenuationColor: new THREE.Color(0xf0f8ff), attenuationDistance: 2.8,
    sheen: .3, sheenRoughness: .35, sheenColor: new THREE.Color(0xffffff),
  });

  const coinGeometry = createCrystalCoinGeometry();
  const logoGeometry = buildBitcoinGeometry();
  const frontEmblem = new THREE.Mesh(logoGeometry, logoCrystalMaterial);
  frontEmblem.position.z = COIN_CONFIG.logoBaseZ;
  const backEmblem = new THREE.Mesh(logoGeometry, logoCrystalMaterial);
  backEmblem.position.z = -COIN_CONFIG.logoBaseZ;
  backEmblem.rotation.y = Math.PI;

  const coin = new THREE.Group();
  coin.add(new THREE.Mesh(coinGeometry, crystalMaterial), frontEmblem, backEmblem);
  scene.add(coin, backdrop.mesh, rimKeyLight, rimBackLight);

  const controls = new OrbitControls(camera, stage);
  controls.enableDamping = true;
  controls.dampingFactor = .055;
  controls.enablePan = false;
  controls.minDistance = 3.3;
  controls.maxDistance = 13.5;
  controls.rotateSpeed = .78;
  controls.update();

  let interacting = false;
  controls.addEventListener("start", () => { interacting = true; });
  controls.addEventListener("end", () => { interacting = false; });

  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  function updateProjection() {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (width !== nextWidth || height !== nextHeight || pixelRatio !== nextRatio) {
      width = nextWidth;
      height = nextHeight;
      pixelRatio = nextRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    }
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Frame the coin in its grid column while using one backdrop across the viewport.
    camera.setViewOffset(bounds.width, bounds.height, -bounds.left, -bounds.top, width, height);
  }
  const resizeObserver = new ResizeObserver(updateProjection);
  resizeObserver.observe(stage);
  resizeObserver.observe(document.body);
  window.addEventListener("resize", updateProjection);
  window.addEventListener("scroll", updateProjection, { passive: true });
  updateProjection();

  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  function animate(timestamp: number) {
    const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, .05) : 0;
    lastTime = timestamp;
    elapsed += dt;
    backdrop.uniforms.uTime.value = elapsed;

    if (!interacting) {
      coin.rotation.y += dt * .38;
      coin.rotation.x += (Math.sin(elapsed * .55) * .12 - coin.rotation.x) * Math.min(1, dt * 3);
      coin.rotation.z += (Math.cos(elapsed * .42) * .045 - coin.rotation.z) * Math.min(1, dt * 3);
    }

    coin.position.y = Math.sin(elapsed * .95) * .045;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }

  function lost(event: Event) {
    event.preventDefault();
    cancelAnimationFrame(frame);
    onLost();
  }
  canvas.addEventListener("webglcontextlost", lost);
  animate(performance.now());

  return () => {
    cancelAnimationFrame(frame);
    canvas.removeEventListener("webglcontextlost", lost);
    window.removeEventListener("resize", updateProjection);
    window.removeEventListener("scroll", updateProjection);
    resizeObserver.disconnect();
    controls.dispose();
    coinGeometry.dispose();
    logoGeometry.dispose();
    crystalMaterial.dispose();
    logoCrystalMaterial.dispose();
    backdrop.mesh.geometry.dispose();
    backdrop.mesh.material.dispose();
    environment.dispose();
    renderer.dispose();
  };
}
