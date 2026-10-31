"""Periksa .dtm tulisan aplikasi dengan alat riset (read_dtm, cdt2, dtm_text). pakai: cek_dtm.py <repo> <file.dtm> <file.str>"""
import sys, numpy as np
R, dtm, st = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, R + '/riset/volume')
import strio, tin, update_harian as uh
P, T = strio.read_dtm(dtm, st)
print('read_dtm: segitiga', len(T), '| indeks ke baris pemisah (NaN):', int(np.isnan(P[T].sum(axis=(1, 2))).sum()))
key = lambda P, t: tuple(sorted(tuple(np.round(P[i][:2], 3)) for i in t))
A = {key(P, t) for t in T}
segs = strio.read_str(st)[1]; Q, U, sk, _ = tin.build_tin_cdt2(segs, spot=tuple(range(500, 1000)))
B = {key(Q[:, :3] if Q.shape[1] == 3 else Q, t) for t in U}
print('TIN sama dengan cdt2 (pembanding TIN Surpac):', A == B, f'({len(A)} vs {len(B)})')
# tetangga: tiap tetangga harus berbagi sisi yang sama (terbalik)
L = open(dtm, encoding='latin1', newline='').read().split('\r\n')
i0 = next(i for i, l in enumerate(L) if l.startswith('TRISOLATION')) + 1
rows = [list(map(int, l.split(',')[:7])) for l in L[i0:] if l and l[0].isdigit()]
tri = {r[0]: r[1:4] for r in rows}; bad = 0
for r in rows:
    t = r[1:4]
    for k in range(3):
        nb = r[4 + k]
        if nb and not ({t[k], t[(k + 1) % 3]} <= set(tri[nb])): bad += 1
print('tetangga konsisten:', bad == 0, '| sisi tepi (tetangga 0):', sum(r[4:7].count(0) for r in rows))
# baris segitiga sama dengan dtm_text riset untuk segitiga yang sama
ref = uh.dtm_text('x', None, [r[1:4] for r in rows], []).split('\n')
j0 = next(i for i, l in enumerate(ref) if l.startswith('TRISOLATION'))
print('baris TRISOLATION sama dengan dtm_text riset:', ref[j0:-1] == L[i0 - 1:-1])
# segitiga yang beda: apakah hanya pilihan diagonal di empat titik ko-sirkular (sama sah untuk Delaunay)?
onlyA, onlyB = A - B, B - A
def quads(S):
    from collections import defaultdict
    e = defaultdict(list)
    for t in S:
        for k in range(3): e[tuple(sorted((t[k], t[(k + 1) % 3])))].append(t)
    return e
ea = quads(onlyA)
cocirc = 0
for d, ts in ea.items():
    if len(ts) != 2: continue
    q = sorted(set(ts[0]) | set(ts[1]))
    if len(q) != 4: continue
    M = np.array([[x - q[0][0], y - q[0][1], (x - q[0][0]) ** 2 + (y - q[0][1]) ** 2] for x, y in q[1:]])
    if abs(np.linalg.det(M)) < 1e-6: cocirc += 1
print(f'segitiga beda: {len(onlyA)} (di aplikasi) / {len(onlyB)} (di cdt2); pasangan ko-sirkular (diagonal tukar): {cocirc}, jadi {2 * cocirc} segitiga')
