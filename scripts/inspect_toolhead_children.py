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

# Check all direct children of Toolhead_2 (node 6)
toolhead_2 = nodes[6]
children_indices = toolhead_2.get('children', [])

print(f"Toolhead_2 children count: {len(children_indices)}")
for c_idx in children_indices:
    c = nodes[c_idx]
    c_name = c.get('name')
    mesh_idx = c.get('mesh')
    sub_children = c.get('children', [])
    print(f"Child [{c_idx}] '{c_name}': mesh={mesh_idx}, sub_children={[nodes[sc].get('name') for sc in sub_children]}")
