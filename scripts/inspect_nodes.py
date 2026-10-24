import json
import struct

with open('bambu_a1_mini_standard.glb', 'rb') as f:
    f.read(12)
    clen, _ = struct.unpack('<II', f.read(8))
    d = json.loads(f.read(clen))

nodes = d.get('nodes', [])
meshes = d.get('meshes', [])
materials = d.get('materials', [])

print(f"Total nodes: {len(nodes)}, Total meshes: {len(meshes)}, Total materials: {len(materials)}")

for i, n in enumerate(nodes):
    name = n.get('name', '')
    if any(k in name for k in ['Toolhead', 'Nozzle', 'Motor', 'Arm', 'Rail', 'Bar', 'Beam', 'Axis', 'X_', 'Heatbed', 'Gantry', 'Extrusion', 'Guide']):
        mesh_idx = n.get('mesh')
        mat_names = []
        if mesh_idx is not None and mesh_idx < len(meshes):
            mesh = meshes[mesh_idx]
            for p in mesh.get('primitives', []):
                mat_idx = p.get('material')
                if mat_idx is not None and mat_idx < len(materials):
                    mat_names.append(materials[mat_idx].get('name', f'mat_{mat_idx}'))
        print(f"[{i}] {name} | mesh={mesh_idx} | mats={mat_names} | children={n.get('children', [])}")
