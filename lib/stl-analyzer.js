/**
 * STΔN Studio — Client-Side Local STL Mesh Analyzer & Pre-Flight Engine
 * 
 * Performs 100% client-side memory parsing of binary and ASCII .stl files.
 * Zero network requests during analysis.
 * 
 * Features:
 * - High-speed binary DataView and ASCII stream parsing
 * - Exact Signed Tetrahedron Volume calculation (divergence theorem on closed manifold)
 * - 3D Bounding box and Bambu Lab A1 Mini print bed clearance verification (180 x 180 x 180 mm)
 * - Filament weight estimation in grams (PLA density 1.24 g/cm3 with adjustable infill multiplier)
 * - Real-time INR (₹) price estimation with configurable rates
 * - Local Blob URL creation for instant Three.js viewport loading
 */

// Bambu Lab A1 Mini maximum printable volume
export const PRINTER_LIMITS = Object.freeze({
    model: 'Bambu Lab A1 Mini',
    maxX: 180.0, // mm
    maxY: 180.0, // mm
    maxZ: 180.0, // mm
});

// Standard PLA print parameters and pricing
export const DEFAULT_PRINT_CONFIG = Object.freeze({
    materialDensityGcm3: 1.24, // PLA density in g/cm3
    defaultInfillMultiplier: 0.25, // 2-3 outer walls + 15% infill ≈ 25% effective solid mass
    baseFeeINR: 50.0, // Base machine setup fee in ₹
    ratePerGramINR: 3.50, // Rate per gram of PLA in ₹
    minimumOrderINR: 120.0, // Minimum order threshold in ₹
});

/**
 * Parses an STL input (File, Blob, ArrayBuffer, or Buffer) and returns detailed physical metrics.
 * 
 * @param {File|Blob|ArrayBuffer|Buffer} input - Raw STL file or buffer
 * @param {Object} [options] - Custom analysis parameters
 * @param {number} [options.infillMultiplier=0.25] - Effective mass ratio (0.10 to 1.0)
 * @param {number} [options.ratePerGramINR=3.50] - Price in ₹ per gram
 * @param {number} [options.baseFeeINR=50.0] - Fixed machine prep fee in ₹
 * @returns {Promise<STLAnalysisResult>}
 */
