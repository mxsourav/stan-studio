/* ═══════════════════════════════════════════════════════════════════════
   VERBATIM HERO STAGE ENGINE — extracted 1:1 from stan-studio index.html.
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

   Every line of physics, geometry, camera choreography and scroll handling
   is untouched. Wrapper lines only: the init export and the unmount guard
   appended at the bottom (after the verbatim block).
   ═══════════════════════════════════════════════════════════════════════ */
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export function initRepoHeroStage() {

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

/* ─── CAD Dimensions for 1kg Spool ────────────────────────────── */
const S = {
    flangeR  : 1.95,   // Outer flange disc radius
    flangeTh : 0.075,  // Flange disc thickness
    hubInR   : 0.50,   // Center axle hole radius (hollow bore)
    hubOutR  : 0.96,   // Outer hub barrel where winding starts
    width    : 1.22,   // Gap between inner flange faces
    maxWindR : 1.82,   // Full 1kg wound filament radius
    minWindR : 0.98,   // Depleted spool radius
    strandR  : 0.024,  // Tactile wire radius matching 24 bold spool rings
};

/* ═══════════════════════════════════════════════════════════════════
   RENDERER & STUDIO SETUP
   ═══════════════════════════════════════════════════════════════════ */
const canvas = document.getElementById('webgl-canvas');
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xffffff, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* ═══════════════════════════════════════════════════════════════════
   SCENE & STUDIO PMREM ENVIRONMENT
   ═══════════════════════════════════════════════════════════════════ */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070708);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0x070708);
envScene.add(new THREE.AmbientLight(0xfff2e0, 0.35));

const envKey = new THREE.DirectionalLight(0xfff1dd, 3.2);
envKey.position.set(-4, 8, 5);
envScene.add(envKey);

const envFill = new THREE.DirectionalLight(0xcfe0ff, 1.1);
envFill.position.set(-5, 3, -3);
envScene.add(envFill);

// Overhead softbox strip: the long specular streak rolling across the coils
const envStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
);
envStrip.position.set(-2, 9, 2);
envStrip.rotation.x = Math.PI / 2;
envScene.add(envStrip);

const envSideStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xbfd2ff })
);
envSideStrip.position.set(-8, 2, -2);
envSideStrip.rotation.y = Math.PI / 2;
envScene.add(envSideStrip);

scene.environment = pmrem.fromScene(envScene, 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);

/* ═══════════════════════════════════════════════════════════════════
   LIGHTING SETUP (CLEAN INDUSTRIAL STUDIO)
   ═══════════════════════════════════════════════════════════════════ */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.26);
scene.add(ambientLight);

const keyLightTarget = new THREE.Object3D();
keyLightTarget.position.set(-4.2, -0.2, 0.0);
scene.add(keyLightTarget);

const keyLight = new THREE.DirectionalLight(0xfff0dc, 3.9);
keyLight.position.set(-6.2, 10.5, 5.0);
keyLight.target = keyLightTarget;
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near = 1.0;
keyLight.shadow.camera.far = 24.0;
keyLight.shadow.camera.left = -5.0;
keyLight.shadow.camera.right = 5.0;
keyLight.shadow.camera.top = 5.0;
keyLight.shadow.camera.bottom = -5.0;
keyLight.shadow.bias = -0.0001;
keyLight.shadow.normalBias = 0.035;
keyLight.shadow.radius = 4.5;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xaab4c8, 0.4);
fillLight.position.set(-9.0, 5.0, -3.0);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xdfe9ff, 3.0);
rimLight.position.set(-11.0, 3.5, -5.5);
scene.add(rimLight);

/* ═══════════════════════════════════════════════════════════════════
   CLEAN STUDIO FLOOR SHADOW PLANE & SOFT CONTACT SHADOW
   ═══════════════════════════════════════════════════════════════════ */
const FLOOR_Y = -2.58;

// Disable harsh geometric spoke silhouette projection on the studio floor
const shadowPlaneGeo = new THREE.PlaneGeometry(100, 100);
const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.0 });
const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = FLOOR_Y;
shadowPlane.receiveShadow = false;
shadowPlane.visible = false;
scene.add(shadowPlane);

// Photorealistic Multi-Layer Gaussian Blur Shadow (Cinema 4D / Octane Softbox Contact AO)
function createContactShadowTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 1024);

    const cx = 512, cy = 512;
    const hasFilter = typeof ctx.filter === 'string';

    if (hasFilter) {
        // 1. Broad Ambient Gaussian Dispersion (Feathers softly into infinite white floor)
        ctx.save();
        ctx.filter = 'blur(65px)';
        ctx.fillStyle = 'rgba(18, 22, 30, 0.16)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 390, 240, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Mid-Field Cylinder Body Penumbra (Spool wound filament mass)
        ctx.save();
        ctx.filter = 'blur(35px)';
        ctx.fillStyle = 'rgba(14, 18, 26, 0.28)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 280, 165, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Dense Grounding Contact Occlusion (Occlusion near floor)
        ctx.save();
        ctx.filter = 'blur(18px)';
        ctx.fillStyle = 'rgba(10, 14, 20, 0.44)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 15, 185, 105, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 4. Tight Crevice Contact Touch (Deep dark grounding under the lowest rim)
        ctx.save();
        ctx.filter = 'blur(9px)';
        ctx.fillStyle = 'rgba(6, 8, 14, 0.68)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 25, 115, 58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else {
        const grad = ctx.createRadialGradient(cx, cy, 15, cx, cy, 480);
        grad.addColorStop(0.00, 'rgba(6, 8, 14, 0.70)');
        grad.addColorStop(0.12, 'rgba(10, 14, 20, 0.50)');
        grad.addColorStop(0.30, 'rgba(14, 18, 26, 0.30)');
        grad.addColorStop(0.55, 'rgba(18, 22, 30, 0.14)');
        grad.addColorStop(0.80, 'rgba(22, 26, 35, 0.04)');
        grad.addColorStop(1.00, 'rgba(28, 32, 42, 0.00)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 480, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    return tex;
}

const contactShadowTex = createContactShadowTexture();
const contactShadowGeo = new THREE.PlaneGeometry(1, 1);
const contactShadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
});
const contactShadowMesh = new THREE.Mesh(contactShadowGeo, contactShadowMat);
contactShadowMesh.rotation.x = -Math.PI / 2;
contactShadowMesh.position.y = FLOOR_Y + 0.002;
scene.add(contactShadowMesh);

/* ═══════════════════════════════════════════════════════════════════
   PREMIUM PBR MATERIALS (INJECTION-MOLDED ABS & PRECISION MATTE PLA)
   ═══════════════════════════════════════════════════════════════════ */
const matSpool = new THREE.MeshPhysicalMaterial({
    color: 0x141416,
    roughness: 0.32,
    metalness: 0.1,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
});

const matAxlePipe = new THREE.MeshPhysicalMaterial({
    color: 0x0f1013,
    roughness: 0.48,
    metalness: 0.10,
    clearcoat: 0.12,
    clearcoatRoughness: 0.35,
    side: THREE.DoubleSide,
});

const initialHex = 0x085d63; // Rich Precision Matte Teal from previous version
const initialColor = new THREE.Color(initialHex);

/* ═══════════════════════════════════════════════════════════════════
   PROCEDURAL TEXTURES FOR 24 BOLD WOUND RINGS & RADIAL SIDE COILS
   - 24 Distinct, tactile 3D cylinder strands with deep crevice shadows
   - Side concentric coils with ambient occlusion visible in cutout windows
   ═══════════════════════════════════════════════════════════════════ */
function createWoundCylinderTextures() {
    const w = 1024, h = 1024;
    const cColor = document.createElement('canvas');
    cColor.width = w; cColor.height = h;
    const ctxC = cColor.getContext('2d');

    const cNorm = document.createElement('canvas');
    cNorm.width = w; cNorm.height = h;
    const ctxN = cNorm.getContext('2d');
    const imgN = ctxN.createImageData(w, h);
    const dN = imgN.data;

    const numStrands = 24; // Bold tactile rings matching previous version
    const strandH = h / numStrands;

    for (let y = 0; y < h; y++) {
        const t = (y % strandH) / strandH;
        const curve = Math.sin(t * Math.PI);
        // Deep, rich crevice shading (0.36 in groove, 1.0 at peak)
        const shade = 0.36 + 0.64 * Math.pow(curve, 0.62);
        const v = Math.round(255 * shade);

        ctxC.fillStyle = `rgb(${v},${v},${v})`;
        ctxC.fillRect(0, y, w, 1);

        const ny = Math.cos(t * Math.PI);
        const nz = Math.sin(t * Math.PI);
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const microNoise = (Math.random() - 0.5) * 4;
            dN[idx    ] = Math.min(255, Math.max(0, 128 + microNoise));
            dN[idx + 1] = Math.min(255, Math.max(0, 128 + ny * 115 + microNoise));
            dN[idx + 2] = Math.min(255, Math.max(0, 128 + nz * 115));
            dN[idx + 3] = 255;
        }
    }
    ctxN.putImageData(imgN, 0, 0);

    const colorTex = new THREE.CanvasTexture(cColor);
    colorTex.wrapS = colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.anisotropy = 16;

    const normTex = new THREE.CanvasTexture(cNorm);
    normTex.wrapS = normTex.wrapT = THREE.RepeatWrapping;
    normTex.anisotropy = 16;

    return { colorTex, normTex };
}

/* Dedicated Radial Texture for the Concentric Coils seen through Cutout Windows */
function createSideCoilTextures() {
    const size = 1024;
    const cColor = document.createElement('canvas');
    cColor.width = size; cColor.height = size;
    const ctxC = cColor.getContext('2d');

    const cNorm = document.createElement('canvas');
    cNorm.width = size; cNorm.height = size;
    const ctxN = cNorm.getContext('2d');
    const imgN = ctxN.createImageData(size, size);
    const dN = imgN.data;

    const cx = size / 2, cy = size / 2;
    const rMax = size * 0.485;
    const rMin = rMax * (S.hubOutR / S.maxWindR);
    const numLayers = 18;
    const layerPitch = (rMax - rMin) / numLayers;

    // Fill background with deep crevice shade
    ctxC.fillStyle = 'rgb(95,95,95)';
    ctxC.fillRect(0, 0, size, size);

    for (let py = 0; py < size; py++) {
        const dy = py - cy;
        for (let px = 0; px < size; px++) {
            const dx = px - cx;
            const r = Math.sqrt(dx * dx + dy * dy);
            const idx = (py * size + px) * 4;

            if (r >= rMin - 4 && r <= rMax + 4) {
                const angle = Math.atan2(dy, dx);
                const relR = (r - rMin);
                const layerT = (relR % layerPitch) / layerPitch;
                const curve = Math.sin(layerT * Math.PI);
                
                const nr = Math.cos(layerT * Math.PI);
                const nx = nr * Math.cos(angle);
                const ny = nr * Math.sin(angle);
                const nz = Math.sin(layerT * Math.PI);

                dN[idx    ] = Math.min(255, Math.max(0, 128 + nx * 110));
                dN[idx + 1] = Math.min(255, Math.max(0, 128 - ny * 110));
                dN[idx + 2] = Math.min(255, Math.max(0, 128 + nz * 110));
                dN[idx + 3] = 255;
            } else {
                dN[idx    ] = 128;
                dN[idx + 1] = 128;
                dN[idx + 2] = 255;
                dN[idx + 3] = 255;
            }
        }
    }

    // Render color rings to 2D canvas with anti-aliasing and Radial Ambient Occlusion
    for (let i = 0; i < numLayers; i++) {
        const rLayer = rMin + (i + 0.5) * layerPitch;
        const normR = i / (numLayers - 1);
        const ao = 0.52 + 0.48 * Math.pow(normR, 0.60);
        const v = Math.round(255 * ao);
        ctxC.beginPath();
        ctxC.arc(cx, cy, rLayer, 0, Math.PI * 2);
        ctxC.strokeStyle = `rgb(${v},${v},${v})`;
        ctxC.lineWidth = layerPitch * 0.82;
        ctxC.stroke();

        // Dark crevice separator
        ctxC.beginPath();
        ctxC.arc(cx, cy, rMin + i * layerPitch, 0, Math.PI * 2);
        ctxC.strokeStyle = 'rgb(90,90,90)';
        ctxC.lineWidth = layerPitch * 0.22;
        ctxC.stroke();
    }
    ctxN.putImageData(imgN, 0, 0);

    const sideColorTex = new THREE.CanvasTexture(cColor);
    sideColorTex.anisotropy = 16;
    const sideNormTex = new THREE.CanvasTexture(cNorm);
    sideNormTex.anisotropy = 16;

    return { sideColorTex, sideNormTex };
}

