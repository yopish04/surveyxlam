"""Volume cut/fill antara dua TIN di dalam boundary (cara Surpac DTM CUT AND FILL).
Metode: sampel grid halus (titik tengah sel) di dalam boundary, interpolasi linear di tiap TIN."""
import numpy as np
from matplotlib.tri import Triangulation, LinearTriInterpolator
from matplotlib.path import Path

def tin_interp(P, T):
    used = np.unique(T)
    m = np.full(len(P), -1); m[used] = np.arange(len(used))
    Q = P[used]
    tri = Triangulation(Q[:, 0], Q[:, 1], m[T])
    return LinearTriInterpolator(tri, Q[:, 2])

def boundary_rings(segs, string_no=1):
    return [np.array([(r[2], r[1]) for r in s]) for s in segs if s[0][0] == string_no and len(s) >= 3]

def inside_rings(rings, x, y):
    """Aturan genap-ganjil antar segmen (segmen di dalam segmen lain = lubang), seperti Surpac."""
    pts = np.column_stack([x, y]); c = np.zeros(len(x), dtype=int)
    for r in rings: c += Path(r).contains_points(pts)
    return c % 2 == 1

def cut_fill(lower, upper, rings, h=0.1, chunk=2_000_000):
    fl, fu = tin_interp(*lower), tin_interp(*upper)
    allr = np.vstack(rings)
    x0, y0 = allr.min(0); x1, y1 = allr.max(0)
    xs = np.arange(x0 + h / 2, x1, h); ys = np.arange(y0 + h / 2, y1, h)
    cut = fill = acut = afill = 0.0
    rows = max(1, chunk // len(xs))
    for i in range(0, len(ys), rows):
        X, Y = np.meshgrid(xs, ys[i:i + rows]); X = X.ravel(); Y = Y.ravel()
        k = inside_rings(rings, X, Y); X, Y = X[k], Y[k]
        zl = fl(X, Y); zu = fu(X, Y)
        ok = ~(np.ma.getmaskarray(zl) | np.ma.getmaskarray(zu))
        d = (np.asarray(zu)[ok] - np.asarray(zl)[ok])
        cut += -d[d < 0].sum() * h * h; fill += d[d > 0].sum() * h * h
        acut += (d < 0).sum() * h * h; afill += (d > 0).sum() * h * h
    return dict(cut=cut, cut_area=acut, fill=fill, fill_area=afill, nett=fill - cut)
