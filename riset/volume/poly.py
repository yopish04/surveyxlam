"""Gabung (union) boundary: ring = list of (e, n, z, desc). Tanpa library.
Cara: potong semua sisi di titik potong, simpan potongan sisi A yang di luar B dan potongan sisi B
yang di luar A (sisi berimpit diambil sekali), lalu sambung potongan menjadi ring."""
import numpy as np
TOL = 1e-6

def _area(r):
    a = 0.0
    for p, q in zip(r, r[1:] + r[:1]): a += p[0] * q[1] - q[0] * p[1]
    return a / 2

def _open(r):
    r = list(r)
    if len(r) > 1 and abs(r[0][0] - r[-1][0]) < 1e-9 and abs(r[0][1] - r[-1][1]) < 1e-9: r = r[:-1]
    return r

def _inside(rings, x, y):
    c = False
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def _on_edge(rings, x, y, tol=1e-4):
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L))
            if (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2 < tol * tol: return (dx, dy)
    return None

def _split(ra, others):
    """Potong tiap sisi ring ra di titik potong dengan semua sisi ring lain -> list of (p, q)."""
    out = []
    n = len(ra)
    for i in range(n):
        p, q = ra[i], ra[(i + 1) % n]
        ts = [0.0, 1.0]
        for rb in others:
            m = len(rb)
            for j in range(m):
                a, b = rb[j], rb[(j + 1) % m]
                d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0])
                if abs(d) < 1e-12: continue
                t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d
                u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d
                if TOL < t < 1 - TOL and -TOL <= u <= 1 + TOL: ts.append(t)
        ts = sorted(set(ts)); pts = []
        for t in ts:
            if t == 0: pts.append(p)
            elif t == 1: pts.append(q)
            else:
                pts.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]),
                            p[2] + t * (q[2] - p[2]), p[3]))
        out += list(zip(pts, pts[1:]))
    return out

def union(A, B):
    """A, B: list of rings (tiap ring list of (e, n, z, desc)). -> list of rings hasil gabung (CCW)."""
    A = [r if _area(r) > 0 else r[::-1] for r in map(_open, A)]
    B = [r if _area(r) > 0 else r[::-1] for r in map(_open, B)]
    pieces = []
    for src, oth, keep_on in ((A, B, True), (B, A, False)):
        for p, q in _split_all(src, oth):
            mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            on = _on_edge(oth, mx, my)
            if on is not None:
                same = on[0] * (q[0] - p[0]) + on[1] * (q[1] - p[1]) > 0
                if keep_on and same: pieces.append((p, q))
                continue
            if not _inside(oth, mx, my): pieces.append((p, q))
    # sambung potongan: dari ujung ke awal berikutnya
    k = lambda p: (round(p[0], 4), round(p[1], 4))
    nxt = {}
    for p, q in pieces: nxt.setdefault(k(p), []).append((p, q))
    rings, used = [], set()
    for start in pieces:
        if id(start) in used: continue
        ring = []; cur = start
        while cur and id(cur) not in used:
            used.add(id(cur)); ring.append(cur[0])
            cand = [c for c in nxt.get(k(cur[1]), []) if id(c) not in used]
            cur = cand[0] if cand else None
        if len(ring) >= 3: rings.append(ring)
    return rings

def _split_all(src, oth):
    out = []
    for r in src: out += _split(r, oth + [o for o in src if o is not r])
    return out