const { colorTex: cylinderColorTex, normTex: cylinderNormTex } = createWoundCylinderTextures();
const { sideColorTex, sideNormTex } = createSideCoilTextures();

/* STRICT MATTE PLA MATERIALS (ZERO GLOSS, ZERO CLEARCOAT) */
const matWoundFilament = new THREE.MeshPhysicalMaterial({
    color: initialColor,
    map: cylinderColorTex,
    normalMap: cylinderNormTex,
    normalScale: new THREE.Vector2(2.4, 2.4),
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    sheen: 0.0,
    envMapIntensity: 1.0,
    side: THREE.FrontSide,
});

const matSideCoil = new THREE.MeshPhysicalMaterial({
    color: initialColor,
    map: sideColorTex,
    normalMap: sideNormTex,
    normalScale: new THREE.Vector2(2.0, 2.0),
    roughness: 0.52,
    metalness: 0.05,
    clearcoat: 0.4,
    clearcoatRoughness: 0.32,
    sheen: 0.0,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
});

const matUnrolledStrand = new THREE.MeshPhysicalMaterial({
    color: initialColor,
    roughness: 0.4,
    metalness: 0.05,
    clearcoat: 0.55,
    clearcoatRoughness: 0.25,
    sheen: 0.0,
    envMapIntensity: 1.0,
});

/* ═══════════════════════════════════════════════════════════════════
   3D STAGE & SPOOL (CONFIGURABLE VIA 3D CALIBRATOR)
   ═══════════════════════════════════════════════════════════════════ */
const SPOOL_CALIB_START_DEFAULT = Object.freeze({
    posX: -1.90,
    posY: -0.15,
    posZ: 0.00,
    rotXDeg: 0.0,
    rotYDeg: 90.0,
    rotZDeg: -8.0,
    scale: 1.42
});

const SPOOL_CALIB_END_DEFAULT = Object.freeze({
    posX: -6.90,
    posY: 0.75,
    posZ: 1.45,
    rotXDeg: -13.0, // rad: -0.2269
    rotYDeg: 66.0,  // rad: 1.1519
    rotZDeg: 78.5,  // rad: 1.3701
    scale: 1.26
});

const SPOOL_CALIB_START = { ...SPOOL_CALIB_START_DEFAULT };
const SPOOL_CALIB_END = { ...SPOOL_CALIB_END_DEFAULT };

const GLASS_HOVER_CONFIG = {
    hoverIntensity: 0.7,
    blur: 11,           // px
    opacity: 0.05,      // 0.0 to 1.0
    noiseDensity: 0.10, // grain frequency
    noiseSize: 30,        // px
    noiseOpacity: 0.35  // 0.0 to 1.0
};

let activeCalibFrame = 'start'; // 'start' | 'end'
let calibInteractTimeout = null;
let isUserInteractingWithCalibrator = false;

function markCalibInteraction() {
    isUserInteractingWithCalibrator = true;
    if (calibInteractTimeout) clearTimeout(calibInteractTimeout);
    calibInteractTimeout = setTimeout(() => {
        isUserInteractingWithCalibrator = false;
    }, 600);
}

function syncFrameSelectorFromScroll(p) {
    if (isUserInteractingWithCalibrator) return;
    if (typeof window.setCalibFrame !== 'function') return;
    if (p <= 0.03 && activeCalibFrame !== 'start') {
        window.setCalibFrame('start', false);
    } else if (p >= 0.97 && activeCalibFrame !== 'end') {
        window.setCalibFrame('end', false);
    }
}

const stage = new THREE.Group();
stage.scale.set(SPOOL_CALIB_START.scale, SPOOL_CALIB_START.scale, SPOOL_CALIB_START.scale);
stage.position.set(SPOOL_CALIB_START.posX, SPOOL_CALIB_START.posY, SPOOL_CALIB_START.posZ);
scene.add(stage);

const spoolAnchor = new THREE.Group();
spoolAnchor.position.set(-1.40, 0.0, 0.0);
stage.add(spoolAnchor);

const spoolPose = new THREE.Group();
spoolPose.rotation.x = SPOOL_CALIB_START.rotXDeg * Math.PI / 180;
spoolPose.rotation.y = SPOOL_CALIB_START.rotYDeg * Math.PI / 180;
spoolPose.rotation.z = SPOOL_CALIB_START.rotZDeg * Math.PI / 180;
spoolAnchor.add(spoolPose);

const spoolRotor = new THREE.Group();
spoolPose.add(spoolRotor);

/* ─── REAL 3D HOLLOW AXLE PIPE (100% CLEAR BORE) ──────────────── */
const pipeH = S.width + S.flangeTh * 2 + 0.08;
const axlePipeGeo = new THREE.CylinderGeometry(S.hubInR, S.hubInR, pipeH, 64, 1, true);
const axlePipeMesh = new THREE.Mesh(axlePipeGeo, matAxlePipe);
spoolRotor.add(axlePipeMesh);

const lipGeo = new THREE.TorusGeometry(S.hubInR, 0.020, 16, 64);
const lipTop = new THREE.Mesh(lipGeo, matAxlePipe);
lipTop.rotation.x = Math.PI / 2;
lipTop.position.y = pipeH / 2;
spoolRotor.add(lipTop);

const lipBottom = new THREE.Mesh(lipGeo, matAxlePipe);
lipBottom.rotation.x = Math.PI / 2;
lipBottom.position.y = -pipeH / 2;
spoolRotor.add(lipBottom);

// Central Hub Cylinder Barrel
const hubH = S.width;
const hubGeo = new THREE.CylinderGeometry(S.hubOutR, S.hubOutR, hubH, 64, 1, true);
const hubMesh = new THREE.Mesh(hubGeo, matSpool);
hubMesh.castShadow = true;
hubMesh.receiveShadow = true;
spoolRotor.add(hubMesh);

/* ═══════════════════════════════════════════════════════════════════
   AUTHENTIC INJECTION-MOLDED SPOOL FRAME GENERATOR
   - 4 Sector / Trapezoidal window cutouts showing coiled filament inside
   - 4 Solid quadrants with authentic STΔN spec decal
   - Raised outer perimeter rim lip + filament clip notches
   - Raised inner bore collar + radial structural reinforcement ribs
   ═══════════════════════════════════════════════════════════════════ */
function createSpecLabelDecal() {
    const w = 512, h = 180;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    ctx.fillStyle = '#0a0a0c';
    ctx.font = 'bold 36px -apple-system, sans-serif';
    ctx.fillText('STΔN  PLA-PRO', 20, 48);

    ctx.fillStyle = '#475569';
    ctx.font = '600 18px monospace';
    ctx.fillText('1.75MM • 1000G • PRECISION', 20, 76);

    // Embossed 100RAV: black plastic lettering raised off the label, lit
    // from the top-left (matching the stage key light) with a bottom-right
    // drop shadow so the relief reads while the flange rotates.
    const by = 96, bh = 52;
    const ravText = '100RAV';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 46px Antapani, -apple-system, sans-serif';
    const tx = w / 2;
    const ty = by + bh / 2;
    // drop shadow (bottom-right)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(ravText, tx + 2.5, ty + 2.5);
    // raised bevel highlight (top-left edge catching the key light)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(ravText, tx - 1.5, ty - 1.5);
    // raised black plastic body
    ctx.fillStyle = '#141417';
    ctx.fillText(ravText, tx, ty);
    // subtle sheen along the upper face of the relief
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillText(ravText, tx - 0.5, ty - 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#64748b';
    ctx.font = '600 15px monospace';
    ctx.fillText('LOT #STN-2604 // 205-225°C', 20, 168);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 16;
    return tex;
}

const specLabelTex = createSpecLabelDecal();
const matSpecLabel = new THREE.MeshPhysicalMaterial({
    map: specLabelTex,
    roughness: 0.90,
    metalness: 0.02,
    clearcoat: 0.04,
    side: THREE.DoubleSide,
});

function createInjectionMoldedFlange(isFront = false) {
    const flangeGroup = new THREE.Group();

    // 1. Base Shape with Central Bore and 4 Sector Windows
    const shape = new THREE.Shape();
    shape.absarc(0, 0, S.flangeR, 0, Math.PI * 2, false);

    const centerHole = new THREE.Path();
    centerHole.absarc(0, 0, S.hubInR, 0, Math.PI * 2, true);
    shape.holes.push(centerHole);

    // 4 Sector Window Cutouts centered at 45°, 135°, 225°, 315°
    const windowAngles = [
        Math.PI * 0.25, // Top-Right (45°)
        Math.PI * 0.75, // Top-Left (135°)
        Math.PI * 1.25, // Bottom-Left (225°)
        Math.PI * 1.75  // Bottom-Right (315°)
    ];
    const r1 = S.hubOutR + 0.12; // 1.08
    const r2 = S.flangeR - 0.20;  // 1.75
    const span = Math.PI * 0.26;  // ~47 degrees

    windowAngles.forEach(a => {
        const hPath = new THREE.Path();
        const aStart = a - span / 2;
        const aEnd = a + span / 2;

        hPath.absarc(0, 0, r2, aStart, aEnd, false);
        hPath.lineTo(Math.cos(aEnd) * r1, Math.sin(aEnd) * r1);
        hPath.absarc(0, 0, r1, aEnd, aStart, true);
        hPath.lineTo(Math.cos(aStart) * r2, Math.sin(aStart) * r2);
        shape.holes.push(hPath);
    });

    // 2 Pairs of tiny filament-clip holes on outer rim
    const clipAngles = [Math.PI * 0.50, Math.PI * 1.50];
    clipAngles.forEach(ca => {
        for (let offset = -0.045; offset <= 0.045; offset += 0.09) {
            const clipPath = new THREE.Path();
            const angle = ca + offset;
            const cr = S.flangeR - 0.07;
            const cx = Math.cos(angle) * cr;
            const cy = Math.sin(angle) * cr;
            clipPath.absarc(cx, cy, 0.022, 0, Math.PI * 2, true);
            shape.holes.push(clipPath);
        }
    });

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: S.flangeTh,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        curveSegments: 64,
    });
    geo.center();
    geo.rotateX(Math.PI / 2);

    const mainPlate = new THREE.Mesh(geo, matSpool);
    mainPlate.castShadow = true;
    mainPlate.receiveShadow = true;
    flangeGroup.add(mainPlate);

    // 2. Raised Outer Perimeter Rim Lip
    const rimLipGeo = new THREE.TorusGeometry(S.flangeR - 0.035, 0.036, 16, 72);
    const rimLip = new THREE.Mesh(rimLipGeo, matSpool);
    rimLip.rotation.x = Math.PI / 2;
    rimLip.position.y = (S.flangeTh / 2) + 0.015;
    rimLip.castShadow = true;
    flangeGroup.add(rimLip);

    // 3. Raised Inner Hub Collar Ring
    const collarGeo = new THREE.TorusGeometry(S.hubInR + 0.06, 0.028, 16, 64);
    const collar = new THREE.Mesh(collarGeo, matSpool);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = (S.flangeTh / 2) + 0.012;
    collar.castShadow = true;
    flangeGroup.add(collar);

    // 4. 8 Raised Radial Structural Ribs (Framing the borders of each window)
    const ribLen = r2 - r1 + 0.22;
    const ribMidR = (r1 + r2) * 0.50;
    const ribGeo = new THREE.BoxGeometry(0.040, 0.024, ribLen);

    const borderRibAngles = [];
    windowAngles.forEach(wa => {
        borderRibAngles.push(wa - span / 2 - 0.015);
        borderRibAngles.push(wa + span / 2 + 0.015);
    });

    borderRibAngles.forEach(ra => {
        const rib = new THREE.Mesh(ribGeo, matSpool);
        rib.position.x = Math.cos(ra) * ribMidR;
        rib.position.z = Math.sin(ra) * ribMidR;
        rib.position.y = (S.flangeTh / 2) + 0.012;
        rib.rotation.y = -ra + Math.PI / 2;
        rib.castShadow = true;
        flangeGroup.add(rib);
    });

    // 5. STΔN Technical Spec Label Decal (on solid quadrant matching reference)
    return flangeGroup;
}

