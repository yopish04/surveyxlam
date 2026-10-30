"""Constrained Delaunay cepat untuk data besar (Tofu 9: ~880 ribu titik, ~240 ribu ruas breakline).

Aturan sama dengan cdt.py (yang identik dengan TIN Surpac di LD03):
  - Delaunay biasa, lalu tiap breakline yang belum jadi sisi dipaksa dengan tukar diagonal (Sloan 1993);
  - breakline yang memotong breakline lain yang sudah terpasang dilewati (yang lebih dulu menang);
  - breakline yang melewati titik lain dipecah di titik itu;
  - sisi baru dikembalikan ke Delaunay kecuali breakline.
Bedanya: sisi yang terpotong dicari dengan berjalan dari segitiga ke segitiga (bukan memeriksa semua sisi),
sehingga waktu per breakline hanya sebanding panjangnya.
"""
import numpy as np
from scipy.spatial import Delaunay


def _o(X, a, b, c):
    return (X[b, 0] - X[a, 0]) * (X[c, 1] - X[a, 1]) - (X[b, 1] - X[a, 1]) * (X[c, 0] - X[a, 0])


class Mesh:
    def __init__(self, X, T):
        self.X = X
        self.tri = {}
        self.edge = {}               # (u, v) berarah CCW -> id segitiga
        self.vt = {}                 # titik -> salah satu segitiga yang memuatnya
        self.nid = 0
        for t in T:
            a, b, c = int(t[0]), int(t[1]), int(t[2])
            if _o(X, a, b, c) < 0: b, c = c, b
            self.add(a, b, c)

    def add(self, a, b, c):
        i = self.nid; self.nid += 1
        self.tri[i] = (a, b, c)
        self.edge[(a, b)] = i; self.edge[(b, c)] = i; self.edge[(c, a)] = i
        self.vt[a] = i; self.vt[b] = i; self.vt[c] = i
        return i

    def remove(self, i):
        a, b, c = self.tri.pop(i)
        for e in ((a, b), (b, c), (c, a)):
            if self.edge.get(e) == i: del self.edge[e]

    def has(self, u, v): return (u, v) in self.edge or (v, u) in self.edge

    def opp(self, u, v):
        i = self.edge.get((u, v))
        if i is None: return None
        a, b, c = self.tri[i]
        return c if (a, b) == (u, v) else a if (b, c) == (u, v) else b

    def around(self, a):
        """Segitiga di sekitar titik a: daftar (p, q) dengan segitiga (a, p, q) CCW."""
        i = self.vt.get(a)
        if i is None or i not in self.tri: return []      # titik tidak ikut triangulasi (dobel)
        out = []
        start = i
        # putar ke satu arah
        cur = i
        while True:
            a0, b0, c0 = self.tri[cur]
            if a0 == a: p, q = b0, c0
            elif b0 == a: p, q = c0, a0
            else: p, q = a0, b0
            out.append((p, q))
            nxt = self.edge.get((a, q))            # segitiga berikut berbagi sisi a-q
            # segitiga dengan sisi (q, a) adalah tetangga di seberang a-q pada segitiga sekarang (a,p,q): sisi q->a
            nxt = self.edge.get((a, q))
            if nxt is None or nxt == start: break
            cur = nxt
            if len(out) > 10000: break
        if nxt is None:                              # batas hull: putar ke arah lain
            cur = start
            while True:
                a0, b0, c0 = self.tri[cur]
                if a0 == a: p, q = b0, c0
                elif b0 == a: p, q = c0, a0
                else: p, q = a0, b0
                prv = self.edge.get((p, a))
                if prv is None: break
                cur = prv
                a0, b0, c0 = self.tri[cur]
                if a0 == a: pp, qq = b0, c0
                elif b0 == a: pp, qq = c0, a0
                else: pp, qq = a0, b0
                out.append((pp, qq))
                if len(out) > 10000: break
        return out

    def flip(self, u, v):
        p = self.opp(u, v); q = self.opp(v, u)
        if p is None or q is None: return None
        X = self.X
        if not (_o(X, p, q, u) * _o(X, p, q, v) < 0): return None
        self.remove(self.edge[(u, v)]); self.remove(self.edge[(v, u)])
        if _o(X, p, q, v) > 0: self.add(p, q, v)
        else: self.add(q, p, v)
        if _o(X, q, p, u) > 0: self.add(q, p, u)
        else: self.add(p, q, u)
        return p, q


