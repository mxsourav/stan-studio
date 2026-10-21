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
        varying float vDust;

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
            // 3-TIER PROGRESSIVE BOTTOM-TO-TOP CASCADE (AIRBORNE MICRO-DUST ONLY)
            // PARTICLES ARE 100% INVISIBLE AT REST (alpha = 0).
            // THEY ONLY APPEAR AS MICRO-DUST GRAINS WHEN DETACHED (ZERO DOUBLE LAYER, ZERO BOLD).
            // 1. Scroll cue button erupts into dust first (p >= 0.004)
            // 2. studio. & crimson dot erupt bottom-to-top into dust (p >= 0.030)
            // 3. STΔN erupts bottom-to-top into dust (p >= 0.055)
            // 4. All dust clouds merge and end simultaneously at 0.70 -> 0.94
            // ══════════════════════════════════════════════════════════════
            float dispProgress = 0.0;
            float alpha = 0.0;

            if (aType >= 1.8) {
                // ─── TIER 1: SCROLL CUE BUTTON (BOTTOM) ───
                // Erupts at p >= 0.004 into fine micro-dust. Zero flash, zero double layer.
                float pStart = 0.004;
                float cueDelay = aNormY * 0.008 + (aRandom.x - 0.5) * 0.006;
                float pAfter = uScrollProgress - pStart - cueDelay;
                if (pAfter > 0.0001) {
                    float progress = clamp(pAfter / 0.10, 0.0, 1.0);
                    dispProgress = progress * progress * (3.0 - 2.0 * progress);
                    alpha = smoothstep(0.0, 0.04, dispProgress);
                } else {
                    alpha = 0.0;
                }
            } else if (aType > 1.2) {
                // ─── TIER 2A: STUDIO TYPOGRAPHY (MIDDLE) ───
                // Bottom-to-top organic eruption into dust at p >= 0.030
                // Spatial Simplex noise prevents flat horizontal lines!
                float pStart = 0.030;
                float spatialNoise = snoise(vec3(position.xy * 0.040, aRandom.x * 5.0));
                float waveDelay = aNormY * 0.016 + spatialNoise * 0.005 + (aRandom.x - 0.5) * 0.004;
                float pAfter = uScrollProgress - pStart - waveDelay;
                if (pAfter > 0.0001) {
                    float progress = clamp(pAfter / 0.12, 0.0, 1.0);
                    dispProgress = progress * progress * (3.0 - 2.0 * progress);
                    alpha = smoothstep(0.0, 0.04, dispProgress);
                } else {
                    alpha = 0.0;
                }
            } else if (aType > 0.5) {
                // ─── TIER 2B: CRIMSON PERIOD DOT ───
                // Delicate organic red dust eruption at p >= 0.030. ZERO SUDDEN BLAST.
                float pStart = 0.030;
                float redDelay = aNormY * 0.008 + (aRandom.x - 0.5) * 0.006;
                float pAfter = uScrollProgress - pStart - redDelay;
                if (pAfter > 0.0001) {
                    float progress = clamp(pAfter / 0.14, 0.0, 1.0);
                    dispProgress = progress * progress * (3.0 - 2.0 * progress);
                    alpha = smoothstep(0.0, 0.04, dispProgress);
                } else {
                    alpha = 0.0;
                }
            } else {
                // ─── TIER 3: STΔN TYPOGRAPHY (TOP) ───
                // Bottom-to-top organic eruption into dust at p >= 0.055
                // Spatial Simplex noise prevents flat horizontal lines!
                float pStart = 0.055;
                float spatialNoise = snoise(vec3(position.xy * 0.035, aRandom.x * 6.0));
                float waveDelay = aNormY * 0.018 + spatialNoise * 0.006 + (aRandom.x - 0.5) * 0.005;
                float pAfter = uScrollProgress - pStart - waveDelay;
                if (pAfter > 0.0001) {
                    float progress = clamp(pAfter / 0.14, 0.0, 1.0);
                    dispProgress = progress * progress * (3.0 - 2.0 * progress);
                    alpha = smoothstep(0.0, 0.04, dispProgress);
                } else {
                    alpha = 0.0;
                }
            }

            vDust = dispProgress;

            // ─── SYNCHRONIZED END: ALL TIERS FADE OUT TOGETHER AT FULL UNROLL ───
            float unifiedFadeOut = 1.0 - smoothstep(0.70 + aRandom.x * 0.12, 0.94 + aRandom.y * 0.04, uScrollProgress);
            vAlpha = alpha * unifiedFadeOut;

            // ABSOLUTE ZERO LEAKAGE: Inactive / at-rest particles are completely clipped out
            // NEVER renders on top of DOM text -> ZERO DOUBLE LAYER, ZERO BOLD FEEL
            if (vAlpha <= 0.001) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                gl_PointSize = 0.0;
                return;
            }

            // ══════════════════════════════════════════════════════════════
            // HIGH-ENERGY TURBULENT SHATTER & EVAPORATION
            // ══════════════════════════════════════════════════════════════
            vec3 hfCoord = (position * 0.042) + vec3(uTime * 0.30, uTime * 0.25, aRandom.x * 12.0);
            vec3 hfNoise = vec3(
                snoise(hfCoord),
                snoise(hfCoord + vec3(31.4, 71.2, 19.8)),
                snoise(hfCoord + vec3(88.3, 14.7, 52.1))
            );

            // 55% noise + 45% radial isotropic dispersal
            vec3 disperseDir = normalize(aRandomDir * 0.45 + hfNoise * 0.55);

            float maxSpread = (50.0 + aRandom.z * 75.0) * uSpreadScale;
            if (aType > 0.5 && aType < 1.2) {
                // High-contrast red particles disperse delicately throughout the dust field
                maxSpread = (42.0 + aRandom.z * 65.0) * uSpreadScale;
            } else if (aType >= 1.8) {
                maxSpread = (45.0 + aRandom.z * 70.0) * uSpreadScale;
            }

            // ZERO UPLIFT: Explodes directly in place in 3D isotropic space
            vec3 worldDisp = position + (disperseDir * maxSpread * dispProgress);
            worldDisp.z += aRandomDir.z * 35.0 * dispProgress;

            // ══════════════════════════════════════════════════════════════
            // DELAYED DENSE HOVER CROWD WITH NATURAL INERTIAL DECAY
            // ══════════════════════════════════════════════════════════════
            float hoverWeight = uMouseWorld.z;
            if (hoverWeight > 0.001 && uMagnetStrength > 0.001 && dispProgress > 0.001) {
                vec2 mouseDiff = uMouseWorld.xy - worldDisp.xy;
                float mouseDist = length(mouseDiff);
                if (mouseDist < uMagnetRadius) {
                    float angle = aRandom.z * 6.2831853;
                    float rDisk = sqrt(aRandom.w) * 30.0;
                    vec2 crowdPos = uMouseWorld.xy + vec2(cos(angle), sin(angle)) * rDisk;
                    
                    vec2 toCrowd = crowdPos - worldDisp.xy;
                    float normDist = mouseDist / uMagnetRadius;
                    
                    float densityPull = (1.0 - normDist) * (1.0 - normDist);
                    float pullAmount = clamp(densityPull * uMagnetStrength * 3.5 * dispProgress * hoverWeight, 0.0, 0.88);
                    
                    worldDisp.xy += toCrowd * pullAmount;
                    
                    vec2 swirlDir = vec2(-mouseDiff.y, mouseDiff.x) / max(mouseDist, 1.0);
                    float swirl = sin(uTime * 2.8 + aRandom.x * 6.283) * 4.0 * (1.0 - normDist) * uMagnetStrength * dispProgress * hoverWeight;
                    worldDisp.xy += swirlDir * swirl;
                    worldDisp.z += (1.0 - normDist) * 16.0 * uMagnetStrength * dispProgress * hoverWeight;
                }
            }

            // ══════════════════════════════════════════════════════════════
            // POINT SIZE: DELICATE CIRCULAR MICRO-DUST GRAINS IN MOTION
            // ══════════════════════════════════════════════════════════════
            float dustPt = uParticleSize * uPixelRatio * (0.85 + aRandom.y * 0.30);
            if (aType > 0.5 && aType < 1.2) {
                dustPt *= 0.85; // delicate scarlet dust for period dot
            }
            gl_PointSize = dustPt;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(worldDisp, 1.0);
        }
    `;

    // ═══════════════════════════════════════════════════════════════════
    // GLSL FRAGMENT SHADER: SOFT ANTI-ALIASED CIRCULAR MICRO-DUST GRAINS
    // ═══════════════════════════════════════════════════════════════════
    const FRAGMENT_SHADER = /* glsl */ `
        uniform float uTime;
        uniform float uScrollProgress;
        uniform float uIsDark;

        varying vec4 vColor;
        varying vec4 vRandom;
        varying float vAlpha;
        varying float vType;
        varying float vDust;

        void main() {
            if (vAlpha <= 0.002) discard;

            // Soft anti-aliased circular micro-dust grain (ZERO SQUARE TILES, ZERO BOLD OVERLAP)
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;
            float edgeAlpha = smoothstep(0.5, 0.22, dist);

            // High-contrast electric scarlet red (#FF002E) particles: pure, vivid, visible in dust
            if (vType > 0.5 && vType < 1.2) {
                vec3 redCol = vec3(1.0, 0.0, 0.18);
                gl_FragColor = vec4(redCol, edgeAlpha * vAlpha);
                return;
            }

            // High-contrast typography particles:
            // Light mode: pitch black (#000000)
            // Dark mode: pure white (#FFFFFF)
            vec3 col = (uIsDark > 0.5) ? vec3(1.0, 1.0, 1.0) : vec3(0.0, 0.0, 0.0);
            if (vType >= 1.8) {
                col = (uIsDark > 0.5) ? vec3(1.0, 1.0, 1.0) : vec3(0.09, 0.10, 0.12);
            }

            gl_FragColor = vec4(col, edgeAlpha * vAlpha);
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
        currentHoverStrength: 0.0,
        magnetStrength: 0.20,
        magnetRadius: 145.0,
        particleSize: 1.2,
        spreadScale: 0.7,
    };

    /**
     * Samples the exact DOM typography and button onto an offscreen canvas
     * and constructs 60,000 - 90,000 ultra-fine micro-particles.
     */
    function sampleHeroParticles() {
        if (!state.heroBrand) return;

        const stanEl = state.heroBrand.querySelector('.hero-stan');
        const studioEl = state.heroBrand.querySelector('.hero-studio');
        const dotEl = studioEl ? studioEl.querySelector('.crimson-dot') : null;
        const cueEl = state.heroBrand.querySelector('.hero-scroll-cue');

        if (!stanEl || !studioEl || !cueEl) return;

        state.stanEl = stanEl;
        state.studioEl = studioEl;
        state.dotEl = dotEl;
        state.cueEl = cueEl;

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

        // Dedicated single-element sampling pass (eliminates all boundary cross-talk and slicing)
        function samplePass(drawFn, typeVal, elemTop, elemHeight, colorOverride, subsampleRate) {
            ctx.clearRect(0, 0, width, height);
            drawFn();
            const imgData = ctx.getImageData(0, 0, offW, offH);
            const data = imgData.data;

            for (let py = 0; py < offH; py++) {
                const sampleY = py / sampleScale;
                // Normalized coordinate within this specific element: 0 at bottom, 1 at top
                let normInElem = 0.5;
                if (elemHeight > 0) {
                    normInElem = Math.max(0.0, Math.min(1.0, 1.0 - ((sampleY - elemTop) / elemHeight)));
                }

                for (let px = 0; px < offW; px++) {
                    const idx = (py * offW + px) * 4;
                    const a = data[idx + 3];
                    if (a > 32) {
                        if (subsampleRate && Math.random() > subsampleRate) continue;

                        const screenX = hbRect.left - pad + (px / sampleScale);
                        const screenY = hbRect.top - pad + (py / sampleScale);

                        const worldX = screenX - halfWinW;
                        const worldY = -(screenY - halfWinH);
                        const worldZ = 0.0;

                        positions.push(worldX, worldY, worldZ);

                        if (colorOverride) {
                            colors.push(colorOverride[0], colorOverride[1], colorOverride[2], a / 255);
                        } else {
                            colors.push(data[idx] / 255, data[idx + 1] / 255, data[idx + 2] / 255, a / 255);
                        }

                        // Uniform 3D isotropic radial unit vector
                        const theta = Math.random() * 2 * Math.PI;
                        const phi = Math.acos(2 * Math.random() - 1);
                        randomDirs.push(
                            Math.sin(phi) * Math.cos(theta),
                            Math.sin(phi) * Math.sin(theta),
                            Math.cos(phi)
                        );

                        randoms.push(Math.random(), Math.random(), Math.random(), Math.random());
                        grains.push(Math.random());
                        normYs.push(normInElem);
                        types.push(typeVal);
                    }
                }
            }
        }

        // Helper to dynamically measure exact live DOM baseline to eliminate any sub-pixel jump
        function getElementBaseline(el) {
            try {
                const strut = document.createElement('span');
                strut.style.display = 'inline-block';
                strut.style.width = '0px';
                strut.style.height = '0px';
                strut.style.verticalAlign = 'baseline';
                el.appendChild(strut);
                const baseline = strut.getBoundingClientRect().top - el.getBoundingClientRect().top;
                el.removeChild(strut);
                return baseline;
            } catch (e) {
                return 0;
            }
        }

        // Pass 1: STΔN Typography (100% isolated, zero bottom truncation)
        const stanRelX = (stanRect.left + stanRect.width / 2) - hbRect.left + pad;
        const stanBaselineOffset = getElementBaseline(stanEl) || 67.80;
        const stanBaselineY = (stanRect.top - hbRect.top + pad) + stanBaselineOffset;
        samplePass(function () {
            ctx.fillStyle = textCol;
            ctx.font = '800 92px "Antapani", -apple-system, sans-serif';
            if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.03em';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('STΔN', stanRelX, stanBaselineY);
        }, 0.0, stanRect.top - hbRect.top + pad, stanRect.height);

        // Pass 2: Studio Typography (100% isolated, zero STΔN contamination)
        const studioRelX = studioRect.left - hbRect.left + pad;
        const studioRelY = studioRect.top - hbRect.top + pad;
        const studioBaselineOffset = getElementBaseline(studioEl) || 31.80;
        const studioBaselineY = studioRelY + studioBaselineOffset;
        samplePass(function () {
            ctx.fillStyle = textCol;
            ctx.font = '800 42px "Antapani", -apple-system, sans-serif';
            if ('letterSpacing' in ctx) ctx.letterSpacing = '-0.02em';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('studio', studioRelX, studioBaselineY);
        }, 1.5, studioRect.top - hbRect.top + pad, studioRect.height);

        // Pass 3: Crimson Period Dot
        // User directive: "red dont vanish" -> ZERO VANISHING!
        // Sits as clean solid 8px period dot at rest, then dissolves into delicate red dust pinch
        if (dotRect) {
            const dotRelX = dotRect.left - hbRect.left + pad;
            samplePass(function () {
                ctx.fillStyle = '#FF0033';
                ctx.font = '800 42px "Antapani", -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText('.', dotRelX, studioBaselineY);
            }, 1.0, studioRect.top - hbRect.top + pad, studioRect.height, [1.0, 0.0, 0.18], 0.30);
        }

        // Pass 4: Circular Scroll Cue Button
        const cueRelX = cueRect.left - hbRect.left + pad;
        const cueRelY = cueRect.top - hbRect.top + pad;
        const cueCx = cueRelX + cueRect.width / 2;
        const cueCy = cueRelY + cueRect.height / 2;
        const cueR = cueRect.width / 2;
        samplePass(function () {
            ctx.fillStyle = cueBgCol;
            ctx.beginPath();
            ctx.arc(cueCx, cueCy, cueR, 0, Math.PI * 2);
            ctx.fill();

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
        }, 2.0, cueRect.top - hbRect.top + pad, cueRect.height);

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

        // Heavy spool-like delayed mouse tracking (responding as heavy thing with physical delay)
        const mouseInertia = 0.045; // Exactly matching spool 0.05 lag
        state.mouseWorldX += (state.targetMouseWorldX - state.mouseWorldX) * mouseInertia;
        state.mouseWorldY += (state.targetMouseWorldY - state.mouseWorldY) * mouseInertia;

        // Determine target hover state near hero brand / dust field
        let targetHover = 0.0;
        if (state.heroBrand && state.isMouseHovering && p >= 0.002) {
            const rect = state.heroBrand.getBoundingClientRect();
            // Generous reach around hero lockup: magnetRadius + 180px
            // Ensures fast mouse swipes don't prematurely drop the gravitational field
            const reach = state.magnetRadius + 180.0;
            const mx = state.mouseClientX || 0;
            const my = state.mouseClientY || 0;
            if (mx >= rect.left - reach && mx <= rect.right + reach &&
                my >= rect.top - reach && my <= rect.bottom + reach) {
                targetHover = 1.0;
            }
        }
        // Asymmetric physical relaxation:
        // Enters smoothly at 0.08, but decays gracefully at 0.028 (~1.5s natural return) if cursor is lost or moves away
        const decayRate = (targetHover > state.currentHoverStrength) ? 0.08 : 0.028;
        state.currentHoverStrength += (targetHover - state.currentHoverStrength) * decayRate;
        if (state.currentHoverStrength < 0.001) state.currentHoverStrength = 0.0;

        // 4. Staged 3-Tier Progressive Handoff (Bottom-Up):
        // - Stage 1 (Bottom): Round pill cue button dissolves first (p >= 0.002)
        // - Stage 2 (Middle): studio. typography dissolves when cue particles collide with it (p >= 0.030)
        // - Stage 3 (Top):    STΔN typography dissolves when studio particles collide with it (p >= 0.055)
        const stanEl = state.stanEl || (state.stanEl = state.heroBrand ? state.heroBrand.querySelector('.hero-stan') : null);
        const studioEl = state.studioEl || (state.studioEl = state.heroBrand ? state.heroBrand.querySelector('.hero-studio') : null);
        const cueEl = state.cueEl || (state.cueEl = state.heroBrand ? state.heroBrand.querySelector('.hero-scroll-cue') : null);

        if (state.heroBrand) {
            state.heroBrand.style.filter = 'none';
            state.heroBrand.style.transform = 'translateY(-50%)';
            state.heroBrand.style.opacity = '1';
            state.heroBrand.style.pointerEvents = 'auto';
        }

        // Tier 1: Scroll cue button smoothly dissolves into dust (ZERO FLASH)
        if (cueEl) {
            if (p < 0.004) {
                cueEl.style.opacity = '1';
                cueEl.style.pointerEvents = 'auto';
            } else {
                const cueFade = Math.max(0.0, 1.0 - (p - 0.004) / 0.016);
                cueEl.style.opacity = cueFade.toFixed(3);
                cueEl.style.pointerEvents = (cueFade <= 0.01) ? 'none' : 'auto';
            }
        }

        // Tier 2: studio. typography (p >= 0.030)
        // Dissolves smoothly as bottom-up micro-dust cloud erupts (ZERO DOUBLE LAYER, ZERO BOLD)
        if (studioEl) {
            studioEl.style.clipPath = 'none';
            if (p < 0.030) {
                studioEl.style.opacity = '1';
            } else {
                const studioFade = Math.max(0.0, 1.0 - (p - 0.030) / 0.018);
                studioEl.style.opacity = studioFade.toFixed(3);
            }
        }

        // Tier 3: STΔN typography (p >= 0.055)
        // Sits 100% crisp DOM vector font while studio disperses.
        // Dissolves smoothly as bottom-up micro-dust cloud erupts (ZERO UPLIFT, ZERO DOUBLE LAYER)
        if (stanEl) {
            stanEl.style.clipPath = 'none';
            if (p < 0.055) {
                stanEl.style.opacity = '1';
            } else {
                const stanFade = Math.max(0.0, 1.0 - (p - 0.055) / 0.022);
                stanEl.style.opacity = stanFade.toFixed(3);
            }
        }

        if (state.canvas) {
            state.canvas.style.opacity = '1';
        }

        // 5. Update shader uniforms
        if (state.material) {
            state.material.uniforms.uTime.value = time;
            state.material.uniforms.uScrollProgress.value = p;
            state.material.uniforms.uScrollVelocity.value = state.dampedVelocity;
            // Continuous smooth hoverWeight with physical momentum decay
            state.material.uniforms.uMouseWorld.value.set(
                state.mouseWorldX,
                state.mouseWorldY,
                state.currentHoverStrength
            );
            state.material.uniforms.uMagnetStrength.value = state.magnetStrength;
            state.material.uniforms.uMagnetRadius.value = state.magnetRadius;
            state.material.uniforms.uParticleSize.value = state.particleSize;
            state.material.uniforms.uSpreadScale.value = state.spreadScale;
        }

        // 6. Render WebGL micro-particles when active or in transition (ZERO FLASH)
        if (state.renderer && state.scene && state.camera) {
            if (p > 0.001) {
                state.renderer.render(state.scene, state.camera);
            } else {
                state.renderer.clear();
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
