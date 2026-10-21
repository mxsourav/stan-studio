/**
 * STΔN Studio — Ultra-Fine Frosted Glass Micro-Grain Silica Dissolve
 * Module: lib/hero-dispersion.js
 * 
 * Architecture:
 * 1. Crisp DOM + Progressive Optical Frosted Glass Blur (filter: blur(0..18px), opacity, scale, translateY)
 * 2. High-Density Micro-Grain Sampling (60,000 - 90,000 micro-points on high-DPI buffer)
 * 3. STRICT POINT SIZE CAP: gl_PointSize strictly clamped between 1.2 * uPixelRatio and 2.2 * uPixelRatio (NEVER > 3px)
 * 4. In-Place Frosted Evaporation: 3D isotropic radial unit vectors + high-frequency simplex noise (frequency 3.5)
 * 5. Smooth Opacity Envelope: fadeIn (0.02 -> 0.18) + per-particle stochastic fadeOut (0.25 -> 0.75)
 * 6. Signature #FF2A2A crimson red period particles softly clustered around origin
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
    // GLSL VERTEX SHADER: ULTRA-FINE MICRO-GRAIN IN-PLACE EVAPORATION
    // ═══════════════════════════════════════════════════════════════════
    const VERTEX_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uScrollVelocity;
        uniform float uPixelRatio;
        uniform vec2 uViewport;
        uniform float uIsDark;
        uniform vec3 uMouseWorld;      // (x, y, isHovering: 1.0 or 0.0)
        uniform float uMagnetStrength;  // intensity (0.0 to 1.5, default 0.45)
        uniform float uMagnetRadius;    // reach in pixels (40 to 350, default 140)
        uniform float uParticleSize;    // particle size in pixels (1.0 to 3.0, default 1.8)
        uniform float uSpreadScale;     // dispersion spread scale (0.5 to 2.5, default 1.0)

        attribute vec3 aRandomDir; // Unique 3D unit vector on sphere for isotropic radial dispersion
        attribute vec4 aRandom;    // (fadeSeed, sizeSeed, spreadSeed, thermalSeed)
        attribute float aGrain;    // high-frequency grain dither
        attribute float aNormY;    // normalized vertical position in hero lockup (0 = button, 1 = STAN top)
        attribute float aType;     // 0 = text, 1 = red dot, 2 = button

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vAlpha;
        varying float vType;

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
            // SINGLE-LAYER OPACITY ENVELOPE (FULL AT REST, FADES OUT ON SCROLL)
            // ══════════════════════════════════════════════════════════════
            // Full opacity at rest; fades out stochastically as particles disperse
            float fadeOut = 1.0 - smoothstep(0.28 + aRandom.x * 0.30, 0.76 + aRandom.x * 0.24, uScrollProgress);
            vAlpha = fadeOut;

            // ══════════════════════════════════════════════════════════════
            // IN-PLACE FROSTED EVAPORATION (NO TORNADO CLUMPING)
            // ══════════════════════════════════════════════════════════════
            // Directional stagger: bottom-up wave so cue button and bottom of studio dissolve first
            float stagger = (aNormY * 0.35) + (aRandom.x * 0.14);
            float dispProgress = smoothstep(stagger, stagger + 0.45, uScrollProgress * 1.35 * uSpreadScale);

            // High-frequency 3D Simplex Noise (frequency = 3.5 - NOT low-frequency clumping)
            vec3 hfCoord = (position * 0.035) + vec3(uTime * 0.25, uTime * 0.20, aRandom.x * 8.0);
            vec3 hfNoise = vec3(
                snoise(hfCoord),
                snoise(hfCoord + vec3(43.1, 19.7, 7.3)),
                snoise(hfCoord + vec3(17.5, 62.9, 81.1))
            );

            // Outward radial dispersion in all directions from exact letter position:
            vec3 disperseDir = normalize(aRandomDir * 0.72 + hfNoise * 0.28);

            // Spread distance (40px to 110px spread)
            float maxSpread = (40.0 + aRandom.z * 70.0) * uSpreadScale;
            if (aType > 0.5 && aType < 1.5) {
                // Red period stays softly clustered around its origin
                maxSpread = (25.0 + aRandom.z * 35.0) * uSpreadScale;
            }

            // Gentle upward thermal float (+30px to +80px on Y)
            float thermalLift = (30.0 + aRandom.w * 50.0) * dispProgress;

            vec3 worldDisp = position + (disperseDir * maxSpread * dispProgress);
            worldDisp.y += thermalLift;
            worldDisp.z += aRandomDir.z * 35.0 * dispProgress; // subtle depth scatter

            // ══════════════════════════════════════════════════════════════
            // MAGNETIC MOUSE HOVER ATTRACTION (GENTLE PULL TOWARD CURSOR)
            // ══════════════════════════════════════════════════════════════
            if (uMouseWorld.z > 0.5 && uMagnetStrength > 0.001) {
                vec2 mouseDiff = uMouseWorld.xy - worldDisp.xy;
                float mouseDist = length(mouseDiff);
                if (mouseDist < uMagnetRadius && mouseDist > 0.1) {
                    float normDist = mouseDist / uMagnetRadius;
                    // Quadratic smooth falloff: maximum pull near cursor, gentle drop-off to boundary
                    float pullFactor = (1.0 - normDist) * (1.0 - normDist);
                    vec2 pullDir = mouseDiff / mouseDist;
                    
                    // Elastic magnetic pull toward cursor (not too strong, soft drag)
                    float maxPull = uMagnetRadius * 0.42 * uMagnetStrength;
                    float pullAmount = min(mouseDist * 0.85, maxPull) * pullFactor;
                    worldDisp.xy += pullDir * pullAmount;
                    worldDisp.z += pullFactor * (uMagnetStrength * 20.0);
                }
            }

            // ══════════════════════════════════════════════════════════════
            // STRICT POINT SIZE: CRISP SOLID COVERAGE AT REST
            // ══════════════════════════════════════════════════════════════
            float basePt = (aType > 0.5 && aType < 1.5) ? (uParticleSize * 1.15) : uParticleSize;
            float pt = basePt * uPixelRatio * (0.95 + aRandom.y * 0.10);
            gl_PointSize = clamp(pt, 1.2 * uPixelRatio, 2.8 * uPixelRatio);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(worldDisp, 1.0);
        }
    `;

    // ═══════════════════════════════════════════════════════════════════
    // GLSL FRAGMENT SHADER: ULTRA-FINE FROSTED SILICA MICRO-GRAIN
    // ═══════════════════════════════════════════════════════════════════
    const FRAGMENT_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uIsDark;

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vAlpha;
        varying float vType;

        void main() {
            if (vAlpha <= 0.002) discard;

            // Crisp anti-aliased circular micro-grain shape
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            // Sharp anti-aliased micro-grain edge (solid inside 0.38, smooth anti-aliased feather to 0.5)
            float edgeAlpha = smoothstep(0.5, 0.38, dist);

            // Subtle twinkle only during scroll dispersion, solid at rest
            float sparkle = mix(1.0, 0.88 + 0.24 * sin(uTime * 9.0 + vRandom.y * 62.83), clamp(uScrollProgress * 3.0, 0.0, 1.0));

            // Red period signature particles: exact #FF2A2A crimson red
            if (vType > 0.5 && vType < 1.5) {
                vec3 redCol = vec3(1.0, 0.165, 0.165); // #FF2A2A
                gl_FragColor = vec4(redCol, edgeAlpha * vAlpha);
                return;
            }

            // High-contrast, clean typography particles:
            // Light mode: pitch black (#000000) for text, exactly matching DOM text!
            // Dark mode: pure white (#FFFFFF) for text!
            vec3 col = vColor.rgb;
            if (vType < 1.5) {
                // Main typography: STAN & studio
                col = (uIsDark > 0.5) ? vec3(1.0, 1.0, 1.0) : vec3(0.0, 0.0, 0.0);
            }

            gl_FragColor = vec4(col, edgeAlpha * vAlpha * sparkle);
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
        lerpFactor: 0.085,
        rafId: null,
        clock: new THREE.Clock(),
        resizeObserver: null,

        // Mouse Hover & Magnet Effect
        mouseWorldX: 0,
        mouseWorldY: 0,
        targetMouseWorldX: 0,
        targetMouseWorldY: 0,
        isMouseHovering: false,
        isHoveringNearHero: false,
        magnetStrength: 0.45,
        magnetRadius: 140.0,
        particleSize: 1.8,
        spreadScale: 1.0,
    };

    /**
     * Samples the exact DOM typography and button onto an offscreen canvas
     * and constructs 60,000 - 90,000 ultra-fine micro-particles.
     */
    function sampleHeroParticles() {
        if (!state.heroBrand) return;

        const stanEl = state.heroBrand.querySelector('.hero-stan');
        const studioEl = state.heroBrand.querySelector('.hero-studio');
        const dotEl = state.heroBrand.querySelector('.crimson-dot');
        const cueEl = state.heroBrand.querySelector('.hero-scroll-cue');

        if (!stanEl || !studioEl || !cueEl) return;

        const sampleScale = 1.6;
        state.sampleScale = sampleScale;

        const hbRect = state.heroBrand.getBoundingClientRect();
        if (hbRect.width <= 0 || hbRect.height <= 0) return;

        const pad = 14;
        const width = Math.ceil(hbRect.width + pad * 2);
        const height = Math.ceil(hbRect.height + pad * 2);

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.ceil(width * sampleScale);
        offscreen.height = Math.ceil(height * sampleScale);
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        ctx.scale(sampleScale, sampleScale);

        const stanRect = stanEl.getBoundingClientRect();
        const studioRect = studioEl.getBoundingClientRect();
        const dotRect = dotEl ? dotEl.getBoundingClientRect() : null;
        const cueRect = cueEl.getBoundingClientRect();

        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
        state.isDark = isDark;

        const textCol = isDark ? '#ffffff' : '#000000';
        const cueBgCol = isDark ? '#ffffff' : '#181a1e';
        const cueIconCol = isDark ? '#0b0d11' : '#ffffff';

        // 1. Draw STAN with exact letter spacing and baseline
        ctx.fillStyle = textCol;
        ctx.font = '800 92px "Antapani", -apple-system, sans-serif';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.03em';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const stanRelX = (stanRect.left + stanRect.width / 2) - hbRect.left + pad;
        const stanBaselineY = (stanRect.top - hbRect.top + pad) + 66.56;
        ctx.fillText('STΔN', stanRelX, stanBaselineY);

        // 2. Draw studio with exact letter spacing and baseline
        ctx.font = '800 42px "Antapani", -apple-system, sans-serif';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.02em';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const studioRelX = studioRect.left - hbRect.left + pad;
        const studioBaselineY = (studioRect.top - hbRect.top + pad) + 30.11;
        ctx.fillText('studio', studioRelX, studioBaselineY);

        // 3. Draw signature red period '.' with exact #FF2A2A
        if (dotRect) {
            ctx.fillStyle = '#FF2A2A';
            const dotRelX = dotRect.left - hbRect.left + pad;
            ctx.fillText('.', dotRelX, studioBaselineY);
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

        const positions = [];
        const colors = [];
        const randomDirs = [];
        const randoms = [];
        const grains = [];
        const normYs = [];
        const types = [];

        const halfWinW = window.innerWidth / 2;
        const halfWinH = window.innerHeight / 2;

        const offW = offscreen.width;
        const offH = offscreen.height;

        // Clean integer grid sampling - ZERO flooring duplicates, ZERO moire stripes
        for (let py = 0; py < offH; py++) {
            const normY = 1.0 - (py / offH); // 0 at bottom (button), 1 at top (STAN)

            for (let px = 0; px < offW; px++) {
                const idx = (py * offW + px) * 4;
                const a = data[idx + 3];

                if (a > 32) {
                    const r = data[idx] / 255;
                    const g = data[idx + 1] / 255;
                    const b = data[idx + 2] / 255;
                    const alpha = a / 255;

                    // Screen coordinate of this sample
                    const screenX = hbRect.left - pad + (px / sampleScale);
                    const screenY = hbRect.top - pad + (py / sampleScale);

                    // Perspective camera 1:1 world coordinate at z = 0
                    const worldX = screenX - halfWinW;
                    const worldY = -(screenY - halfWinH);
                    const worldZ = 0.0;

                    // Classify particle type
                    let particleType = 0.0; // standard typography
                    const isRed = (r > 0.65 && g < 0.35 && b < 0.35);
                    if (isRed) {
                        particleType = 1.0; // signature red period
                    } else if (py / sampleScale > (cueRelY - 4)) {
                        particleType = 2.0; // circular chevron cue button
                    }

                    positions.push(worldX, worldY, worldZ);
                    colors.push(r, g, b, alpha);

                    // Generate uniform 3D random unit vector on sphere for isotropic radial evaporation
                    const theta = Math.random() * 2 * Math.PI;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const dirX = Math.sin(phi) * Math.cos(theta);
                    const dirY = Math.sin(phi) * Math.sin(theta);
                    const dirZ = Math.cos(phi);
                    randomDirs.push(dirX, dirY, dirZ);

                    // Random attribute seeds (fadeSeed, sizeSeed, spreadSeed, thermalSeed)
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
        geo.setAttribute('aRandomDir', new THREE.Float32BufferAttribute(randomDirs, 3));
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
                uMouseWorld: { value: new THREE.Vector3(0, 0, 0) },
                uMagnetStrength: { value: state.magnetStrength },
                uMagnetRadius: { value: state.magnetRadius },
                uParticleSize: { value: state.particleSize },
                uSpreadScale: { value: state.spreadScale },
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
     * Animation frame render loop with spring-damped scroll tracking.
     */
    function renderLoop() {
        state.rafId = requestAnimationFrame(renderLoop);

        const delta = state.clock.getDelta();
        const time = state.clock.getElapsedTime();

        // 1. Calculate target scroll progress for hero section
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

        // Smooth mouse world interpolation
        state.mouseWorldX += (state.targetMouseWorldX - state.mouseWorldX) * 0.15;
        state.mouseWorldY += (state.targetMouseWorldY - state.mouseWorldY) * 0.15;

        // Determine if mouse is hovering near hero brand
        let isNearHero = false;
        if (state.heroBrand && state.isMouseHovering) {
            const rect = state.heroBrand.getBoundingClientRect();
            const reach = state.magnetRadius + 30.0;
            const mx = state.mouseClientX || 0;
            const my = state.mouseClientY || 0;
            if (mx >= rect.left - reach && mx <= rect.right + reach &&
                my >= rect.top - reach && my <= rect.bottom + reach) {
                isNearHero = true;
            }
        }
        state.isHoveringNearHero = isNearHero;

        // 4. Seamless Single-Layer Handoff:
        // - At rest with mouse away: 100% razor sharp native DOM vector text! (No pixelation on edges)
        // - When mouse hovers near text OR user scrolls: WebGL particles take over with ZERO double layer!
        const isDistorting = (p > 0.002) || isNearHero;
        if (state.heroBrand) {
            state.heroBrand.style.filter = 'none';
            state.heroBrand.style.transform = 'translateY(-50%)';
            state.heroBrand.style.opacity = isDistorting ? '0' : '1';
            state.heroBrand.style.pointerEvents = 'auto'; // keeps cue button clickable
        }
        if (state.canvas) {
            state.canvas.style.opacity = isDistorting ? '1' : '0';
        }

        // 5. Update shader uniforms
        if (state.material) {
            state.material.uniforms.uTime.value = time;
            state.material.uniforms.uScrollProgress.value = p;
            state.material.uniforms.uScrollVelocity.value = state.dampedVelocity;
            state.material.uniforms.uMouseWorld.value.set(
                state.mouseWorldX,
                state.mouseWorldY,
                (isNearHero || p > 0.002) ? 1.0 : 0.0
            );
            state.material.uniforms.uMagnetStrength.value = state.magnetStrength;
            state.material.uniforms.uMagnetRadius.value = state.magnetRadius;
            state.material.uniforms.uParticleSize.value = state.particleSize;
            state.material.uniforms.uSpreadScale.value = state.spreadScale;
        }

        // 6. Render WebGL micro-particles when active or in transition
        if (state.renderer && state.scene && state.camera) {
            if (isDistorting || p > 0.0005) {
                state.renderer.render(state.scene, state.camera);
            }
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

            // Mouse Hover Tracking for Magnetic Attraction
            window.addEventListener('mousemove', function (e) {
                state.isMouseHovering = true;
                state.mouseClientX = e.clientX;
                state.mouseClientY = e.clientY;
                const halfWinW = window.innerWidth / 2;
                const halfWinH = window.innerHeight / 2;
                state.targetMouseWorldX = e.clientX - halfWinW;
                state.targetMouseWorldY = -(e.clientY - halfWinH);
            }, { passive: true });

            window.addEventListener('mouseleave', function () {
                state.isMouseHovering = false;
                state.isHoveringNearHero = false;
            });

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
         * Live tuning for magnetic hover strength (pull intensity)
         * @param {number} val 
         */
        setMagnetStrength: function (val) {
            state.magnetStrength = Math.max(0, Math.min(2.0, parseFloat(val) || 0));
            if (state.material) state.material.uniforms.uMagnetStrength.value = state.magnetStrength;
        },

        /**
         * Live tuning for magnetic hover radius (reach in pixels)
         * @param {number} val 
         */
        setMagnetRadius: function (val) {
            state.magnetRadius = Math.max(20, Math.min(500, parseFloat(val) || 140));
            if (state.material) state.material.uniforms.uMagnetRadius.value = state.magnetRadius;
        },

        /**
         * Live tuning for particle size (points)
         * @param {number} val 
         */
        setParticleSize: function (val) {
            state.particleSize = Math.max(0.8, Math.min(4.0, parseFloat(val) || 1.8));
            if (state.material) state.material.uniforms.uParticleSize.value = state.particleSize;
        },

        /**
         * Live tuning for dispersion spread scale
         * @param {number} val 
         */
        setSpreadScale: function (val) {
            state.spreadScale = Math.max(0.2, Math.min(3.0, parseFloat(val) || 1.0));
            if (state.material) state.material.uniforms.uSpreadScale.value = state.spreadScale;
        },

        /**
         * Returns current magnet and particle configuration
         */
        getMagnetConfig: function () {
            return {
                strength: state.magnetStrength,
                radius: state.magnetRadius,
                particleSize: state.particleSize,
                spreadScale: state.spreadScale
            };
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