def _incircle(X, a, b, c, d):
    ax, ay = X[a, 0] - X[d, 0], X[a, 1] - X[d, 1]
    bx, by = X[b, 0] - X[d, 0], X[b, 1] - X[d, 1]
    cx, cy = X[c, 0] - X[d, 0], X[c, 1] - X[d, 1]
    det = ((ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay)
           + (cx * cx + cy * cy) * (ax * by - bx * ay))
    return det > 1e-9


def _cross(X, a, b, p, q):
    if len({a, b, p, q}) < 4: return False
    return _o(X, a, b, p) * _o(X, a, b, q) < 0 and _o(X, p, q, a) * _o(X, p, q, b) < 0


def _walk(M, a, b, tol=0.0):
    """Sisi yang dipotong ruas a-b, atau ('titik', w) kalau ruas melewati titik w, atau None kalau gagal."""
    X = M.X
    L = np.hypot(*(X[b] - X[a])); eps = max(1e-7 * max(L, 1.0) * max(L, 1.0), tol * L)
    # segitiga awal di sekitar a
    first = None
    for p, q in M.around(a):
        op, oq = _o(X, a, b, p), _o(X, a, b, q)
        if abs(op) <= eps and (X[p] - X[a]) @ (X[b] - X[a]) > 0: return ('titik', p)
        if abs(oq) <= eps and (X[q] - X[a]) @ (X[b] - X[a]) > 0: return ('titik', q)
        if op < 0 < oq: first = (p, q); break
    if first is None: return None
    cross = []
    p, q = first                         # sisi p->q pada segitiga (a,p,q); lanjut ke seberang (q->p)
    for _ in range(100000):
        cross.append((p, q))
        r = M.opp(q, p)
        if r is None: return None
        if r == b: return cross
        orr = _o(X, a, b, r)
        if abs(orr) <= eps: return ('titik', r)
        if orr < 0: p = r                # a-b lewat antara r dan q
        else: q = r
    return None


def cdt(X, constraints, max_flips=20_000_000, tol=0.0, sisa=True):
    X = np.asarray(X, float)
    X = X - X.min(axis=0)               # titik asal lokal: koordinat UTM besar membuat qhull/orientasi kurang presisi
    M = Mesh(X, Delaunay(X).simplices)
    fixed, skipped = set(), []
    work = list(reversed(constraints))   # tumpukan; pop() dari belakang = urutan asal
    flips = 0
    while work:
        a, b = work.pop()
        if a == b: continue
        key = (min(a, b), max(a, b))
        if M.has(a, b): fixed.add(key); continue
        w = _walk(M, a, b, tol)
        if w is None: skipped.append((a, b)); continue
        if isinstance(w, tuple) and w and w[0] == 'titik':
            mid = w[1]
            if sisa or tol == 0: work.append((mid, b))
            work.append((a, mid)); continue
        cross = w
        if any((min(e), max(e)) in fixed for e in cross):
            skipped.append((a, b)); continue
        queue = list(cross); new = []; guard = 0
        while queue:
            u, v = queue.pop(0); guard += 1
            if guard > 50 * (len(cross) + 5): break
            if not M.has(u, v): continue
            if (u, v) not in M.edge: u, v = v, u
            r = M.flip(u, v)
            if r is None: queue.append((u, v)); continue
            flips += 1
            p, q = r
            if {p, q} == {a, b}: continue
            if _cross(X, a, b, p, q): queue.append((p, q))
            else: new.append((p, q))
        if not M.has(a, b): skipped.append((a, b)); continue
        fixed.add(key)
        changed = True; it = 0
        while changed and it < 20:
            changed = False; it += 1
            for p, q in list(new):
                if (min(p, q), max(p, q)) in fixed or not M.has(p, q): continue
                if (p, q) not in M.edge: p, q = q, p
                o1 = M.opp(p, q); o2 = M.opp(q, p)
                if o1 is None or o2 is None: continue
                if _incircle(X, p, q, o1, o2):
                    r = M.flip(p, q)
                    if r:
                        if (p, q) in new: new.remove((p, q))
                        new.append(r); changed = True
        if flips > max_flips: break
    T = np.array(list(M.tri.values()))
    return T, skipped