const flangeLeft = createInjectionMoldedFlange(false);
flangeLeft.position.y = -(S.width / 2 + S.flangeTh / 2);
spoolRotor.add(flangeLeft);

const flangeRight = createInjectionMoldedFlange(true); // Front flange with STΔN spec decal
flangeRight.position.y = (S.width / 2 + S.flangeTh / 2);
spoolRotor.add(flangeRight);

/* ─── ENGRAVED 100RAV — molded marking on the flat flange face ──────────────
   Where the stock barcode label sat: a shallow molded relief in darker,
   glossier plastic on the broad flat face of the right flange, oriented to
   read left-to-right for a viewer looking at that face. */
(function mountSpecBadge() {
    const matEngraved = new THREE.MeshStandardMaterial({
        color: 0x1a1a20,      // a shade darker, glossier than the flange
        roughness: 0.18,      // the key/rim light reflects off the letter faces
        metalness: 0.35,
    });
    const fontLoader = new FontLoader();
    const fontUrl = new URL('../assets/helvetiker_bold.typeface.json', import.meta.url).href;
    fontLoader.loadAsync(fontUrl).then((font) => {
        const glyphs = font.generateShapes('100RAV', 0.1);
        const geo = new THREE.ExtrudeGeometry(glyphs, {
            depth: 0.003,        // shallow molded relief
            bevelEnabled: true,
            bevelThickness: 0.0009,
            bevelSize: 0.0008,
            bevelSegments: 2,
        });
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0);
        const mesh = new THREE.Mesh(geo, matEngraved);
        // On the right flange's flat outer face, toward the outer rim area:
        mesh.rotation.set(-Math.PI / 2, 0, 0);   // lie flat on the face, text up = -Z
        mesh.position.set(-1.05, S.width / 2 + S.flangeTh / 2 + 0.002, 0);
        spoolRotor.add(mesh);
        // Second marking on the opposite side of the face: one of the two is
        // always on the camera-visible half as the spool rolls.
        const mesh2 = new THREE.Mesh(geo, matEngraved);
        mesh2.rotation.set(-Math.PI / 2, 0, 0);
        mesh2.position.set(1.05, S.width / 2 + S.flangeTh / 2 + 0.002, 0);
        spoolRotor.add(mesh2);
        window.__stanEngraving = mesh;
    }).catch((e) => { window.__stanFontError = String(e && e.message || e); });
})();

/* ═══════════════════════════════════════════════════════════════════
   COILED FILAMENT PACK: 24 BOLD TACTILE RINGS & RECESSED SIDE COILS
   ═══════════════════════════════════════════════════════════════════ */
const halfW = (S.width - 0.02) / 2;

// 1. Outer Cylindrical Wound Barrel (Clean UV mapping across full spool width)
let woundCylGeo = new THREE.CylinderGeometry(S.maxWindR, S.maxWindR, S.width - 0.02, 96, 1, true);
const woundMesh = new THREE.Mesh(woundCylGeo, matWoundFilament);
woundMesh.castShadow = true;
woundMesh.receiveShadow = true;
spoolRotor.add(woundMesh);

// 2. Recessed Side Coils visible through the 4 Sector Cutout Windows
function createSideCoilGeo(currentR) {
    const geo = new THREE.RingGeometry(S.hubOutR + 0.015, currentR, 72, 1);
    const pos = geo.attributes.position;
    const uvs = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const u = 0.5 + (x / (S.maxWindR * 2.06));
        const v = 0.5 + (y / (S.maxWindR * 2.06));
        uvs.setXY(i, u, v);
    }
    uvs.needsUpdate = true;
    return geo;
}

let sideCoilFrontGeo = createSideCoilGeo(S.maxWindR);
const sideCoilFront = new THREE.Mesh(sideCoilFrontGeo, matSideCoil);
sideCoilFront.rotation.x = -Math.PI / 2;
sideCoilFront.position.y = halfW - 0.005;
sideCoilFront.receiveShadow = true;
spoolRotor.add(sideCoilFront);

let sideCoilBackGeo = createSideCoilGeo(S.maxWindR);
const sideCoilBack = new THREE.Mesh(sideCoilBackGeo, matSideCoil);
sideCoilBack.rotation.x = Math.PI / 2;
sideCoilBack.position.y = -halfW + 0.005;
sideCoilBack.receiveShadow = true;
spoolRotor.add(sideCoilBack);


/* ═══════════════════════════════════════════════════════════════════
   AERODYNAMIC UNROLLING FILAMENT STRAND & CINEMATIC CAMERA
   ═══════════════════════════════════════════════════════════════════ */
const PEEL_RAD = 18 * Math.PI / 180; // Top-front rim peel angle
const cosP = Math.cos(PEEL_RAD);
const sinP = Math.sin(PEEL_RAD);

// Pure circumferential tangent (+theta direction)
const tLocal = new THREE.Vector3(-sinP, 0, cosP);

// 13-point smooth aerodynamic trajectory across studio in stage space
const strandPoints = [
    new THREE.Vector3(-1.45,  1.78,  0.05), // P_anc: snug on roll surface
    new THREE.Vector3(-1.10,  1.79,  0.15), // P0: Dynamic peel point on roll
    new THREE.Vector3(-0.79,  1.72,  0.38), // P1: Smooth tangent departure
    new THREE.Vector3(-0.35,  1.66,  0.68), // P2: Tangent lift into air
    new THREE.Vector3( 0.25,  1.56,  1.02), // P3: Tangent arc fusion
    new THREE.Vector3( 1.45,  1.18,  0.92), // P4: Smooth sweeping glide to the right
    new THREE.Vector3( 2.45,  0.50,  0.65), // P5: Gentle aerodynamic curve
    new THREE.Vector3( 2.75, -0.35,  0.40), // P6: Wide radius banking down
    new THREE.Vector3( 2.25, -1.25,  0.15), // P7: Inward sweeping flourish
    new THREE.Vector3( 1.20, -1.95, -0.05), // P8: Flowing across lower center
    new THREE.Vector3(-0.05, -2.60, -0.20), // P9: Low studio floor flow
    new THREE.Vector3( 0.50, -3.45, -0.15), // P10: Continuous ribbon loop
    new THREE.Vector3( 1.40, -4.30,  0.10), // P11: Trailing off gracefully
];

let strandCurve = new THREE.CatmullRomCurve3(strandPoints, false, 'centripetal', 0.5);
const RADIAL_SEGS = 16;
const INDICES_PER_SEG = RADIAL_SEGS * 6; // Exactly 96 indices per tubular segment
const TUBE_SEGS = 260;
let strandGeo = new THREE.TubeGeometry(strandCurve, TUBE_SEGS, S.strandR, RADIAL_SEGS, false);
const strandMesh = new THREE.Mesh(strandGeo, matUnrolledStrand);
strandMesh.castShadow = false;
stage.add(strandMesh); // Placed directly in stage coordinates

// Watertight Solid Polymer Tip Cap (cleanly seals the tube end without any hole or clipping)
const tipCapGeo = new THREE.SphereGeometry(S.strandR * 1.08, 24, 16);
const tipCapMesh = new THREE.Mesh(tipCapGeo, matUnrolledStrand);
tipCapMesh.castShadow = false;
tipCapMesh.visible = false;
stage.add(tipCapMesh);

/* ═══════════════════════════════════════════════════════════════════
   CINEMATIC MULTI-ANGLE CAMERA CHOREOGRAPHY
   ═══════════════════════════════════════════════════════════════════ */
const cameraSpline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.20,  0.35, 8.5), // 0.00: Hero start with generous breathing margins on all sides
    new THREE.Vector3(-2.40,  0.40, 8.8), // 0.25: Gentle elevation and lateral tracking as peel begins
    new THREE.Vector3(-2.60,  0.42, 9.1), // 0.50: Clean bore framing, zero clipping on left/top
    new THREE.Vector3(-2.70,  0.40, 9.3), // 0.75: Spool comfortably framed on left, wire sweeps right
    new THREE.Vector3(-2.75,  0.38, 9.5), // 1.00: Final stage with large spool cleanly framed and rolling
], false, 'catmullrom', 0.5);

const lookAtSpline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.30,  0.15, 0.0), // 0.00: Centered on spool and strand
    new THREE.Vector3(-3.40,  0.25, 0.2), // 0.25: Tracking peel point
    new THREE.Vector3(-3.50,  0.35, 0.4), // 0.50: Centered vertically and horizontally
    new THREE.Vector3(-3.55,  0.40, 0.6), // 0.75: Continuing smooth track
    new THREE.Vector3(-3.60,  0.45, 0.7), // 1.00: Last stage resting frame
], false, 'catmullrom', 0.5);

/* ═══════════════════════════════════════════════════════════════════
   SCROLL ENGINE & 3-SECOND SMOOTH UNROLL TRANSITION
   ═══════════════════════════════════════════════════════════════════ */
let targetProgress = 0;
let currentProgress = 0;
let spoolRotationAngle = 0;
let continuousRollAngle = 0;
const scrollPercentEl = document.getElementById('scroll-percent');
const resetScrollBtn = document.getElementById('reset-scroll-btn');

let isTransitioning = false;
let transStartTime = 0;
let transDuration = 1500; // 1.5 seconds to reach 100%
let transStartP = 0;
let transTargetP = 0;

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

window.animateRollTo = function (destP, duration = 1500) {
    transStartP = currentProgress;
    transTargetP = Math.max(0, Math.min(1.0, destP));
    transStartTime = performance.now();
    transDuration = duration;
    isTransitioning = true;
};

function getHeroRunway() {
    const scrollSpacer = document.querySelector('.scroll-spacer');
    if (scrollSpacer && scrollSpacer.offsetHeight > window.innerHeight) {
        return scrollSpacer.offsetHeight - window.innerHeight;
    }
    return Math.max(window.innerHeight * 1.6, 900);
}

