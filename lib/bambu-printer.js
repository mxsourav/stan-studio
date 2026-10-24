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
 * - Live telemetry readout callback
 */

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

        this.isLoaded = false;
        this.isPrinting = true;
        this.speedMultiplier = this.options.speed;

        // Kinematics State
        this.pathTime = 0;
        this.layerIndex = 0;
        this.totalLayers = 50;
        this.layerZOffset = 0;

        // Setup Scene & Viewport
        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        this._initGround();
        this._initPrintedPart();
        this._initDynamicTubes();
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
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
        this.scene.add(this.ambientLight);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        this.keyLight.position.set(5, 12, 6);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = 2048;
        this.keyLight.shadow.mapSize.height = 2048;
        this.keyLight.shadow.bias = -0.0001;
        this.keyLight.shadow.normalBias = 0.02;
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xe0eeff, 1.1);
        this.fillLight.position.set(-6, 4, -4);
        this.scene.add(this.fillLight);

        this.rimLight = new THREE.DirectionalLight(0xffffff, 1.4);
        this.rimLight.position.set(-2, 8, 8);
        this.scene.add(this.rimLight);

        // Nozzle hotend light
        this.nozzleLight = new THREE.PointLight(0xffedd5, 1.2, 0.5, 2.0);
        this.scene.add(this.nozzleLight);
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
    }

    _initDynamicTubes() {
        // Procedural Bowden PTFE tube (translucent frosted polymer)
        this.ptfeMat = new THREE.MeshPhysicalMaterial({
            color: 0xf8fafc,
            roughness: 0.16,
            transmission: 0.82,
            opacity: 0.90,
            transparent: true,
            ior: 1.35,
            depthWrite: true,
            side: THREE.DoubleSide
        });

        // Procedural hotend electrical cable harness (ribbed matte black polymer)
        this.cableMat = new THREE.MeshStandardMaterial({
            color: 0x18181b,
            roughness: 0.70,
            metalness: 0.12
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

                // 1. Hide duplicate / overlapping mod meshes and severed stubs
                const duplicateNodes = [
                    'Part_Cooling_Fan', // Aftermarket cooling duct that extends 13.6 units
                    'FanBlock',         // Duplicate front cube
                    'Nozzle_2',         // Duplicate floating nozzle
                    'CableTrans',       // Static detached PTFE tube
                    'CableSOlid',       // Static detached electrical cable
                    'CablePlug'         // Severed cable stub dangling off heatbed in mid-air
                ];
                duplicateNodes.forEach(name => {
                    const obj = this.model.getObjectByName(name);
                    if (obj) {
                        obj.visible = false;
                        obj.traverse(c => { c.visible = false; });
                    }
                });

                // 2. Realistic Brushed Silver Aluminum PBR Materials for Arm & Steel Guide Rail
                const silverArmMat = new THREE.MeshStandardMaterial({
                    color: 0xd6dbe0,
                    metalness: 0.92,
                    roughness: 0.22,
                    envMapIntensity: 1.6
                });
                const silverRailMat = new THREE.MeshStandardMaterial({
                    color: 0xeef2f6,
                    metalness: 0.96,
                    roughness: 0.14,
                    envMapIntensity: 1.8
                });

                const armParts = ['RailMain', 'Rail', 'End', 'Z_Rail'];
                armParts.forEach(name => {
                    const obj = this.model.getObjectByName(name);
                    if (obj) {
                        obj.traverse(child => {
                            if (child.isMesh) {
                                child.material = (name === 'Rail') ? silverRailMat : silverArmMat;
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                    }
                });

                // 3. Kinematic nodes setup
                this.toolhead = this.model.getObjectByName('Toolhead');
                this.xGantry = this.model.getObjectByName('Motor');
                this.bed = this.model.getObjectByName('Heatbed_2');
                this.nozzleObj = this.model.getObjectByName('Nozzle');
                this.peiPlate = this.model.getObjectByName('PEI_Plate');

                // Dynamic tube anchor points
                this.toolheadInput = this.model.getObjectByName('Input') || this.toolhead;
                this.motorAnchor = this.model.getObjectByName('FilamentClip') || this.model.getObjectByName('MotorBody') || this.xGantry;
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
        if (this.printedBaseMesh && this.printedBaseMesh.material) {
            this.printedBaseMesh.material.color.set(col);
        }
    }

    setTheme(isDark) {
        if (this.ambientLight) {
            this.ambientLight.intensity = isDark ? 0.60 : 0.80;
        }
        if (this.keyLight) {
            this.keyLight.intensity = isDark ? 2.0 : 2.4;
        }
        if (this.contactShadow && this.contactShadow.material) {
            this.contactShadow.material.opacity = isDark ? 0.75 : 0.55;
        }
    }

    toggleAnimation() {
        this.isPrinting = !this.isPrinting;
        return this.isPrinting;
    }

    resetTransform() {
        Object.assign(this.options, this.defaultTransform);
        this.armPose = { x: 0.0, y: 0.0, z: 0.0 };
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
            speed: +(this.speedMultiplier || 1.8).toFixed(2)
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
        if (!this.toolheadInput || !this.motorAnchor) {
            if (this.model) {
                this.toolheadInput = this.model.getObjectByName('Input') || this.toolhead;
                this.motorAnchor = this.model.getObjectByName('FilamentClip') || this.model.getObjectByName('MotorBody') || this.xGantry;
            }
        }
        if (!this.toolheadInput || !this.motorAnchor || !this.printerGroup) return;

        // 1. Toolhead PTFE tube & electrical cable harness
        const pStart = new THREE.Vector3();
        const pEnd = new THREE.Vector3();
        this.motorAnchor.getWorldPosition(pStart);
        this.toolheadInput.getWorldPosition(pEnd);
        this.printerGroup.worldToLocal(pStart);
        this.printerGroup.worldToLocal(pEnd);

        const dist = pStart.distanceTo(pEnd);
        // Dynamic flex arch: arches higher when toolhead approaches motor, relaxes when far
        const archHeight = Math.max(0.18, 0.44 - dist * 0.28);

        const p0 = pStart.clone().add(new THREE.Vector3(0.015, 0.02, -0.01));
        const p1 = pStart.clone().add(new THREE.Vector3(-0.035, archHeight * 0.60, 0.04));
        const p2 = pStart.clone().lerp(pEnd, 0.48).add(new THREE.Vector3(0.015, archHeight, 0.05));
        const p3 = pEnd.clone().add(new THREE.Vector3(0.0, 0.08, 0.0));
        const p4 = pEnd.clone().add(new THREE.Vector3(0.0, 0.015, 0.0));

        const ptfeCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4], false, 'centripetal', 0.5);

        // Cable runs smoothly in parallel with a slight offset
        const cableOffset = new THREE.Vector3(0.006, 0.002, -0.008);
        const c0 = p0.clone().add(cableOffset);
        const c1 = p1.clone().add(cableOffset);
        const c2 = p2.clone().add(cableOffset);
        const c3 = p3.clone().add(cableOffset);
        const c4 = p4.clone().add(cableOffset);
        const cableCurve = new THREE.CatmullRomCurve3([c0, c1, c2, c3, c4], false, 'centripetal', 0.5);

        if (this.ptfeMesh) {
            if (this.ptfeMesh.geometry) this.ptfeMesh.geometry.dispose();
            this.ptfeMesh.geometry = new THREE.TubeGeometry(ptfeCurve, 32, 0.007, 8, false);
        }
        if (this.cableMesh) {
            if (this.cableMesh.geometry) this.cableMesh.geometry.dispose();
            this.cableMesh.geometry = new THREE.TubeGeometry(cableCurve, 32, 0.0095, 8, false);
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

            const fbxScale = 140; // Calibrated scale factor to keep print within PEI bed

            // Manual arm offsets from calibration sliders
            const armOffsetHeadZ = ((this.armPose?.x || 0) / 1000) * 240;
            const armOffsetGantryY = ((this.armPose?.y || 0) / 1000) * 240;
            const armOffsetBedX = -((this.armPose?.z || 0) / 1000) * 240;

            // Safe collision bounds for toolhead: stays far away from MotorBody (z = -15.5) and Rail End (+28.2)
            const minSafeHeadZ = -8.5;
            const maxSafeHeadZ = 18.0;

            let pathX = 0, pathY = 0, mode = 'Manual Hold';

            if (this.isPrinting) {
                this.pathTime += delta * this.speedMultiplier;
                const path = this._getToolpath(this.pathTime);
                pathX = path.x;
                pathY = path.y;
                mode = path.mode;

                // Centered print coordinates: centered around the PEI plate
                const rawHeadZ = initT.z + 4.2 + (path.x * fbxScale) + armOffsetHeadZ;
                const targetHeadZ = THREE.MathUtils.clamp(rawHeadZ, minSafeHeadZ, maxSafeHeadZ);
                const targetBedX = initB.x + (-path.y * fbxScale) + armOffsetBedX;

                const lerpFactor = path.isInfill ? 0.48 : 0.28;
                this.toolhead.position.z += (targetHeadZ - this.toolhead.position.z) * lerpFactor;
                this.bed.position.x += (targetBedX - this.bed.position.x) * lerpFactor;

                this.layerIndex = Math.floor(this.pathTime / 7.2);
                this.layerZOffset = (this.layerIndex % this.totalLayers) * 0.18;

                const targetGantryY = initG.y + this.layerZOffset + armOffsetGantryY;
                this.xGantry.position.y += (targetGantryY - this.xGantry.position.y) * 0.25;
                this.toolhead.position.y = this.xGantry.position.y + (initT.y - initG.y);
            } else {
                // When paused, sliders directly reposition the arm smoothly
                const targetHeadZ = THREE.MathUtils.clamp(initT.z + 4.2 + armOffsetHeadZ, minSafeHeadZ, maxSafeHeadZ);
                const targetBedX = initB.x + armOffsetBedX;
                const targetGantryY = initG.y + this.layerZOffset + armOffsetGantryY;

                this.toolhead.position.z += (targetHeadZ - this.toolhead.position.z) * 0.25;
                this.bed.position.x += (targetBedX - this.bed.position.x) * 0.25;
                this.xGantry.position.y += (targetGantryY - this.xGantry.position.y) * 0.25;
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
                    tempBed: 65
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
