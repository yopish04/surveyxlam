"""Data uji sintetis: topo 26/27 Okt (grid 5 m, galian 3 m di tengah), boundary, data harian. pakai: gen_topo.py <folder> (butuh <folder>/D/yopi dan <folder>/Z/SMA)."""
import math, sys, os
root = sys.argv[1]
def write(path, name, strings, date='27-Oct-26'):
    L = [f"{name},{date},0,0", "0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000"]
    for sn, pts in strings:
        for (y, x, z, d) in pts: L.append(f"{sn}, {y:.3f}, {x:.3f}, {z:.3f}, {d}")
        L.append("0, 0.000, 0.000, 0.000,")
    L.append("0, 0.000, 0.000, 0.000, END")
    open(path, 'w', newline='').write('\r\n'.join(L) + '\r\n')
X0, Y0 = 350000.0, 9650000.0
def topo(dig):
    pts = []
    for i in range(41):
        for j in range(41):
            x, y = X0 + i * 5, Y0 + j * 5
            z = 100 + 0.02 * i * 5 - 0.01 * j * 5 + 2 * math.sin(i / 6) * math.cos(j / 7)
            if dig and 60 <= i * 5 <= 140 and 60 <= j * 5 <= 140: z -= 3.0
            pts.append((y, x, z, ''))
    bdy = [(Y0, X0, 100, ''), (Y0, X0 + 200, 100, ''), (Y0 + 200, X0 + 200, 100, ''), (Y0 + 200, X0, 100, ''), (Y0, X0, 100, '')]
    return [(1, bdy), (500, pts)]
write(f"{root}/D/yopi/2026_10_26_update_topo.str", "topo", topo(False), '26-Oct-26')
write(f"{root}/D/yopi/2026_10_27_update_topo.str", "topo", topo(True))
sq = lambda a, b, z: [(Y0 + a, X0 + a, z, ''), (Y0 + a, X0 + b, z, ''), (Y0 + b, X0 + b, z, ''), (Y0 + b, X0 + a, z, ''), (Y0 + a, X0 + a, z, '')]
write(f"{root}/D/yopi/boundary_pit.str", "bdy", [(1, sq(50, 150, 100))])
# data harian: boundary pengukuran + titik
h = [(Y0 + 60 + k * 10, X0 + 60 + m * 10, 96.5, '') for k in range(9) for m in range(9)]
write(f"{root}/D/yopi/271026_pit_tofu9.str", "harian", [(1, sq(60, 140, 97)), (500, h)])
write(f"{root}/Z/SMA/server_topo.str", "srv", topo(False))
print(os.listdir(f"{root}/D/yopi"))