function handleScroll() {
    if (isTransitioning) return;
    const runway = getHeroRunway();
    if (runway > 0) {
        const raw = window.pageYOffset / runway;
        targetProgress = Math.min(1.0, Math.max(0.0, isNaN(raw) ? 0 : raw));
    } else {
        targetProgress = 0;
    }
}

window.addEventListener('scroll', handleScroll, { passive: true });
window.addEventListener('resize', handleScroll);
window.addEventListener('pageshow', () => {
    window.scrollTo(0, 0);
    handleScroll();
});
handleScroll();

window.__DEBUG__ = {
    getTargetProgress: () => targetProgress,
    getCurrentProgress: () => currentProgress,
    getActiveFrame: () => activeCalibFrame,
    getStartCalib: () => SPOOL_CALIB_START,
    getEndCalib: () => SPOOL_CALIB_END,
    setTargetProgress: (v) => { targetProgress = v; currentProgress = v; },
    animateRollTo: (v, dur) => window.animateRollTo(v, dur),
    camera,
    stage,
    spoolPose
};

// Interactive Mouse Parallax
let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;
window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / innerWidth - 0.5) * 2;
    targetMouseY = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });

/* ═══════════════════════════════════════════════════════════════════
   MAIN RENDER LOOP (60FPS DETERMINISTIC, REAL FORWARD ROTATION)
   ═══════════════════════════════════════════════════════════════════ */
const _camPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _p0Local = new THREE.Vector3();
const _p1Local = new THREE.Vector3();
const _p2Local = new THREE.Vector3();
const _p3Local = new THREE.Vector3();
let prevRadius = S.maxWindR;
let lastStrandP = -1;

function render() {
    requestAnimationFrame(render);

    if (isTransitioning) {
        const elapsed = performance.now() - transStartTime;
        const t = Math.min(1.0, elapsed / transDuration);
        const easedT = easeInOutCubic(t);
        currentProgress = transStartP + (transTargetP - transStartP) * easedT;
        targetProgress = currentProgress;

        const runway = getHeroRunway();
        if (runway > 0) {
            window.scrollTo(0, currentProgress * runway);
        }

        if (t >= 1.0) {
            currentProgress = transTargetP;
            isTransitioning = false;
        }
    } else {
        if (isNaN(targetProgress) || !isFinite(targetProgress)) targetProgress = 0;
        if (isNaN(currentProgress) || !isFinite(currentProgress)) currentProgress = 0;

        currentProgress += (targetProgress - currentProgress) * 0.085;
        if (Math.abs(targetProgress - currentProgress) < 0.0001) {
            currentProgress = targetProgress;
        }
    }
    const p = Math.min(1.0, Math.max(0.0, currentProgress));

    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    const runway = getHeroRunway();
    const excessScroll = Math.max(0, window.pageYOffset - runway);

    const pct = Math.round(p * 100);
    if (scrollPercentEl) {
        scrollPercentEl.textContent = p >= 0.99 ? 'Unrolling Complete • 100%' : `Scroll to unroll filament • ${pct}%`;
    }
    if (resetScrollBtn) {
        resetScrollBtn.style.display = p > 0.05 ? 'inline-block' : 'none';
    }

    // Smoothly fade out scroll status pill when scrolling down into printer showcase
    const scrollStatusEl = document.getElementById('scroll-status');
    if (scrollStatusEl) {
        if (excessScroll > 40) {
            scrollStatusEl.style.opacity = '0';
            scrollStatusEl.style.pointerEvents = 'none';
            scrollStatusEl.style.transform = 'translateX(-50%) translateY(24px)';
        } else {
            scrollStatusEl.style.opacity = '1';
            scrollStatusEl.style.pointerEvents = 'auto';
            scrollStatusEl.style.transform = 'translateX(-50%) translateY(0)';
        }
    }

    if (typeof syncFrameSelectorFromScroll === 'function') {
        syncFrameSelectorFromScroll(p);
    }

    /* 1. Dynamic Spool Radius (Shrinks uniformly as filament is consumed) */
    const wp = Math.pow(p, 0.70);
    const currentR = THREE.MathUtils.lerp(S.maxWindR, S.minWindR, wp);

    if (Math.abs(currentR - prevRadius) > 0.003) {
        woundCylGeo.dispose();
        woundCylGeo = new THREE.CylinderGeometry(currentR, currentR, S.width - 0.02, 96, 1, true);
        woundMesh.geometry = woundCylGeo;

        sideCoilFrontGeo.dispose();
        sideCoilFrontGeo = createSideCoilGeo(currentR);
        sideCoilFront.geometry = sideCoilFrontGeo;

        sideCoilBackGeo.dispose();
        sideCoilBackGeo = createSideCoilGeo(currentR);
        sideCoilBack.geometry = sideCoilBackGeo;

        prevRadius = currentR;
    }

    /* 2. FORWARD CLOCKWISE ROTATION WITH CONTINUOUS END-STAGE ROLLING:
          Rolls forward as filament peels, and smoothly keeps slowly rolling */
    continuousRollAngle -= 0.005;
    const targetSpoolAngle = -p * Math.PI * 4.6 + continuousRollAngle;
    spoolRotationAngle += (targetSpoolAngle - spoolRotationAngle) * 0.12;
    spoolRotor.rotation.y = spoolRotationAngle;

    /* Dynamic Stage Interpolation: Smooth transition from Initial to Last Stage Pose */
    const curPosX = THREE.MathUtils.lerp(SPOOL_CALIB_START.posX, SPOOL_CALIB_END.posX, p);
    let curPosY = THREE.MathUtils.lerp(SPOOL_CALIB_START.posY, SPOOL_CALIB_END.posY, p);
    const curPosZ = THREE.MathUtils.lerp(SPOOL_CALIB_START.posZ, SPOOL_CALIB_END.posZ, p);
    const curScale = THREE.MathUtils.lerp(SPOOL_CALIB_START.scale, SPOOL_CALIB_END.scale, p);

    // Continuous 3D exit: smoothly scroll the spool upward out of the viewport in 3D
    // when the user scrolls past the hero runway into the printer section,
    // completely eliminating any horizontal 2D slicing or cutting!
    if (excessScroll > 0) {
        const exitRatio = Math.min(1.5, excessScroll / (window.innerHeight * 0.85));
        curPosY += exitRatio * 8.5;
    }

    stage.position.set(curPosX, curPosY, curPosZ);
    stage.scale.set(curScale, curScale, curScale);

    const curRotXDeg = THREE.MathUtils.lerp(SPOOL_CALIB_START.rotXDeg, SPOOL_CALIB_END.rotXDeg, p);
    const curRotYDeg = THREE.MathUtils.lerp(SPOOL_CALIB_START.rotYDeg, SPOOL_CALIB_END.rotYDeg, p);
    const curRotZDeg = THREE.MathUtils.lerp(SPOOL_CALIB_START.rotZDeg, SPOOL_CALIB_END.rotZDeg, p);

    const baseRotX = (curRotXDeg * Math.PI) / 180;
    const baseRotY = (curRotYDeg * Math.PI) / 180;
    const baseRotZ = (curRotZDeg * Math.PI) / 180;

    /* Enhanced Interactive Kinetic Hover Parallax with Adjustable Multiplier */
    const hoverMult = (typeof GLASS_HOVER_CONFIG !== 'undefined') ? GLASS_HOVER_CONFIG.hoverIntensity : 1.8;
    const hoverPitch = mouseY * (0.075 * hoverMult);
    const hoverYaw = mouseX * (0.135 * hoverMult);
    const hoverRoll = mouseX * (-0.035 * hoverMult);

    spoolPose.rotation.x = baseRotX + Math.sin(p * Math.PI) * 0.06 + hoverPitch;
    spoolPose.rotation.y = baseRotY + Math.sin(p * Math.PI) * 0.10 + hoverYaw;
    spoolPose.rotation.z = baseRotZ - Math.sin(p * Math.PI) * 0.03 + hoverRoll;

    // Subtle 3D floating translation responsive to mouse hover
    const hoverShiftX = mouseX * (0.12 * hoverMult);
    const hoverShiftY = -mouseY * (0.08 * hoverMult);
    spoolPose.position.set(hoverShiftX, hoverShiftY, 0.0);

    /* 3. Spool Stays Anchored in Viewport (Zero off-screen exit) */
    spoolAnchor.position.x = -1.40;

    /* 4. Local Tangent Peel Mechanics (Zero Kinks, C2-Continuous Flow):
          P_anc, P0, P1, P2, P3 are computed in local spool frame along the pure circumferential
          tangent and transformed smoothly into stage coordinate space */
    const traverseY = Math.sin(p * Math.PI * 6.0) * (halfW * 0.40);

    const anchorAngle = PEEL_RAD - 0.28;
    const _pAncLocal = new THREE.Vector3(currentR * Math.cos(anchorAngle), traverseY, currentR * Math.sin(anchorAngle));
    _p0Local.set(currentR * cosP, traverseY, currentR * sinP);
    _p1Local.copy(_p0Local).addScaledVector(tLocal, 0.40);
    _p2Local.copy(_p0Local).addScaledVector(tLocal, 0.85);
    const _p3Local = _p0Local.clone().addScaledVector(tLocal, 1.45);

    spoolAnchor.updateMatrixWorld(true);
    spoolPose.updateMatrix();

    const m = spoolPose.matrixWorld;
    const pAncWorld = _pAncLocal.clone().applyMatrix4(m);
    const p0World = _p0Local.clone().applyMatrix4(m);
    const p1World = _p1Local.clone().applyMatrix4(m);
    const p2World = _p2Local.clone().applyMatrix4(m);
    const p3World = _p3Local.clone().applyMatrix4(m);

    stage.worldToLocal(pAncWorld);
    stage.worldToLocal(p0World);
    stage.worldToLocal(p1World);
    stage.worldToLocal(p2World);
    stage.worldToLocal(p3World);

    strandPoints[0].copy(pAncWorld);
    strandPoints[1].copy(p0World);
    strandPoints[2].copy(p1World);
    strandPoints[3].copy(p2World);
    strandPoints[4].copy(p3World);

    if (Math.abs(p - lastStrandP) > 0.0006 || lastStrandP < 0) {
        strandGeo.dispose();
        strandCurve = new THREE.CatmullRomCurve3(strandPoints, false, 'centripetal', 0.5);
        strandGeo = new THREE.TubeGeometry(strandCurve, TUBE_SEGS, S.strandR, RADIAL_SEGS, false);
        strandMesh.geometry = strandGeo;
        lastStrandP = p;
    }

    /* 5. Trailing Filament Reveal with Smooth Dynamic Peel */
    const reveal = Math.min(1.0, Math.pow(p, 0.78) * 1.15);
    const completedSegs = Math.floor(reveal * TUBE_SEGS);
    const drawCount = completedSegs * INDICES_PER_SEG;

    strandGeo.setDrawRange(0, drawCount);
    strandMesh.visible = completedSegs > 0;

    if (completedSegs > 0) {
        tipCapMesh.visible = true;
        const uTip = Math.min(1.0, completedSegs / TUBE_SEGS);
        strandCurve.getPoint(uTip, tipCapMesh.position);
    } else {
        tipCapMesh.visible = false;
    }

    /* Hero brand dispersion handled via WebGL & Curl Noise in lib/hero-dispersion.js */

    /* 6. Dynamic Robotic Studio Camera Tracking & Parallax */
    cameraSpline.getPointAt(p, _camPos);
    lookAtSpline.getPointAt(p, _lookTarget);

    _camPos.x += mouseX * (0.07 * hoverMult);
    _camPos.y += -mouseY * (0.05 * hoverMult);

    camera.position.copy(_camPos);
    camera.lookAt(_lookTarget);

    /* 7. Subtle Cinematic Banking */
    const dutchTilt = Math.sin(p * Math.PI) * -0.065;
    camera.rotation.z += dutchTilt;

    /* 8. Studio Dynamic Key Light & Photorealistic Gaussian Contact Shadow Tracking */
    const _spoolCenter = new THREE.Vector3();
    spoolPose.getWorldPosition(_spoolCenter);

    keyLightTarget.position.copy(_spoolCenter);
    keyLight.position.set(_spoolCenter.x + 1.2, _spoolCenter.y + 10.5, _spoolCenter.z + 2.2);

    // Dynamic ground shadow orientation & scale tracking
    const _cylAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(spoolPose.getWorldQuaternion(new THREE.Quaternion()));
    const shadowRotationAngle = Math.atan2(-_cylAxis.z, _cylAxis.x);
    contactShadowMesh.rotation.z = shadowRotationAngle;

    contactShadowMesh.position.x = _spoolCenter.x - 0.16;
    contactShadowMesh.position.z = _spoolCenter.z - 0.22;

    const shadowWidth = curScale * 4.9;
    const shadowHeight = curScale * 3.7;
    contactShadowMesh.scale.set(shadowWidth, shadowHeight, 1.0);
    contactShadowMat.opacity = 0.62;

    renderer.render(scene, camera);
}