export async function analyzeSTL(input, options = {}) {
    const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    const config = {
        ...DEFAULT_PRINT_CONFIG,
        ...options,
    };

    // 1. Convert input to ArrayBuffer
    let arrayBuffer;
    let fileName = 'model.stl';
    let fileSize = 0;
    let blobUrl = null;

    if (input instanceof ArrayBuffer) {
        arrayBuffer = input;
        fileSize = input.byteLength;
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
        arrayBuffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
        fileSize = input.byteLength;
    } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
        fileSize = input.size;
        fileName = input.name || fileName;
        arrayBuffer = await input.arrayBuffer();
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            try {
                blobUrl = URL.createObjectURL(input);
            } catch (e) {
                blobUrl = null;
            }
        }
    } else {
        throw new TypeError('Invalid input: Expected File, Blob, ArrayBuffer, or Buffer.');
    }

    if (fileSize < 84) {
        throw new Error('Invalid STL file: File size is smaller than standard 84-byte STL header.');
    }

    // 2. Detect Binary vs ASCII
    const isBinary = checkIsBinary(arrayBuffer);

    // 3. Parse triangles, bounding box, and signed tetrahedron volume
    const parseResult = isBinary ? parseBinarySTL(arrayBuffer) : parseAsciiSTL(arrayBuffer);

    const {
        trianglesCount,
        bounds,
        rawVolumeMm3,
        format,
    } = parseResult;

    // Dimensions in mm
    const widthMm = Math.max(0, bounds.maxX - bounds.minX);
    const depthMm = Math.max(0, bounds.maxY - bounds.minY);
    const heightMm = Math.max(0, bounds.maxZ - bounds.minZ);

    // Build volume checks (Bambu Lab A1 Mini: 180 x 180 x 180 mm)
    const sortedDims = [widthMm, depthMm, heightMm].sort((a, b) => a - b);
    const fitsPrinter = sortedDims[0] <= PRINTER_LIMITS.maxX &&
                        sortedDims[1] <= PRINTER_LIMITS.maxY &&
                        sortedDims[2] <= PRINTER_LIMITS.maxZ;

    const oversizedAxes = [];
    if (widthMm > PRINTER_LIMITS.maxX) oversizedAxes.push(`Width (${widthMm.toFixed(1)}mm > 180mm)`);
    if (depthMm > PRINTER_LIMITS.maxY) oversizedAxes.push(`Depth (${depthMm.toFixed(1)}mm > 180mm)`);
    if (heightMm > PRINTER_LIMITS.maxZ) oversizedAxes.push(`Height (${heightMm.toFixed(1)}mm > 180mm)`);

    // Volume conversion: 1 cm3 = 1000 mm3
    const volumeCm3 = Math.max(0, rawVolumeMm3 / 1000.0);

    // Weight calculations (PLA density = 1.24 g/cm3)
    const solidWeightGrams = volumeCm3 * config.materialDensityGcm3;
    const estimatedWeightGrams = solidWeightGrams * config.defaultInfillMultiplier;

    // Price calculation in INR
    const rawPrice = config.baseFeeINR + (estimatedWeightGrams * config.ratePerGramINR);
    const estimatedPriceINR = Math.max(config.minimumOrderINR, Math.round(rawPrice));

    const parseDurationMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - startTime;

    return {
        fileName,
        fileSizeBytes: fileSize,
        fileSizeFormatted: formatFileSize(fileSize),
        format,
        trianglesCount,
        blobUrl,
        dimensions: {
            widthMm: round(widthMm, 2),
            depthMm: round(depthMm, 2),
            heightMm: round(heightMm, 2),
            formatted: `${round(widthMm, 1)} × ${round(depthMm, 1)} × ${round(heightMm, 1)} mm`,
        },
        boundingBox: {
            minX: round(bounds.minX, 2),
            maxX: round(bounds.maxX, 2),
            minY: round(bounds.minY, 2),
            maxY: round(bounds.maxY, 2),
            minZ: round(bounds.minZ, 2),
            maxZ: round(bounds.maxZ, 2),
        },
        printability: {
            printerModel: PRINTER_LIMITS.model,
            fitsPrinter,
            maxPrintVolumeMm: `${PRINTER_LIMITS.maxX} × ${PRINTER_LIMITS.maxY} × ${PRINTER_LIMITS.maxZ} mm`,
            oversizedAxes,
            status: fitsPrinter ? 'FITS_BED' : 'EXCEEDS_BED',
        },
        volume: {
            volumeMm3: round(rawVolumeMm3, 2),
            volumeCm3: round(volumeCm3, 3),
            formatted: `${round(volumeCm3, 2)} cm³`,
        },
        weight: {
            solidWeightGrams: round(solidWeightGrams, 2),
            estimatedWeightGrams: round(estimatedWeightGrams, 2),
            infillMultiplier: config.defaultInfillMultiplier,
            formatted: `${round(estimatedWeightGrams, 1)} g`,
        },
        pricing: {
            currency: 'INR',
            symbol: '₹',
            estimatedPriceINR,
            baseFeeINR: config.baseFeeINR,
            ratePerGramINR: config.ratePerGramINR,
            breakdown: {
                materialCostINR: round(estimatedWeightGrams * config.ratePerGramINR, 2),
                baseSetupINR: config.baseFeeINR,
            },
            formatted: `₹${estimatedPriceINR}`,
        },
        parseDurationMs: round(parseDurationMs, 2),
    };
}

/**
 * Checks whether an STL ArrayBuffer is binary or ASCII.
 * Binary STLs strictly follow the formula: byteLength === 84 + (numTriangles * 50).
 */
function checkIsBinary(buffer) {
    if (buffer.byteLength < 84) return false;
    const view = new DataView(buffer);
    const numTriangles = view.getUint32(80, true);
    const expectedByteLength = 84 + numTriangles * 50;
    
    // Strict binary file size match
    if (buffer.byteLength === expectedByteLength) {
        return true;
    }

    // Secondary check: inspect first 512 bytes for null/binary characters
    const previewLen = Math.min(buffer.byteLength, 512);
    const uint8 = new Uint8Array(buffer, 0, previewLen);
    let hasNull = false;
    for (let i = 0; i < previewLen; i++) {
        if (uint8[i] === 0) {
            hasNull = true;
            break;
        }
    }

    return hasNull;
}

