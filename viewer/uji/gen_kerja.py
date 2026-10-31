"""Folder kerja uji Proses Harian: global lama 25 Okt, boundary lama, base pra-tambang untuk area pit_tofu3."""
import math, sys
k = sys.argv[1]
AX = '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000'
def write(path, head, strings):
    L = [head, AX]
    for sn, pts in strings:
        for (n, e, z, d) in pts: L.append(f'{sn}, {n:.3f}, {e:.3f}, {z:.3f}, {d}')
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    open(path, 'w', newline='').write('\r\n'.join(L) + '\r\n')
N0, E0 = 9651000.0, 351000.0
def grid(zf):
    return [(N0 - 20 + j * 5, E0 - 20 + i * 5, zf(i, j), '') for i in range(85) for j in range(29)]
glob = grid(lambda i, j: 101 + 0.01 * i - 0.02 * j + 0.5 * math.sin(i / 7))
crest = [(N0 + 60, E0 - 20 + i * 5, 101.5, '') for i in range(85)]
write(f'{k}/2026_10_25_update_topo_pit_tofu3.str', '2026_10_25_update_topo_pit_tofu3,25-Oct-26,0,0', [(5, crest), (600, glob)])
ring = [(N0 - 10, E0 - 10, 101, ''), (N0 - 10, E0 + 60, 101, ''), (N0 + 30, E0 + 60, 101, ''), (N0 + 30, E0 - 10, 101, ''), (N0 - 10, E0 - 10, 101, '')]
write(f'{k}/2026_10_25_update_topo_pit_tofu3_bdy.str', '2026_10_25_update_topo_pit_tofu3_bdy,25-Oct-26,0,0', [(1, ring)])
write(f'{k}/base_pit_tofu3.str', 'base_pit_tofu3,01-Jan-26,0,0', [(600, grid(lambda i, j: 112 + 0.01 * i))])