// Start render loop
render();

/* ═══════════════════════════════════════════════════════════════════
   WINDOW RESIZE
   ═══════════════════════════════════════════════════════════════════ */
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    handleScroll();
});

/* ═══════════════════════════════════════════════════════════════════
   STUDIO CONTROLS INTERACTIVE ENGINE (COLOR & MATERIAL TWEAKER)
   ═══════════════════════════════════════════════════════════════════ */
window.setFilamentColor = function (hex) {
    const col = new THREE.Color(hex);
    matWoundFilament.color.copy(col);
    if (typeof matSideCoil !== 'undefined') matSideCoil.color.copy(col);
    matUnrolledStrand.color.copy(col);
    if (window.printerStudio && typeof window.printerStudio.setFilamentColor === 'function') {
        window.printerStudio.setFilamentColor(col);
    }

    const hexStr = '#' + col.getHexString().toUpperCase();
    const hexLabel = document.getElementById('active-hex-label');
    if (hexLabel) hexLabel.textContent = hexStr;

    const ind = document.getElementById('toggle-indicator');
    if (ind) ind.style.background = hexStr;
};

window.setMaterialFinish = function (type) {
    const rSlider = document.getElementById('slider-roughness');
    const cSlider = document.getElementById('slider-clearcoat');
    const sSlider = document.getElementById('slider-sheen');

    if (type === 'matte') {
        matWoundFilament.roughness = matUnrolledStrand.roughness = 0.90;
        matWoundFilament.clearcoat = matUnrolledStrand.clearcoat = 0.00;
        matWoundFilament.sheen = matUnrolledStrand.sheen = 0.00;
        matWoundFilament.metalness = matUnrolledStrand.metalness = 0.00;
        if (typeof matSideCoil !== 'undefined') {
            matSideCoil.roughness = 0.90;
            matSideCoil.clearcoat = 0.00;
            matSideCoil.sheen = 0.00;
            matSideCoil.metalness = 0.00;
        }
    } else if (type === 'silk') {
        matWoundFilament.roughness = matUnrolledStrand.roughness = 0.22;
        matWoundFilament.clearcoat = matUnrolledStrand.clearcoat = 0.70;
        matWoundFilament.sheen = matUnrolledStrand.sheen = 0.95;
        matWoundFilament.metalness = matUnrolledStrand.metalness = 0.02;
        if (typeof matSideCoil !== 'undefined') {
            matSideCoil.roughness = 0.22;
            matSideCoil.clearcoat = 0.70;
            matSideCoil.sheen = 0.95;
            matSideCoil.metalness = 0.02;
        }
    } else if (type === 'carbon') {
        matWoundFilament.roughness = matUnrolledStrand.roughness = 0.75;
        matWoundFilament.clearcoat = matUnrolledStrand.clearcoat = 0.04;
        matWoundFilament.sheen = matUnrolledStrand.sheen = 0.08;
        matWoundFilament.metalness = matUnrolledStrand.metalness = 0.12;
        if (typeof matSideCoil !== 'undefined') {
            matSideCoil.roughness = 0.75;
            matSideCoil.clearcoat = 0.04;
            matSideCoil.sheen = 0.08;
            matSideCoil.metalness = 0.12;
        }
    }

    if (rSlider) { rSlider.value = matWoundFilament.roughness; document.getElementById('val-roughness').textContent = matWoundFilament.roughness; }
    if (cSlider) { cSlider.value = matWoundFilament.clearcoat; document.getElementById('val-clearcoat').textContent = matWoundFilament.clearcoat; }
    if (sSlider) { sSlider.value = matWoundFilament.sheen; document.getElementById('val-sheen').textContent = matWoundFilament.sheen; }
};

window.toggleStudioCtrl = function (forceState) {
    const ctrl = document.getElementById('studio-ctrl');
    if (!ctrl) return;
    const isCurrentlyHidden = (ctrl.style.display === 'none' || ctrl.classList.contains('minimized'));
    const shouldShow = (typeof forceState === 'boolean') ? forceState : isCurrentlyHidden;
    if (shouldShow) {
        ctrl.style.display = 'block';
        requestAnimationFrame(() => {
            ctrl.classList.remove('minimized');
        });
    } else {
        ctrl.classList.add('minimized');
        setTimeout(() => {
            if (ctrl.classList.contains('minimized')) {
                ctrl.style.display = 'none';
            }
        }, 320);
    }
};
window.showStudioCtrl = () => window.toggleStudioCtrl(true);
window.hideStudioCtrl = () => window.toggleStudioCtrl(false);

// Developer Quick Toggle: Press Shift + C anytime to reveal/hide the tweak bar
window.addEventListener('keydown', (e) => {
    if (e.key === 'C' && e.shiftKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        window.toggleStudioCtrl();
    }
});

// Wire UI Event Listeners
document.querySelectorAll('.swatch-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const color = btn.dataset.color;
        window.setFilamentColor(color);
    });
});

const customInput = document.getElementById('custom-color-input');
if (customInput) {
    customInput.addEventListener('input', (e) => {
        document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
        window.setFilamentColor(e.target.value);
    });
}

document.querySelectorAll('.finish-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.finish-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.setMaterialFinish(btn.dataset.finish);
    });
});

const rSlider = document.getElementById('slider-roughness');
if (rSlider) {
    rSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        matWoundFilament.roughness = matSideCoil.roughness = matUnrolledStrand.roughness = val;
        document.getElementById('val-roughness').textContent = val.toFixed(2);
    });
}

const cSlider = document.getElementById('slider-clearcoat');
if (cSlider) {
    cSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        matWoundFilament.clearcoat = matSideCoil.clearcoat = matUnrolledStrand.clearcoat = val;
        document.getElementById('val-clearcoat').textContent = val.toFixed(2);
    });
}

const sSlider = document.getElementById('slider-sheen');
if (sSlider) {
    sSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        matWoundFilament.sheen = matSideCoil.sheen = matUnrolledStrand.sheen = val;
        document.getElementById('val-sheen').textContent = val.toFixed(2);
    });
}

// ═══════════════════════════════════════════════════════════════════
// 3D PLACEMENT & ORIENTATION CALIBRATOR LOGIC
// ═══════════════════════════════════════════════════════════════════
function getActiveCalibState() {
    return activeCalibFrame === 'start' ? SPOOL_CALIB_START : SPOOL_CALIB_END;
}

window.setCalibFrame = function (frame, shouldScroll = true) {
    if (frame !== 'start' && frame !== 'end') return;
    activeCalibFrame = frame;

    const btnStart = document.getElementById('btn-frame-start');
    const btnEnd = document.getElementById('btn-frame-end');
    if (btnStart) btnStart.classList.toggle('active', frame === 'start');
    if (btnEnd) btnEnd.classList.toggle('active', frame === 'end');

    if (shouldScroll) {
        if (frame === 'start') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            const runway = getHeroRunway();
            window.scrollTo({ top: runway, behavior: 'smooth' });
        }
    }

    syncCalibInputsFromState();
};

function formatSingleFrameCode(name, obj) {
    const radX = (obj.rotXDeg * Math.PI / 180).toFixed(4);
    const radY = (obj.rotYDeg * Math.PI / 180).toFixed(4);
    const radZ = (obj.rotZDeg * Math.PI / 180).toFixed(4);
    return `// 3D Filament Spool Placement & Orientation (${name === 'start' ? 'Start Frame • 0%' : 'Last Frame • 100%'})
const SPOOL_CALIBRATION = {
  posX: ${obj.posX.toFixed(2)},
  posY: ${obj.posY.toFixed(2)},
  posZ: ${obj.posZ.toFixed(2)},
  rotXDeg: ${obj.rotXDeg.toFixed(1)}, // rad: ${radX}
  rotYDeg: ${obj.rotYDeg.toFixed(1)}, // rad: ${radY}
  rotZDeg: ${obj.rotZDeg.toFixed(1)}, // rad: ${radZ}
  scale: ${obj.scale.toFixed(2)}
};`;
}

function formatBothFramesCode() {
    const radX = (obj) => (obj.rotXDeg * Math.PI / 180).toFixed(4);
    const radY = (obj) => (obj.rotYDeg * Math.PI / 180).toFixed(4);
    const radZ = (obj) => (obj.rotZDeg * Math.PI / 180).toFixed(4);

    return `// 3D Filament Spool Placement & Orientation (Both Frames)
const SPOOL_CALIBRATION = {
  start: {
    posX: ${SPOOL_CALIB_START.posX.toFixed(2)},
    posY: ${SPOOL_CALIB_START.posY.toFixed(2)},
    posZ: ${SPOOL_CALIB_START.posZ.toFixed(2)},
    rotXDeg: ${SPOOL_CALIB_START.rotXDeg.toFixed(1)}, // rad: ${radX(SPOOL_CALIB_START)}
    rotYDeg: ${SPOOL_CALIB_START.rotYDeg.toFixed(1)}, // rad: ${radY(SPOOL_CALIB_START)}
    rotZDeg: ${SPOOL_CALIB_START.rotZDeg.toFixed(1)}, // rad: ${radZ(SPOOL_CALIB_START)}
    scale: ${SPOOL_CALIB_START.scale.toFixed(2)}
  },
  end: {
    posX: ${SPOOL_CALIB_END.posX.toFixed(2)},
    posY: ${SPOOL_CALIB_END.posY.toFixed(2)},
    posZ: ${SPOOL_CALIB_END.posZ.toFixed(2)},
    rotXDeg: ${SPOOL_CALIB_END.rotXDeg.toFixed(1)}, // rad: ${radX(SPOOL_CALIB_END)}
    rotYDeg: ${SPOOL_CALIB_END.rotYDeg.toFixed(1)}, // rad: ${radY(SPOOL_CALIB_END)}
    rotZDeg: ${SPOOL_CALIB_END.rotZDeg.toFixed(1)}, // rad: ${radZ(SPOOL_CALIB_END)}
    scale: ${SPOOL_CALIB_END.scale.toFixed(2)}
  }
};`;
}