/**
 * High-performance Binary STL Parser using DataView.
 * Calculates bounding box and signed volume simultaneously in a single linear pass.
 */
function parseBinarySTL(buffer) {
    const view = new DataView(buffer);
    const totalTriangles = view.getUint32(80, true);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    let signedVolumeSum = 0.0;
    let offset = 84;

    const maxOffset = buffer.byteLength;

    for (let i = 0; i < totalTriangles && (offset + 50 <= maxOffset); i++) {
        // Skip normal vector (3 * float32 = 12 bytes)
        offset += 12;

        // Vertex 1
        const x1 = view.getFloat32(offset, true);
        const y1 = view.getFloat32(offset + 4, true);
        const z1 = view.getFloat32(offset + 8, true);
        offset += 12;

        // Vertex 2
        const x2 = view.getFloat32(offset, true);
        const y2 = view.getFloat32(offset + 4, true);
        const z2 = view.getFloat32(offset + 8, true);
        offset += 12;

        // Vertex 3
        const x3 = view.getFloat32(offset, true);
        const y3 = view.getFloat32(offset + 4, true);
        const z3 = view.getFloat32(offset + 8, true);
        offset += 12;

        // Skip 2-byte attribute uint16
        offset += 2;

        // Bounding box tracking
        if (x1 < minX) minX = x1; if (x1 > maxX) maxX = x1;
        if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2;
        if (x3 < minX) minX = x3; if (x3 > maxX) maxX = x3;

        if (y1 < minY) minY = y1; if (y1 > maxY) maxY = y1;
        if (y2 < minY) minY = y2; if (y2 > maxY) maxY = y2;
        if (y3 < minY) minY = y3; if (y3 > maxY) maxY = y3;

        if (z1 < minZ) minZ = z1; if (z1 > maxZ) maxZ = z1;
        if (z2 < minZ) minZ = z2; if (z2 > maxZ) maxZ = z2;
        if (z3 < minZ) minZ = z3; if (z3 > maxZ) maxZ = z3;

        // Signed tetrahedron volume formula:
        // V = (1/6) * ( v1 · (v2 × v3) )
        // 6 * V = x1*(y2*z3 - z2*y3) + y1*(z2*x3 - x2*z3) + z1*(x2*y3 - y2*x3)
        const vTet6 = x1 * (y2 * z3 - z2 * y3) +
                      y1 * (z2 * x3 - x2 * z3) +
                      z1 * (x2 * y3 - y2 * x3);

        signedVolumeSum += vTet6;
    }

    const rawVolumeMm3 = Math.abs(signedVolumeSum / 6.0);

    return {
        trianglesCount: totalTriangles,
        format: 'binary',
        bounds: { minX, maxX, minY, maxY, minZ, maxZ },
        rawVolumeMm3,
    };
}

/**
 * ASCII STL parser with regular expression token stream.
 */
function parseAsciiSTL(buffer) {
    const text = new TextDecoder('utf-8').decode(buffer);
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    let signedVolumeSum = 0.0;
    let trianglesCount = 0;

    // Pattern matching 3 vertices per facet
    const vertexRegex = /vertex\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)\s+([+-]?\d*(?:\.\d+)?(?:[eE][+-]?\d+)?)/gi;

    let match;
    let currentFacet = [];

    while ((match = vertexRegex.exec(text)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        const z = parseFloat(match[3]);

        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

        currentFacet.push({ x, y, z });

        if (currentFacet.length === 3) {
            const [v1, v2, v3] = currentFacet;
            const vTet6 = v1.x * (v2.y * v3.z - v2.z * v3.y) +
                          v1.y * (v2.z * v3.x - v2.x * v3.z) +
                          v1.z * (v2.x * v3.y - v2.y * v3.x);

            signedVolumeSum += vTet6;
            trianglesCount++;
            currentFacet = [];
        }
    }

    const rawVolumeMm3 = Math.abs(signedVolumeSum / 6.0);

    return {
        trianglesCount,
        format: 'ascii',
        bounds: { minX, maxX, minY, maxY, minZ, maxZ },
        rawVolumeMm3,
    };
}

function round(val, dec = 2) {
    const factor = Math.pow(10, dec);
    return Math.round(val * factor) / factor;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default analyzeSTL;
