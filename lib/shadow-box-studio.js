/**
 * STΔN Studio — 3D Shadow Box Lamp Generator Engine
 * 
 * Clean-room, client-side computational geometry & inverse perspective optical ray engine.
 * Synthesizes watertight 3D printable enclosures, generates live wall shadow projections,
 * auto-bridges floating silhouette islands, and exports print-ready binary STL & multi-plate ZIPs.
 * 
 * Copyright (c) 2026 STΔN Studio. All rights reserved.
 */

(function (global) {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 1: GEOMETRIC PROFILES & OPTICAL RAY CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    const SHAPE_KINDS = Object.freeze({
        RECTANGLE: 'rect',
        CYLINDER: 'cyl',
        ROUND12: 'round12',
        HEXAGON: 'hex',
        OCTAGON: 'oct',
        TRIANGLE: 'tri',
        DIAMOND: 'diamond'
    });

    const DEFAULT_PARAMS = Object.freeze({
        shape: SHAPE_KINDS.HEXAGON,
        width: 110,         // mm (inner bounding width / diameter)
        height: 110,        // mm (inner bounding height / depth)
        panelHeight: 70,    // mm (Hp - wall panel height)
        ledHeight: 85,      // mm (hL - LED point source height above floor, must exceed panelHeight)
        floorThickness: 3.0,// mm (F - base floor plate thickness)
        wallThickness: 1.8, // mm (Tp - extruded wall thickness)
        strutWidth: 1.0,    // mm (structural bridge thickness for floating islands)
        minIslandArea: 8,   // px (min connected component pixel area to keep)
        threshold: 128,     // 0-255 luminance binarization threshold
        invert: false,      // Invert foreground/background
        mirror: true,       // Flip horizontally for correct wall shadow orientation
        wallDistance: 250,  // mm (distance from lamp back to virtual wall in 3D scene)
        ledColor: '#ffb347',// Warm amber 2700K
        ledIntensity: 2.2,  // Light power
        viewMode: 'shadow-wall' // 'shadow-wall' | 'assembled-mesh' | 'flat-bed'
    });

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 2: CLIENT-SIDE ZERO-DEPENDENCY PKZIP ARCHIVE GENERATOR
    // ═══════════════════════════════════════════════════════════════════

    class MinimalZip {
        constructor() {
            this.entries = [];
        }

        static crc32(buffer) {
            let table = MinimalZip._crcTable;
            if (!table) {
                table = new Uint32Array(256);
                for (let i = 0; i < 256; i++) {
                    let c = i;
                    for (let k = 0; k < 8; k++) {
                        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
                    }
                    table[i] = c;
                }
                MinimalZip._crcTable = table;
            }

            let crc = 0xffffffff;
            const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            for (let i = 0; i < bytes.length; i++) {
                crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
            }
            return (crc ^ 0xffffffff) >>> 0;
        }

        addFile(filename, content) {
            let data;
            if (typeof content === 'string') {
                data = new TextEncoder().encode(content);
            } else if (content instanceof ArrayBuffer) {
                data = new Uint8Array(content);
            } else if (content instanceof Uint8Array) {
                data = content;
            } else {
                throw new Error('Unsupported ZIP content type');
            }

            this.entries.push({
                name: filename,
                data: data,
                crc: MinimalZip.crc32(data),
                size: data.length
            });
        }

        generateBlob() {
            let totalLocalLen = 0;
            let totalCentralLen = 0;
            const encoder = new TextEncoder();

            this.entries.forEach(entry => {
                entry.nameBytes = encoder.encode(entry.name);
                totalLocalLen += 30 + entry.nameBytes.length + entry.size;
                totalCentralLen += 46 + entry.nameBytes.length;
            });

            const totalSize = totalLocalLen + totalCentralLen + 22;
            const buffer = new ArrayBuffer(totalSize);
            const view = new DataView(buffer);
            const uint8 = new Uint8Array(buffer);

            let offset = 0;
            const centralOffsets = [];

            // Write Local File Headers & Data
            for (let i = 0; i < this.entries.length; i++) {
                const entry = this.entries[i];
                centralOffsets.push(offset);

                view.setUint32(offset, 0x04034b50, true);      // Local header signature
                view.setUint16(offset + 4, 20, true);          // Version needed (2.0)
                view.setUint16(offset + 6, 0, true);           // Flags
                view.setUint16(offset + 8, 0, true);           // Compression: 0 (Stored)
                view.setUint16(offset + 10, 0, true);          // Mod time
                view.setUint16(offset + 12, 0, true);          // Mod date
                view.setUint32(offset + 14, entry.crc, true);  // CRC32
                view.setUint32(offset + 18, entry.size, true); // Compressed size
                view.setUint32(offset + 22, entry.size, true); // Uncompressed size
                view.setUint16(offset + 26, entry.nameBytes.length, true); // Name len
                view.setUint16(offset + 28, 0, true);          // Extra len

                offset += 30;
                uint8.set(entry.nameBytes, offset);
                offset += entry.nameBytes.length;
                uint8.set(entry.data, offset);
                offset += entry.size;
            }

            const centralDirStart = offset;

            // Write Central Directory Headers
            for (let i = 0; i < this.entries.length; i++) {
                const entry = this.entries[i];
                const localOff = centralOffsets[i];

                view.setUint32(offset, 0x02014b50, true);      // Central directory signature
                view.setUint16(offset + 4, 20, true);          // Version made by
                view.setUint16(offset + 6, 20, true);          // Version needed
                view.setUint16(offset + 8, 0, true);           // Flags
                view.setUint16(offset + 10, 0, true);          // Compression (Stored)
                view.setUint16(offset + 12, 0, true);          // Mod time
                view.setUint16(offset + 14, 0, true);          // Mod date
                view.setUint32(offset + 16, entry.crc, true);  // CRC32
                view.setUint32(offset + 20, entry.size, true); // Comp size
                view.setUint32(offset + 24, entry.size, true); // Uncomp size
                view.setUint16(offset + 28, entry.nameBytes.length, true); // Name len
                view.setUint16(offset + 30, 0, true);          // Extra len
                view.setUint16(offset + 32, 0, true);          // Comment len
                view.setUint16(offset + 34, 0, true);          // Disk num
                view.setUint16(offset + 36, 0, true);          // Internal attrs
                view.setUint32(offset + 38, 0, true);          // External attrs
                view.setUint32(offset + 42, localOff, true);   // Relative offset of local header

                offset += 46;
                uint8.set(entry.nameBytes, offset);
                offset += entry.nameBytes.length;
            }

            const centralDirLen = offset - centralDirStart;

            // Write End of Central Directory Record (EOCD)
            view.setUint32(offset, 0x06054b50, true);          // EOCD signature
            view.setUint16(offset + 4, 0, true);               // Disk num
            view.setUint16(offset + 6, 0, true);               // Start disk
            view.setUint16(offset + 8, this.entries.length, true);  // Entries this disk
            view.setUint16(offset + 10, this.entries.length, true); // Total entries
            view.setUint32(offset + 12, centralDirLen, true);  // Central dir size
            view.setUint32(offset + 16, centralDirStart, true);// Central dir offset
            view.setUint16(offset + 20, 0, true);              // Comment len

            return new Blob([buffer], { type: 'application/zip' });
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 3: WATERTIGHT BINARY STL SERIALIZER
    // ═══════════════════════════════════════════════════════════════════

    class BinaryStlSerializer {
        /**
         * Serializes one or multiple THREE.BufferGeometry objects into a compliant binary STL ArrayBuffer.
         */
        static serialize(geometries) {
            const list = Array.isArray(geometries) ? geometries : [geometries];
            let totalTriangles = 0;

            const nonIndexed = list.map(geom => {
                const nonIdx = geom.index ? geom.toNonIndexed() : geom;
                const pos = nonIdx.getAttribute('position');
                const triCount = pos ? Math.floor(pos.count / 3) : 0;
                totalTriangles += triCount;
                return { geom: nonIdx, pos, count: triCount };
            });

            // Standard Binary STL format: 80 bytes header + 4 bytes uint32 tri count + 50 bytes per triangle
            const bufferSize = 80 + 4 + totalTriangles * 50;
            const buffer = new ArrayBuffer(bufferSize);
            const view = new DataView(buffer);

            // Write 80-byte header
            const headerStr = 'STΔN Studio — Custom 3D Shadow Box Lamp [Watertight Solid STL]';
            const encoder = new TextEncoder();
            const headerBytes = encoder.encode(headerStr);
            const headerTarget = new Uint8Array(buffer, 0, 80);
            headerTarget.set(headerBytes.subarray(0, Math.min(headerBytes.length, 80)));

            // Write Triangle Count
            view.setUint32(80, totalTriangles, true);

            let offset = 84;
            const vA = new THREE.Vector3();
            const vB = new THREE.Vector3();
            const vC = new THREE.Vector3();
            const cb = new THREE.Vector3();
            const ab = new THREE.Vector3();
            const normal = new THREE.Vector3();

            for (const item of nonIndexed) {
                const pos = item.pos;
                const count = item.count;
                if (!pos || count === 0) continue;

                for (let i = 0; i < count; i++) {
                    const idx = i * 3;
                    vA.fromBufferAttribute(pos, idx);
                    vB.fromBufferAttribute(pos, idx + 1);
                    vC.fromBufferAttribute(pos, idx + 2);

                    // Compute normal: (vC - vB) x (vA - vB)
                    cb.subVectors(vC, vB);
                    ab.subVectors(vA, vB);
                    normal.crossVectors(cb, ab).normalize();

                    // Normal Vector (12 bytes)
                    view.setFloat32(offset, normal.x || 0, true);
                    view.setFloat32(offset + 4, normal.y || 0, true);
                    view.setFloat32(offset + 8, normal.z || 0, true);

                    // Vertex 1 (12 bytes)
                    view.setFloat32(offset + 12, vA.x, true);
                    view.setFloat32(offset + 16, vA.y, true);
                    view.setFloat32(offset + 20, vA.z, true);

                    // Vertex 2 (12 bytes)
                    view.setFloat32(offset + 24, vB.x, true);
                    view.setFloat32(offset + 28, vB.y, true);
                    view.setFloat32(offset + 32, vB.z, true);

                    // Vertex 3 (12 bytes)
                    view.setFloat32(offset + 36, vC.x, true);
                    view.setFloat32(offset + 40, vC.y, true);
                    view.setFloat32(offset + 44, vC.z, true);

                    // Attribute byte count (2 bytes) = 0
                    view.setUint16(offset + 48, 0, true);

                    offset += 50;
                }
            }

            return buffer;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 4: SILHOUETTE PROCESSOR & AUTOMATIC STRUT BRIDGING
    // ═══════════════════════════════════════════════════════════════════

    class SilhouetteProcessor {
        /**
         * Renders an image or SVG onto an internal 2D canvas, extracts luminance,
         * thresholds to binary mask, despeckles, and applies MST-based strut bridging.
         */
        static processImage(imageSource, options = {}) {
            const width = options.width || 512;
            const height = options.height || 512;
            const threshold = options.threshold !== undefined ? options.threshold : 128;
            const invert = !!options.invert;
            const mirror = !!options.mirror;
            const minArea = options.minArea || 8;
            const strutPx = Math.max(2, Math.round(options.strutWidthPx || 4));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            if (mirror) {
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
            }

            // Draw image centered and aspect-scaled with 6% safety margin
            const margin = Math.round(width * 0.06);
            const drawW = width - margin * 2;
            const drawH = height - margin * 2;

            const imgW = imageSource.naturalWidth || imageSource.width || width;
            const imgH = imageSource.naturalHeight || imageSource.height || height;
            const scale = Math.min(drawW / imgW, drawH / imgH);
            const sw = Math.round(imgW * scale);
            const sh = Math.round(imgH * scale);
            const sx = margin + Math.round((drawW - sw) / 2);
            const sy = margin + Math.round((drawH - sh) / 2);

            ctx.drawImage(imageSource, sx, sy, sw, sh);
            ctx.restore();

            const imgData = ctx.getImageData(0, 0, width, height);
            const rgba = imgData.data;
            const totalPixels = width * height;
            const binaryMask = new Uint8Array(totalPixels);

            // Binarization: Convert grayscale luminance (0.299R + 0.587G + 0.114B)
            for (let i = 0; i < totalPixels; i++) {
                const p = i * 4;
                const a = rgba[p + 3] / 255.0;
                // If translucent, blend over white background
                const r = rgba[p] * a + 255 * (1 - a);
                const g = rgba[p + 1] * a + 255 * (1 - a);
                const b = rgba[p + 2] * a + 255 * (1 - a);
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                // Dark pixel = foreground plastic (1), bright = hollow light cutout (0)
                let isSolid = lum < threshold ? 1 : 0;
                if (invert) isSolid = 1 - isSolid;
                binaryMask[i] = isSolid;
            }

            // Bottom Rail: Force bottom 4 rows to be 100% solid plastic (anchors the stencil to base plate)
            const railRows = Math.max(3, Math.round(height * 0.025));
            for (let y = height - railRows; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    binaryMask[y * width + x] = 1;
                }
            }

            // Automatic Floating Island Detection & Prim-Based MST Strut Bridging
            const bridgeResult = SilhouetteProcessor.bridgeIslands(binaryMask, width, height, strutPx, minArea);

            // Create preview thumbnail
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = width;
            previewCanvas.height = height;
            const pCtx = previewCanvas.getContext('2d');
            const pImgData = pCtx.createImageData(width, height);
            const pData = pImgData.data;

            for (let i = 0; i < totalPixels; i++) {
                const idx = i * 4;
                const val = binaryMask[i] ? 20 : 245; // Dark plastic vs bright cutout
                pData[idx] = val;
                pData[idx + 1] = val;
                pData[idx + 2] = val;
                pData[idx + 3] = 255;
            }
            pCtx.putImageData(pImgData, 0, 0);

            return {
                mask: binaryMask,
                width,
                height,
                previewDataUrl: previewCanvas.toDataURL('image/png'),
                bridgedCount: bridgeResult.bridged,
                droppedCount: bridgeResult.dropped
            };
        }

        /**
         * 8-connected components labeling and shortest-path ray bridging for floating islands.
         */
        static bridgeIslands(mask, w, h, strutPx, minArea) {
            const labels = new Int32Array(w * h);
            const components = [];
            const stack = new Int32Array(w * h);

            // 1. Identify Connected Components
            for (let i = 0; i < w * h; i++) {
                if (!mask[i] || labels[i]) continue;
                const compId = components.length + 1;
                const pixels = [];
                let sp = 0;
                stack[sp++] = i;
                labels[i] = compId;

                while (sp > 0) {
                    const c = stack[--sp];
                    pixels.push(c);
                    const cx = c % w;
                    const cy = Math.floor(c / w);

                    // 4-way direct neighbors
                    if (cx > 0 && mask[c - 1] && !labels[c - 1]) { labels[c - 1] = compId; stack[sp++] = c - 1; }
                    if (cx < w - 1 && mask[c + 1] && !labels[c + 1]) { labels[c + 1] = compId; stack[sp++] = c + 1; }
                    if (cy > 0 && mask[c - w] && !labels[c - w]) { labels[c - w] = compId; stack[sp++] = c - w; }
                    if (cy < h - 1 && mask[c + w] && !labels[c + w]) { labels[c + w] = compId; stack[sp++] = c + w; }
                }

                components.push({ id: compId, pixels });
            }

            if (components.length <= 1) {
                return { bridged: 0, dropped: 0 };
            }

            // Identify the Anchor Component (touches bottom rail)
            let anchorComp = null;
            let maxRailPixels = 0;

            for (const comp of components) {
                let railHits = 0;
                for (const p of comp.pixels) {
                    if (Math.floor(p / w) >= h - 4) railHits++;
                }
                if (railHits > maxRailPixels) {
                    maxRailPixels = railHits;
                    anchorComp = comp;
                }
            }

            if (!anchorComp) {
                anchorComp = components.reduce((max, c) => c.pixels.length > max.pixels.length ? c : max, components[0]);
            }

            // Extract boundary points for a component
            const getBoundaryPoints = (comp, maxSamples = 80) => {
                const boundary = [];
                for (const p of comp.pixels) {
                    const x = p % w;
                    const y = Math.floor(p / w);
                    if (x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
                        !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) {
                        boundary.push([x, y]);
                    }
                }
                if (boundary.length <= maxSamples) return boundary;
                // Subsample evenly
                const step = boundary.length / maxSamples;
                const res = [];
                for (let i = 0; i < maxSamples; i++) {
                    res.push(boundary[Math.floor(i * step)]);
                }
                return res;
            };

            const floatingComps = components.filter(c => c.id !== anchorComp.id);
            let dropped = 0;
            const candidates = [];

            for (const comp of floatingComps) {
                if (comp.pixels.length < minArea) {
                    // Remove noise specks
                    for (const p of comp.pixels) mask[p] = 0;
                    dropped++;
                } else {
                    candidates.push({
                        comp,
                        boundary: getBoundaryPoints(comp, 60),
                        anchored: false,
                        bestDistSq: Infinity,
                        fromPt: null,
                        toPt: null
                    });
                }
            }

            // Prim MST: iteratively bridge nearest floating island to anchored cluster
            const anchorPoints = getBoundaryPoints(anchorComp, 180);
            let currentAnchoredPoints = [...anchorPoints];

            const updateDistances = (candidate, newPoints) => {
                for (const p of candidate.boundary) {
                    for (const q of newPoints) {
                        const dx = p[0] - q[0];
                        const dy = p[1] - q[1];
                        const dSq = dx * dx + dy * dy;
                        if (dSq < candidate.bestDistSq) {
                            candidate.bestDistSq = dSq;
                            candidate.fromPt = p;
                            candidate.toPt = q;
                        }
                    }
                }
            };

            for (const cand of candidates) {
                updateDistances(cand, currentAnchoredPoints);
            }

            let bridged = 0;
            const halfStrut = Math.max(1, Math.round(strutPx / 2));

            for (let step = 0; step < candidates.length; step++) {
                let bestCand = null;
                for (const cand of candidates) {
                    if (!cand.anchored && (!bestCand || cand.bestDistSq < bestCand.bestDistSq)) {
                        bestCand = cand;
                    }
                }

                if (!bestCand || !bestCand.fromPt || !bestCand.toPt) break;

                // Stamp thick line bridge into mask
                SilhouetteProcessor.stampBresenhamLine(
                    mask, w, h,
                    bestCand.fromPt[0], bestCand.fromPt[1],
                    bestCand.toPt[0], bestCand.toPt[1],
                    halfStrut
                );

                bestCand.anchored = true;
                bridged++;

                // Update candidate distances to include this newly anchored island's points
                for (const cand of candidates) {
                    if (!cand.anchored) {
                        updateDistances(cand, bestCand.boundary);
                    }
                }
            }

            return { bridged, dropped };
        }

        /**
         * Thick Bresenham line stamper for physical 3D printable struts.
         */
        static stampBresenhamLine(mask, w, h, x0, y0, x1, y1, radius) {
            let dx = Math.abs(x1 - x0);
            let dy = Math.abs(y1 - y0);
            let sx = x0 < x1 ? 1 : -1;
            let sy = y0 < y1 ? 1 : -1;
            let err = dx - dy;

            let curX = x0;
            let curY = y0;

            const stampCircle = (cx, cy) => {
                const rSq = radius * radius;
                for (let ry = -radius; ry <= radius; ry++) {
                    const py = cy + ry;
                    if (py < 0 || py >= h) continue;
                    for (let rx = -radius; rx <= radius; rx++) {
                        const px = cx + rx;
                        if (px < 0 || px >= w) continue;
                        if (rx * rx + ry * ry <= rSq) {
                            mask[py * w + px] = 1;
                        }
                    }
                }
            };

            while (true) {
                stampCircle(curX, curY);
                if (curX === x1 && curY === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) {
                    err -= dy;
                    curX += sx;
                }
                if (e2 < dx) {
                    err += dx;
                    curY += sy;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 5: INVERSE OPTICAL RAY PROJECTION & ENCLOSURE GEOMETRY
    // ═══════════════════════════════════════════════════════════════════

    class OpticalRayProjector {
        /**
         * Constructs 2D perimeter boundary vertices for the selected shape.
         */
        static generateShapeVertices(kind, width, height) {
            const rx = width / 2;
            const ry = height / 2;
            const verts = [];

            switch (kind) {
                case SHAPE_KINDS.RECTANGLE:
                    verts.push([-rx, ry], [rx, ry], [rx, -ry], [-rx, -ry]);
                    break;

                case SHAPE_KINDS.CYLINDER: {
                    const count = 36;
                    for (let i = 0; i < count; i++) {
                        const theta = (i / count) * Math.PI * 2;
                        verts.push([rx * Math.cos(theta), ry * Math.sin(theta)]);
                    }
                    break;
                }

                case SHAPE_KINDS.ROUND12: {
                    const count = 12;
                    for (let i = 0; i < count; i++) {
                        const theta = (i / count) * Math.PI * 2;
                        verts.push([rx * Math.cos(theta), ry * Math.sin(theta)]);
                    }
                    break;
                }

                case SHAPE_KINDS.HEXAGON: {
                    const count = 6;
                    for (let i = 0; i < count; i++) {
                        const theta = (i / count) * Math.PI * 2 + Math.PI / 6;
                        verts.push([rx * Math.cos(theta), ry * Math.sin(theta)]);
                    }
                    break;
                }

                case SHAPE_KINDS.OCTAGON: {
                    const count = 8;
                    for (let i = 0; i < count; i++) {
                        const theta = (i / count) * Math.PI * 2 + Math.PI / 8;
                        verts.push([rx * Math.cos(theta), ry * Math.sin(theta)]);
                    }
                    break;
                }

                case SHAPE_KINDS.TRIANGLE: {
                    const count = 3;
                    for (let i = 0; i < count; i++) {
                        const theta = (i / count) * Math.PI * 2 + Math.PI / 2;
                        verts.push([rx * Math.cos(theta), ry * Math.sin(theta)]);
                    }
                    break;
                }

                case SHAPE_KINDS.DIAMOND:
                    verts.push([0, ry], [rx, 0], [0, -ry], [-rx, 0]);
                    break;

                default:
                    verts.push([-rx, ry], [rx, ry], [rx, -ry], [-rx, -ry]);
                    break;
            }

            return verts;
        }

        /**
         * Extracts perimeter panel segments and normals from polygon vertices.
         */
        static computePerimeterInfo(verts) {
            const count = verts.length;
            const sides = [];
            let cumulativeU = 0;

            for (let i = 0; i < count; i++) {
                const next = (i + 1) % count;
                const p0 = verts[i];
                const p1 = verts[next];
                const dx = p1[0] - p0[0];
                const dy = p1[1] - p0[1];
                const len = Math.hypot(dx, dy);

                // Tangent & Outward Normal
                const tx = dx / len;
                const ty = dy / len;
                const nx = ty;
                const ny = -tx;

                // Center of panel segment
                const cx = (p0[0] + p1[0]) / 2;
                const cy = (p0[1] + p1[1]) / 2;
                const distToOrigin = cx * nx + cy * ny;

                sides.push({
                    index: i,
                    p0,
                    p1,
                    length: len,
                    u0: cumulativeU,
                    u1: cumulativeU + len,
                    normal: [nx, ny],
                    tangent: [tx, ty],
                    center: [cx, cy],
                    dist: distToOrigin,
                    angle: Math.atan2(ny, nx)
                });

                cumulativeU += len;
            }

            return { sides, totalPerimeter: cumulativeU };
        }

        /**
         * Core Optical Inverse Ray Projection Formula:
         * Calculates stencil height zp from magnification factor q.
         * Wall at Z = 0, floor at Z = F, LED at (0, 0, F + hL).
         */
        static projectInverseHeight(q, floorThickness, ledHeight) {
            if (q <= 0) return 0;
            // q = (F + hL) / (hL - zp) => hL - zp = (F + hL) / q => zp = hL - (F + hL) / q
            return ledHeight - (floorThickness + ledHeight) / q;
        }

        /**
         * Forward Optical Ray Projection:
         * Calculates wall magnification q from stencil height zp.
         */
        static projectForwardMagnification(zp, floorThickness, ledHeight) {
            const denom = ledHeight - zp;
            if (denom <= 0.001) return 999.0;
            return (floorThickness + ledHeight) / denom;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 6: PARAMETRIC 3D SOLID GENERATOR (WATERTIGHT BUFFERGEOMETRIES)
    // ═══════════════════════════════════════════════════════════════════

    class EnclosureBuilder {
        /**
         * Synthesizes the Base Floor Plate with:
         * - Cable exit channel underneath
         * - Center wire hole
         * - Rear wall keyhole slot
         */
        static createBasePlateGeometry(vertices, floorThickness, wallThickness) {
            const shape = new THREE.Shape();
            shape.moveTo(vertices[0][0], vertices[0][1]);
            for (let i = 1; i < vertices.length; i++) {
                shape.lineTo(vertices[i][0], vertices[i][1]);
            }
            shape.closePath();

            // Center wire passage hole (4.5mm diameter)
            const wireHole = new THREE.Path();
            wireHole.absarc(0, 0, 2.25, 0, Math.PI * 2, true);
            shape.holes.push(wireHole);

            // Extrude Base Plate
            const extrudeSettings = {
                depth: floorThickness,
                bevelEnabled: false
            };
            const baseGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            baseGeom.center();
            return baseGeom;
        }

        /**
         * Synthesizes the Hollow Central LED Post with 5mm top LED socket cup.
         */
        static createLedPostGeometry(postHeight, floorThickness) {
            const outerRadius = 4.2; // 8.4mm outer diameter
            const innerRadius = 2.4; // 4.8mm wire hole straight through
            const cupRadius = 2.7;   // 5.4mm socket cup for 5mm LED bulb
            const cupDepth = 3.5;

            const postShape = new THREE.Shape();
            postShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

            const wirePath = new THREE.Path();
            wirePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
            postShape.holes.push(wirePath);

            const postGeom = new THREE.ExtrudeGeometry(postShape, {
                depth: Math.max(10, postHeight - cupDepth),
                bevelEnabled: false
            });

            // Top LED Socket Cup
            const cupShape = new THREE.Shape();
            cupShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
            const cupHole = new THREE.Path();
            cupHole.absarc(0, 0, cupRadius, 0, Math.PI * 2, true);
            cupShape.holes.push(cupHole);

            const cupGeom = new THREE.ExtrudeGeometry(cupShape, {
                depth: cupDepth,
                bevelEnabled: false
            });
            cupGeom.translate(0, 0, Math.max(10, postHeight - cupDepth));

            // Merge Post + Cup
            const merged = EnclosureBuilder.mergeBufferGeometries([postGeom, cupGeom]);
            return merged;
        }

        /**
         * Synthesizes 3D Extruded Perimeter Stencil Wall Panels.
         * Discretizes each panel into columns along its width, sampling the optical projection
         * to compute the stencil cutout height profile.
         */
        static createStencilWallGeometries(sides, silhouetteData, params, unfolded = false) {
            const { mask, width: maskW, height: maskH } = silhouetteData;
            const { floorThickness, ledHeight, panelHeight, wallThickness } = params;
            const geometries = [];

            const sampleMask = (uNorm, vNorm) => {
                if (uNorm < 0 || uNorm >= 1 || vNorm < 0 || vNorm >= 1) return 0;
                const mx = Math.floor(uNorm * maskW);
                const my = Math.floor((1 - vNorm) * maskH);
                return mask[my * maskW + mx] ? 1 : 0;
            };

            const numColsPerSide = 32;
            const numRows = 28;

            let unfoldOffsetX = 0;

            for (let sIdx = 0; sIdx < sides.length; sIdx++) {
                const side = sides[sIdx];
                const panelWidth = side.length;
                const positions = [];
                const indices = [];

                // Discretize panel grid (numColsPerSide x numRows)
                const dx = panelWidth / numColsPerSide;
                const dz = panelHeight / numRows;

                for (let r = 0; r <= numRows; r++) {
                    const zp = r * dz;
                    // Forward magnification at this height
                    const q = OpticalRayProjector.projectForwardMagnification(zp, floorThickness, ledHeight);

                    for (let c = 0; c <= numColsPerSide; c++) {
                        const u = -panelWidth / 2 + c * dx;

                        // Point on panel in local coordinate system
                        const worldX = side.center[0] + u * side.tangent[0];
                        const worldY = side.center[1] + u * side.tangent[1];

                        // Projected point on wall plane
                        const wallX = worldX * q;
                        const wallY = worldY * q;

                        // Map to normalized silhouette canvas coordinates
                        // Figure scale: auto-fit to 2.5x box width on wall
                        const wallCoverageMm = params.width * 2.8;
                        const normU = 0.5 + wallX / wallCoverageMm;
                        const normV = 0.5 + wallY / wallCoverageMm;

                        // Check mask: 1 = solid plastic, 0 = cutout hole
                        // Force bottom rail (zp <= 4mm) to always be solid plastic
                        const isSolid = zp <= 3.8 || sampleMask(normU, normV);

                        // Vertex position on panel surface: (u, zp, thicknessOffset)
                        positions.push(u, zp, isSolid ? wallThickness : 0);
                    }
                }

                // Build Quad Triangles
                const cols = numColsPerSide + 1;
                for (let r = 0; r < numRows; r++) {
                    for (let c = 0; c < numColsPerSide; c++) {
                        const i0 = r * cols + c;
                        const i1 = i0 + 1;
                        const i2 = (r + 1) * cols + c;
                        const i3 = i2 + 1;

                        const val0 = positions[i0 * 3 + 2] > 0;
                        const val1 = positions[i1 * 3 + 2] > 0;
                        const val2 = positions[i2 * 3 + 2] > 0;
                        const val3 = positions[i3 * 3 + 2] > 0;

                        // Only generate triangles for solid plastic regions
                        if (val0 || val1 || val2 || val3) {
                            indices.push(i0, i1, i2);
                            indices.push(i1, i3, i2);
                        }
                    }
                }

                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geom.setIndex(indices);
                geom.computeVertexNormals();

                if (unfolded) {
                    // Lay flat on build plate at Z = 0
                    geom.rotateX(-Math.PI / 2);
                    geom.translate(unfoldOffsetX, 0, 0);
                    unfoldOffsetX += panelWidth + 6;
                } else {
                    // Position along 3D perimeter
                    geom.rotateY(Math.atan2(side.normal[1], side.normal[0]) + Math.PI / 2);
                    geom.translate(side.center[0], side.center[1], floorThickness / 2);
                }

                geometries.push(geom);
            }

            return geometries;
        }

        /**
         * Merges multiple BufferGeometries into a single solid BufferGeometry.
         */
        static mergeBufferGeometries(geometries) {
            let totalPositions = 0;
            let totalIndices = 0;

            const nonIndexed = geometries.map(g => (g.index ? g.toNonIndexed() : g));
            nonIndexed.forEach(g => {
                const pos = g.getAttribute('position');
                if (pos) totalPositions += pos.array.length;
            });

            const mergedPos = new Float32Array(totalPositions);
            let offset = 0;

            nonIndexed.forEach(g => {
                const pos = g.getAttribute('position');
                if (pos) {
                    mergedPos.set(pos.array, offset);
                    offset += pos.array.length;
                }
            });

            const merged = new THREE.BufferGeometry();
            merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
            merged.computeVertexNormals();
            return merged;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 7: MAIN SHADOW BOX STUDIO INTERACTIVE CONTROLLER
    // ═══════════════════════════════════════════════════════════════════

    class ShadowBoxStudio {
        constructor(canvasId, options = {}) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) throw new Error(`Canvas #${canvasId} not found`);

            this.params = { ...DEFAULT_PARAMS, ...options };
            this.activeSilhouette = null;
            this.currentMeshes = {
                base: null,
                post: null,
                walls: [],
                room: null
            };

            this.initThree();
            this.loadDefaultSilhouette();
        }

        initThree() {
            const width = this.canvas.clientWidth || 800;
            const height = this.canvas.clientHeight || 600;

            // Scene & Camera
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color('#070708');

            this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
            this.camera.position.set(50, -320, 240);
            this.camera.up.set(0, 0, 1);

            // Renderer with Soft Shadows
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance'
            });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

            // Controls (Simple smooth mouse orbit with right-offset target)
            this.initOrbitControls();

            // Lighting Setup
            this.initLighting();

            // Build Virtual Shadow Wall Room
            this.buildShadowRoom();

            // Render Loop
            this.isAnimating = true;
            this.autoOrbit = false;
            this.animate = this.animate.bind(this);
            requestAnimationFrame(this.animate);

            // Handle Resize
            window.addEventListener('resize', () => this.handleResize());
        }

        initOrbitControls() {
            let isDragging = false;
            let prevX = 0;
            let prevY = 0;
            this.orbitTheta = -Math.PI / 2;
            this.orbitPhi = Math.PI / 4;
            this.orbitRadius = 380;
            this.target = new THREE.Vector3(50, this.params.wallDistance * 0.4, 70);

            const updateCam = () => {
                this.orbitPhi = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, this.orbitPhi));
                this.camera.position.x = this.target.x + this.orbitRadius * Math.sin(this.orbitPhi) * Math.cos(this.orbitTheta);
                this.camera.position.y = this.target.y + this.orbitRadius * Math.sin(this.orbitPhi) * Math.sin(this.orbitTheta);
                this.camera.position.z = this.target.z + this.orbitRadius * Math.cos(this.orbitPhi);
                this.camera.lookAt(this.target);
            };

            this.canvas.addEventListener('mousedown', (e) => {
                isDragging = true;
                prevX = e.clientX;
                prevY = e.clientY;
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - prevX;
                const dy = e.clientY - prevY;
                prevX = e.clientX;
                prevY = e.clientY;

                this.orbitTheta -= dx * 0.008;
                this.orbitPhi -= dy * 0.008;
                updateCam();
            });

            window.addEventListener('mouseup', () => { isDragging = false; });

            this.canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.orbitRadius = Math.max(120, Math.min(900, this.orbitRadius + e.deltaY * 0.4));
                updateCam();
            }, { passive: false });

            this.updateCamera = updateCam;
            updateCam();
        }

        initLighting() {
            // Ambient Studio Light
            this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
            this.scene.add(this.ambientLight);

            // Studio Directional Light
            this.dirLight = new THREE.DirectionalLight(0xffffff, 0.65);
            this.dirLight.position.set(150, -200, 300);
            this.scene.add(this.dirLight);

            // Realistic Lamp LED Point Light (Casts true inverse perspective shadow on wall)
            this.ledLight = new THREE.PointLight(this.params.ledColor, this.params.ledIntensity, 1200, 1.2);
            this.ledLight.castShadow = true;
            this.ledLight.shadow.mapSize.width = 2048;
            this.ledLight.shadow.mapSize.height = 2048;
            this.ledLight.shadow.camera.near = 5;
            this.ledLight.shadow.camera.far = 1000;
            this.ledLight.shadow.bias = -0.001;

            this.scene.add(this.ledLight);

            // LED Glow Bulb Mesh
            const bulbGeom = new THREE.SphereGeometry(3.5, 16, 16);
            this.bulbMat = new THREE.MeshBasicMaterial({ color: this.params.ledColor });
            this.bulbMesh = new THREE.Mesh(bulbGeom, this.bulbMat);
            this.scene.add(this.bulbMesh);
        }

        buildShadowRoom() {
            if (this.roomGroup) this.scene.remove(this.roomGroup);
            this.roomGroup = new THREE.Group();

            // Virtual Shadow Wall at Y = wallDistance (refined dark neutral plaster)
            const wallGeom = new THREE.PlaneGeometry(850, 600);
            const wallMat = new THREE.MeshStandardMaterial({
                color: '#131317',
                roughness: 0.94,
                metalness: 0.0
            });
            this.shadowWall = new THREE.Mesh(wallGeom, wallMat);
            this.shadowWall.position.set(0, this.params.wallDistance, 140);
            this.shadowWall.rotation.x = Math.PI / 2;
            this.shadowWall.receiveShadow = true;
            this.roomGroup.add(this.shadowWall);

            // Obsidian Studio Tabletop Surface (Floor Z = 0)
            const deskGeom = new THREE.PlaneGeometry(850, 700);
            const deskMat = new THREE.MeshStandardMaterial({
                color: '#08090b',
                roughness: 0.88,
                metalness: 0.05
            });
            this.deskMesh = new THREE.Mesh(deskGeom, deskMat);
            this.deskMesh.position.set(0, 0, 0);
            this.deskMesh.receiveShadow = true;
            this.roomGroup.add(this.deskMesh);

            // Bambu Lab A1 Mini 180 x 180 mm Build Plate Bed Guide (Monochrome subtle grid)
            const bedGeom = new THREE.PlaneGeometry(180, 180);
            const bedMat = new THREE.MeshBasicMaterial({
                color: '#71717a',
                wireframe: true,
                transparent: true,
                opacity: 0.35
            });
            this.bedGuide = new THREE.Mesh(bedGeom, bedMat);
            this.bedGuide.position.set(0, 0, 0.2);
            this.bedGuide.visible = false;
            this.roomGroup.add(this.bedGuide);

            this.scene.add(this.roomGroup);
        }

        loadDefaultSilhouette() {
            // Built-in iconic wolf & moon silhouette SVG
            const svgString = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
                    <circle cx="256" cy="190" r="130" fill="#000" />
                    <circle cx="210" cy="170" r="120" fill="#fff" />
                    <path d="M 230 400 L 260 310 L 280 330 L 320 280 L 330 330 L 360 300 L 350 400 Z" fill="#000" />
                    <path d="M 120 400 L 170 340 L 210 400 Z" fill="#000" />
                    <circle cx="340" cy="180" r="16" fill="#000" />
                    <rect x="0" y="390" width="512" height="122" fill="#000" />
                </svg>
            `;
            this.loadFromSvgString(svgString);
        }

        loadFromSvgString(svgStr) {
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                this.setSilhouetteImage(img);
            };
            img.src = url;
        }

        loadFromFile(file) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                this.setSilhouetteImage(img);
            };
            img.src = url;
        }

        setSilhouetteImage(imageObj) {
            this.rawImage = imageObj;
            this.rebuildModel();
        }

        rebuildModel() {
            if (!this.rawImage) return;

            // 1. Process Silhouette Binary Mask & Bridges
            this.activeSilhouette = SilhouetteProcessor.processImage(this.rawImage, {
                width: 512,
                height: 512,
                threshold: this.params.threshold,
                invert: this.params.invert,
                mirror: this.params.mirror,
                minArea: this.params.minIslandArea,
                strutWidthPx: this.params.strutWidth * 3.5
            });

            // Update UI Telemetry if callbacks attached
            if (this.onTelemetry) {
                this.onTelemetry({
                    bridged: this.activeSilhouette.bridgedCount,
                    dropped: this.activeSilhouette.droppedCount,
                    previewUrl: this.activeSilhouette.previewDataUrl
                });
            }

            // 2. Clear Previous Meshes
            this.clearModelMeshes();

            // 3. Compute Polygon Footprint
            const verts = OpticalRayProjector.generateShapeVertices(
                this.params.shape,
                this.params.width,
                this.params.height
            );
            const perimeterInfo = OpticalRayProjector.computePerimeterInfo(verts);

            const isFlatBed = this.params.viewMode === 'flat-bed';

            // 4. Generate Base Floor Plate
            const baseGeom = EnclosureBuilder.createBasePlateGeometry(
                verts,
                this.params.floorThickness,
                this.params.wallThickness
            );
            this.rawBaseGeom = baseGeom;

            const baseMat = new THREE.MeshStandardMaterial({
                color: '#18181b',
                roughness: 0.45,
                metalness: 0.10
            });
            this.baseMesh = new THREE.Mesh(baseGeom, baseMat);
            this.baseMesh.position.set(0, 0, this.params.floorThickness / 2);
            this.baseMesh.castShadow = true;
            this.baseMesh.receiveShadow = true;
            this.scene.add(this.baseMesh);

            // 5. Generate LED Post
            const postGeom = EnclosureBuilder.createLedPostGeometry(
                this.params.ledHeight,
                this.params.floorThickness
            );
            this.rawPostGeom = postGeom;

            const postMat = new THREE.MeshStandardMaterial({
                color: '#27272a',
                roughness: 0.45,
                metalness: 0.10
            });
            this.postMesh = new THREE.Mesh(postGeom, postMat);
            this.postMesh.position.set(0, 0, this.params.floorThickness);
            this.postMesh.castShadow = true;
            this.scene.add(this.postMesh);

            // 6. Generate Stencil Wall Panels
            const wallGeoms = EnclosureBuilder.createStencilWallGeometries(
                perimeterInfo.sides,
                this.activeSilhouette,
                this.params,
                isFlatBed
            );
            this.rawWallGeoms = wallGeoms;

            const wallMat = new THREE.MeshStandardMaterial({
                color: '#27272a',
                roughness: 0.35,
                metalness: 0.15,
                side: THREE.DoubleSide
            });

            this.wallMeshes = [];
            for (const wg of wallGeoms) {
                const mesh = new THREE.Mesh(wg, wallMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.scene.add(mesh);
                this.wallMeshes.push(mesh);
            }

            // 7. Update LED Position and Shadows
            const ledZ = this.params.floorThickness + this.params.ledHeight;
            this.ledLight.position.set(0, 0, ledZ);
            this.ledLight.color.set(this.params.ledColor);
            this.ledLight.intensity = this.params.ledIntensity;

            this.bulbMesh.position.set(0, 0, ledZ);
            this.bulbMat.color.set(this.params.ledColor);

            // 8. Update View Mode Environment
            this.updateViewMode(this.params.viewMode);

            // 9. Emit BOM & Price Telemetry
            this.updateBOM();
        }

        clearModelMeshes() {
            if (this.baseMesh) { this.scene.remove(this.baseMesh); this.baseMesh.geometry.dispose(); }
            if (this.postMesh) { this.scene.remove(this.postMesh); this.postMesh.geometry.dispose(); }
            if (this.wallMeshes) {
                this.wallMeshes.forEach(m => { this.scene.remove(m); m.geometry.dispose(); });
                this.wallMeshes = [];
            }
        }

        updateViewMode(mode) {
            this.params.viewMode = mode;
            if (mode === 'shadow-wall') {
                this.shadowWall.visible = true;
                this.deskMesh.visible = true;
                this.bedGuide.visible = false;
                this.ledLight.visible = true;
                this.ambientLight.intensity = 0.20;
                this.dirLight.intensity = 0.30;
                this.orbitRadius = 380;
                this.target.set(50, this.params.wallDistance * 0.4, 70);
            } else if (mode === 'assembled-mesh') {
                this.shadowWall.visible = false;
                this.deskMesh.visible = true;
                this.bedGuide.visible = false;
                this.ledLight.visible = true;
                this.ambientLight.intensity = 0.55;
                this.dirLight.intensity = 0.75;
                this.orbitRadius = 260;
                this.target.set(40, 0, 45);
            } else if (mode === 'flat-bed') {
                this.shadowWall.visible = false;
                this.deskMesh.visible = false;
                this.bedGuide.visible = true;
                this.ledLight.visible = false;
                this.ambientLight.intensity = 0.80;
                this.dirLight.intensity = 0.90;
                this.orbitRadius = 280;
                this.target.set(30, 0, 0);
            }
            if (this.updateCamera) this.updateCamera();
        }

        updateBOM() {
            // Rough volume calculation in mm3
            const width = this.params.width;
            const height = this.params.height;
            const baseVol = (width * height * 0.7) * this.params.floorThickness;
            const postVol = Math.PI * (4.2 * 4.2 - 2.4 * 2.4) * this.params.ledHeight;
            const perimeter = width * 3.14;
            const wallsVol = perimeter * this.params.panelHeight * this.params.wallThickness * 0.55; // ~45% cutouts
            const totalVolMm3 = baseVol + postVol + wallsVol;

            // Density of PLA: 1.24 g/cm3 (1 cm3 = 1000 mm3)
            const filamentGrams = Math.round((totalVolMm3 / 1000) * 1.24);

            // Pricing formula: ₹3.50 per gram + ₹80 LED/hardware + ₹195 machine prep
            const filamentCost = Math.round(filamentGrams * 3.50);
            const hardwareCost = 80;
            const prepFee = 195;
            const totalPrice = filamentCost + hardwareCost + prepFee;

            if (this.onBOMUpdate) {
                this.onBOMUpdate({
                    dimensions: `${this.params.width} × ${this.params.height} × ${this.params.panelHeight + Math.round(this.params.floorThickness)} mm`,
                    filamentGrams,
                    totalPrice,
                    printTimeHours: (filamentGrams / 18).toFixed(1) // ~18g/hr on Bambu A1 Mini
                });
            }
        }

        setParam(key, value) {
            this.params[key] = value;
            this.rebuildModel();
        }

        downloadFusedStl(filename = 'STAN_Shadow_Lamp_Fused.stl') {
            if (!this.rawBaseGeom || !this.rawPostGeom || !this.rawWallGeoms) return;

            const allGeoms = [this.rawBaseGeom, this.rawPostGeom, ...this.rawWallGeoms];
            const buffer = BinaryStlSerializer.serialize(allGeoms);
            const blob = new Blob([buffer], { type: 'application/sla' });
            this.triggerDownload(blob, filename);
        }

        downloadMultiPlateZip(filename = 'STAN_Shadow_Lamp_Print_Bundle.zip') {
            if (!this.rawBaseGeom || !this.rawPostGeom || !this.rawWallGeoms) return;

            const zip = new MinimalZip();

            // 1. Base Plate STL
            const baseBuffer = BinaryStlSerializer.serialize(this.rawBaseGeom);
            zip.addFile('01_Base_Plate.stl', baseBuffer);

            // 2. LED Post STL
            const postBuffer = BinaryStlSerializer.serialize(this.rawPostGeom);
            zip.addFile('02_LED_Post.stl', postBuffer);

            // 3. Stencil Wall Panels STL
            const wallsBuffer = BinaryStlSerializer.serialize(this.rawWallGeoms);
            zip.addFile('03_Stencil_Wall_Panels.stl', wallsBuffer);

            // 4. Print & Slicing Guide
            const guide = `STΔN STUDIO — 3D SHADOW BOX LAMP PRINTING GUIDE
=============================================================
Order Spec:
- Shape: ${this.params.shape.toUpperCase()}
- Dimensions: ${this.params.width} x ${this.params.height} x ${this.params.panelHeight} mm
- Floor Thickness: ${this.params.floorThickness} mm
- Wall Thickness: ${this.params.wallThickness} mm
- Strut Bridge Width: ${this.params.strutWidth} mm

Recommended Slicer Settings (Bambu Studio / PrusaSlicer / Cura):
- Layer Height: 0.16mm or 0.20mm
- Wall Loops: 3
- Top / Bottom Shells: 4
- Infill: 15% - 20% Gyroid
- Supports: NONE needed! (All panels are oriented flat with auto-struts)
- Brim: Recommended 3mm outer brim for thin stencil panels

Hardware Assembly:
1. Pass the USB/LED wire through the base bottom wire channel and up the post.
2. Solder a 5mm Warm Amber (or White) LED with a 150-220 ohm resistor for 5V USB.
3. Seat the LED bulb in the top cup.
4. Slot the stencil wall panels into the base perimeter groove.
5. Place in front of a white wall or hang using the rear keyhole slot!

Manufactured by STΔN Studio (https://stanstudio.in)
`;
            zip.addFile('Print_Guide_STAN_Studio.txt', guide);

            const blob = zip.generateBlob();
            this.triggerDownload(blob, filename);
        }

        triggerDownload(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }

        handleResize() {
            if (!this.canvas || !this.renderer || !this.camera) return;
            const w = this.canvas.clientWidth || 800;
            const h = this.canvas.clientHeight || 600;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        }

        animate() {
            if (!this.isAnimating) return;
            requestAnimationFrame(this.animate);

            if (this.autoOrbit) {
                this.orbitTheta += 0.005;
                if (this.updateCamera) this.updateCamera();
            }

            this.renderer.render(this.scene, this.camera);
        }
    }

    // Export cleanly to global
    global.ShadowBoxStudio = ShadowBoxStudio;
    global.SHAPE_KINDS = SHAPE_KINDS;

})(typeof window !== 'undefined' ? window : this);
