# STΔN studio.

> Hyper-realistic, interactive 3D WebGL filament spool experience engineered with Three.js.

![STΔN studio Preview](https://raw.githubusercontent.com/mxsourav/stan-studio/main/preview.png)

## Overview

**STΔN studio.** is an ultra-premium, interactive 3D industrial design showcase combining modern WebGL creative technology with skeuomorphic industrial aesthetics (inspired by Nothing, Teenage Engineering, and Apple).

### Key Features

- **Authentic Injection-Molded ABS Spool Frame**: Procedural CSG flange geometry with 4 trapezoidal inspection windows, structural radial reinforcement ribs, raised rim lip with clip notches, hollow axle bore, and recessed STΔN technical spec decal badge.
- **Physical 24-Ring Concentric Winding**: Micro-textured matte PLA filament coils with deep crevice ambient occlusion shadows and visible radial side coils.
- **Clockwise Roll & C2-Continuous Unspooling**: Physics-based rotational inertia on downward scroll, feeding filament tangentially off the spool into a gravity-driven aerodynamic S-curve across the viewport.
- **Pure Matte PLA PBR Shading**: Zero artificial glossy sheen (`roughness: 0.90`, `clearcoat: 0.00`, `sheen: 0.00`, `#085D63` Precision Teal) with studio environment lighting and soft contact shadows.
- **Optical Liquid Glassmorphic Navigation**: Frosted top navigation bar with dynamic backdrop blur, physical rim highlights, and typographic lockup featuring the Greek uppercase Delta (`Δ`) in Antapani Extra Bold.
- **Interactive Material Studio**: Real-time glassmorphic control drawer for switching filament finishes (Matte PLA, Silk Gloss, Carbon) and tuning PBR parameters live at 60 FPS.

## Getting Started

Serve the repository with any local static HTTP server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Open `http://localhost:8000` in your modern WebGL-compatible browser.

## Built With

- [Three.js](https://threejs.org/) (r160)
- Vanilla HTML5 / Modern CSS3 (Glassmorphism & Flexbox/Grid)
- Antapani Extra Bold Typography

## License

Private repository © STΔN Studio. All rights reserved.
