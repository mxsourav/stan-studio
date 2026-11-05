/**
 * 3D Forge — local GLB → binary STL conversion (the quota-preserving
 * fallback, approved refinement 1): if the space's cloud export
 * (/on_export_click) fails or times out, the cached mesh blob — never the
 * user's spent ZeroGPU budget — is converted here in the browser.
 *
 * three's STLExporter wants Scene/Mesh objects; we load the GLB, flatten the
 * scene graph into ONE indexed geometry (welded vertices → watertight-ish),
 * then export binary STL ready for the slicer.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';

export interface LocalExportResult {
  stl: Blob;
  triangles: number;
}

export function glbBlobToStl(blob: Blob, signal?: AbortSignal): Promise<LocalExportResult> {
  return new Promise<LocalExportResult>((resolve, reject) => {
    const loader = new GLTFLoader();
    blob
      .arrayBuffer()
      .then((buffer) => {
        if (signal?.aborted) return reject(new Error('aborted'));
        loader.parse(
          buffer,
          '',
          (gltf) => {
            try {
              const geos: THREE.BufferGeometry[] = [];
              gltf.scene.updateMatrixWorld(true);
              gltf.scene.traverse((obj) => {
                const mesh = obj as THREE.Mesh;
                if (!mesh.isMesh || !mesh.geometry) return;
                let geo = mesh.geometry.clone();
                if (geo.index) geo = geo.toNonIndexed();
                mesh.updateMatrixWorld(true);
                geo.applyMatrix4(mesh.matrixWorld);
                // drop attributes STL doesn't need — mergeVertices requires
                // consistent attributes across geometries
                for (const name of Object.keys(geo.attributes)) {
                  if (name !== 'position') geo.deleteAttribute(name);
                }
                const welded = BufferGeometryUtils.mergeVertices(geo, 1e-4);
                welded.computeVertexNormals();
                geos.push(welded);
              });
              if (geos.length === 0) return reject(new Error('no mesh found in GLB'));
              const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
              if (!merged || merged.getAttribute('position').count === 0) {
                return reject(new Error('empty merged mesh'));
              }
              const scene = new THREE.Scene();
              const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial());
              scene.add(mesh);
              const exporter = new STLExporter();
              const result = exporter.parse(scene, { binary: true }) as DataView;
              const stl = new Blob([result.buffer as ArrayBuffer], { type: 'model/stl' });
              resolve({ stl, triangles: merged.index ? merged.index.count / 3 : merged.getAttribute('position').count / 3 });
            } catch (err) {
              reject(err instanceof Error ? err : new Error('STL conversion failed'));
            }
          },
          (err) => reject(new Error(`GLB parse failed: ${String(err)}`)),
        );
      })
      .catch((err) => reject(err instanceof Error ? err : new Error('blob read failed')));
  });
}
