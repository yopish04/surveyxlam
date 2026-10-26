"""Prototype: raw instrument txt -> Surpac str (crest/toe/spot/boundary), pure-Python
algorithms so they can be ported to VBA. Evaluated against manually finished str."""
import math, os, sys, collections

CREST, TOE, SPOT, JUNC, BND = 5, 6, 602, 23, 1


def read_raw(path):
    pts = []
    for i, l in enumerate(open(path, encoding='latin1').read().splitlines()[1:]):
        p = l.split('\t')
        if len(p) < 4:
            continue
        pts.append(dict(file=os.path.basename(path), row=i, name=p[0].strip(), n=float(p[1]),
                        e=float(p[2]), z=float(p[3]), code=p[4].strip() if len(p) > 4 else ''))
    return pts


def classify(code):
    if code == '2': return {CREST}
    if code == '3': return {TOE}
    if code == '23': return {CREST, TOE, JUNC}
    if code in ('500', '602'): return {SPOT}
    if code == '': return set()          # no code -> skipped, reported
    return {'EXCA'}                      # EX..., EXA_..., Bolong: unit positions


def d(a, b):
    return math.hypot(a['n'] - b['n'], a['e'] - b['e'])


# ---------------------------------------------------------------- lines
def runs_for(pts, kind, gap):
    """Consecutive raw points of one line type form a run; break on other code or big gap."""
    runs, cur = [], []
    for p in pts:
        if kind in p['cls']:
            if cur and d(cur[-1], p) > gap:
                runs.append(cur); cur = []
            cur.append(p)
        else:
            if cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    return runs


def merge_runs(runs, gap):
    """Greedy: join nearest pair of free endpoints (<= gap). A junction (23) end is a natural
    line end, so it is not joined to another run's end unless it is the very same point."""
    runs = [r[:] for r in runs]
    while True:
        best = None
        for i, a in enumerate(runs):
            for j, b in enumerate(runs):
                if i >= j: continue
                for ea in (0, -1):
                    for eb in (0, -1):
                        pa, pb = a[ea], b[eb]
                        if JUNC in pa['cls'] or JUNC in pb['cls']:
                            continue
                        dist = d(pa, pb)
                        if dist <= gap and (best is None or dist < best[0]):
                            best = (dist, i, j, ea, eb)
        if not best: return runs
        _, i, j, ea, eb = best
        a, b = runs[i], runs[j]
        if ea == 0: a = a[::-1]
        if eb == -1: b = b[::-1]
        runs[i] = a + b
        del runs[j]


