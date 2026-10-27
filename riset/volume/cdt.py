"""Constrained Delaunay (tanpa titik bantu) dengan cara Sloan (1993): Delaunay biasa, lalu
setiap breakline yang belum jadi sisi dipaksa dengan menukar diagonal (edge flip).
Breakline yang memotong breakline lain yang sudah dipasang dilewati (yang lebih dulu menang),
seperti hasil Surpac pada data uji LD03."""
import numpy as np
from scipy.spatial import Delaunay


def _orient(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _incircle(a, b, c, d):
    m = np.array([[a[0] - d[0], a[1] - d[1], (a[0] - d[0]) ** 2 + (a[1] - d[1]) ** 2],
                  [b[0] - d[0], b[1] - d[1], (b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2],
                  [c[0] - d[0], c[1] - d[1], (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2]])
    return np.linalg.det(m) > 1e-9


class Mesh:
    def __init__(self, XY, T):
        self.X = XY
        self.tri = {}
        self.edge = {}          # (u, v) berarah -> id segitiga (sisi u->v milik segitiga CCW itu)
        self.nid = 0
        for t in T:
            a, b, c = map(int, t)
            if _orient(XY[a], XY[b], XY[c]) < 0: b, c = c, b
            self.add(a, b, c)

    def add(self, a, b, c):
        i = self.nid; self.nid += 1
        self.tri[i] = (a, b, c)
        for u, v in ((a, b), (b, c), (c, a)): self.edge[(u, v)] = i
        return i

    def remove(self, i):
        a, b, c = self.tri.pop(i)
        for u, v in ((a, b), (b, c), (c, a)):
            if self.edge.get((u, v)) == i: del self.edge[(u, v)]

    def opposite(self, u, v):
        i = self.edge.get((u, v))
        if i is None: return None
        t = self.tri[i]
        return [w for w in t if w != u and w != v][0]

    def flip(self, u, v):
        """Tukar diagonal u-v pada segiempat u,p,v,q -> p-q. Return (p, q) atau None kalau tidak cembung."""
        p = self.opposite(u, v); q = self.opposite(v, u)
        if p is None or q is None: return None
        X = self.X
        # segiempat u, q, v, p harus cembung (p dan q di sisi berbeda dari u-v, u dan v di sisi berbeda dari p-q)
        if not (_orient(X[p], X[q], X[u]) * _orient(X[p], X[q], X[v]) < 0): return None
        self.remove(self.edge[(u, v)]); self.remove(self.edge[(v, u)])
        self.add(p, q, v) if _orient(X[p], X[q], X[v]) > 0 else self.add(q, p, v)
        self.add(q, p, u) if _orient(X[q], X[p], X[u]) > 0 else self.add(p, q, u)
        return p, q

    def has(self, u, v): return (u, v) in self.edge or (v, u) in self.edge

    def edges(self):
        return {(min(u, v), max(u, v)) for (u, v) in self.edge}


def _crossing_edges(M, a, b):
    """Sisi mesh yang memotong ruas a-b di bagian dalam; juga titik yang tepat di atas ruas."""
    X = M.X; A, B = X[a], X[b]
    E = np.array(list(M.edges()))
    P, Q = X[E[:, 0]], X[E[:, 1]]
    d1 = (B[0] - A[0]) * (P[:, 1] - A[1]) - (B[1] - A[1]) * (P[:, 0] - A[0])
    d2 = (B[0] - A[0]) * (Q[:, 1] - A[1]) - (B[1] - A[1]) * (Q[:, 0] - A[0])
    d3 = (Q[:, 0] - P[:, 0]) * (A[1] - P[:, 1]) - (Q[:, 1] - P[:, 1]) * (A[0] - P[:, 0])
    d4 = (Q[:, 0] - P[:, 0]) * (B[1] - P[:, 1]) - (Q[:, 1] - P[:, 1]) * (B[0] - P[:, 0])
    L = np.hypot(*(B - A)); eps = 1e-7 * max(L, 1)
    k = (d1 * d2 < 0) & (d3 * d4 < 0) & (np.abs(d1) > eps) & (np.abs(d2) > eps)
    return [tuple(e) for e in E[k]]


def _on_segment(X, a, b, cand):
    A, B = X[a], X[b]; AB = B - A; L2 = AB @ AB
    out = []
    for w in cand:
        if w in (a, b): continue
        d = X[w] - A; t = d @ AB / L2
        if 0 < t < 1 and abs(d[0] * AB[1] - d[1] * AB[0]) / np.sqrt(L2) < 1e-6: out.append((t, w))
    return [w for _, w in sorted(out)]


def cdt(XY, constraints, max_flips=200000):
    """XY: (N,2); constraints: list (a, b) berurutan. -> T (M,3) CCW, daftar breakline yang dilewati."""
    M = Mesh(XY, Delaunay(XY).simplices)
    fixed, skipped = set(), []
    work = list(constraints)
    flips = 0
    while work:
        a, b = work.pop(0)
        if a == b or M.has(a, b):
            fixed.add((min(a, b), max(a, b))); continue
        cross = _crossing_edges(M, a, b)
        # titik di atas ruas -> pecah breakline
        on = _on_segment(XY, a, b, {w for e in cross for w in e} | set(range(0)))
        if on:
            ch = [a] + on + [b]
            work[:0] = list(zip(ch, ch[1:])); continue
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
            if _crossing_edges_pair(XY, a, b, p, q): queue.append((p, q))
            else: new.append((p, q))
        if not M.has(a, b):
            skipped.append((a, b)); continue
        fixed.add((min(a, b), max(a, b)))
        # pulihkan Delaunay untuk sisi baru (kecuali breakline)
        changed = True; it = 0
        while changed and it < 20:
            changed = False; it += 1
            for p, q in list(new):
                if (min(p, q), max(p, q)) in fixed or not M.has(p, q): continue
                if (p, q) not in M.edge: p, q = q, p
                o1 = M.opposite(p, q); o2 = M.opposite(q, p)
                if o1 is None or o2 is None: continue
                if _incircle(XY[p], XY[q], XY[o1], XY[o2]):
                    r = M.flip(p, q)
                    if r: new.remove((p, q)) if (p, q) in new else None; new.append(r); changed = True
        if flips > max_flips: break
    T = np.array(list(M.tri.values()))
    return T, skipped


def _crossing_edges_pair(X, a, b, p, q):
    A, B, P, Q = X[a], X[b], X[p], X[q]
    if len({a, b, p, q}) < 4: return False
    return _orient(A, B, P) * _orient(A, B, Q) < 0 and _orient(P, Q, A) * _orient(P, Q, B) < 0