function updateCalibCodeDisplay() {
    const el = document.getElementById('calib-code-display');
    const badgeEl = document.getElementById('calib-active-frame-badge');
    const labelEl = document.getElementById('calib-code-frame-label');
    if (badgeEl) {
        badgeEl.textContent = activeCalibFrame === 'start' ? 'Editing: Start (0%)' : 'Editing: Last (100%)';
        badgeEl.style.color = activeCalibFrame === 'start' ? '#0284c7' : '#16a34a';
        badgeEl.style.background = activeCalibFrame === 'start' ? 'rgba(2,132,199,0.1)' : 'rgba(22,163,74,0.1)';
    }
    if (labelEl) {
        labelEl.textContent = activeCalibFrame === 'start' ? 'Start Frame (0%)' : 'Last Frame (100%)';
    }
    if (!el) return;
    el.textContent = formatBothFramesCode();
}

function syncCalibInputsFromState() {
    const state = getActiveCalibState();
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    setVal('calib-pos-x', state.posX);
    setVal('calib-num-pos-x', state.posX.toFixed(2));
    setVal('calib-pos-y', state.posY);
    setVal('calib-num-pos-y', state.posY.toFixed(2));
    setVal('calib-pos-z', state.posZ);
    setVal('calib-num-pos-z', state.posZ.toFixed(2));

    setVal('calib-rot-x', state.rotXDeg);
    setVal('calib-num-rot-x', state.rotXDeg.toFixed(1));
    setVal('calib-rot-y', state.rotYDeg);
    setVal('calib-num-rot-y', state.rotYDeg.toFixed(1));
    setVal('calib-rot-z', state.rotZDeg);
    setVal('calib-num-rot-z', state.rotZDeg.toFixed(1));

    setVal('calib-scale', state.scale);
    setVal('calib-num-scale', state.scale.toFixed(2));

    updateCalibCodeDisplay();
}

function onCalibSliderInput() {
    markCalibInteraction();
    const state = getActiveCalibState();
    const getVal = (id, fallback) => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) : fallback;
    };
    state.posX = getVal('calib-pos-x', state.posX);
    state.posY = getVal('calib-pos-y', state.posY);
    state.posZ = getVal('calib-pos-z', state.posZ);
    state.rotXDeg = getVal('calib-rot-x', state.rotXDeg);
    state.rotYDeg = getVal('calib-rot-y', state.rotYDeg);
    state.rotZDeg = getVal('calib-rot-z', state.rotZDeg);
    state.scale = getVal('calib-scale', state.scale);

    // Sync numeric fields
    const setNum = (id, val, dec) => {
        const el = document.getElementById(id);
        if (el) el.value = val.toFixed(dec);
    };
    setNum('calib-num-pos-x', state.posX, 2);
    setNum('calib-num-pos-y', state.posY, 2);
    setNum('calib-num-pos-z', state.posZ, 2);
    setNum('calib-num-rot-x', state.rotXDeg, 1);
    setNum('calib-num-rot-y', state.rotYDeg, 1);
    setNum('calib-num-rot-z', state.rotZDeg, 1);
    setNum('calib-num-scale', state.scale, 2);

    updateCalibCodeDisplay();
}

function onCalibNumberInput() {
    markCalibInteraction();
    const state = getActiveCalibState();
    const getVal = (id, fallback) => {
        const el = document.getElementById(id);
        const v = el ? parseFloat(el.value) : fallback;
        return isNaN(v) ? fallback : v;
    };
    state.posX = getVal('calib-num-pos-x', state.posX);
    state.posY = getVal('calib-num-pos-y', state.posY);
    state.posZ = getVal('calib-num-pos-z', state.posZ);
    state.rotXDeg = getVal('calib-num-rot-x', state.rotXDeg);
    state.rotYDeg = getVal('calib-num-rot-y', state.rotYDeg);
    state.rotZDeg = getVal('calib-num-rot-z', state.rotZDeg);
    state.scale = getVal('calib-num-scale', state.scale);

    // Sync range sliders
    const setSlider = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    setSlider('calib-pos-x', state.posX);
    setSlider('calib-pos-y', state.posY);
    setSlider('calib-pos-z', state.posZ);
    setSlider('calib-rot-x', state.rotXDeg);
    setSlider('calib-rot-y', state.rotYDeg);
    setSlider('calib-rot-z', state.rotZDeg);
    setSlider('calib-scale', state.scale);

    updateCalibCodeDisplay();
}

// Bind Calibrator Sliders and Numeric Inputs
['calib-pos-x', 'calib-pos-y', 'calib-pos-z', 'calib-rot-x', 'calib-rot-y', 'calib-rot-z', 'calib-scale'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', onCalibSliderInput);
});

['calib-num-pos-x', 'calib-num-pos-y', 'calib-num-pos-z', 'calib-num-rot-x', 'calib-num-rot-y', 'calib-num-rot-z', 'calib-num-scale'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', onCalibNumberInput);
        el.addEventListener('change', onCalibNumberInput);
    }
});

// Precision Steppers & Mouse-Wheel Controls
function stepCalibInput(id, direction, factor = 1) {
    markCalibInteraction();
    const input = document.getElementById(id);
    if (!input) return;
    const step = parseFloat(input.step) || 0.05;
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    const current = parseFloat(input.value) || 0;
    
    const delta = step * direction * factor;
    let next = current + delta;
    next = Math.min(max, Math.max(min, next));
    
    const stepDecimals = (step.toString().split('.')[1] || '').length;
    const decimals = factor < 1 ? stepDecimals + 1 : stepDecimals;
    
    input.value = next.toFixed(decimals);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

let stepperTimer = null;
let stepperInterval = null;
function clearStepperTimers() {
    if (stepperTimer) { clearTimeout(stepperTimer); stepperTimer = null; }
    if (stepperInterval) { clearInterval(stepperInterval); stepperInterval = null; }
}

document.querySelectorAll('.stepper-btn').forEach(btn => {
    const targetId = btn.dataset.target;
    const dir = parseInt(btn.dataset.dir, 10) || 1;
    
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const factor = e.shiftKey ? 0.2 : (e.ctrlKey ? 5 : 1);
        stepCalibInput(targetId, dir, factor);
        clearStepperTimers();
        stepperTimer = setTimeout(() => {
            stepperInterval = setInterval(() => {
                stepCalibInput(targetId, dir, factor);
            }, 50);
        }, 220);
    });

    btn.addEventListener('mouseup', clearStepperTimers);
    btn.addEventListener('mouseleave', clearStepperTimers);
    btn.addEventListener('touchend', clearStepperTimers);
});

// Mouse Wheel Scrolling on rows & inputs for ultra-precision calibration
document.querySelectorAll('.calib-row').forEach(row => {
    row.addEventListener('wheel', (e) => {
        e.preventDefault();
        const targetId = row.dataset.target;
        if (!targetId) return;
        const dir = e.deltaY < 0 ? 1 : -1;
        const factor = e.shiftKey ? 0.2 : (e.ctrlKey ? 5 : 1);
        stepCalibInput(targetId, dir, factor);
    }, { passive: false });
});

// Presets per active frame
window.applyFramePreset = function (presetName) {
    markCalibInteraction();
    const state = getActiveCalibState();
    if (activeCalibFrame === 'start') {
        if (presetName === 'default' || presetName === 'far-left') {
            Object.assign(state, SPOOL_CALIB_START_DEFAULT);
        } else if (presetName === 'center') {
            Object.assign(state, { posX: 0.00, posY: 0.00, posZ: 0.00, rotXDeg: -10.0, rotYDeg: 45.0, rotZDeg: 90.0, scale: 0.65 });
        } else if (presetName === 'face') {
            Object.assign(state, { posX: -1.20, posY: 0.00, posZ: 0.00, rotXDeg: 0.0, rotYDeg: 0.0, rotZDeg: 90.0, scale: 0.58 });
        }
    } else {
        if (presetName === 'default' || presetName === 'last-stage') {
            Object.assign(state, SPOOL_CALIB_END_DEFAULT);
        } else if (presetName === 'center') {
            Object.assign(state, { posX: 0.00, posY: 0.20, posZ: 1.50, rotXDeg: -10.0, rotYDeg: 50.0, rotZDeg: 85.0, scale: 1.05 });
        } else if (presetName === 'far-left') {
            Object.assign(state, { posX: -6.50, posY: 0.10, posZ: 0.80, rotXDeg: -12.0, rotYDeg: 60.0, rotZDeg: 85.0, scale: 0.90 });
        } else if (presetName === 'face') {
            Object.assign(state, { posX: -2.00, posY: 0.10, posZ: 1.00, rotXDeg: 0.0, rotYDeg: 0.0, rotZDeg: 90.0, scale: 0.80 });
        }
    }
    syncCalibInputsFromState();
};

window.copyCalibConfig = function (target = 'both') {
    const codeStr = (target === 'both') ? formatBothFramesCode() : formatSingleFrameCode(activeCalibFrame, getActiveCalibState());
    const btnId = (target === 'both') ? 'btn-copy-both' : 'btn-copy-calib';
    const defaultText = (target === 'both') ? '📋 Copy Both (Start + End)' : '📄 Copy Active';

    function onCopySuccess() {
        const btn = document.getElementById(btnId);
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✓ Copied!';
            btn.style.background = '#16a34a';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = '';
            }, 1800);
        }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeStr).then(onCopySuccess).catch(() => {
            copyFallback(codeStr);
            onCopySuccess();
        });
    } else {
        copyFallback(codeStr);
        onCopySuccess();
    }

    function copyFallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch (e) { }
        document.body.removeChild(ta);
    }
};

window.resetCalibConfig = function () {
    markCalibInteraction();
    const state = getActiveCalibState();
    if (activeCalibFrame === 'start') {
        Object.assign(state, SPOOL_CALIB_START_DEFAULT);
    } else {
        Object.assign(state, SPOOL_CALIB_END_DEFAULT);
    }
    syncCalibInputsFromState();
};

// Studio Tabs Switching
document.querySelectorAll('.studio-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.studio-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.studio-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.tab;
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
    });
});

/* ═══════════════════════════════════════════════════════════════════
   FROSTED GLASS & REEL HOVER CONTROLLER
   ═══════════════════════════════════════════════════════════════════ */
function formatGlassCode() {
    return `// Frosted Glass & Reel Hover Calibration
const GLASS_HOVER_CALIBRATION = {
  hoverIntensity: ${GLASS_HOVER_CONFIG.hoverIntensity.toFixed(1)},
  blur: ${GLASS_HOVER_CONFIG.blur.toFixed(0)},           // px
  opacity: ${GLASS_HOVER_CONFIG.opacity.toFixed(2)},      // 0.0 to 1.0
  noiseDensity: ${GLASS_HOVER_CONFIG.noiseDensity.toFixed(2)}, // grain frequency
  noiseSize: ${GLASS_HOVER_CONFIG.noiseSize.toFixed(0)},        // px
  noiseOpacity: ${GLASS_HOVER_CONFIG.noiseOpacity.toFixed(2)}  // 0.0 to 1.0
};`;
}