# ---------------------------------------------------------------- areas + boundary
def clusters(pts, link):
    """Single-linkage clustering with a grid (areas that are physically separate)."""
    cell = collections.defaultdict(list)
    for idx, p in enumerate(pts):
        cell[(int(p['e'] // link), int(p['n'] // link))].append(idx)
    lab = [-1] * len(pts); c = 0
    for s in range(len(pts)):
        if lab[s] >= 0: continue
        stack = [s]; lab[s] = c
        while stack:
            k = stack.pop(); p = pts[k]
            cx, cy = int(p['e'] // link), int(p['n'] // link)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for m in cell[(cx + dx, cy + dy)]:
                        if lab[m] < 0 and d(p, pts[m]) <= link:
                            lab[m] = c; stack.append(m)
        c += 1
    out = collections.defaultdict(list)
    for i, l in enumerate(lab): out[l].append(pts[i])
    return list(out.values())


def _ang(a, b):  # angle of vector a->b
    return math.atan2(b['n'] - a['n'], b['e'] - a['e'])


def _segx(p1, p2, p3, p4):
    def o(a, b, c): return (b['e'] - a['e']) * (c['n'] - a['n']) - (b['n'] - a['n']) * (c['e'] - a['e'])
    if p1 is p3 or p1 is p4 or p2 is p3 or p2 is p4: return False
    return (o(p1, p2, p3) * o(p1, p2, p4) < 0) and (o(p3, p4, p1) * o(p3, p4, p2) < 0)


def _inside(poly, p):
    c = False
    for a, b in zip(poly, poly[1:] + poly[:1]):
        if (a['n'] > p['n']) != (b['n'] > p['n']):
            if p['e'] < (b['e'] - a['e']) * (p['n'] - a['n']) / (b['n'] - a['n']) + a['e']:
                c = not c
    return c


def concave_hull(pts, k=8):
    """Moreira & Santos k-nearest-neighbours concave hull. Uses only existing points
    (like the manual boundary). Increases k until every point is inside."""
    uniq = {}
    for p in pts: uniq.setdefault((round(p['e'], 3), round(p['n'], 3)), p)
    P = list(uniq.values())
    if len(P) < 4: return P
    k = max(3, k)
    while k < len(P):
        hull = _knn_hull(P, k)
        if hull and all(_inside(hull, p) or any(p is h for h in hull) for p in P[::3]):
            return hull
        k += 2
    return None


def _knn_hull(P, k):
    first = min(P, key=lambda p: (p['n'], p['e']))
    hull = [first]; cur = first; prev_ang = 0.0  # pointing east from lowest point
    remaining = [p for p in P if p is not first]
    step = 0
    while True:
        if step == 4: remaining.append(first)
        cand = sorted(remaining, key=lambda p: d(cur, p))[:k]
        # sort by right-hand turn from previous direction (clockwise sweep)
        def turn(p):
            a = (prev_ang - _ang(cur, p)) % (2 * math.pi)
            return a if a > 1e-12 else 2 * math.pi
        cand.sort(key=turn, reverse=True)
        nxt = None
        for c in cand:
            last = 1 if c is first else 0
            ok = True
            for i in range(len(hull) - 2 - last):
                if _segx(cur, c, hull[i], hull[i + 1]):
                    ok = False; break
            if ok: nxt = c; break
        if nxt is None: return None
        if nxt is first: return hull
        prev_ang = _ang(nxt, cur)
        hull.append(nxt); remaining.remove(nxt); cur = nxt; step += 1
        if step > len(P) + 5: return None


# ---------------------------------------------------------------- write str
def write_str(path, title, date, strings):
    """strings: list of (number, [points], closed)"""
    L = [f'{title},{date},0,0', '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000']
    for num, seg, closed in strings:
        pts = seg + ([seg[0]] if closed else [])
        for p in pts:
            L.append(f"{num}, {p['n']:.3f}, {p['e']:.3f}, {p['z']:.3f}, {p['name']},{date},RTK_SMA")
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    open(path, 'w', newline='\r\n').write('\n'.join(L) + '\n')


def convert(raw_files, out_path, title, date, line_gap=8.0, area_link=20.0, k=8):
    pts, report = [], collections.Counter()
    for f in raw_files:
        for p in read_raw(f):
            p['cls'] = classify(p['code'])
            if not p['cls']: report['tanpa kode (dilewati)'] += 1; continue
            if 'EXCA' in p['cls']: report['posisi unit EX (dipisah)'] += 1; continue
            pts.append(p)
    strings = []
    # per file keeps the instrument order meaningful
    by_file = collections.defaultdict(list)
    for p in pts: by_file[p['file']].append(p)
    lines = {}
    for kind in (CREST, TOE):
        runs = []
        for fp in by_file.values(): runs += runs_for(fp, kind, line_gap)
        lines[kind] = merge_runs(runs, line_gap)
    areas = clusters(pts, area_link)
    hulls = [h for h in (concave_hull(a, k) for a in areas if len(a) >= 10) if h]
    for h in hulls: strings.append((BND, h, True))
    for kind in (CREST, TOE):
        for r in lines[kind]:
            if len(r) >= 2: strings.append((kind, r, False))
    for p in pts:
        if JUNC in p['cls']: strings.append((JUNC, [p], False))
    for fp in by_file.values():
        for r in runs_for(fp, SPOT, 15.0): strings.append((SPOT, r, False))
    write_str(out_path, title, date, strings)
    return strings, report, areas


if __name__ == '__main__':
    out, title, date, *files = sys.argv[1:]
    s, rep, areas = convert(files, out, title, date)
    print(out, collections.Counter(n for n, _, _ in s), dict(rep), 'areas:', len(areas))
