"""Buat TIN dari .str seperti Surpac CREATE DTM: semua titik dipakai, segmen >= 2 titik = breakline.
Tanpa library CDT: breakline dipaksa dengan menyisip titik bantu di tengah sisi yang belum muncul
di Delaunay (conforming Delaunay), z bantu = interpolasi linear sepanjang garis."""
import numpy as np
from scipy.spatial import Delaunay

def build_tin(segs, skip=(1,), spot=(500, 600, 602), max_iter=30, min_len=0.05):
    pts = {}; lines = []
    def pid(e, n, z):
        k = (round(e, 3), round(n, 3))
        if k not in pts: pts[k] = (len(pts), z)
        return pts[k][0]
    for s in segs:
        if s[0][0] in skip: continue
        ids = [pid(r[2], r[1], r[3]) for r in s]
        if s[0][0] in spot: continue          # string spot height: titik saja, bukan breakline
        for a, b in zip(ids, ids[1:]):
            if a != b: lines.append((a, b))
    P = np.zeros((len(pts), 3))
    for (e, n), (i, z) in pts.items(): P[i] = (e, n, z)
    P = list(map(tuple, P)); lines = set(tuple(sorted(l)) for l in lines)
    for it in range(max_iter):
        A = np.array(P); D = Delaunay(A[:, :2])
        E = set()
        for t in D.simplices:
            for i in range(3):
                a, b = t[i], t[(i + 1) % 3]; E.add((min(a, b), max(a, b)))
        miss = [l for l in lines if l not in E]
        if not miss: break
        new = set()
        for a, b in miss:
            pa, pb = np.array(P[a]), np.array(P[b])
            if np.hypot(*(pa[:2] - pb[:2])) < min_len: new.add((a, b)); continue
            m = len(P); P.append(tuple((pa + pb) / 2))
            new.add((min(a, m), max(a, m))); new.add((min(b, m), max(b, m)))
        lines = (lines - set(miss)) | new
    miss = locals().get('miss', [])
    A = np.array(P)
    return A, Delaunay(A[:, :2]).simplices, len(miss), it


def build_tin_cdt(segs, skip=(1,), spot=(500, 600, 602)):
    """Seperti build_tin tetapi constrained Delaunay murni (tanpa titik bantu).
    -> P (N,3), T (M,3), jumlah breakline dilewati, peta indeks: (no segmen, no titik) -> indeks P."""
    from cdt import cdt
    pts = {}; lines = []; where = {}
    for si, s in enumerate(segs):
        if s[0][0] in skip: continue
        ids = []
        for pi, r in enumerate(s):
            k = (round(r[2], 3), round(r[1], 3))
            if k not in pts: pts[k] = (len(pts), r[3])
            ids.append(pts[k][0]); where[(si, pi)] = pts[k][0]
        if s[0][0] in spot: continue
        lines += [(a, b) for a, b in zip(ids, ids[1:]) if a != b]
    P = np.zeros((len(pts), 3))
    for (e, n), (i, z) in pts.items(): P[i] = (e, n, z)
    T, skipped = cdt(P[:, :2], lines, tol=tol, sisa=sisa)
    return P, T, len(skipped), where


def build_tin_cdt2(segs, skip=(1,), spot=(500, 600, 602), tol=0.0, sisa=True):
    """Sama dengan build_tin_cdt, memakai cdt2 (cepat untuk data besar)."""
    from cdt2 import cdt
    pts = {}; lines = []; where = {}
    for si, s in enumerate(segs):
        if s[0][0] in skip: continue
        ids = []
        for pi, r in enumerate(s):
            k = (round(r[2], 3), round(r[1], 3))
            if k not in pts: pts[k] = (len(pts), r[3])
            ids.append(pts[k][0]); where[(si, pi)] = pts[k][0]
        if s[0][0] in spot: continue
        lines += [(a, b) for a, b in zip(ids, ids[1:]) if a != b]
    P = np.zeros((len(pts), 3))
    for (e, n), (i, z) in pts.items(): P[i] = (e, n, z)
    T, skipped = cdt(P[:, :2], lines, tol=tol, sisa=sisa)
    return P, T, len(skipped), where