function updateGlassAndHover() {
    const nav = document.getElementById('liquid-glass-nav');
    if (nav) {
        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
        const bgRgba = isDark 
            ? `rgba(16, 20, 28, ${Math.max(GLASS_HOVER_CONFIG.opacity * 6, 0.45)})`
            : `rgba(255, 255, 255, ${GLASS_HOVER_CONFIG.opacity})`;
        nav.style.setProperty('--glass-bg', bgRgba);
        nav.style.setProperty('--glass-blur', `${GLASS_HOVER_CONFIG.blur}px`);
        
        // Generate SVG noise filter with custom density (baseFrequency)
        const svg = `<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${GLASS_HOVER_CONFIG.noiseDensity}' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
        const dataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        nav.style.setProperty('--glass-noise-url', dataUrl);
        nav.style.setProperty('--glass-noise-size', `${GLASS_HOVER_CONFIG.noiseSize}px`);
        nav.style.setProperty('--glass-noise-opacity', isDark ? (GLASS_HOVER_CONFIG.noiseOpacity * 0.75).toFixed(2) : GLASS_HOVER_CONFIG.noiseOpacity);
    }

    const codeDisplay = document.getElementById('glass-code-display');
    if (codeDisplay) {
        codeDisplay.textContent = formatGlassCode();
    }
}

function onGlassInput() {
    markCalibInteraction();
    const getVal = (id, fallback) => {
        const el = document.getElementById(id);
        const v = el ? parseFloat(el.value) : fallback;
        return isNaN(v) ? fallback : v;
    };
    GLASS_HOVER_CONFIG.hoverIntensity = getVal('glass-num-hover', GLASS_HOVER_CONFIG.hoverIntensity);
    GLASS_HOVER_CONFIG.blur = getVal('glass-num-blur', GLASS_HOVER_CONFIG.blur);
    GLASS_HOVER_CONFIG.opacity = getVal('glass-num-opacity', GLASS_HOVER_CONFIG.opacity);
    GLASS_HOVER_CONFIG.noiseDensity = getVal('glass-num-noise-density', GLASS_HOVER_CONFIG.noiseDensity);
    GLASS_HOVER_CONFIG.noiseSize = getVal('glass-num-noise-size', GLASS_HOVER_CONFIG.noiseSize);
    GLASS_HOVER_CONFIG.noiseOpacity = getVal('glass-num-noise-opacity', GLASS_HOVER_CONFIG.noiseOpacity);

    // Sync sliders
    const setSlider = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    setSlider('glass-hover', GLASS_HOVER_CONFIG.hoverIntensity);
    setSlider('glass-blur', GLASS_HOVER_CONFIG.blur);
    setSlider('glass-opacity', GLASS_HOVER_CONFIG.opacity);
    setSlider('glass-noise-density', GLASS_HOVER_CONFIG.noiseDensity);
    setSlider('glass-noise-size', GLASS_HOVER_CONFIG.noiseSize);
    setSlider('glass-noise-opacity', GLASS_HOVER_CONFIG.noiseOpacity);

    updateGlassAndHover();
}

function onGlassSliderInput(e) {
    markCalibInteraction();
    const id = e.target.id;
    const val = parseFloat(e.target.value);
    const numId = id.replace('glass-', 'glass-num-');
    const numEl = document.getElementById(numId);
    if (numEl) numEl.value = val;

    if (id === 'glass-hover') GLASS_HOVER_CONFIG.hoverIntensity = val;
    else if (id === 'glass-blur') GLASS_HOVER_CONFIG.blur = val;
    else if (id === 'glass-opacity') GLASS_HOVER_CONFIG.opacity = val;
    else if (id === 'glass-noise-density') GLASS_HOVER_CONFIG.noiseDensity = val;
    else if (id === 'glass-noise-size') GLASS_HOVER_CONFIG.noiseSize = val;
    else if (id === 'glass-noise-opacity') GLASS_HOVER_CONFIG.noiseOpacity = val;

    updateGlassAndHover();
}

['glass-hover', 'glass-blur', 'glass-opacity', 'glass-noise-density', 'glass-noise-size', 'glass-noise-opacity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', onGlassSliderInput);
});

['glass-num-hover', 'glass-num-blur', 'glass-num-opacity', 'glass-num-noise-density', 'glass-num-noise-size', 'glass-num-noise-opacity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', onGlassInput);
        el.addEventListener('change', onGlassInput);
    }
});

window.copyGlassConfig = function () {
    const codeStr = formatGlassCode();
    const btn = document.getElementById('btn-copy-glass');
    function onCopySuccess() {
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✓ Copied!';
            btn.style.background = '#16a34a';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = '';
            }, 1800);
        }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeStr).then(onCopySuccess).catch(() => {
            copyFallback(codeStr);
            onCopySuccess();
        });
    } else {
        copyFallback(codeStr);
        onCopySuccess();
    }

    function copyFallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch (e) { }
        document.body.removeChild(ta);
    }
};

/* ═══════════════════════════════════════════════════════════════════
   DARK / LIGHT THEME CONTROLLER
   ═══════════════════════════════════════════════════════════════════ */
window.applyTheme = function (isDark, persist = true) {
    if (persist) {
        try {
            localStorage.setItem('stan_theme', isDark ? 'dark' : 'light');
        } catch (e) {}
    }

    if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark-mode');
    } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark-mode');
    }

    // Toggle icons in navbar button
    const moonIcon = document.querySelector('.theme-icon-moon');
    const sunIcon = document.querySelector('.theme-icon-sun');
    if (moonIcon && sunIcon) {
        moonIcon.style.display = isDark ? 'none' : 'flex';
        sunIcon.style.display = isDark ? 'flex' : 'none';
    }

    // Three.js scene background, lighting, & shadow adjustments
    if (typeof scene !== 'undefined' && scene) {
        const bgHex = isDark ? 0x070708 : 0xffffff;
        scene.background.setHex(bgHex);
        if (typeof renderer !== 'undefined' && renderer) {
            renderer.setClearColor(bgHex, 1);
        }
    }
    if (typeof ambientLight !== 'undefined' && ambientLight) {
        ambientLight.intensity = isDark ? 0.28 : 0.45;
    }
    if (typeof rimLight !== 'undefined' && rimLight) {
        rimLight.intensity = isDark ? 3.0 : 1.40;
    }
    if (typeof contactShadowMat !== 'undefined' && contactShadowMat) {
        contactShadowMat.opacity = isDark ? 0.78 : 0.58;
    }

    // Update frosted glass background dynamic variables
    updateGlassAndHover();

    // Update WebGL Hero Dispersion theme
    if (window.HeroDispersion && typeof window.HeroDispersion.setTheme === 'function') {
        window.HeroDispersion.setTheme(isDark);
    }

    // Update Bambu Lab A1 Mini Studio theme
    if (window.printerStudio && typeof window.printerStudio.setTheme === 'function') {
        window.printerStudio.setTheme(isDark);
    }
};

window.toggleTheme = function () {
    const isCurrentlyDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
    window.applyTheme(!isCurrentlyDark, true);
};

// Initial Theme Detection and Application
const savedTheme = (function () {
    try {
        const t = localStorage.getItem('stan_theme');
        if (t === 'dark' || t === 'light') return t === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
        return false;
    }
})();
window.applyTheme(savedTheme, false);

// Initial Code Readout Render
syncCalibInputsFromState();

// Initialize WebGL Frosted Glass & 3D Curl-Noise Hero Dispersion
if (window.HeroDispersion && typeof window.HeroDispersion.init === 'function') {
    window.HeroDispersion.init({
        canvasId: 'hero-dispersion-canvas',
        heroId: 'hero-brand'
    });
}

// ═══════════════════════════════════════════════════════════════════
// BAMBU LAB A1 MINI PRINTER STUDIO CONTROLLER & LIVE CALIBRATION UI
// ═══════════════════════════════════════════════════════════════════
function initBambuPrinter() {
    const pCanvas = document.getElementById('printer-canvas');
    if (!pCanvas || typeof BambuPrinterStudio === 'undefined') return;

    const hudX = document.getElementById('hud-x');
    const hudY = document.getElementById('hud-y');
    const hudZ = document.getElementById('hud-z');
    const hudLayer = document.getElementById('hud-layer');
    const hudMode = document.getElementById('hud-mode');
    const codeReadout = document.getElementById('printer-code-readout');
    const loaderOverlay = document.getElementById('printer-loader-overlay');
    const loaderText = document.getElementById('printer-loader-text');

    // Local file:// protocol CORS warning
    if (window.location.protocol === 'file:' && loaderText) {
        loaderText.innerHTML = '⚠️ <strong style="color:#ef4444;">Local File Notice:</strong> Browsers block 3D GLB model fetch via <code>file://</code>.<br>Please open via <a href="http://localhost:3847" style="color:#38bdf8; text-decoration:underline; font-weight:700;">http://localhost:3847</a> (Python dev server active).';
    }

    const studio = new BambuPrinterStudio('printer-canvas', {
        modelPath: 'bambu_a1_mini_standard.glb',
        posX: 0.0,
        posY: -1.2,
        posZ: 0.0,
        rotX: 0.0,
        rotY: -28.0,
        rotZ: 0.0,
        scale: 4.8,
        armX: 0.0,
        armY: 0.0,
        armZ: 0.0,
        speed: 1.8,
        onTelemetry: (t) => {
            if (hudX) hudX.textContent = `${t.xMm.toFixed(1)} mm`;
            if (hudY) hudY.textContent = `${t.yMm.toFixed(1)} mm`;
            if (hudZ) hudZ.textContent = `${t.zMm.toFixed(2)} mm`;
            if (hudLayer) hudLayer.textContent = `${t.layer} / 50`;
            if (hudMode) hudMode.textContent = t.mode;
        },
        onProgress: (pct) => {
            if (loaderText && window.location.protocol !== 'file:') {
                loaderText.textContent = `Loading Bambu Lab A1 Mini Studio... ${pct}%`;
            }
        },
        onLoaded: () => {
            if (loaderOverlay) {
                loaderOverlay.style.opacity = '0';
                loaderOverlay.style.pointerEvents = 'none';
                setTimeout(() => { if (loaderOverlay.parentNode) loaderOverlay.parentNode.removeChild(loaderOverlay); }, 450);
            }
            syncPrinterUIFromState();
        }
    });

    window.printerStudio = studio;

    function syncPrinterUIFromState() {
        if (!window.printerStudio) return;
        const cfg = window.printerStudio.getConfig();

        const syncField = (sliderId, numId, val) => {
            const s = document.getElementById(sliderId);
            const n = document.getElementById(numId);
            if (s) s.value = val;
            if (n) n.value = val;
        };

        const pX = (cfg && cfg.posX !== undefined) ? cfg.posX : 0;
        const pY = (cfg && cfg.posY !== undefined) ? cfg.posY : -1.2;
        const pZ = (cfg && cfg.posZ !== undefined) ? cfg.posZ : 0;
        const rX = (cfg && cfg.rotX !== undefined) ? cfg.rotX : 0;
        const rY = (cfg && cfg.rotY !== undefined) ? cfg.rotY : -28;
        const rZ = (cfg && cfg.rotZ !== undefined) ? cfg.rotZ : 0;
        const sc = (cfg && cfg.scale !== undefined) ? cfg.scale : 4.8;
        const aX = (cfg && cfg.armX !== undefined) ? cfg.armX : 0;
        const aY = (cfg && cfg.armY !== undefined) ? cfg.armY : 0;
        const aZ = (cfg && cfg.armZ !== undefined) ? cfg.armZ : 0;
        const spd = (cfg && cfg.speed !== undefined) ? cfg.speed : 1.8;

        const lim = (cfg && cfg.axisLimits) ? cfg.axisLimits : {
            xStart: 14.0, xEnd: 90.0,
            yStart: 35.0, yEnd: 100.0,
            zStart: -10.0, zEnd: 70.0
        };
        const mp = (cfg && cfg.motorPct) ? cfg.motorPct : { x: 50, y: 50, z: 20 };

        syncField('p-pos-x', 'p-num-pos-x', pX);
        syncField('p-pos-y', 'p-num-pos-y', pY);
        syncField('p-pos-z', 'p-num-pos-z', pZ);
        syncField('p-rot-x', 'p-num-rot-x', rX);
        syncField('p-rot-y', 'p-num-rot-y', rY);
        syncField('p-rot-z', 'p-num-rot-z', rZ);
        syncField('p-scale', 'p-num-scale', sc);

        // Motor Axis Travel Limits
        syncField('p-x-start', 'p-num-x-start', lim.xStart);
        syncField('p-x-end', 'p-num-x-end', lim.xEnd);
        syncField('p-y-start', 'p-num-y-start', lim.yStart);
        syncField('p-y-end', 'p-num-y-end', lim.yEnd);
        syncField('p-z-start', 'p-num-z-start', lim.zStart);
        syncField('p-z-end', 'p-num-z-end', lim.zEnd);

        // Manual Motor Test Percentages
        syncField('p-motor-x', 'p-num-motor-x', mp.x);
        syncField('p-motor-y', 'p-num-motor-y', mp.y);
        syncField('p-motor-z', 'p-num-motor-z', mp.z);

        // Gantry Arm Position Offset Trim
        syncField('p-arm-x', 'p-num-arm-x', aX);
        syncField('p-arm-y', 'p-num-arm-y', aY);
        syncField('p-arm-z', 'p-num-arm-z', aZ);

        if (codeReadout) {
            codeReadout.textContent = `// Bambu Lab A1 Mini Studio Calibration
const BAMBU_PRINTER_CONFIG = {
  stage: {
    posX: ${pX.toFixed(2)},
    posY: ${pY.toFixed(2)},
    posZ: ${pZ.toFixed(2)},
    rotXDeg: ${rX.toFixed(1)},
    rotYDeg: ${rY.toFixed(1)},
    rotZDeg: ${rZ.toFixed(1)},
    scale: ${sc.toFixed(2)}
  },
  axisLimits: {
    xStart: ${lim.xStart.toFixed(1)},
    xEnd: ${lim.xEnd.toFixed(1)},
    yStart: ${lim.yStart.toFixed(1)},
    yEnd: ${lim.yEnd.toFixed(1)},
    zStart: ${lim.zStart.toFixed(1)},
    zEnd: ${lim.zEnd.toFixed(1)}
  },
  speed: ${spd.toFixed(2)}
};`;
        }
    }

    const bindControl = (sliderId, numId, updateFn) => {
        const slider = document.getElementById(sliderId);
        const num = document.getElementById(numId);

        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (num) num.value = val;
                updateFn(val);
                syncPrinterUIFromState();
            });
        }
        if (num) {
            num.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                    if (slider) slider.value = val;
                    updateFn(val);
                    syncPrinterUIFromState();
                }
            });
        }
    };

    // Stage bindings
    bindControl('p-pos-x', 'p-num-pos-x', (v) => studio.setPosition(v, undefined, undefined));
    bindControl('p-pos-y', 'p-num-pos-y', (v) => studio.setPosition(undefined, v, undefined));
    bindControl('p-pos-z', 'p-num-pos-z', (v) => studio.setPosition(undefined, undefined, v));

    bindControl('p-rot-x', 'p-num-rot-x', (v) => studio.setRotation(v, undefined, undefined));
    bindControl('p-rot-y', 'p-num-rot-y', (v) => studio.setRotation(undefined, v, undefined));
    bindControl('p-rot-z', 'p-num-rot-z', (v) => studio.setRotation(undefined, undefined, v));

    bindControl('p-scale', 'p-num-scale', (v) => studio.setScale(v));

    // Axis Limits bindings (Calibrate Start & End Points for each axis with live visual positioning)
    const onAxisLimitChange = (axis, isStart, val) => {
        if (studio.isPrinting) {
            studio.isPrinting = false; // Pause automatically so user can inspect manual motor calibration
            if (pauseBtn) {
                pauseBtn.textContent = '▶ Resume';
                pauseBtn.style.color = '#16a34a';
            }
        }
        if (axis === 'x') {
            studio.setAxisLimits(isStart ? { xStart: val } : { xEnd: val });
            studio.setManualMotorPercent(isStart ? 0 : 100, undefined, undefined);
        } else if (axis === 'y') {
            studio.setAxisLimits(isStart ? { yStart: val } : { yEnd: val });
            studio.setManualMotorPercent(undefined, isStart ? 0 : 100, undefined);
        } else if (axis === 'z') {
            studio.setAxisLimits(isStart ? { zStart: val } : { zEnd: val });
            studio.setManualMotorPercent(undefined, undefined, isStart ? 0 : 100);
        }
    };

    bindControl('p-x-start', 'p-num-x-start', (v) => onAxisLimitChange('x', true, v));
    bindControl('p-x-end', 'p-num-x-end', (v) => onAxisLimitChange('x', false, v));
    bindControl('p-y-start', 'p-num-y-start', (v) => onAxisLimitChange('y', true, v));
    bindControl('p-y-end', 'p-num-y-end', (v) => onAxisLimitChange('y', false, v));
    bindControl('p-z-start', 'p-num-z-start', (v) => onAxisLimitChange('z', true, v));
    bindControl('p-z-end', 'p-num-z-end', (v) => onAxisLimitChange('z', false, v));

    // Manual Motor Test bindings (0% Start → 100% End)
    const onMotorTest = (axis, val) => {
        if (studio.isPrinting) {
            studio.isPrinting = false; // Pause automatically so user can inspect manual motor calibration
            if (pauseBtn) {
                pauseBtn.textContent = '▶ Resume';
                pauseBtn.style.color = '#16a34a';
            }
        }
        if (axis === 'x') studio.setManualMotorPercent(val, undefined, undefined);
        if (axis === 'y') studio.setManualMotorPercent(undefined, val, undefined);
        if (axis === 'z') studio.setManualMotorPercent(undefined, undefined, val);
    };

    bindControl('p-motor-x', 'p-num-motor-x', (v) => onMotorTest('x', v));
    bindControl('p-motor-y', 'p-num-motor-y', (v) => onMotorTest('y', v));
    bindControl('p-motor-z', 'p-num-motor-z', (v) => onMotorTest('z', v));

    // Gantry Arm offset bindings
    bindControl('p-arm-x', 'p-num-arm-x', (v) => studio.setArmPosition(v, undefined, undefined));
    bindControl('p-arm-y', 'p-num-arm-y', (v) => studio.setArmPosition(undefined, v, undefined));
    bindControl('p-arm-z', 'p-num-arm-z', (v) => studio.setArmPosition(undefined, undefined, v));

    const btnResetCam = document.getElementById('btn-reset-printer-cam');
    if (btnResetCam) {
        btnResetCam.addEventListener('click', () => studio.resetView());
    }

    const btnResetTrans = document.getElementById('btn-reset-printer-transform');
    if (btnResetTrans) {
        btnResetTrans.addEventListener('click', () => {
            studio.resetTransform();
            syncPrinterUIFromState();
        });
    }

    document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.speed-btn[data-speed]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const spd = parseFloat(btn.dataset.speed);
            studio.setSpeed(spd);
            syncPrinterUIFromState();
        });
    });

    const pauseBtn = document.getElementById('btn-printer-pause');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            const isPrinting = studio.toggleAnimation();
            pauseBtn.textContent = isPrinting ? '⏸ Pause' : '▶ Resume';
            pauseBtn.style.color = isPrinting ? '#ef4444' : '#16a34a';
        });
    }

    window.copyPrinterConfig = function () {
        if (!studio) return;
        const cfg = studio.getConfig();
        const lim = cfg.axisLimits || {};
        const codeStr = `// Bambu Lab A1 Mini Studio Calibration
const BAMBU_PRINTER_CONFIG = {
  stage: {
    posX: ${cfg.posX.toFixed(2)},
    posY: ${cfg.posY.toFixed(2)},
    posZ: ${cfg.posZ.toFixed(2)},
    rotXDeg: ${cfg.rotX.toFixed(1)},
    rotYDeg: ${cfg.rotY.toFixed(1)},
    rotZDeg: ${cfg.rotZ.toFixed(1)},
    scale: ${cfg.scale.toFixed(2)}
  },
  axisLimits: {
    xStart: ${(lim.xStart ?? 14.0).toFixed(1)},
    xEnd: ${(lim.xEnd ?? 90.0).toFixed(1)},
    yStart: ${(lim.yStart ?? 35.0).toFixed(1)},
    yEnd: ${(lim.yEnd ?? 100.0).toFixed(1)},
    zStart: ${(lim.zStart ?? -10.0).toFixed(1)},
    zEnd: ${(lim.zEnd ?? 70.0).toFixed(1)}
  },
  speed: ${cfg.speed.toFixed(2)}
};`;

        const btn = document.getElementById('btn-copy-printer-config');
        function onCopySuccess() {
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '✓ Copied!';
                btn.style.background = '#16a34a';
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.style.background = '';
                }, 1800);
            }
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(codeStr).then(onCopySuccess).catch(() => {
                copyFallback(codeStr);
                onCopySuccess();
            });
        } else {
            copyFallback(codeStr);
            onCopySuccess();
        }

        function copyFallback(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try { document.execCommand('copy'); } catch (e) { }
            document.body.removeChild(ta);
        }
    };

    const copyBtn = document.getElementById('btn-copy-printer-config');
    if (copyBtn) {
        copyBtn.addEventListener('click', window.copyPrinterConfig);
    }

    // High-Tech Action Dock Buttons (LiDAR, Thermal IR, Stepper Audio)
    const btnLidar = document.getElementById('btn-dock-lidar');
    const btnThermal = document.getElementById('btn-dock-thermal');
    const btnAudio = document.getElementById('btn-dock-audio');
    const hudVisionLabel = document.getElementById('hud-vision-label');
    const hudVisionVal = document.getElementById('hud-vision-value');

    if (btnLidar) {
        btnLidar.addEventListener('click', () => {
            const active = studio.toggleLidar();
            btnLidar.classList.toggle('active', active);
            if (hudVisionLabel && hudVisionVal && !studio.isThermalActive) {
                hudVisionLabel.textContent = 'LIDAR BED MESH';
                hudVisionVal.textContent = active ? 'SCANNING ±0.012mm' : 'OFFLINE';
                hudVisionVal.style.color = active ? '#06b6d4' : '#64748b';
            }
        });
    }

    if (btnThermal) {
        btnThermal.addEventListener('click', () => {
            const active = studio.toggleThermal();
            btnThermal.classList.toggle('active-thermal', active);
            if (hudVisionLabel && hudVisionVal) {
                if (active) {
                    hudVisionLabel.textContent = 'FLIR THERMAL';
                    hudVisionVal.textContent = 'SPOT: 215.4 °C';
                    hudVisionVal.style.color = '#f97316';
                } else {
                    hudVisionLabel.textContent = 'LIDAR BED MESH';
                    hudVisionVal.textContent = studio.isLidarActive ? 'SCANNING ±0.012mm' : 'OFFLINE';
                    hudVisionVal.style.color = studio.isLidarActive ? '#06b6d4' : '#64748b';
                }
            }
        });
    }

    if (btnAudio) {
        btnAudio.addEventListener('click', () => {
            const active = studio.toggleAudio();
            btnAudio.classList.toggle('active-audio', active);
            const icon = document.getElementById('dock-audio-icon');
            const text = document.getElementById('dock-audio-text');
            if (icon) icon.textContent = active ? '🔊' : '🔈';
            if (text) text.textContent = active ? 'Motor Singing' : 'Motor Audio';
        });
    }

    syncPrinterUIFromState();
}

initBambuPrinter();


    /* ─── Wrapper epilogue (no physics touched): unmount guard for React ─── */
    let __stopped = false;
    const __originalRender = render;
    render = function guardedRender() {
        if (__stopped) return;
        return __originalRender.apply(this, arguments);
    };
    return function cleanupRepoHeroStage() {
        __stopped = true;
    };
}
