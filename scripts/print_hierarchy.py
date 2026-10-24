import json
import struct
import sys

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

with open('bambu_a1_mini_standard.glb', 'rb') as f:
    f.read(12)
    clen, _ = struct.unpack('<II', f.read(8))
    d = json.loads(f.read(clen))

nodes = d.get('nodes', [])
meshes = d.get('meshes', [])
materials = d.get('materials', [])

print(f"Total nodes: {len(nodes)}, Total meshes: {len(meshes)}, Total materials: {len(materials)}")
for i, m in enumerate(materials):
    pbr = m.get('pbrMetallicRoughness', {})
    col = pbr.get('baseColorFactor', [1,1,1,1])
    metal = pbr.get('metallicFactor', 0)
    rough = pbr.get('roughnessFactor', 1)
    print(f"Material [{i}] '{m.get('name')}': baseColor={col}, metallic={metal}, roughness={rough}")

print("\n--- NODES TREE ROOT ---")
scenes = d.get('scenes', [])
root_nodes = scenes[0].get('nodes', []) if scenes else []

def print_node(idx, depth=0):
    if idx >= len(nodes): return
    n = nodes[idx]
    name = n.get('name', 'unnamed')
    mesh_idx = n.get('mesh')
    mats = []
    if mesh_idx is not None and mesh_idx < len(meshes):
        for p in meshes[mesh_idx].get('primitives', []):
            midx = p.get('material')
            if midx is not None:
                mats.append(f"{midx}:{materials[midx].get('name')}")
    children = n.get('children', [])
    trans = n.get('translation')
    t_str = f" pos={trans}" if trans else ""
    m_str = f" mesh={mesh_idx} mats={mats}" if mesh_idx is not None else ""
    print(f"{'  '*depth}[{idx}] '{name}'{t_str}{m_str}")
    for c in children:
        print_node(c, depth+1)

for r in root_nodes:
    print_node(r, 0)
