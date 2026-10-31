"""Data mentah sintetis untuk menguji TXT ke STR (semua aturan raw2str terpicu)."""
import math, random, sys, os
out = sys.argv[1]; seed = int(sys.argv[2]); random.seed(seed)
os.makedirs(out, exist_ok=True)
N0, E0 = 9650000.0 + seed * 1000, 350000.0 + seed * 1000
J = lambda s=0.15: random.uniform(-s, s)
def bench(n0, e0, length, step, z, ang, wav=0.0):
    pts = []
    for i in range(int(length / step) + 1):
        t = i * step
        pts.append((n0 + t * math.sin(ang) + J() + wav * math.sin(t / 9), e0 + t * math.cos(ang) + J(), z + J(0.1)))
    return pts
k = [0]
def nm(): k[0] += 1; return f'P{k[0]}'
def fmtA(rows): return 'Name\tNorthing\tEasting\tElevation\tCode\n' + ''.join(f'{r[0]}\t{r[1]:.3f}\t{r[2]:.3f}\t{r[3]:.3f}\t{r[4]}\n' for r in rows)
def fmtB(rows): return ''.join(f'{r[4]} {r[1]:.3f} {r[2]:.3f} {r[3]:.3f} {r[0]} 1.800 FIXED\n' for r in rows)
a = random.uniform(0, 0.6)
# ---------- area pit (dua area terpisah) ----------
rows = []
for area, (dn, de) in enumerate([(0, 0), (40, 260)]):
    for b in range(3):
        z = 100 - b * 5
        crest = bench(N0 + dn + b * 12, E0 + de, 120, 6, z, a, wav=2)
        toe = bench(N0 + dn + b * 12 + 4, E0 + de + 1, 120, 6, z - 5, a, wav=2)
        rows.append((nm(), *crest[0], '23'))
        rows += [(nm(), *p, '2') for p in crest[1:-1]]
        rows.append((nm(), *crest[-1], '23'))
        rows += [(nm(), *p, '3') for p in reversed(toe)]
        # spot di lantai
        for i in range(25):
            t = random.uniform(5, 110); s = random.uniform(5.5, 11)
            rows.append((nm(), N0 + dn + b * 12 + s + J(), E0 + de + t + J(), z - 5.2 + J(0.2), random.choice(['500', '500', '602'])))
    rows.append((nm(), N0 + dn + 9, E0 + de + 50, 120.0, '500'))          # tinggi mencurigakan
    rows.append((nm(), N0 + dn + 1, E0 + de + 30, 99.0, ''))             # tanpa kode
r0 = rows[10]; rows.append(('DBL', r0[1] + 0.01, r0[2] + 0.02, r0[3] + 0.01, r0[4]))   # titik double
# zig-zag: dua garis rapat ditembak bergantian
zz = []
for i in range(12):
    side = 1.2 if i % 2 else -1.2
    zz.append((nm(), N0 + 70 + side, E0 + 20 + i * 4 + J(0.05), 80 + J(0.05), '2'))
rows += zz
# garis bersilangan: toe pendek memotong crest
rows += [(nm(), N0 + 2 + j * 3, E0 + 60 + J(0.05), 94 + J(0.1), '3') for j in range(4)]
# jalan kode 7: penampang 5 titik
for s in range(8):
    for l in range(5):
        rows.append((nm(), N0 - 30 + l * 2.5 + J(0.1), E0 + s * 10 + J(0.1), 105 + J(0.1), '7'))
# unit exca DS
rows.append(('X1', N0 - 10, E0 + 5, 101, 'EX01')); rows.append(('X2', N0 - 10, E0 + 7.5, 101, 'EX01'))
rows.append(('X3', N0 - 12, E0 + 15, 101, 'EXA_02'))
open(f'{out}/26102026_PIT_TF3.txt', 'w').write(fmtA(rows))
# crest diukur dua kali (file kedua, area sama)
rows2 = [(nm(), p[0] + 0.3, p[1] + 0.2, p[2], '2') for p in bench(N0, E0, 60, 5, 100, a, wav=2)]
rows2 += [(nm(), N0 + 30 + J(), E0 + 40 + i * 5, 92, '500') for i in range(10)]
open(f'{out}/26-10-2026-PIT-TOFU-03_DS.txt', 'w').write(fmtA(rows2))
# ---------- base / waste ----------
rows = []
crest = bench(N0 + 500, E0, 90, 5, 120, a); toe = bench(N0 + 506, E0, 90, 5, 116, a)
rows += [(nm(), *p, '2') for p in crest] + [(nm(), *p, '3') for p in toe]
rows += [(nm(), N0 + 503 + J(2), E0 + random.uniform(0, 90), 118 + J(), '500') for _ in range(40)]
open(f'{out}/26102026_WASTE_TF9.txt', 'w').write(fmtA(rows))
# ---------- format B (hampar: kode tetap) ----------
rows = []
crest = bench(N0 + 900, E0 + 100, 80, 5, 130, a); toe = bench(N0 + 905, E0 + 100, 80, 5, 127, a)
rows += [(nm(), *p, '2') for p in crest] + [(nm(), *p, '3') for p in toe]
rows += [(nm(), N0 + 902 + J(2), E0 + 100 + random.uniform(0, 80), 128 + J(), '800') for _ in range(30)]
open(f'{out}/20261026_progres_hampar_limonit_090428.txt', 'w').write(fmtB(rows))
# ---------- exca malam (tanggal lebih lama) ----------
open(f'{out}/25102026_REC_EXA_NS_112346.txt', 'w').write(fmtA([('N1', N0 - 50, E0, 100, 'EX05'), ('N2', N0 - 51, E0 + 3, 100, 'EX05'), ('N3', N0 - 60, E0 + 10, 100, 'EXC_TF3')]))
