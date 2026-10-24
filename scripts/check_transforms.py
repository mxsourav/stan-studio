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

for name in ['Toolhead', 'Motor', 'Heatbed_2', 'Rail', 'MotorBody', 'PEI_Plate']:
    for idx, n in enumerate(nodes):
        if n.get('name') == name:
            trans = n.get('translation')
            rot = n.get('rotation')
            scale = n.get('scale')
            print(f"Node [{idx}] '{name}': pos={trans}, rot={rot}, scale={scale}")
            # check mesh bbox if any
            if n.get('mesh') is not None:
                m = meshes[n['mesh']]
                for p in m.get('primitives', []):
                    acc = accessors[p['attributes']['POSITION']]
                    print(f"   mesh bbox: min={acc.get('min')} max={acc.get('max')}")
