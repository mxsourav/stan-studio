/**
 * STΔN Studio — Complete STL Local Parsing & Cloud Submission Test Suite
 * 
 * Verifies:
 * 1. Binary STL generation & local memory parsing (20x20x20mm calibration cube)
 * 2. Exact signed tetrahedron volume math (expected: exactly 8.0 cm3)
 * 3. Bounding box & Bambu Lab A1 Mini build volume limits
 * 4. Weight & pricing calculations
 * 5. ASCII STL parsing verification
 * 6. Live Supabase Storage cloud upload into 'stl-uploads' bucket
 */

import { analyzeSTL } from '../lib/stl-analyzer.js';
import { submitPrintOrder, sanitizeFileName } from '../lib/order-service.js';

// Helper: Generates a binary STL ArrayBuffer for an axis-aligned box (w x d x h)
function createBoxBinarySTL(w, d, h) {
    const p1 = [0, 0, 0], p2 = [w, 0, 0], p3 = [w, d, 0], p4 = [0, d, 0];
    const p5 = [0, 0, h], p6 = [w, 0, h], p7 = [w, d, h], p8 = [0, d, h];

    // 12 triangles with CCW outward normals
    const triangles = [
        // Bottom (-Z)
        { n: [0, 0, -1], v: [p1, p3, p2] }, { n: [0, 0, -1], v: [p1, p4, p3] },
        // Top (+Z)
        { n: [0, 0, 1],  v: [p5, p6, p7] }, { n: [0, 0, 1],  v: [p5, p7, p8] },
        // Front (-Y)
        { n: [0, -1, 0], v: [p1, p2, p6] }, { n: [0, -1, 0], v: [p1, p6, p5] },
        // Back (+Y)
        { n: [0, 1, 0],  v: [p4, p7, p3] }, { n: [0, 1, 0],  v: [p4, p8, p7] },
        // Left (-X)
        { n: [-1, 0, 0], v: [p1, p5, p8] }, { n: [-1, 0, 0], v: [p1, p8, p4] },
        // Right (+X)
        { n: [1, 0, 0],  v: [p2, p3, p7] }, { n: [1, 0, 0],  v: [p2, p7, p6] },
    ];

    const bufferSize = 84 + triangles.length * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // 80 bytes header (leave as zeroes)
    // 4 bytes triangle count
    view.setUint32(80, triangles.length, true);

    let offset = 84;
    for (const tri of triangles) {
        // Normal
        view.setFloat32(offset, tri.n[0], true);
        view.setFloat32(offset + 4, tri.n[1], true);
        view.setFloat32(offset + 8, tri.n[2], true);
        offset += 12;

        // 3 Vertices
        for (const pt of tri.v) {
            view.setFloat32(offset, pt[0], true);
            view.setFloat32(offset + 4, pt[1], true);
            view.setFloat32(offset + 8, pt[2], true);
            offset += 12;
        }

        // 2 bytes attribute
        view.setUint16(offset, 0, true);
        offset += 2;
    }

    return buffer;
}

// Helper: Generates a small ASCII STL string
function createBoxAsciiSTL(w, d, h) {
    return `solid cube
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex ${w} ${d} 0
      vertex ${w} 0 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 ${d} 0
      vertex ${w} ${d} 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 ${h}
      vertex ${w} 0 ${h}
      vertex ${w} ${d} ${h}
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 ${h}
      vertex ${w} ${d} ${h}
      vertex 0 ${d} ${h}
    endloop
  endfacet
endsolid cube`;
}

