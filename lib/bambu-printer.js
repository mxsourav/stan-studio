/**
 * STΔN 3D STUDIO — BAMBU LAB A1 MINI INTERACTIVE STUDIO & KINEMATICS ENGINE
 * Model Creator: neilvfx (Sketchfab, CC-BY 4.0)
 * 
 * Features:
 * - Standalone WebGL studio renderer with studio HD soft lighting & contact shadows
 * - Full interactive Orbit & Zoom (mouse drag / scroll wheel)
 * - Complete transform controls: Stage Position (X,Y,Z), Rotation (X,Y,Z deg), Scale
 * - Full independent Arm/Gantry XYZ controls: Toolhead Glide (X), Gantry Height (Y), Bed Carriage (Z)
 * - Authentic G-code toolpath kinematics with safe PEI plate centering & collision avoidance
 * - Authentic brushed silver aluminum PBR material for the cantilever arm & steel guide rail
 * - Dynamic procedural flexing Bowden PTFE tube & electrical cable moving seamlessly with toolhead
 * - Dynamic continuous bed cable loop (hiding severed static stub and flexing cleanly into base)
 * - Cleaned factory toolhead housing (hides overlapping accessory/mod meshes)
 * - Dynamic hotend nozzle LED light (215°C amber glow)
 * - Dynamic 3D G-code molten filament extrusion trail
 * - Bambu Micro LiDAR dual-laser auto bed leveling scanner
 * - Native Web Audio CoreXY stepper motor PWM synthesizer
 * - FLIR Infrared Thermal IR Heatmap Vision mode
 * - Live telemetry readout callback
 */

class BambuStepperAudio {
    constructor() {
        this.ctx = null;
        this.isEnabled = false;
        this.oscX = null;
        this.oscY = null;
        this.filter = null;
        this.gain = null;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();

            this.oscX = this.ctx.createOscillator();
            this.oscY = this.ctx.createOscillator();
            this.oscX.type = 'sawtooth';
            this.oscY.type = 'triangle';

            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = 'bandpass';
            this.filter.frequency.value = 850;
            this.filter.Q.value = 3.5;

            this.gain = this.ctx.createGain();
            this.gain.gain.value = 0.0;

            this.oscX.connect(this.filter);
            this.oscY.connect(this.filter);
            this.filter.connect(this.gain);
            this.gain.connect(this.ctx.destination);

            this.oscX.start();
            this.oscY.start();
        } catch (e) {
            console.warn('Web Audio Stepper Audio not supported:', e);
        }
    }

    toggle() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.isEnabled = !this.isEnabled;
        if (!this.isEnabled && this.gain && this.ctx) {
            this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
        }
        return this.isEnabled;
    }

    update(speedMultiplier, isPrinting, mode) {
        if (!this.ctx || !this.isEnabled || !isPrinting) {
            if (this.gain && this.ctx) {
                this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
            }
            return;
        }

        const now = this.ctx.currentTime;
        const speed = Math.max(0.5, speedMultiplier || 1.8);

        if (mode && mode.includes('Infill')) {
            // Rapid 45° infill raster buzzing (stepper microstepping resonance)
            const t = now * 18 * speed;
            const stepPitch = 520 * Math.min(2.0, speed) + Math.sin(t) * 140;
            this.oscX.frequency.setTargetAtTime(stepPitch, now, 0.015);
            this.oscY.frequency.setTargetAtTime(stepPitch * 1.5, now, 0.015);
            this.filter.frequency.setTargetAtTime(1100, now, 0.02);
            this.gain.gain.setTargetAtTime(0.040, now, 0.02);
        } else if (mode && mode.includes('Perimeter')) {
            // Smooth circular motion melodic pitch sweep
            const t = now * 4.5 * speed;
            const sweep = 360 * Math.min(1.8, speed) + Math.sin(t) * 75;
            this.oscX.frequency.setTargetAtTime(sweep, now, 0.03);
            this.oscY.frequency.setTargetAtTime(sweep * 1.25, now, 0.03);
            this.filter.frequency.setTargetAtTime(750, now, 0.03);
            this.gain.gain.setTargetAtTime(0.032, now, 0.03);
        } else {
            // Travel / Z-Step chirp
            this.oscX.frequency.setTargetAtTime(960, now, 0.01);
            this.gain.gain.setTargetAtTime(0.015, now, 0.02);
        }
    }
}

class BambuPrinterStudio {
    constructor(canvas, options = {}) {
        this.canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
        if (!this.canvas) {
            console.error('BambuPrinterStudio: Canvas element not found.');
            return;
        }

        this.options = Object.assign({
            modelPath: 'bambu_a1_mini_standard.glb',
            posX: 0.0,
            posY: -1.2,
            posZ: 0.0,
            rotX: 0.0,
            rotY: -28.0, // Degrees
            rotZ: 0.0,
            scale: 4.8,
            armX: 0.0, // Toolhead travel along rail (mm)
            armY: 0.0, // Gantry height along Z-column (mm)
            armZ: 0.0, // Bed carriage offset (mm)
            filamentColor: 0xef4444,
            speed: 1.8,
            onTelemetry: null,
            onLoaded: null,
            onProgress: null
        }, options);

        this.defaultTransform = {
            posX: this.options.posX,
            posY: this.options.posY,
            posZ: this.options.posZ,
            rotX: this.options.rotX,
            rotY: this.options.rotY,
            rotZ: this.options.rotZ,
            scale: this.options.scale
        };

        this.armPose = {
            x: this.options.armX || 0.0,
            y: this.options.armY || 0.0,
            z: this.options.armZ || 0.0
        };

        // Calibrated travel limits for each motor axis (real millimeter coordinates)
        this.axisLimits = Object.assign({
            xStart: 14.0,
            xEnd: 90.0,
            yStart: 35.0,
            yEnd: 100.0,
            zStart: -10.0,
            zEnd: 70.0
        }, this.options.axisLimits || {});

        // Manual motor testing position: 0% is Start limit, 100% is End limit
        this.manualMotorPercent = {
            x: 50.0,
            y: 50.0,
            z: 20.0
        };

        this.isLoaded = false;
        this.isPrinting = true;
        this.speedMultiplier = this.options.speed;

        // Kinematics State
        this.pathTime = 0;
        this.layerIndex = 0;
        this.totalLayers = 50;
        this.layerZOffset = 0;

        // Interactive Studio FX: Micro LiDAR, Extrusion Trail, Audio, Thermal IR
        this.isLidarActive = true;
        this.isThermalActive = false;
        this.audioEngine = new BambuStepperAudio();
        this.extrusionPoints = [];
        this._lastExtrudeTime = 0;

        // Setup Scene & Viewport
        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        this._initGround();
        this._initPrintedPart();
        this._initDynamicTubes();
        this._initMicroLidar();
        this._initOrbitControls();

        const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
        this.setTheme(isDark);

        // Load Bambu Lab A1 Mini
        this._loadModel();

        // Start 60fps Loop
        this.clock = new THREE.Clock();
        this._animate = this._animate.bind(this);
        requestAnimationFrame(this._animate);

        // Window resize
        window.addEventListener('resize', () => this.resize());
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        const w = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : window.innerWidth;
        const h = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : window.innerHeight;
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.printerGroup = new THREE.Group();
        this._applyTransformToGroup();
        this.scene.add(this.printerGroup);
    }

