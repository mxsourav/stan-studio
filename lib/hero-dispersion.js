/**
 * STΔN Studio — Awwwards-Grade WebGL Frosted-Glass & 3D Curl-Noise Particle Dispersion
 * Module: lib/hero-dispersion.js
 * 
 * Features:
 * 1. Dual-Layer DOM-to-WebGL High-DPI Pixel Sampling (35,000 - 60,000 micro-particles)
 * 2. Stage 1 (0% -> 25% scroll): Frosted Glass Silica Refraction & RGB Chromatic Edge Fracture
 * 3. Stage 2 (15% -> 100% scroll): GPU 3D Curl-Noise Advection with Directional Stagger (Bottom-Up Wave)
 * 4. Simulated Depth-of-Field Bokeh & High-Frequency Silica Grain Shimmer
 * 5. Signature #FF2A2A Crimson Emissive Bloom with 1.45x turbulence for the '.' period
 * 6. Smooth Spring-Damped Scroll Binding (Reversible Physics at 60fps)
 */

;(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['three'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('three'));
    } else {
        root.HeroDispersion = factory(root.THREE);
    }
})(typeof self !== 'undefined' ? self : this, function (THREE) {
    'use strict';

    if (!THREE) {
        console.error('[HeroDispersion] Three.js is required but not loaded.');
        return { init: function () {} };
    }

    // --- GLSL Shaders ---
    const VERTEX_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uScrollVelocity;
        uniform float uPixelRatio;
        uniform vec2 uViewport;
        uniform float uIsDark;

        attribute vec4 aRandom;   // (staggerSeed, curlSpeed, thermalSeed, depthSeed)
        attribute float aGrain;    // silica dither noise
        attribute float aNormY;    // normalized vertical position in hero lockup (0 = button, 1 = STAN top)
        attribute float aType;     // 0 = text, 1 = red dot, 2 = button

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vGrain;
        varying float vDispProgress;
        varying float vDepth;
        varying float vType;
        varying float vChromatic;

        // ══════════════════════════════════════════════════════════════
        // 3D SIMPLEX NOISE (Ian McEwan, Ashima Arts)
        // ══════════════════════════════════════════════════════════════
        vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + 1.0 * C.xxx;
            vec3 x2 = x0 - i2 + 2.0 * C.xxx;
            vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

            i = mod(i, 289.0);
            vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0) * 2.0 + 1.0;
            vec4 s1 = floor(b1) * 2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }

        // ══════════════════════════════════════════════════════════════
        // 3D CURL NOISE (Divergence-free fluid vector field)
        // ══════════════════════════════════════════════════════════════
        vec3 snoiseVec3(vec3 x) {
            float s  = snoise(vec3(x));
            float s1 = snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2));
            float s2 = snoise(vec3(x.z + 74.2, x.x - 12.5, x.y + 91.1));
            return vec3(s, s1, s2);
        }

        vec3 curlNoise(vec3 p) {
            const float e = 0.05;
            vec3 dx = vec3(e, 0.0, 0.0);
            vec3 dy = vec3(0.0, e, 0.0);
            vec3 dz = vec3(0.0, 0.0, e);

            vec3 p_x0 = snoiseVec3(p - dx);
            vec3 p_x1 = snoiseVec3(p + dx);
            vec3 p_y0 = snoiseVec3(p - dy);
            vec3 p_y1 = snoiseVec3(p + dy);
            vec3 p_z0 = snoiseVec3(p - dz);
            vec3 p_z1 = snoiseVec3(p + dz);

            float x = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
            float y = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
            float z = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);

            return normalize(vec3(x, y, z) / (2.0 * e));
        }

        void main() {
            vColor = color;
            vRandom = aRandom;
            vGrain = aGrain;
            vType = aType;

            // ══════════════════════════════════════════════════════════════
            // DIRECTIONAL STAGGER (Bottom-Up Erosion Wave)
            // ══════════════════════════════════════════════════════════════
            // Button & bottom of studio shatter first, sweeping up to STAN
            float diagonalSweep = (position.x) * 0.0006;
            float staggerThreshold = (aNormY * 0.65) + (aRandom.x * 0.16) + diagonalSweep;
            
            // As uScrollProgress advances, dispersion sweeps upward
            float effectiveProgress = uScrollProgress * 1.58;
            float disp = smoothstep(staggerThreshold, staggerThreshold + 0.32, effectiveProgress);
            vDispProgress = disp;

            // ══════════════════════════════════════════════════════════════
            // STAGE 1: FROSTED GLASS REFRACTION & CHROMATIC FRACTURE (0% -> 25%)
            // ══════════════════════════════════════════════════════════════
            float refractPhase = smoothstep(0.002, 0.22, uScrollProgress) * (1.0 - smoothstep(0.18, 0.50, uScrollProgress));
            float silicaNoiseX = snoise(position * 0.075 + vec3(0.0, 0.0, uTime * 0.7));
            float silicaNoiseY = snoise(position * 0.075 + vec3(43.1, 19.7, uTime * 0.7));
            vec3 silicaRefraction = vec3(silicaNoiseX, silicaNoiseY, silicaNoiseX * 0.4) * (refractPhase * 6.5 * (0.5 + aGrain * 0.9));
            
            // Chromatic aberration scalar passed to fragment shader
            vChromatic = refractPhase * (0.45 + 0.55 * aGrain);

            // ══════════════════════════════════════════════════════════════
            // STAGE 2: 3D CURL-NOISE ADVECTION (15% -> 100%)
            // ══════════════════════════════════════════════════════════════
            vec3 curlCoord1 = position * 0.0035 + vec3(0.0, uTime * 0.12, 0.0);
            vec3 c1 = curlNoise(curlCoord1);
            vec3 curlCoord2 = position * 0.0080 + vec3(31.4, -uTime * 0.16, 17.2);
            vec3 c2 = curlNoise(curlCoord2);
            vec3 advectionVector = c1 * 0.72 + c2 * 0.28;

            // Signature red dot accent: 1.45x higher turbulence
            float turbulenceMult = (aType > 0.5 && aType < 1.5) ? 1.45 : 1.0;
            advectionVector *= turbulenceMult;

            // Scroll velocity dynamic kick
            float velocityBoost = 1.0 + clamp(abs(uScrollVelocity) * 0.035, 0.0, 2.8);

            // Upward thermal lift
            float thermalLift = (95.0 + aRandom.y * 75.0) * disp * (aType > 0.5 && aType < 1.5 ? 1.35 : 1.0);

            // 3D Depth Scatter (Z-axis bokeh depth)
            float depthScatter = (aRandom.w - 0.45) * 420.0 * disp;
            vDepth = depthScatter;

            // Full travel distance along curl vector
            float travelDistance = (280.0 + aRandom.z * 190.0) * disp * velocityBoost;

            vec3 worldDisp = position + silicaRefraction + (advectionVector * travelDistance);
            worldDisp.y += thermalLift;
            worldDisp.z += depthScatter;

            // ══════════════════════════════════════════════════════════════
            // DEPTH-OF-FIELD BOKEH POINT SIZING
            // ══════════════════════════════════════════════════════════════
            float basePtSize = (aType > 0.5 && aType < 1.5 ? 4.5 : 3.0) * uPixelRatio;
            // Particles rushing toward the camera expand into soft bokeh circles
            float bokehFactor = 1.0 + clamp(abs(depthScatter) * 0.0042, 0.0, 2.5);
            // Fine frost dust expansion as particles disperse
            float frostExpansion = 1.0 + disp * 1.6;

            gl_PointSize = basePtSize * bokehFactor * frostExpansion;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(worldDisp, 1.0);
        }
    `;

    const FRAGMENT_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uIsDark;

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vGrain;
        varying float vDispProgress;
        varying float vDepth;
        varying float vType;
        varying float vChromatic;

        void main() {
            // Soft circular / refractive micro-shard shape
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            // Depth-of-Field Bokeh softness: soft gaussian edge
            float edgeSharpness = clamp(0.5 - abs(vDepth) * 0.0012, 0.08, 0.45);
            float shapeAlpha = smoothstep(0.5, edgeSharpness, dist);

            // High-frequency silica noise grain
            float grain = fract(sin(dot(gl_PointCoord * 14.0 + vec2(vRandom.x * 37.0, uTime * 2.5), vec2(12.9898, 78.233))) * 43758.5453);
            
            // Specular alpha flickering (illuminated frosted glass shards)
            float sparkle = 0.70 + 0.55 * sin(uTime * 9.0 + vRandom.y * 62.83 + vGrain * 12.56);

            vec3 baseCol = vColor.rgb;
            
            // Stage 1 Chromatic Aberration Edge Shift
            if (vChromatic > 0.01) {
                vec2 noiseDir = normalize(coord + vec2(0.001));
                baseCol.r += vChromatic * 0.38 * max(0.0, noiseDir.x);
                baseCol.b += vChromatic * 0.42 * max(0.0, -noiseDir.x);
            }

            // Signature Red Period Accent (Intense #FF2A2A crimson bloom)
            if (vType > 0.5 && vType < 1.5) {
                vec3 redBloom = vec3(1.0, 0.165, 0.165);
                baseCol = redBloom * (1.15 + 0.65 * sparkle);
                float emberFade = smoothstep(1.0, 0.65, vDispProgress);
                float alpha = shapeAlpha * vColor.a * (0.88 + 0.28 * sparkle) * emberFade;
                gl_FragColor = vec4(baseCol, alpha);
                return;
            }

            // Normal typography and button particles: Frosted Silica Glass
            vec3 frostedCol = baseCol;
            if (uIsDark > 0.5) {
                // Dark mode: pure white silica crystal frost with soft ice specular highlights
                frostedCol = mix(frostedCol, vec3(0.94, 0.97, 1.0), vDispProgress * 0.45);
                frostedCol += vec3(0.20, 0.24, 0.28) * sparkle * (0.3 + 0.7 * vGrain);
            } else {
                // Light mode: deep graphite / quartz crystal
                frostedCol = mix(frostedCol, vec3(0.12, 0.14, 0.18), vDispProgress * 0.4);
            }

            // Particle Alpha:
            // When resting (vDispProgress == 0), alpha is 1.0 (exact match to DOM text).
            // As it disperses, it sparkles like frosted glass, then gently dissolves into the void.
            float fadeOut = smoothstep(1.0, 0.72, vDispProgress);
            float alpha = shapeAlpha * vColor.a * (0.80 + 0.40 * sparkle) * fadeOut;

            gl_FragColor = vec4(frostedCol, alpha);
        }
    `;

    // --- Singleton Controller ---
    let state = {
        canvas: null,
        heroBrand: null,
        displacementMap: null,
        renderer: null,
        scene: null,
        camera: null,
        particlesMesh: null,
        material: null,
        geometry: null,
        isInitialized: false,
        isDark: false,
        dpr: 1,
        width: 0,
        height: 0,
        
        // Physics & Scroll Binding
        targetProgress: 0,
        currentProgress: 0,
        lastTargetProgress: 0,
        scrollVelocity: 0,
        dampedVelocity: 0,
        lerpFactor: 0.075,
        rafId: null,
        clock: new THREE.Clock(),
        resizeObserver: null,
    };

    /**
     * Samples the exact DOM typography and button onto an offscreen canvas
     * and constructs the 35,000 - 60,000 particle buffer attributes.
     */
    function sampleHeroParticles() {
        if (!state.heroBrand) return;

        const stanEl = state.heroBrand.querySelector('.hero-stan');
        const studioEl = state.heroBrand.querySelector('.hero-studio');
        const dotEl = state.heroBrand.querySelector('.crimson-dot');
        const cueEl = state.heroBrand.querySelector('.hero-scroll-cue');

        if (!stanEl || !studioEl || !cueEl) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.dpr = dpr;

        const hbRect = state.heroBrand.getBoundingClientRect();
        if (hbRect.width <= 0 || hbRect.height <= 0) return;

        const pad = 12;
        const width = Math.ceil(hbRect.width + pad * 2);
        const height = Math.ceil(hbRect.height + pad * 2);

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.ceil(width * dpr);
        offscreen.height = Math.ceil(height * dpr);
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        ctx.scale(dpr, dpr);

        const stanRect = stanEl.getBoundingClientRect();
        const studioRect = studioEl.getBoundingClientRect();
        const dotRect = dotEl ? dotEl.getBoundingClientRect() : null;
        const cueRect = cueEl.getBoundingClientRect();

        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
        state.isDark = isDark;

        const textCol = isDark ? '#ffffff' : '#000000';
        const cueBgCol = isDark ? '#ffffff' : '#181a1e';
        const cueIconCol = isDark ? '#0b0d11' : '#ffffff';

        // 1. Draw STAN
        ctx.fillStyle = textCol;
        ctx.font = '800 92px "Antapani", -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const stanRelX = (stanRect.left + stanRect.width / 2) - hbRect.left + pad;
        const stanRelY = stanRect.top - hbRect.top + pad;
        ctx.fillText('STΔN', stanRelX, stanRelY);

        // 2. Draw studio
        ctx.font = '800 42px "Antapani", -apple-system, sans-serif';
        ctx.textAlign = 'left';
        const studioRelX = studioRect.left - hbRect.left + pad;
        const studioRelY = studioRect.top - hbRect.top + pad;
        ctx.fillText('studio', studioRelX, studioRelY);

        // 3. Draw signature red period '.' with exact #FF2A2A
        if (dotRect) {
            ctx.fillStyle = '#FF2A2A';
            const dotRelX = dotRect.left - hbRect.left + pad;
            const dotRelY = dotRect.top - hbRect.top + pad;
            ctx.fillText('.', dotRelX, dotRelY);
        }

        // 4. Draw circular scroll cue button
        const cueRelX = cueRect.left - hbRect.left + pad;
        const cueRelY = cueRect.top - hbRect.top + pad;
        const cueCx = cueRelX + cueRect.width / 2;
        const cueCy = cueRelY + cueRect.height / 2;
        const cueR = cueRect.width / 2;

        ctx.fillStyle = cueBgCol;
        ctx.beginPath();
        ctx.arc(cueCx, cueCy, cueR, 0, Math.PI * 2);
        ctx.fill();

        // 5. Draw chevron inside cue button
        ctx.strokeStyle = cueIconCol;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const chevronScale = 18 / 24;
        const ox = cueCx - 12 * chevronScale;
        const oy = cueCy - 12 * chevronScale;
        ctx.moveTo(ox + 7 * chevronScale, oy + 10 * chevronScale);
        ctx.lineTo(ox + 12 * chevronScale, oy + 15 * chevronScale);
        ctx.lineTo(ox + 17 * chevronScale, oy + 10 * chevronScale);
        ctx.stroke();

        // Read pixel data
        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imgData.data;

        // Count candidate pixels
        let activePixelCount = 0;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 20) activePixelCount++;
        }

        // Target: between 38,000 and 55,000 micro-particles
        const targetParticles = 45000;
        let step = 1;
        if (activePixelCount > 55000) {
            step = Math.sqrt(activePixelCount / targetParticles);
        } else if (activePixelCount < 30000 && activePixelCount > 0) {
            step = Math.max(0.75, Math.sqrt(activePixelCount / targetParticles));
        }

        const positions = [];
        const colors = [];
        const randoms = [];
        const grains = [];
        const normYs = [];
        const types = [];

        const halfWinW = window.innerWidth / 2;
        const halfWinH = window.innerHeight / 2;

        const offW = offscreen.width;
        const offH = offscreen.height;

        for (let y = 0; y < offH; y += step) {
            const py = Math.floor(y);
            const normY = 1.0 - (py / offH); // 0 at bottom (button), 1 at top (STAN)

            for (let x = 0; x < offW; x += step) {
                const px = Math.floor(x);
                const idx = (py * offW + px) * 4;
                const a = data[idx + 3];

                if (a > 20) {
                    const r = data[idx] / 255;
                    const g = data[idx + 1] / 255;
                    const b = data[idx + 2] / 255;
                    const alpha = a / 255;

                    // Screen coordinate of this sample
                    const screenX = hbRect.left - pad + (px / dpr);
                    const screenY = hbRect.top - pad + (py / dpr);

                    // Perspective camera 1:1 world coordinate at z = 0
                    const worldX = screenX - halfWinW;
                    const worldY = -(screenY - halfWinH);
                    const worldZ = 0.0;

                    // Classify particle type
                    let particleType = 0.0; // standard typography
                    const isRed = (r > 0.70 && g < 0.35 && b < 0.35);
                    if (isRed) {
                        particleType = 1.0; // signature red period
                    } else if (py / dpr > (cueRelY - 4)) {
                        particleType = 2.0; // circular chevron cue button
                    }

                    positions.push(worldX, worldY, worldZ);
                    colors.push(r, g, b, alpha);

                    // Random attribute seeds
                    const r1 = Math.random();
                    const r2 = Math.random();
                    const r3 = Math.random();
                    const r4 = Math.random();
                    randoms.push(r1, r2, r3, r4);

                    // High-frequency silica grain dither
                    const grain = Math.random();
                    grains.push(grain);

                    normYs.push(normY);
                    types.push(particleType);
                }
            }
        }

        // Build Three.js BufferGeometry
        if (state.geometry) {
            state.geometry.dispose();
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
        geo.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 4));
        geo.setAttribute('aGrain', new THREE.Float32BufferAttribute(grains, 1));
        geo.setAttribute('aNormY', new THREE.Float32BufferAttribute(normYs, 1));
        geo.setAttribute('aType', new THREE.Float32BufferAttribute(types, 1));

        state.geometry = geo;

        if (state.particlesMesh) {
            state.particlesMesh.geometry = geo;
        } else {
            state.particlesMesh = new THREE.Points(geo, state.material);
            state.scene.add(state.particlesMesh);
        }
    }

    /**
     * Initializes the Three.js rendering pipeline for hero dispersion.
     */
    function initRenderer() {
        const canvas = state.canvas;
        if (!canvas) return;

        state.width = window.innerWidth;
        state.height = window.innerHeight;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.dpr = dpr;

        // Dedicated WebGL Renderer on overlay canvas
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
        });
        renderer.setSize(state.width, state.height);
        renderer.setPixelRatio(dpr);
        renderer.setClearColor(0x000000, 0); // Pure transparent overlay
        state.renderer = renderer;

        const scene = new THREE.Scene();
        state.scene = scene;

        // Perspective camera with exact 1:1 pixel projection at z = 0
        const fov = 45;
        const camera = new THREE.PerspectiveCamera(fov, state.width / state.height, 1, 3000);
        const distZ = (state.height / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
        camera.position.set(0, 0, distZ);
        camera.lookAt(0, 0, 0);
        state.camera = camera;

        // Custom Shader Material
        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
        state.isDark = isDark;

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uScrollProgress: { value: 0 },
                uScrollVelocity: { value: 0 },
                uPixelRatio: { value: dpr },
                uViewport: { value: new THREE.Vector2(state.width, state.height) },
                uIsDark: { value: isDark ? 1.0 : 0.0 },
            },
            transparent: true,
            depthWrite: false,
            vertexColors: true,
            blending: THREE.NormalBlending,
        });
        state.material = material;
    }

    /**
     * Handles window resize and re-calculates perspective projection.
     */
    function handleResize() {
        if (!state.renderer || !state.camera || !state.material) return;

        state.width = window.innerWidth;
        state.height = window.innerHeight;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        state.dpr = dpr;

        state.renderer.setSize(state.width, state.height);
        state.renderer.setPixelRatio(dpr);

        state.camera.aspect = state.width / state.height;
        const fov = state.camera.fov;
        const distZ = (state.height / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
        state.camera.position.set(0, 0, distZ);
        state.camera.updateProjectionMatrix();

        state.material.uniforms.uPixelRatio.value = dpr;
        state.material.uniforms.uViewport.value.set(state.width, state.height);

        // Re-sample particles to match new responsive typography bounds
        sampleHeroParticles();
    }

    /**
     * Updates SVG displacement map filter scale for initial frosted-glass touch (0% -> 25%).
     */
    function updateDisplacementFilter(p) {
        if (!state.displacementMap) return;
        // Peak displacement around 5% - 15% scroll
        let scale = 0;
        if (p > 0.001 && p < 0.28) {
            scale = Math.sin((p / 0.28) * Math.PI) * 9.5;
        }
        state.displacementMap.setAttribute('scale', scale.toFixed(2));
    }

    /**
     * Animation frame render loop with spring-damped scroll tracking.
     */
    function renderLoop() {
        state.rafId = requestAnimationFrame(renderLoop);

        const delta = state.clock.getDelta();
        const time = state.clock.getElapsedTime();

        // 1. Calculate target scroll progress for hero section
        // Hero dissolves over the first ~1.35 viewports of runway
        const maxScroll = Math.max(window.innerHeight * 1.35, 600);
        const rawScroll = window.scrollY || window.pageYOffset || 0;
        state.targetProgress = Math.min(Math.max(rawScroll / maxScroll, 0), 1.0);

        // 2. Calculate instantaneous scroll velocity
        const deltaProgress = state.targetProgress - state.lastTargetProgress;
        state.lastTargetProgress = state.targetProgress;
        state.scrollVelocity = deltaProgress / Math.max(delta, 0.001);

        // 3. Smooth Spring Damping (Bi-directional Reversible Physics)
        const activeLerp = state.targetProgress === 0 ? 0.12 : state.lerpFactor;
        state.currentProgress += (state.targetProgress - state.currentProgress) * activeLerp;
        if (state.targetProgress === 0 && state.currentProgress < 0.02) {
            state.currentProgress = 0.0;
        } else if (state.targetProgress === 1 && state.currentProgress > 0.985) {
            state.currentProgress = 1.0;
        }
        state.dampedVelocity += (state.scrollVelocity - state.dampedVelocity) * 0.12;

        const p = state.currentProgress;

        // 4. Update SVG displacement filter
        updateDisplacementFilter(p);

        // 5. Seamless DOM-to-WebGL Handoff
        if (state.heroBrand && state.canvas) {
            if (p <= 0.003) {
                // DOM active, selectable and crisp
                state.heroBrand.style.visibility = 'visible';
                state.heroBrand.style.opacity = '1';
                state.heroBrand.style.pointerEvents = 'auto';
                state.canvas.style.opacity = '0';
            } else {
                // Live WebGL shader active
                state.heroBrand.style.visibility = 'hidden';
                state.heroBrand.style.opacity = '0';
                state.heroBrand.style.pointerEvents = 'none';
                state.canvas.style.opacity = '1';
            }
        }

        // 6. Update shader uniforms
        if (state.material) {
            state.material.uniforms.uTime.value = time;
            state.material.uniforms.uScrollProgress.value = p;
            state.material.uniforms.uScrollVelocity.value = state.dampedVelocity;
        }

        // 7. Render particles when canvas is active or near threshold
        if (state.renderer && state.scene && state.camera && (p > 0.001 || state.targetProgress > 0.001)) {
            state.renderer.render(state.scene, state.camera);
        }
    }

    /**
     * Public API
     */
    return {
        /**
         * Initializes hero dispersion system.
         * @param {Object} options 
         * @param {string} options.canvasId ID of the WebGL overlay canvas
         * @param {string} options.heroId ID of the DOM hero container
         * @param {string} [options.displacementFilterId] ID of SVG feDisplacementMap
         */
        init: function (options) {
            if (state.isInitialized) return;

            const opts = options || {};
            state.canvas = document.getElementById(opts.canvasId || 'hero-dispersion-canvas');
            state.heroBrand = document.getElementById(opts.heroId || 'hero-brand');
            state.displacementMap = document.getElementById(opts.displacementFilterId || 'frost-displacement-map');

            if (!state.canvas || !state.heroBrand) {
                console.warn('[HeroDispersion] Canvas or hero brand element missing.');
                return;
            }

            initRenderer();

            // Wait for fonts so Antapani renders correctly
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function () {
                    sampleHeroParticles();
                });
            } else {
                setTimeout(sampleHeroParticles, 250);
            }

            // Window resize and DOM ResizeObserver
            window.addEventListener('resize', handleResize);
            if (window.ResizeObserver && state.heroBrand) {
                state.resizeObserver = new ResizeObserver(function () {
                    handleResize();
                });
                state.resizeObserver.observe(state.heroBrand);
            }

            // Start RAF loop
            state.clock.start();
            renderLoop();

            state.isInitialized = true;
        },

        /**
         * Updates dark / light mode shader uniforms and resamples particles.
         * @param {boolean} isDark 
         */
        setTheme: function (isDark) {
            state.isDark = isDark;
            if (state.material) {
                state.material.uniforms.uIsDark.value = isDark ? 1.0 : 0.0;
            }
            sampleHeroParticles();
        },

        /**
         * Forces an instant re-sample (useful after font loading or orientation changes).
         */
        resample: function () {
            sampleHeroParticles();
        },

        /**
         * Destroys the instance and cleans up resources.
         */
        destroy: function () {
            if (state.rafId) cancelAnimationFrame(state.rafId);
            window.removeEventListener('resize', handleResize);
            if (state.resizeObserver) state.resizeObserver.disconnect();
            if (state.geometry) state.geometry.dispose();
            if (state.material) state.material.dispose();
            if (state.renderer) state.renderer.dispose();
            state.isInitialized = false;
        }
    };
});
