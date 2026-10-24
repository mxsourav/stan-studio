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
materials = d.get('materials', [])

target_names = [
    'RailMain', 'Rail', 'End', 'Wiper', 'CableTrans', 'CableSOlid',
    'Part_Cooling_Fan', 'FanBlock', 'Front_Cover', 'MidSection', 'MainFrame',
    'Z_Rail', 'MotorBody', 'Motor_2'
]

for i, n in enumerate(nodes):
    name = n.get('name', '')
    if any(tn in name for tn in target_names):
        mesh_idx = n.get('mesh')
        mat_info = []
        if mesh_idx is not None:
            for p in meshes[mesh_idx].get('primitives', []):
                m_idx = p.get('material')
                if m_idx is not None:
                    mat_info.append((m_idx, materials[m_idx].get('name')))
        print(f"[{i}] {name} | mesh={mesh_idx} | mats={mat_info}")