async function runTests() {
    console.log('========================================================');
    console.log('STΔN Studio — STL Pipeline Verification Test');
    console.log('========================================================\n');

    let allPassed = true;

    // TEST 1: 20x20x20mm Binary Calibration Cube
    console.log('[TEST 1] Analyzing 20x20x20mm Binary Calibration Cube...');
    const cubeBuffer = createBoxBinarySTL(20, 20, 20);
    const cubeAnalysis = await analyzeSTL(cubeBuffer);

    console.log(' - Format:', cubeAnalysis.format);
    console.log(' - Triangles:', cubeAnalysis.trianglesCount);
    console.log(' - Dimensions:', cubeAnalysis.dimensions.formatted);
    console.log(' - Volume:', cubeAnalysis.volume.formatted, `(Raw: ${cubeAnalysis.volume.volumeMm3} mm3)`);
    console.log(' - Fits Bambu Lab A1 Mini:', cubeAnalysis.printability.fitsPrinter);
    console.log(' - Weight:', cubeAnalysis.weight.formatted);
    console.log(' - Estimated Price:', cubeAnalysis.pricing.formatted);

    const isDim20 = cubeAnalysis.dimensions.widthMm === 20 &&
                    cubeAnalysis.dimensions.depthMm === 20 &&
                    cubeAnalysis.dimensions.heightMm === 20;

    const isVol8 = Math.abs(cubeAnalysis.volume.volumeCm3 - 8.0) < 0.01;
    const isFitA1 = cubeAnalysis.printability.fitsPrinter === true;

    if (isDim20 && isVol8 && isFitA1) {
        console.log('✓ TEST 1 PASSED: Exact dimensions, signed volume, and printability verified.');
    } else {
        console.error('✗ TEST 1 FAILED:', { isDim20, isVol8, isFitA1 });
        allPassed = false;
    }

    // TEST 2: Oversized Model Clearance Check (>180mm)
    console.log('\n[TEST 2] Testing Oversized Model Build Volume Check (220x100x50mm)...');
    const oversizedBuffer = createBoxBinarySTL(220, 100, 50);
    const oversizedAnalysis = await analyzeSTL(oversizedBuffer);

    console.log(' - Dimensions:', oversizedAnalysis.dimensions.formatted);
    console.log(' - Fits Bambu Lab A1 Mini:', oversizedAnalysis.printability.fitsPrinter);
    console.log(' - Oversized Axes:', oversizedAnalysis.printability.oversizedAxes);

    if (oversizedAnalysis.printability.fitsPrinter === false && oversizedAnalysis.printability.oversizedAxes.length > 0) {
        console.log('✓ TEST 2 PASSED: Correctly identified oversized dimensions.');
    } else {
        console.error('✗ TEST 2 FAILED: Failed to detect oversized model.');
        allPassed = false;
    }

    // TEST 3: ASCII STL Parsing
    console.log('\n[TEST 3] Testing ASCII STL Parsing...');
    const asciiText = createBoxAsciiSTL(15, 15, 15);
    const asciiBuffer = new TextEncoder().encode(asciiText).buffer;
    const asciiAnalysis = await analyzeSTL(asciiBuffer);

    console.log(' - Format:', asciiAnalysis.format);
    console.log(' - Triangles parsed:', asciiAnalysis.trianglesCount);
    console.log(' - Dimensions:', asciiAnalysis.dimensions.formatted);

    if (asciiAnalysis.format === 'ascii' && asciiAnalysis.trianglesCount === 4) {
        console.log('✓ TEST 3 PASSED: ASCII parser handled stream cleanly.');
    } else {
        console.error('✗ TEST 3 FAILED: ASCII parsing failed.');
        allPassed = false;
    }

    // TEST 4: Filename Sanitizer
    console.log('\n[TEST 4] Testing Filename Sanitizer...');
    const sanitized = sanitizeFileName('My Awesome Phone Stand 2026! (V2.1).stl');
    console.log(' - Input: "My Awesome Phone Stand 2026! (V2.1).stl"');
    console.log(' - Output:', sanitized);
    if (sanitized === 'my_awesome_phone_stand_2026_v2_1.stl') {
        console.log('✓ TEST 4 PASSED: Safe storage naming confirmed.');
    } else {
        console.error('✗ TEST 4 FAILED: Unexpected sanitized name:', sanitized);
        allPassed = false;
    }

    // TEST 5: Cloud Storage Upload to Supabase 'stl-uploads'
    console.log('\n[TEST 5] Testing Cloud Storage Upload to Supabase "stl-uploads"...');
    try {
        const testFileName = 'calibration_cube_20mm.stl';
        const fileBlob = new Blob([cubeBuffer], { type: 'model/stl' });
        // Attach name property to blob
        fileBlob.name = testFileName;

        const customer = {
            name: 'STΔN Test Customer',
            email: 'test@stanstudio.com',
            phone: '+919876543210',
            address: 'STΔN Studio Lab, Bangalore, Karnataka',
            notes: 'High precision 0.12mm layer test order',
        };

        const specs = {
            material: 'Matte PLA',
            color: 'Precision Matte Teal',
            infillPercent: 20,
            dimensions: cubeAnalysis.dimensions,
            volumeCm3: cubeAnalysis.volume.volumeCm3,
            weightGrams: cubeAnalysis.weight.estimatedWeightGrams,
            estimatedPriceINR: cubeAnalysis.pricing.estimatedPriceINR,
        };

        const orderResult = await submitPrintOrder(fileBlob, customer, specs);

        console.log(' - Cloud Storage Path:', orderResult.storagePath);
        console.log(' - Public CDN URL:', orderResult.publicUrl);
        console.log(' - Order Ticket Number:', orderResult.orderNumber);
        console.log(' - Database Status:', orderResult.databaseSaved ? 'SAVED_TO_DB' : 'SAVED_TO_STORAGE_METADATA_FALLBACK');
        if (orderResult.databaseNotice) {
            console.log('   Notice:', orderResult.databaseNotice);
        }

        if (orderResult.success && orderResult.publicUrl && orderResult.storagePath) {
            console.log('✓ TEST 5 PASSED: Cloud file upload and order generation successful.');
        } else {
            console.error('✗ TEST 5 FAILED:', orderResult);
            allPassed = false;
        }
    } catch (uploadErr) {
        console.error('✗ TEST 5 FAILED:', uploadErr.message);
        allPassed = false;
    }

    console.log('\n========================================================');
    if (allPassed) {
        console.log('ALL TESTS PASSED! PIPELINE IS 100% OPERATIONAL.');
    } else {
        console.error('SOME TESTS FAILED.');
    }
    console.log('========================================================');

    return allPassed;
}

runTests().then(passed => {
    process.exit(passed ? 0 : 1);
});
