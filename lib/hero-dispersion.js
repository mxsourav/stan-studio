/**
 * STΔN Studio — Ultra-Fine Frosted Glass Gray Micro-Powder Dissolve & Interactive Hover
 * Module: lib/hero-dispersion.js
 * 
 * Features & Fixes:
 * 1. ZERO POSITION SHIFT: Direct fullscreen subpixel sampling matching DOM typography coordinates 1:1.
 * 2. FULLY RANDOMIZED ISOTROPIC SPLAY: True 360° omnidirectional radial explosion without any heart/cone/tornado shape.
 * 3. FROSTED GLASS GRAY POWDER: Translucent silica powder (#b4c0cd) with crystalline specular sparkles; never black dust/soot.
 * 4. INTERACTIVE MOUSE HOVER: Kinetic repulsion, tangential vortex swirl, and luminous specular glints on mouse hover.
 * 5. SEAMLESS PROGRESSION: Synchronized with scroll unrolling for natural, responsive feel.
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

    // ═══════════════════════════════════════════════════════════════════
    // GLSL VERTEX SHADER: ISOTROPIC GLASS MICRO-POWDER & HOVER REACTION
    // ═══════════════════════════════════════════════════════════════════
    const VERTEX_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uScrollVelocity;
        uniform float uPixelRatio;
        uniform vec2 uViewport;
        uniform float uIsDark;
        uniform vec2 uMouse;

        attribute vec3 aRandomDir; // Uniform 3D random unit vector on sphere for true isotropic 360° splay
        attribute vec4 aRandom;    // (startSeed, speedSeed, spreadSeed, thermalSeed)
        attribute float aGrain;    // grain dither
        attribute float aType;     // 0 = text, 1 = red dot, 2 = button

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vAlpha;
        varying float vType;
        varying vec3 vWorldPos;
        varying float vDispProgress;

        // --- Fast 3D Simplex Noise ---
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

        void main() {
            vColor = color;
            vRandom = aRandom;
            vType = aType;

            // ══════════════════════════════════════════════════════════════
            // PURE RANDOMIZED STOCHASTIC DISSOLVE (ZERO HEART / CONE SHAPE)
            // ══════════════════════════════════════════════════════════════
            // Activation threshold is purely random across all letters simultaneously:
            float particleStart = aRandom.x * 0.38;
            float dispProgress = smoothstep(particleStart, particleStart + 0.36, uScrollProgress * 1.40);
            vDispProgress = dispProgress;

            // Opacity envelope: instantaneous smooth entrance on scroll start,
            // progressive airy dissolution into atmosphere as particles travel (never dark clumps!)
            float fadeIn = smoothstep(0.001, 0.03, uScrollProgress);
            float travelFade = 1.0 - smoothstep(0.12, 0.88, dispProgress);
            vAlpha = fadeIn * travelFade;

            // High-frequency 3D micro-turbulence
            vec3 hfCoord = (position * 0.035) + vec3(uTime * 0.25, aRandom.y * 12.0, aRandom.z * 12.0);
            vec3 hfNoise = vec3(
                snoise(hfCoord),
                snoise(hfCoord + vec3(31.4, 71.2, 19.3)),
                snoise(hfCoord + vec3(89.1, 14.5, 52.8))
            );

            // True 360-degree isotropic radial explosion (ZERO upward Y bias!)
            vec3 splayVector = normalize(aRandomDir * 0.70 + hfNoise * 0.30);

            // Randomized splay radius (40px to 135px)
            float maxSpread = 40.0 + aRandom.z * 95.0;
            if (aType > 0.5 && aType < 1.5) {
                // Red period particles stay softly clustered
                maxSpread = 16.0 + aRandom.z * 24.0;
            }

            vec3 worldDisp = position + (splayVector * maxSpread * dispProgress);

            // ══════════════════════════════════════════════════════════════
            // INTERACTIVE MOUSE HOVERING REACTION (REPULSION + KINETIC SWIRL)
            // ══════════════════════════════════════════════════════════════
            vec2 mouseDiff = worldDisp.xy - uMouse;
            float mouseDist = length(mouseDiff);
            float hoverRadius = 160.0;
            if (mouseDist < hoverRadius && mouseDist > 0.001) {
                float hoverFactor = 1.0 - (mouseDist / hoverRadius);
                float hoverForce = smoothstep(0.0, 1.0, hoverFactor);

                vec2 pushDir = normalize(mouseDiff);
                vec2 swirlDir = vec2(-pushDir.y, pushDir.x); // vortex swirl

                // Repel away from cursor with kinetic swirl
                vec2 hoverOffset = (pushDir * 38.0 + swirlDir * 22.0) * hoverForce;
                float responseMult = mix(0.40, 1.25, dispProgress);
                worldDisp.xy += hoverOffset * responseMult;
                worldDisp.z += hoverForce * 30.0 * responseMult;
            }

            vWorldPos = worldDisp;

            // Strict fine micro-grain point size: 1.0 * uPixelRatio to 1.8 * uPixelRatio
            float basePt = (aType > 0.5 && aType < 1.5) ? 1.60 : 1.30;
            float pt = basePt * uPixelRatio * (0.85 + aRandom.y * 0.30);
            gl_PointSize = clamp(pt, 1.0 * uPixelRatio, 1.8 * uPixelRatio);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(worldDisp, 1.0);
        }
    `;

    // ═══════════════════════════════════════════════════════════════════
    // GLSL FRAGMENT SHADER: FROSTED GLASS GRAY POWDER (NOT BLACK DUST)
    // ═══════════════════════════════════════════════════════════════════
    const FRAGMENT_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uIsDark;
        uniform vec2 uMouse;

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vAlpha;
        varying float vType;
        varying vec3 vWorldPos;
        varying float vDispProgress;

        void main() {
            if (vAlpha <= 0.004) discard;

            // Circular micro-grain
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            float edgeAlpha = smoothstep(0.5, 0.12, dist);

            // Micro-silica refractive specular sparkle
            float sparkle = 0.70 + 0.35 * sin(uTime * 12.0 + vRandom.y * 62.83);

            // Mouse proximity specular highlight
            float mouseDistToFrag = length(vWorldPos.xy - uMouse);
            float hoverShimmer = smoothstep(160.0, 0.0, mouseDistToFrag) * 0.40;

            // Red period particles: vibrant #FF2A2A crimson glass embers
            if (vType > 0.5 && vType < 1.5) {
                vec3 redGlass = vec3(1.0, 0.165, 0.165);
                redGlass += vec3(0.12) * hoverShimmer;
                gl_FragColor = vec4(redGlass, edgeAlpha * vAlpha * 0.55);
                return;
            }

            // Frosted Glass Gray Powder (Translucent silica, NEVER black dust!)
            vec3 glassPowder;
            float targetAlpha;

            if (uIsDark > 0.5) {
                // Dark mode: luminous frosted crystal silver-white
                glassPowder = vec3(0.92, 0.95, 1.0);
                glassPowder += vec3(0.15) * sparkle;
                glassPowder += vec3(0.15) * hoverShimmer;
                targetAlpha = 0.65;
            } else {
                // Light mode: translucent frosted glass silica gray (#b4c0cd to #d8e2eb)
                glassPowder = vec3(0.70, 0.76, 0.84);
                glassPowder = mix(glassPowder, vec3(1.0, 1.0, 1.0), (sparkle * 0.45 + hoverShimmer * 0.40));
                targetAlpha = 0.34; // Translucent and airy! Never forms dark clumps!
            }

            gl_FragColor = vec4(glassPowder, edgeAlpha * vAlpha * targetAlpha);
        }
    `;

    // --- Singleton Controller ---
    let state = {
        canvas: null,
        heroBrand: null,
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
        lerpFactor: 0.095,
        rafId: null,
        clock: new THREE.Clock(),
        resizeObserver: null,

        // Mouse hover interaction
        mouseWorld: new THREE.Vector2(-9999, -9999),
        targetMouseWorld: new THREE.Vector2(-9999, -9999),
    };

    /**
     * Subpixel-accurate sampling of DOM typography directly from fullscreen coordinates.
     * Ensures 100% pixel-perfect alignment with zero position shift or offset.
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

        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const stanRect = stanEl.getBoundingClientRect();
        const studioRect = studioEl.getBoundingClientRect();
        const dotRect = dotEl ? dotEl.getBoundingClientRect() : null;
        const cueRect = cueEl.getBoundingClientRect();
        const hbRect = state.heroBrand.getBoundingClientRect();

        if (hbRect.width <= 0 || hbRect.height <= 0) return;

        // Render typography into offscreen buffer sized to viewport
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.ceil(winW * dpr);
        offscreen.height = Math.ceil(winH * dpr);
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        ctx.scale(dpr, dpr);

        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
        state.isDark = isDark;

        const textCol = isDark ? '#ffffff' : '#000000';
        const cueBgCol = isDark ? '#ffffff' : '#181a1e';
        const cueIconCol = isDark ? '#0b0d11' : '#ffffff';

        // 1. Draw STAN with exact letter spacing and baseline (66.56px offset from element top)
        ctx.fillStyle = textCol;
        ctx.font = '800 92px "Antapani", -apple-system, sans-serif';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.03em';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('STΔN', stanRect.left + stanRect.width / 2, stanRect.top + 66.56);

        // 2. Draw studio with exact letter spacing and baseline (30.11px offset from element top)
        ctx.font = '800 42px "Antapani", -apple-system, sans-serif';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.02em';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('studio', studioRect.left, studioRect.top + 30.11);

        // 3. Draw signature red period '.' with exact #FF2A2A
        if (dotRect) {
            ctx.fillStyle = '#FF2A2A';
            ctx.fillText('.', dotRect.left, studioRect.top + 30.11);
        }

        // 4. Draw circular scroll cue button
        const cueCx = cueRect.left + cueRect.width / 2;
        const cueCy = cueRect.top + cueRect.height / 2;
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

        // Sample pixels only within heroBrand bounding box (+ small 10px margin)
        const minX = Math.max(0, Math.floor((hbRect.left - 10) * dpr));
        const maxX = Math.min(offscreen.width, Math.ceil((hbRect.right + 10) * dpr));
        const minY = Math.max(0, Math.floor((hbRect.top - 10) * dpr));
        const maxY = Math.min(offscreen.height, Math.ceil((hbRect.bottom + 10) * dpr));

        const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imgData.data;

        let activePixelCount = 0;
        const offW = offscreen.width;
        for (let py = minY; py < maxY; py++) {
            for (let px = minX; px < maxX; px++) {
                const idx = (py * offW + px) * 4;
                if (data[idx + 3] > 20) activePixelCount++;
            }
        }

        // Target: ~38,000 fine micro-particles for airy, crystalline feel (prevents dark clumping)
        const targetParticles = 38000;
        let step = 1;
        if (activePixelCount > 0) {
            step = Math.sqrt(activePixelCount / targetParticles);
            step = Math.max(0.85, Math.min(1.45, step));
        }

        const positions = [];
        const colors = [];
        const randomDirs = [];
        const randoms = [];
        const grains = [];
        const types = [];

        const halfWinW = winW / 2;
        const halfWinH = winH / 2;

        for (let y = minY; y < maxY; y += step) {
            const py = Math.floor(y);

            for (let x = minX; x < maxX; x += step) {
                const px = Math.floor(x);
                const idx = (py * offW + px) * 4;
                const a = data[idx + 3];

                if (a > 20) {
                    const r = data[idx] / 255;
                    const g = data[idx + 1] / 255;
                    const b = data[idx + 2] / 255;
                    const alpha = a / 255;

                    // Direct subpixel screen coordinate
                    const screenX = px / dpr;
                    const screenY = py / dpr;

                    // 1:1 Perspective world coordinate at z = 0
                    const worldX = screenX - halfWinW;
                    const worldY = -(screenY - halfWinH);
                    const worldZ = 0.0;

                    // Classify particle type
                    let particleType = 0.0; // standard typography
                    const isRed = (r > 0.70 && g < 0.35 && b < 0.35);
                    if (isRed) {
                        particleType = 1.0; // signature red period
                    } else if (screenY > (cueRect.top - 4)) {
                        particleType = 2.0; // circular chevron cue button
                    }

                    positions.push(worldX, worldY, worldZ);
                    colors.push(r, g, b, alpha);

                    // True uniform 3D spherical direction (NO BIAS: equal probability in all directions)
                    const theta = Math.random() * 2 * Math.PI;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const dirX = Math.sin(phi) * Math.cos(theta);
                    const dirY = Math.sin(phi) * Math.sin(theta);
                    const dirZ = Math.cos(phi);
                    randomDirs.push(dirX, dirY, dirZ);

                    // Random attribute seeds (startSeed, speedSeed, spreadSeed, thermalSeed)
                    randoms.push(Math.random(), Math.random(), Math.random(), Math.random());

                    grains.push(Math.random());
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
        geo.setAttribute('aRandomDir', new THREE.Float32BufferAttribute(randomDirs, 3));
        geo.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 4));
        geo.setAttribute('aGrain', new THREE.Float32BufferAttribute(grains, 1));
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
                uMouse: { value: new THREE.Vector2(-9999, -9999) },
            },
            transparent: true,
            depthWrite: false,
            vertexColors: true,
            blending: THREE.NormalBlending,
        });
        state.material = material;

        // Interactive Mouse Tracking
        window.addEventListener('mousemove', function (e) {
            state.targetMouseWorld.x = e.clientX - window.innerWidth / 2;
            state.targetMouseWorld.y = -(e.clientY - window.innerHeight / 2);
        }, { passive: true });
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

        sampleHeroParticles();
    }

    /**
     * Animation frame render loop with spring-damped scroll tracking.
     */
    function renderLoop() {
        state.rafId = requestAnimationFrame(renderLoop);

        const delta = state.clock.getDelta();
        const time = state.clock.getElapsedTime();

        // 1. Calculate target scroll progress for hero section
        // Dissolves smoothly over the initial scroll zone (approx 450px)
        const scrollMax = Math.max(window.innerHeight * 0.70, 420);
        const rawScroll = window.scrollY || window.pageYOffset || 0;
        state.targetProgress = Math.min(Math.max(rawScroll / scrollMax, 0), 1.0);

        // 2. Calculate instantaneous scroll velocity
        const deltaProgress = state.targetProgress - state.lastTargetProgress;
        state.lastTargetProgress = state.targetProgress;
        state.scrollVelocity = deltaProgress / Math.max(delta, 0.001);

        // 3. Smooth Spring Damping (Bi-directional Reversible Physics)
        const activeLerp = state.targetProgress === 0 ? 0.12 : state.lerpFactor;
        state.currentProgress += (state.targetProgress - state.currentProgress) * activeLerp;
        if (state.targetProgress === 0 && state.currentProgress < 0.002) {
            state.currentProgress = 0.0;
        } else if (state.targetProgress === 1 && state.currentProgress > 0.99) {
            state.currentProgress = 1.0;
        }
        state.dampedVelocity += (state.scrollVelocity - state.dampedVelocity) * 0.12;

        const p = state.currentProgress;

        // 4. Smooth Mouse Hover Interpolation
        state.mouseWorld.x += (state.targetMouseWorld.x - state.mouseWorld.x) * 0.14;
        state.mouseWorld.y += (state.targetMouseWorld.y - state.mouseWorld.y) * 0.14;

        // 5. Clean DOM to WebGL handoff with ZERO jumping or ghosting:
        // At rest (p <= 0.002), crisp real DOM text is visible.
        // As scroll begins, DOM smoothly yields to subpixel-matched WebGL particles.
        if (state.heroBrand) {
            if (p <= 0.002) {
                state.heroBrand.style.opacity = '1';
                state.heroBrand.style.filter = 'none';
                state.heroBrand.style.pointerEvents = 'auto';
                if (state.canvas) state.canvas.style.opacity = '0';
            } else {
                const domFade = Math.max(0, 1 - p * 3.5);
                state.heroBrand.style.opacity = domFade.toFixed(3);
                state.heroBrand.style.pointerEvents = domFade < 0.05 ? 'none' : 'auto';
                if (state.canvas) state.canvas.style.opacity = '1';
            }
        }

        // 6. Update shader uniforms
        if (state.material) {
            state.material.uniforms.uTime.value = time;
            state.material.uniforms.uScrollProgress.value = p;
            state.material.uniforms.uScrollVelocity.value = state.dampedVelocity;
            state.material.uniforms.uMouse.value.copy(state.mouseWorld);
        }

        // 7. Render WebGL micro-particles when active or hovered
        const mouseNear = Math.abs(state.mouseWorld.x) < (state.width * 0.5) && Math.abs(state.mouseWorld.y) < (state.height * 0.5);
        if (state.renderer && state.scene && state.camera && (p > 0.001 || state.targetProgress > 0.001 || (mouseNear && p > 0.0005))) {
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
         */
        init: function (options) {
            if (state.isInitialized) return;

            const opts = options || {};
            state.canvas = document.getElementById(opts.canvasId || 'hero-dispersion-canvas');
            state.heroBrand = document.getElementById(opts.heroId || 'hero-brand');

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