    _initCamera() {
        const aspect = (this.canvas.width || 800) / (this.canvas.height || 600);
        this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
        this.defaultCameraPos = new THREE.Vector3(0, 1.8, 8.2);
        this.defaultLookTarget = new THREE.Vector3(0, 0.4, 0);

        this.cameraPos = this.defaultCameraPos.clone();
        this.lookTarget = this.defaultLookTarget.clone();
        this.camera.position.copy(this.cameraPos);
        this.camera.lookAt(this.lookTarget);
    }

    _initLights() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        this.scene.add(this.ambientLight);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
        this.keyLight.position.set(5, 12, 6);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = 2048;
        this.keyLight.shadow.mapSize.height = 2048;
        this.keyLight.shadow.bias = -0.0001;
        this.keyLight.shadow.normalBias = 0.02;
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xe0eeff, 0.55);
        this.fillLight.position.set(-6, 4, -4);
        this.scene.add(this.fillLight);

        this.rimLight = new THREE.DirectionalLight(0xffffff, 0.65);
        this.rimLight.position.set(-2, 8, 8);
        this.scene.add(this.rimLight);

        // Nozzle hotend light
        this.nozzleLight = new THREE.PointLight(0xffedd5, 1.0, 0.5, 2.0);
        this.scene.add(this.nozzleLight);

        // Procedural Studio HDRI Environment Map for realistic metallic specular reflections
        try {
            if (this.renderer && typeof THREE.PMREMGenerator !== 'undefined') {
                const pmremGen = new THREE.PMREMGenerator(this.renderer);
                const envCanvas = document.createElement('canvas');
                envCanvas.width = 256;
                envCanvas.height = 128;
                const eCtx = envCanvas.getContext('2d');
                const grad = eCtx.createLinearGradient(0, 0, 0, 128);
                grad.addColorStop(0, '#e2e8f0'); // Soft studio ceiling dome
                grad.addColorStop(0.3, '#cbd5e1');
                grad.addColorStop(0.7, '#94a3b8'); // Neutral soft metallic horizon
                grad.addColorStop(1, '#475569'); // Studio floor bounce
                eCtx.fillStyle = grad;
                eCtx.fillRect(0, 0, 256, 128);

                // Studio softbox highlight
                eCtx.fillStyle = '#f8fafc';
                eCtx.fillRect(80, 20, 96, 40);

                const envTex = new THREE.CanvasTexture(envCanvas);
                envTex.mapping = THREE.EquirectangularReflectionMapping;
                const envTarget = pmremGen.fromEquirectangular(envTex);
                this.scene.environment = envTarget.texture;
                pmremGen.dispose();
            }
        } catch (e) {
            console.warn('BambuPrinterStudio: PMREM environment fallback', e);
        }
    }

    _initGround() {
        // Soft Gaussian contact shadow beneath the printer rubber feet
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const cx = 256, cy = 256;

        if (typeof ctx.filter === 'string') {
            ctx.filter = 'blur(35px)';
            ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, 190, 170, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.filter = 'blur(16px)';
            ctx.fillStyle = 'rgba(10, 15, 30, 0.45)';
            ctx.beginPath();
            ctx.ellipse(cx, cy, 140, 120, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const radGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 200);
            radGrad.addColorStop(0, 'rgba(12, 18, 32, 0.45)');
            radGrad.addColorStop(0.6, 'rgba(12, 18, 32, 0.18)');
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, 512, 512);
        }

        const shadowTex = new THREE.CanvasTexture(canvas);
        const shadowGeo = new THREE.PlaneGeometry(4.4, 4.2);
        const shadowMat = new THREE.MeshBasicMaterial({
            map: shadowTex,
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });
        this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.contactShadow.rotation.x = -Math.PI / 2;
        this.contactShadow.rotation.z = (this.options.rotY * Math.PI) / 180;
        this.contactShadow.position.set(this.options.posX, this.options.posY + 0.005, this.options.posZ);
        this.scene.add(this.contactShadow);
    }

    _initPrintedPart() {
        this.printedGroup = new THREE.Group();
        this.scene.add(this.printedGroup);

        const baseGeo = new THREE.CylinderGeometry(0.15, 0.16, 0.04, 6);
        const emblemMat = new THREE.MeshStandardMaterial({
            color: this.options.filamentColor,
            roughness: 0.35,
            metalness: 0.12,
            bumpScale: 0.005
        });
        this.printedBaseMesh = new THREE.Mesh(baseGeo, emblemMat);
        this.printedBaseMesh.castShadow = true;
        this.printedBaseMesh.receiveShadow = true;
        this.printedGroup.add(this.printedBaseMesh);

        const coreGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 6);
        const coreMesh = new THREE.Mesh(coreGeo, emblemMat);
        coreMesh.position.y = 0.02;
        coreMesh.castShadow = true;
        this.printedGroup.add(coreMesh);

        // 3D Real-time G-Code Extrusion Filament Trail
        const maxPoints = 300;
        const positions = new Float32Array(maxPoints * 3);
        const colors = new Float32Array(maxPoints * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setDrawRange(0, 0);

        const lineMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            linewidth: 3,
            transparent: true,
            opacity: 0.95
        });
        this.extrusionLine = new THREE.Line(geo, lineMat);
        this.printedGroup.add(this.extrusionLine);

        // Incandescent molten bead directly at nozzle orifice (215°C molten core)
        const beadGeo = new THREE.SphereGeometry(0.010, 10, 10);
        const beadMat = new THREE.MeshBasicMaterial({
            color: 0xffedd5,
            transparent: true,
            opacity: 0.95
        });
        this.moltenBeadMesh = new THREE.Mesh(beadGeo, beadMat);
        this.printedGroup.add(this.moltenBeadMesh);
    }

    _initMicroLidar() {
        this.lidarGroup = new THREE.Group();
        this.printerGroup.add(this.lidarGroup);

        // 1. Dual laser triangular fan planes
        const fanCanvas = document.createElement('canvas');
        fanCanvas.width = 128;
        fanCanvas.height = 256;
        const fCtx = fanCanvas.getContext('2d');
        const fGrad = fCtx.createLinearGradient(64, 0, 64, 256);
        fGrad.addColorStop(0, 'rgba(34, 211, 238, 0.95)');   // Neon cyan emitter lens
        fGrad.addColorStop(0.25, 'rgba(52, 211, 153, 0.65)'); // Emerald transition
        fGrad.addColorStop(0.85, 'rgba(6, 182, 212, 0.20)'); // Volumetric dispersion
        fGrad.addColorStop(1, 'rgba(6, 182, 212, 0.0)');    // Soft fade at plate
        fCtx.fillStyle = fGrad;
        fCtx.beginPath();
        fCtx.moveTo(64, 0);
        fCtx.lineTo(124, 256);
        fCtx.lineTo(4, 256);
        fCtx.closePath();
        fCtx.fill();

        // High intensity core laser line triangulation beams
        fCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        fCtx.lineWidth = 1.8;
        fCtx.beginPath();
        fCtx.moveTo(64, 0); fCtx.lineTo(44, 256);
        fCtx.moveTo(64, 0); fCtx.lineTo(84, 256);
        fCtx.stroke();

        const fanTex = new THREE.CanvasTexture(fanCanvas);
        this.laserFanMat = new THREE.MeshBasicMaterial({
            map: fanTex,
            transparent: true,
            opacity: 0.70,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // 2 crossed triangles forming a volumetric 3D laser sheet fan (6 vertices)
        const fanGeo = new THREE.BufferGeometry();
        const fanPos = new Float32Array(18);
        const fanUvs = new Float32Array([
            0.5, 1.0,  0.0, 0.0,  1.0, 0.0,
            0.5, 1.0,  0.0, 0.0,  1.0, 0.0
        ]);
        fanGeo.setAttribute('position', new THREE.BufferAttribute(fanPos, 3));
        fanGeo.setAttribute('uv', new THREE.BufferAttribute(fanUvs, 2));
        this.laserFanMesh = new THREE.Mesh(fanGeo, this.laserFanMat);
        this.lidarGroup.add(this.laserFanMesh);

        // 2. Holographic bed scan reticle
        const retCanvas = document.createElement('canvas');
        retCanvas.width = 256;
        retCanvas.height = 256;
        const rCtx = retCanvas.getContext('2d');
        const cx = 128, cy = 128;

        const radGrad = rCtx.createRadialGradient(cx, cy, 6, cx, cy, 115);
        radGrad.addColorStop(0, 'rgba(34, 211, 238, 0.50)');
        radGrad.addColorStop(0.5, 'rgba(52, 211, 153, 0.22)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        rCtx.fillStyle = radGrad;
        rCtx.beginPath();
        rCtx.arc(cx, cy, 115, 0, Math.PI * 2);
        rCtx.fill();

        rCtx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
        rCtx.lineWidth = 1.5;
        [28, 56, 88].forEach(r => {
            rCtx.beginPath();
            rCtx.arc(cx, cy, r, 0, Math.PI * 2);
            rCtx.stroke();
        });

        rCtx.strokeStyle = 'rgba(52, 211, 153, 0.95)';
        rCtx.lineWidth = 2.0;
        rCtx.beginPath();
        rCtx.moveTo(cx - 95, cy); rCtx.lineTo(cx + 95, cy);
        rCtx.moveTo(cx, cy - 95); rCtx.lineTo(cx, cy + 95);
        rCtx.stroke();

        const retTex = new THREE.CanvasTexture(retCanvas);
        this.laserReticleMat = new THREE.MeshBasicMaterial({
            map: retTex,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const retGeo = new THREE.PlaneGeometry(0.28, 0.28);
        this.laserReticle = new THREE.Mesh(retGeo, this.laserReticleMat);
        this.laserReticle.rotation.x = -Math.PI / 2;
        this.lidarGroup.add(this.laserReticle);
    }

    _initDynamicTubes() {
        // Procedural Bowden PTFE tube (smoked semi-translucent polymer matching real photo)
        this.ptfeMat = new THREE.MeshPhysicalMaterial({
            color: 0x71717a,
            roughness: 0.25,
            transmission: 0.55,
            opacity: 0.75,
            transparent: true,
            ior: 1.34,
            depthWrite: true,
            side: THREE.DoubleSide
        });

        // Procedural hotend electrical cable harness (ribbed matte black wire loom)
        this.cableMat = new THREE.MeshStandardMaterial({
            color: 0x141416,
            roughness: 0.65,
            metalness: 0.15
        });

        this.ptfeMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.ptfeMat);
        this.ptfeMesh.castShadow = true;
        this.ptfeMesh.visible = false;
        this.printerGroup.add(this.ptfeMesh);

        this.cableMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.cableMat);
        this.cableMesh.castShadow = true;
        this.cableMesh.visible = false;
        this.printerGroup.add(this.cableMesh);

        // Procedural continuous heatbed power cable loop (connects cleanly from bed into base)
        this.bedCableMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.cableMat);
        this.bedCableMesh.castShadow = true;
        this.bedCableMesh.visible = false;
        this.printerGroup.add(this.bedCableMesh);
    }

    _initOrbitControls() {
        let isDragging = false;
        let prevMouse = { x: 0, y: 0 };
        this.spherical = { radius: 8.2, theta: 0, phi: Math.PI * 0.42 };
        this.targetSpherical = { ...this.spherical };

        this.canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            prevMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = (e.clientX - prevMouse.x) * 0.007;
            const dy = (e.clientY - prevMouse.y) * 0.007;

            this.targetSpherical.theta -= dx;
            this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI * 0.48, this.targetSpherical.phi - dy));

            prevMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => { isDragging = false; });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.targetSpherical.radius = Math.max(3.5, Math.min(16.0, this.targetSpherical.radius + e.deltaY * 0.006));
        }, { passive: false });

        // Touch support
        let touchStartDist = 0;
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                touchStartDist = Math.hypot(dx, dy);
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isDragging) {
                const dx = (e.touches[0].clientX - prevMouse.x) * 0.007;
                const dy = (e.touches[0].clientY - prevMouse.y) * 0.007;
                this.targetSpherical.theta -= dx;
                this.targetSpherical.phi = Math.max(0.1, Math.min(Math.PI * 0.48, this.targetSpherical.phi - dy));
                prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const diff = touchStartDist - dist;
                this.targetSpherical.radius = Math.max(3.5, Math.min(16.0, this.targetSpherical.radius + diff * 0.01));
                touchStartDist = dist;
            }
        }, { passive: true });

        this.canvas.addEventListener('touchend', () => { isDragging = false; });
    }

    _loadModel() {
        if (typeof THREE.GLTFLoader === 'undefined') {
            console.error('BambuPrinterStudio: THREE.GLTFLoader is required.');
            return;
        }

        const loader = new THREE.GLTFLoader();
        loader.load(
            this.options.modelPath,
            (gltf) => {
                this.model = gltf.scene;
                this.printerGroup.add(this.model);

                this.model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            child.material.envMapIntensity = 1.15;
                            child.material.roughness = Math.max(0.2, child.material.roughness || 0.4);
                        }
                    }
                });

                // 1. Hide duplicate / overlapping mod meshes, clipping CAD screws, and severed stubs
                const duplicateNodes = [
                    'Part_Cooling_Fan', // Aftermarket cooling duct that extends 13.6 units
                    'Nozzle_2',         // Duplicate floating nozzle
                    'CableTrans',       // Static detached PTFE tube from original CAD model
                    'CableSOlid',       // Static detached electrical cable from original CAD model
                    'CablePlug',        // Severed cable stub dangling off heatbed in mid-air
                    'Screws',           // Overlapping decorative screws clipping through toolhead front/sides (node 9)
                    'Screw'             // Overlapping screw on RailConnection carriage bracket (node 63)
                ];
                duplicateNodes.forEach(name => {
                    const obj = this.model.getObjectByName(name);
                    if (obj) {
                        obj.visible = false;
                        obj.traverse(c => { c.visible = false; });
                    }
                });

                // 2. Authentic Anodized Silver Aluminum & Stainless Steel PBR Materials (Matches Real A1 Mini Photo)
                const realAluminumMat = new THREE.MeshStandardMaterial({
                    color: 0x5a636e, // Authentic brushed gunmetal / titanium silver anodized aluminum (zero blowout)
                    metalness: 0.72,
                    roughness: 0.32,
                    envMapIntensity: 1.4
                });

                const realSteelRailMat = new THREE.MeshStandardMaterial({
                    color: 0x98a2ad, // Mirror chrome stainless steel linear guide rail
                    metalness: 0.95,
                    roughness: 0.12,
                    envMapIntensity: 1.8
                });

                const darkCharcoalMat = new THREE.MeshStandardMaterial({
                    color: 0x2e333a, // Dark grey/charcoal metal and engineering plastic
                    metalness: 0.35,
                    roughness: 0.45
                });

                const goldenBrassMat = new THREE.MeshStandardMaterial({
                    color: 0xd97706, // Amber brass filament indicator gear on toolhead face
                    metalness: 0.85,
                    roughness: 0.25
                });

                // Apply to X Arm (cantilever extrusion and steel rail)
                const xArm = this.model.getObjectByName('RailMain');
                if (xArm) xArm.traverse(c => { if (c.isMesh) { c.material = realAluminumMat; c.castShadow = true; c.receiveShadow = true; } });

                const xRail = this.model.getObjectByName('Rail');
                if (xRail) xRail.traverse(c => { if (c.isMesh) { c.material = realSteelRailMat; c.castShadow = true; c.receiveShadow = true; } });

                const xEnd = this.model.getObjectByName('End');
                if (xEnd) xEnd.traverse(c => { if (c.isMesh) { c.material = darkCharcoalMat; c.castShadow = true; c.receiveShadow = true; } });

                const wiper = this.model.getObjectByName('Wiper');
                if (wiper) wiper.traverse(c => { if (c.isMesh) { c.material = darkCharcoalMat; c.castShadow = true; c.receiveShadow = true; } });

                // Apply to Z Axis Column (vertical tower extrusion and vertical rail)
                const zCol = this.model.getObjectByName('Subdivision_Surface_2_3');
                if (zCol) {
                    zCol.traverse(c => {
                        if (c.isMesh) {
                            if (c.name.includes('Wrfel_5') || c.name.includes('Würfel_5')) {
                                c.material = darkCharcoalMat; // Tower top cap
                            } else {
                                c.material = realAluminumMat;
                            }
                            c.castShadow = true;
                            c.receiveShadow = true;
                        }
                    });
                }

                const zRail = this.model.getObjectByName('Z_Rail');
                if (zRail) zRail.traverse(c => { if (c.isMesh) { c.material = realSteelRailMat; c.castShadow = true; c.receiveShadow = true; } });

                // Apply to Y Axis Bed Extrusion (horizontal rail carriage under PEI heatbed)
                const yAxis = this.model.getObjectByName('Y_Axis');
                if (yAxis) yAxis.traverse(c => { if (c.isMesh) { c.material = realSteelRailMat; c.castShadow = true; c.receiveShadow = true; } });

                // Toolhead Dial / Rotary indicator
                const glas = this.model.getObjectByName('Glas');
                if (glas) glas.traverse(c => { if (c.isMesh) c.material = goldenBrassMat; });

                const rubber = this.model.getObjectByName('Rubber');
                if (rubber) rubber.traverse(c => { if (c.isMesh) c.material = darkCharcoalMat; });

                // 3. Kinematic nodes setup
                this.toolhead = this.model.getObjectByName('Toolhead');
                this.xGantry = this.model.getObjectByName('Motor');
                this.bed = this.model.getObjectByName('Heatbed_2');
                this.nozzleObj = this.model.getObjectByName('Nozzle');
                this.peiPlate = this.model.getObjectByName('PEI_Plate');

                // Dynamic tube anchor points (distinct start & end for filament vs electrical cable)
                // 1. Transparent PTFE Bowden tube: from gantry filament guide/clip down into toolhead top filament input
                this.ptfeStartAnchor = this.model.getObjectByName('FilamentClip') || this.xGantry;
                this.ptfeEndAnchor = this.model.getObjectByName('Input') || this.toolhead;

                // 2. Black electrical cable harness: from motor rear electronics connector into toolhead rear cable clip
                this.cableStartAnchor = this.model.getObjectByName('Connector_2') || this.model.getObjectByName('Connector') || this.model.getObjectByName('MotorBody') || this.xGantry;
                this.cableEndAnchor = this.model.getObjectByName('CableClip') || this.toolhead;

                // 3. Heatbed continuous power cable loop: from heatbed rear into base chassis
                this.bedCableAnchor = this.model.getObjectByName('CablePlug') || this.bed;
                this.baseCableEntry = this.model.getObjectByName('PowerButton_Body_0') || this.model.getObjectByName('Base');

                if (this.toolhead) this.toolhead.userData.initialPos = this.toolhead.position.clone();
                if (this.xGantry) this.xGantry.userData.initialPos = this.xGantry.position.clone();
                if (this.bed) this.bed.userData.initialPos = this.bed.position.clone();

                if (this.ptfeMesh) this.ptfeMesh.visible = true;
                if (this.cableMesh) this.cableMesh.visible = true;
                if (this.bedCableMesh) this.bedCableMesh.visible = true;

                this.isLoaded = true;
                if (typeof this.options.onLoaded === 'function') {
                    this.options.onLoaded(this);
                }
            },
            (xhr) => {
                if (xhr.lengthComputable && typeof this.options.onProgress === 'function') {
                    const pct = Math.round((xhr.loaded / xhr.total) * 100);
                    this.options.onProgress(pct);
                }
            },
            (err) => console.error('BambuPrinterStudio: Failed to load model', err)
        );
    }

    _applyTransformToGroup() {
        if (!this.printerGroup) return;
        this.printerGroup.position.set(this.options.posX, this.options.posY, this.options.posZ);
        this.printerGroup.rotation.x = (this.options.rotX * Math.PI) / 180;
        this.printerGroup.rotation.y = (this.options.rotY * Math.PI) / 180;
        this.printerGroup.rotation.z = (this.options.rotZ * Math.PI) / 180;
        this.printerGroup.scale.set(this.options.scale, this.options.scale, this.options.scale);

        if (this.contactShadow) {
            this.contactShadow.position.set(this.options.posX, this.options.posY + 0.005, this.options.posZ);
            this.contactShadow.rotation.z = (this.options.rotY * Math.PI) / 180;
            const shadowScale = (this.options.scale / 4.8);
            this.contactShadow.scale.set(shadowScale, shadowScale, 1);
        }
    }

    // Public Stage Calibration APIs
    setPosition(x, y, z) {
        if (x !== undefined && !isNaN(x)) this.options.posX = parseFloat(x);
        if (y !== undefined && !isNaN(y)) this.options.posY = parseFloat(y);
        if (z !== undefined && !isNaN(z)) this.options.posZ = parseFloat(z);
        this._applyTransformToGroup();
    }

    setRotation(xDeg, yDeg, zDeg) {
        if (xDeg !== undefined && !isNaN(xDeg)) this.options.rotX = parseFloat(xDeg);
        if (yDeg !== undefined && !isNaN(yDeg)) this.options.rotY = parseFloat(yDeg);
        if (zDeg !== undefined && !isNaN(zDeg)) this.options.rotZ = parseFloat(zDeg);
        this._applyTransformToGroup();
    }

    setScale(s) {
        if (s !== undefined && !isNaN(s)) this.options.scale = Math.max(0.1, parseFloat(s));
        this._applyTransformToGroup();
    }

    // Public Arm XYZ Calibration APIs
    setArmPosition(x, y, z) {
        if (x !== undefined && !isNaN(x)) this.armPose.x = parseFloat(x);
        if (y !== undefined && !isNaN(y)) this.armPose.y = parseFloat(y);
        if (z !== undefined && !isNaN(z)) this.armPose.z = parseFloat(z);
    }

    getArmPosition() {
        const ap = this.armPose || { x: 0, y: 0, z: 0 };
        return {
            x: +(ap.x || 0).toFixed(1),
            y: +(ap.y || 0).toFixed(1),
            z: +(ap.z || 0).toFixed(1)
        };
    }

    setSpeed(spd) {
        this.speedMultiplier = Math.max(0.1, parseFloat(spd));
    }

    setFilamentColor(col) {
        this.options.filamentColor = col;
        if (this.printedBaseMesh && this.printedBaseMesh.material) {
            this.printedBaseMesh.material.color.set(col);
        }
    }

    setTheme(isDark) {
        if (this.ambientLight) {
            this.ambientLight.intensity = isDark ? 0.40 : 0.45;
        }
        if (this.keyLight) {
            this.keyLight.intensity = isDark ? 1.45 : 1.35;
        }
        if (this.fillLight) {
            this.fillLight.intensity = isDark ? 0.50 : 0.55;
        }
        if (this.rimLight) {
            this.rimLight.intensity = isDark ? 0.75 : 0.65;
        }
        if (this.contactShadow && this.contactShadow.material) {
            this.contactShadow.material.opacity = isDark ? 0.75 : 0.55;
        }
    }

    toggleAnimation() {
        this.isPrinting = !this.isPrinting;
        return this.isPrinting;
    }

    // High-Tech Feature Toggles
    toggleLidar(force) {
        this.isLidarActive = force !== undefined ? !!force : !this.isLidarActive;
        if (this.lidarGroup) this.lidarGroup.visible = this.isLidarActive;
        return this.isLidarActive;
    }

    toggleAudio() {
        if (!this.audioEngine) this.audioEngine = new BambuStepperAudio();
        return this.audioEngine.toggle();
    }

    toggleThermal(force) {
        const next = force !== undefined ? !!force : !this.isThermalActive;
        this.isThermalActive = next;

        if (this.model) {
            this.model.traverse(child => {
                if (child.isMesh) {
                    if (next) {
                        if (!child.userData._origMaterial) {
                            child.userData._origMaterial = child.material;
                        }
                        const name = (child.name || '').toLowerCase();
                        if (name.includes('nozzle')) {
                            child.material = new THREE.MeshBasicMaterial({ color: 0xffffff }); // 215°C white core
                        } else if (name.includes('glas') || name.includes('rubber') || name.includes('block') || name.includes('toolhead')) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0xf97316,
                                emissive: 0xd97706,
                                emissiveIntensity: 0.65,
                                roughness: 0.35
                            }); // 190°C heatblock
                        } else if (name.includes('pei') || name.includes('bed')) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0xc026d3,
                                emissive: 0x86198f,
                                emissiveIntensity: 0.45,
                                roughness: 0.50
                            }); // 65°C PEI bed
                        } else {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0x0f172a,
                                roughness: 0.75,
                                metalness: 0.1
                            }); // 24°C cold ambient frame
                        }
                    } else {
                        if (child.userData._origMaterial) {
                            child.material = child.userData._origMaterial;
                        }
                    }
                }
            });
        }

        if (this.nozzleLight) {
            if (next) {
                this.nozzleLight.color.setHex(0xff3b30);
                this.nozzleLight.intensity = 2.8;
            } else {
                this.nozzleLight.color.setHex(0xffedd5);
                this.nozzleLight.intensity = 1.0;
            }
        }

        if (this.renderer && this.scene) {
            const isDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark');
            const bgHex = next ? 0x030712 : (isDark ? 0x0c0e14 : 0xffffff);
            this.renderer.setClearColor(bgHex, 1);
            this.scene.background = new THREE.Color(bgHex);
        }

        return this.isThermalActive;
    }

    // Public Axis Limits & Manual Motor Calibration APIs
    setAxisLimits(limits = {}) {
        if (limits.xStart !== undefined && !isNaN(limits.xStart)) this.axisLimits.xStart = parseFloat(limits.xStart);
        if (limits.xEnd !== undefined && !isNaN(limits.xEnd)) this.axisLimits.xEnd = parseFloat(limits.xEnd);
        if (limits.yStart !== undefined && !isNaN(limits.yStart)) this.axisLimits.yStart = parseFloat(limits.yStart);
        if (limits.yEnd !== undefined && !isNaN(limits.yEnd)) this.axisLimits.yEnd = parseFloat(limits.yEnd);
        if (limits.zStart !== undefined && !isNaN(limits.zStart)) this.axisLimits.zStart = parseFloat(limits.zStart);
        if (limits.zEnd !== undefined && !isNaN(limits.zEnd)) this.axisLimits.zEnd = parseFloat(limits.zEnd);
    }

    getAxisLimits() {
        return { ...this.axisLimits };
    }

    setManualMotorPercent(xPct, yPct, zPct) {
        if (xPct !== undefined && !isNaN(xPct)) this.manualMotorPercent.x = Math.max(0, Math.min(100, parseFloat(xPct)));
        if (yPct !== undefined && !isNaN(yPct)) this.manualMotorPercent.y = Math.max(0, Math.min(100, parseFloat(yPct)));
        if (zPct !== undefined && !isNaN(zPct)) this.manualMotorPercent.z = Math.max(0, Math.min(100, parseFloat(zPct)));
    }

    getManualMotorPercent() {
        return { ...this.manualMotorPercent };
    }

    resetTransform() {
        Object.assign(this.options, this.defaultTransform);
        this.armPose = { x: 0.0, y: 0.0, z: 0.0 };
        this.axisLimits = {
            xStart: 14.0,
            xEnd: 90.0,
            yStart: 35.0,
            yEnd: 100.0,
            zStart: -10.0,
            zEnd: 70.0
        };
        this.manualMotorPercent = { x: 50.0, y: 50.0, z: 20.0 };
        this._applyTransformToGroup();
    }

    resetView() {
        this.targetSpherical = { radius: 8.2, theta: 0, phi: Math.PI * 0.42 };
    }

    getConfig() {
        const ap = this.armPose || { x: 0, y: 0, z: 0 };
        return {
            posX: +(this.options.posX || 0).toFixed(2),
            posY: +(this.options.posY || 0).toFixed(2),
            posZ: +(this.options.posZ || 0).toFixed(2),
            rotX: +(this.options.rotX || 0).toFixed(1),
            rotY: +(this.options.rotY || 0).toFixed(1),
            rotZ: +(this.options.rotZ || 0).toFixed(1),
            scale: +(this.options.scale || 4.8).toFixed(2),
            armX: +(ap.x || 0).toFixed(1),
            armY: +(ap.y || 0).toFixed(1),
            armZ: +(ap.z || 0).toFixed(1),
            axisLimits: { ...this.axisLimits },
            motorPct: { ...this.manualMotorPercent },
            speed: +(this.speedMultiplier || 1.8).toFixed(2),
            isPrinting: this.isPrinting
        };
    }

    _getToolpath(t) {
        const cycle = t % 7.2;

        if (cycle < 2.8) {
            const p = cycle / 2.8;
            const angle = p * Math.PI * 2;
            const r = 0.038;
            return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, isInfill: false, mode: 'Perimeter Hex' };
        } else if (cycle < 6.6) {
            const infillP = (cycle - 2.8) / 3.8;
            const lines = 16;
            const curLine = Math.floor(infillP * lines);
            const lineFrac = (infillP * lines) % 1;
            const span = 0.028;
            const yPos = THREE.MathUtils.lerp(-span, span, curLine / lines);
            const isEven = curLine % 2 === 0;
            const xStart = isEven ? -span : span;
            const xEnd = isEven ? span : -span;
            return {
                x: THREE.MathUtils.lerp(xStart, xEnd, lineFrac),
                y: yPos + (lineFrac * 0.003),
                isInfill: true,
                mode: 'Infill 45° (250mm/s)'
            };
        } else {
            return { x: 0.02, y: 0.02, isInfill: false, isTravel: true, mode: 'Z-Step & Retract' };
        }
    }

    _updateDynamicTubes() {
        if (!this.model || !this.printerGroup) return;

        // Ensure distinct anchors exist
        if (!this.ptfeStartAnchor) this.ptfeStartAnchor = this.model.getObjectByName('FilamentClip') || this.xGantry;
        if (!this.ptfeEndAnchor) this.ptfeEndAnchor = this.model.getObjectByName('Input') || this.toolhead;
        if (!this.cableStartAnchor) this.cableStartAnchor = this.model.getObjectByName('Connector_2') || this.model.getObjectByName('Connector') || this.model.getObjectByName('MotorBody') || this.xGantry;
        if (!this.cableEndAnchor) this.cableEndAnchor = this.model.getObjectByName('CableClip') || this.toolhead;

        // 1. Transparent PTFE Bowden Tube (Filament Delivery)
        // Starts at FilamentClip on gantry top, arches high above the printer, plunges into toolhead top Input
        if (this.ptfeStartAnchor && this.ptfeEndAnchor && this.ptfeMesh) {
            const pStart = new THREE.Vector3();
            const pEnd = new THREE.Vector3();
            this.ptfeStartAnchor.getWorldPosition(pStart);
            this.ptfeEndAnchor.getWorldPosition(pEnd);
            this.printerGroup.worldToLocal(pStart);
            this.printerGroup.worldToLocal(pEnd);

            const distP = pStart.distanceTo(pEnd);
            // Compact, natural arch: stays neat and never shoots out of view
            const archP = Math.max(0.12, 0.26 - distP * 0.12);

            const p0 = pStart.clone().add(new THREE.Vector3(0.01, 0.02, -0.01));
            const p1 = pStart.clone().add(new THREE.Vector3(-0.015, archP * 0.70, 0.03));
            const p2 = pStart.clone().lerp(pEnd, 0.50).add(new THREE.Vector3(0.01, archP, 0.04));
            const p3 = pEnd.clone().add(new THREE.Vector3(0.0, 0.06, 0.0));
            const p4 = pEnd.clone().add(new THREE.Vector3(0.0, 0.01, 0.0));

            const ptfeCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4], false, 'centripetal', 0.5);
            if (this.ptfeMesh.geometry) this.ptfeMesh.geometry.dispose();
            this.ptfeMesh.geometry = new THREE.TubeGeometry(ptfeCurve, 32, 0.0075, 10, false);
        }

        // 2. Black Hotend Electrical Cable Loom (Wiring Harness)
        // Starts at Connector_2 / rear motor port, loops separately behind X arm, clips into toolhead rear CableClip
        if (this.cableStartAnchor && this.cableEndAnchor && this.cableMesh) {
            const cStart = new THREE.Vector3();
            const cEnd = new THREE.Vector3();
            this.cableStartAnchor.getWorldPosition(cStart);
            this.cableEndAnchor.getWorldPosition(cEnd);
            this.printerGroup.worldToLocal(cStart);
            this.printerGroup.worldToLocal(cEnd);

            const distC = cStart.distanceTo(cEnd);
            const archC = Math.max(0.10, 0.22 - distC * 0.10);

            const c0 = cStart.clone().add(new THREE.Vector3(0.015, 0.01, 0.0));
            const c1 = cStart.clone().add(new THREE.Vector3(0.035, archC * 0.65, 0.04));
            const c2 = cStart.clone().lerp(cEnd, 0.52).add(new THREE.Vector3(0.04, archC, 0.02));
            const c3 = cEnd.clone().add(new THREE.Vector3(0.01, 0.04, 0.01));
            const c4 = cEnd.clone();

            const cableCurve = new THREE.CatmullRomCurve3([c0, c1, c2, c3, c4], false, 'centripetal', 0.5);
            if (this.cableMesh.geometry) this.cableMesh.geometry.dispose();
            this.cableMesh.geometry = new THREE.TubeGeometry(cableCurve, 32, 0.0095, 10, false);
        }

        // 2. Continuous Heatbed Power Cable (bridges bed into chassis, eliminating severed stub)
        if (!this.bedCableAnchor && this.model) {
            this.bedCableAnchor = this.model.getObjectByName('CablePlug') || this.bed;
        }
        if (!this.baseCableEntry && this.model) {
            this.baseCableEntry = this.model.getObjectByName('PowerButton_Body_0') || this.model.getObjectByName('Base');
        }

        if (this.bedCableAnchor && this.baseCableEntry && this.bedCableMesh) {
            const pBed = new THREE.Vector3();
            const pBase = new THREE.Vector3();
            this.bedCableAnchor.getWorldPosition(pBed);
            this.baseCableEntry.getWorldPosition(pBase);
            this.printerGroup.worldToLocal(pBed);
            this.printerGroup.worldToLocal(pBase);

            const b0 = pBed.clone();
            const b1 = pBed.clone().add(new THREE.Vector3(-0.06, -0.015, -0.02));
            const b2 = pBase.clone().add(new THREE.Vector3(-0.05, 0.04, -0.01));
            const b3 = pBase.clone().add(new THREE.Vector3(0.01, 0.015, 0.0));

            const bedCurve = new THREE.CatmullRomCurve3([b0, b1, b2, b3], false, 'centripetal', 0.5);
            if (this.bedCableMesh.geometry) this.bedCableMesh.geometry.dispose();
            this.bedCableMesh.geometry = new THREE.TubeGeometry(bedCurve, 24, 0.0075, 8, false);
        }
    }

    _animate() {
        requestAnimationFrame(this._animate);
        const delta = this.clock.getDelta();

        // Smooth Camera Orbit Inertia
        this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * 0.08;
        this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * 0.08;
        this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.08;

        const sinPhi = Math.sin(this.spherical.phi);
        const cosPhi = Math.cos(this.spherical.phi);
        const sinTheta = Math.sin(this.spherical.theta);
        const cosTheta = Math.cos(this.spherical.theta);

        this.camera.position.set(
            this.lookTarget.x + this.spherical.radius * sinPhi * sinTheta,
            this.lookTarget.y + this.spherical.radius * cosPhi,
            this.lookTarget.z + this.spherical.radius * sinPhi * cosTheta
        );
        this.camera.lookAt(this.lookTarget);

        // Kinematics & Arm Position Update
        if (this.isLoaded && this.toolhead && this.bed && this.xGantry) {
            const initT = this.toolhead.userData.initialPos;
            const initB = this.bed.userData.initialPos;
            const initG = this.xGantry.userData.initialPos;

            const { xStart, xEnd, yStart, yEnd, zStart, zEnd } = this.axisLimits;
            const armOffX = this.armPose?.x || 0;
            const armOffY = this.armPose?.y || 0;
            const armOffZ = this.armPose?.z || 0;

            let pathX = 0, pathY = 0, mode = 'Manual Hold';

            if (this.isPrinting) {
                this.pathTime += delta * this.speedMultiplier;
                const path = this._getToolpath(this.pathTime);
                pathX = path.x;
                pathY = path.y;
                mode = path.mode;

                const midMmX = (xStart + xEnd) * 0.5;
                const midMmY = (yStart + yEnd) * 0.5;
                const spanMmX = Math.abs(xEnd - xStart);
                const spanMmY = Math.abs(yEnd - yStart);

                // Toolpath path.x and path.y range [-0.038..0.038]
                // Centered print coordinates mapped within calibrated axis bounds
                const printMmX = midMmX + armOffX + (path.x / 0.038) * (spanMmX * 0.35);
                const printMmY = midMmY + armOffY + (path.y / 0.038) * (spanMmY * 0.35);

                const clampedMmX = THREE.MathUtils.clamp(printMmX, Math.min(xStart, xEnd), Math.max(xStart, xEnd));
                const clampedMmY = THREE.MathUtils.clamp(printMmY, Math.min(yStart, yEnd), Math.max(yStart, yEnd));

                const targetHeadZ = initT.z + (clampedMmX / 4.2);
                const targetBedX = initB.x - (clampedMmY / 4.2);

                const lerpFactor = path.isInfill ? 0.48 : 0.28;
                this.toolhead.position.z += (targetHeadZ - this.toolhead.position.z) * lerpFactor;
                this.bed.position.x += (targetBedX - this.bed.position.x) * lerpFactor;

                this.layerIndex = Math.floor(this.pathTime / 7.2);
                this.layerZOffset = (this.layerIndex % this.totalLayers) * 0.18;

                const printMmZ = zStart + armOffZ + (this.layerZOffset % Math.max(1, Math.abs(zEnd - zStart)));
                const clampedMmZ = THREE.MathUtils.clamp(printMmZ, Math.min(zStart, zEnd), Math.max(zStart, zEnd));
                const targetGantryY = initG.y + (clampedMmZ / 1.8);
                this.xGantry.position.y += (targetGantryY - this.xGantry.position.y) * 0.25;
                this.toolhead.position.y = this.xGantry.position.y + (initT.y - initG.y);
            } else {
                // When paused or calibrating manually: user motor test sliders directly move 0% (Start) -> 100% (End)
                const pctX = (this.manualMotorPercent?.x ?? 50) / 100;
                const pctY = (this.manualMotorPercent?.y ?? 50) / 100;
                const pctZ = (this.manualMotorPercent?.z ?? 20) / 100;

                const curMmX = xStart + armOffX + pctX * (xEnd - xStart);
                const curMmY = yStart + armOffY + pctY * (yEnd - yStart);
                const curMmZ = zStart + armOffZ + pctZ * (zEnd - zStart);

                const targetHeadZ = initT.z + (curMmX / 4.2);
                const targetBedX = initB.x - (curMmY / 4.2);
                const targetGantryY = initG.y + (curMmZ / 1.8);

                // Responsive direct interpolation for manual calibration
                this.toolhead.position.z += (targetHeadZ - this.toolhead.position.z) * 0.50;
                this.bed.position.x += (targetBedX - this.bed.position.x) * 0.50;
                this.xGantry.position.y += (targetGantryY - this.xGantry.position.y) * 0.50;
                this.toolhead.position.y = this.xGantry.position.y + (initT.y - initG.y);
            }

            // Dynamically update PTFE tube, toolhead electrical cable & bed cable geometries
            this._updateDynamicTubes();

            // Synchronize printed part with PEI bed
            if (this.peiPlate && this.printedGroup) {
                const peiWorld = new THREE.Vector3();
                this.peiPlate.getWorldPosition(peiWorld);
                this.printedGroup.position.set(
                    peiWorld.x,
                    peiWorld.y + 0.018 + (this.layerZOffset * 0.009),
                    peiWorld.z
                );
            }

            // Synchronize Live G-Code Extrusion Bead Trail
            if (this.isPrinting && this.extrusionLine) {
                const path = this._getToolpath(this.pathTime);
                if (!path.isTravel) {
                    if (!this._lastExtrudeTime || this.pathTime - this._lastExtrudeTime > 0.035) {
                        this._lastExtrudeTime = this.pathTime;
                        this.extrusionPoints.push({
                            x: path.x,
                            y: 0.022 + (this.layerZOffset * 0.009),
                            z: -path.y,
                            age: 0
                        });
                        if (this.extrusionPoints.length > 280) {
                            this.extrusionPoints.shift();
                        }
                    }
                }

                if (this.moltenBeadMesh) {
                    this.moltenBeadMesh.position.set(path.x, 0.022 + (this.layerZOffset * 0.009) + 0.003, -path.y);
                    this.moltenBeadMesh.visible = !path.isTravel;
                }

                const posAttr = this.extrusionLine.geometry.attributes.position;
                const colAttr = this.extrusionLine.geometry.attributes.color;
                const filCol = new THREE.Color(this.options.filamentColor || 0xef4444);
                const hotCol = new THREE.Color(0xffedd5);

                const n = this.extrusionPoints.length;
                for (let i = 0; i < n; i++) {
                    const pt = this.extrusionPoints[i];
                    pt.age += delta;
                    posAttr.setXYZ(i, pt.x, pt.y, pt.z);
                    const heat = Math.max(0, 1.0 - pt.age * 0.7);
                    const curCol = filCol.clone().lerp(hotCol, heat);
                    colAttr.setXYZ(i, curCol.r, curCol.g, curCol.b);
                }
                this.extrusionLine.geometry.setDrawRange(0, n);
                posAttr.needsUpdate = true;
                colAttr.needsUpdate = true;
            }

            // Update Bambu Micro LiDAR Dual-Laser Scanner
            if (this.lidarGroup) {
                if (!this.isLidarActive || !this.isPrinting) {
                    this.lidarGroup.visible = false;
                } else {
                    this.lidarGroup.visible = true;

                    // Sensor mount on toolhead: offset from center
                    const emitterWorld = new THREE.Vector3(0.05, -0.05, 0.02);
                    this.toolhead.localToWorld(emitterWorld);

                    const peiWorld = new THREE.Vector3();
                    if (this.peiPlate) {
                        this.peiPlate.getWorldPosition(peiWorld);
                    } else if (this.bed) {
                        this.bed.getWorldPosition(peiWorld);
                    }

                    const localEmitter = emitterWorld.clone();
                    this.printerGroup.worldToLocal(localEmitter);

                    const spotWorld = new THREE.Vector3(emitterWorld.x, peiWorld.y + 0.019, emitterWorld.z);
                    const localSpot = spotWorld.clone();
                    this.printerGroup.worldToLocal(localSpot);

                    // Position reticle on bed
                    if (this.laserReticle) {
                        this.laserReticle.position.set(localSpot.x, localSpot.y, localSpot.z);
                        this.laserReticle.rotation.z = this.pathTime * 1.8;
                    }

                    // Update dual laser fan plane vertices
                    if (this.laserFanMesh) {
                        const w = 0.075;
                        const pos = this.laserFanMesh.geometry.attributes.position;
                        // Plane 1: X-spread
                        pos.setXYZ(0, localEmitter.x, localEmitter.y, localEmitter.z);
                        pos.setXYZ(1, localSpot.x - w, localSpot.y, localSpot.z);
                        pos.setXYZ(2, localSpot.x + w, localSpot.y, localSpot.z);
                        // Plane 2: Z-spread cross
                        pos.setXYZ(3, localEmitter.x, localEmitter.y, localEmitter.z);
                        pos.setXYZ(4, localSpot.x, localSpot.y, localSpot.z - w);
                        pos.setXYZ(5, localSpot.x, localSpot.y, localSpot.z + w);
                        pos.needsUpdate = true;
                    }
                }
            }

            // Update Stepper Motor Audio Synthesizer
            if (this.audioEngine) {
                this.audioEngine.update(this.speedMultiplier, this.isPrinting, mode);
            }

            // Synchronize hotend light
            if (this.nozzleObj && this.nozzleLight) {
                const nozzleWorld = new THREE.Vector3();
                this.nozzleObj.getWorldPosition(nozzleWorld);
                this.nozzleLight.position.copy(nozzleWorld);
                this.nozzleLight.intensity = this.isPrinting ? (1.0 + Math.sin(this.pathTime * 12) * 0.25) : 0.8;
            }

            // Real-time Telemetry Callback
            if (typeof this.options.onTelemetry === 'function') {
                const liveHeadMm = (this.toolhead.position.z - initT.z) * 4.2;
                const liveBedMm = -(this.bed.position.x - initB.x) * 4.2;
                const liveZMm = (this.xGantry.position.y - initG.y) * 1.8;

                this.options.onTelemetry({
                    xMm: +liveHeadMm.toFixed(1),
                    yMm: +liveBedMm.toFixed(1),
                    zMm: +liveZMm.toFixed(2),
                    layer: (this.layerIndex % this.totalLayers) + 1,
                    mode: mode,
                    tempNozzle: this.isPrinting ? 215 : 190,
                    tempBed: 65,
                    isLidar: this.isLidarActive,
                    isThermal: this.isThermalActive
                });
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (!this.canvas || !this.renderer || !this.camera) return;
        const w = this.canvas.parentElement ? this.canvas.parentElement.clientWidth : window.innerWidth;
        const h = this.canvas.parentElement ? this.canvas.parentElement.clientHeight : window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}

window.BambuPrinterStudio = BambuPrinterStudio;
