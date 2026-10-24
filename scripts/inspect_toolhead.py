import json
import struct
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('bambu_a1_mini_standard.glb', 'rb') as f:
    f.read(12)
    clen, _ = struct.unpack('<II', f.read(8))
    d = json.loads(f.read(clen))

nodes = d.get('nodes', [])
meshes = d.get('meshes', [])
accessors = d.get('accessors', [])

print("--- TOOLHEAD NODES & BOUNDING BOXES ---")
def inspect_subtree(idx, depth=0):
    n = nodes[idx]
    name = n.get('name', 'unnamed')
    mesh_idx = n.get('mesh')
    bbox_str = ""
    if mesh_idx is not None and mesh_idx < len(meshes):
        mesh = meshes[mesh_idx]
        for p in mesh.get('primitives', []):
            pos_acc = accessors[p['attributes']['POSITION']]
            bbox_str += f" min={pos_acc.get('min')} max={pos_acc.get('max')}"
    print(f"{'  '*depth}[{idx}] '{name}'{bbox_str}")
    for c in n.get('children', []):
        inspect_subtree(c, depth+1)

inspect_subtree(4, 0)
