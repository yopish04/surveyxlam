"""Prototype: raw instrument txt -> Surpac str (crest/toe/spot/boundary), pure-Python
algorithms so they can be ported to VBA. Evaluated against manually finished str."""
import math, os, re, sys, collections

CREST, TOE, SPOT, ROAD = 'CREST', 'TOE', 'SPOT', 'ROAD'   # internal point classes
JUNC, BND, ROAD_EDGE, ROAD_CENTRE = 23, 1, 7, 77           # fixed string numbers

LABEL = 'RTK_SMA'   # last description field; set from the panel / job file (LABEL=...)
MONTHS = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')


def surpac_date(y, m, d):
    """26-Oct-26 with English month names, whatever the Windows language."""
    return f'{d:02d}-{MONTHS[m - 1]}-{y % 100:02d}'


def resolve_date(value, raw_files):
    """DATE from the panel: 'auto'/empty = newest date in the file names, '2026-10-26' or
    '26/10/2026' = that day, anything else (e.g. '26-Oct-26') is used as written."""
    v = (value or '').strip()
    m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})', v) or None
    if m: return surpac_date(int(m[1]), int(m[2]), int(m[3]))
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', v)
    if m: return surpac_date(int(m[3]), int(m[2]), int(m[1]))
    if v and v.lower() != 'auto': return v
    dates = [file_date(f) for f in raw_files if file_date(f)]
    if dates: return surpac_date(*max(dates))
    import datetime; t = datetime.date.today(); return surpac_date(t.year, t.month, t.day)

# Check report as a Surpac .str (<out>_CEK.str): one string number per kind of finding, so
# each kind can get its own colour in Surpac and be compared with the progress data.
CEK_DOUBLE, CEK_TINGGI, CEK_ZIGZAG, CEK_JALAN, CEK_EXCA, CEK_SISA = 9001, 9002, 9003, 9004, 9005, 9006
CEK_GANDA, CEK_POTONG = 9007, 9008   # crest/toe points dropped (pass measured twice), line cut at a crossing

# String numbers per kind of area, learned from 22-26 Oct 2026 manual work.
# Spot strings are keyed by the raw code; any other numeric code keeps its own number.
NUMBERING = {
    'harian': dict(crest=5, toe=6, spot={'500': 600, '602': 602}),   # pit, rehandling, quarry
    'base':   dict(crest=2, toe=3, spot={'500': 500, '602': 602}),   # base, dumping, waste, fill
}
BASE_WORDS = ('BASE', 'DUMP', 'DAMPING', 'WASTE', 'WSD', 'WD_', 'WD-', 'PELEBARAN', 'FILL')


def detect_profile(raw_files):
    names = ' '.join(os.path.basename(f).upper() for f in raw_files)
    return 'base' if any(w in names for w in BASE_WORDS) else 'harian'


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
    if code == '7': return {ROAD}        # road: moved to its own jalan.str
    if code == '': return set()          # no code -> skipped, reported
    if code.isdigit(): return {SPOT}     # 500, 602, 800, ...: spot heights
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


def _turn(a, b, c):
    """Signed turning angle at b (degrees) for path a -> b -> c."""
    t = math.degrees(_ang(b, c) - _ang(a, b))
    return (t + 180) % 360 - 180


def unzip_zigzag(run, min_off=0.3, min_pts=5, win=2):
    """Two parallel lines shot alternately left/right (zig-zag) are split into two lines,
    as done by hand. Each point's sideways offset from a smoothed centre line is measured;
    a stretch where the side keeps flipping (left, right, left, ...) for at least min_pts
    points becomes two lines: the left points and the right points, each in order."""
    n = len(run)
    if n < min_pts: return [run]
    cen = []
    for i in range(n):
        w = run[max(0, i - win):i + win + 1]
        cen.append((sum(p['e'] for p in w) / len(w), sum(p['n'] for p in w) / len(w)))
    side = []
    for i in range(n):
        a, b = cen[max(0, i - 1)], cen[min(n - 1, i + 1)]
        de, dn = b[0] - a[0], b[1] - a[1]
        L = math.hypot(de, dn) or 1.0
        off = (de * (run[i]['n'] - cen[i][1]) - dn * (run[i]['e'] - cen[i][0])) / L
        side.append(0 if abs(off) < min_off else (1 if off > 0 else -1))
    # a point is in a zig-zag stretch when, around it, the side flips at least half the time
    half = 3
    zig = [False] * n
    for i in range(n):
        w = [x for x in side[max(0, i - half):i + half + 1] if x]
        flips = sum(1 for a, b in zip(w, w[1:]) if a != b)
        zig[i] = len(w) >= 5 and flips >= (len(w) - 1) / 2 and w.count(1) >= 2 and w.count(-1) >= 2
    out, start, i = [], 0, 0
    while i < n:
        if not zig[i]: i += 1; continue
        j = i
        while j + 1 < n and zig[j + 1]: j += 1
        if j - i + 1 >= min_pts:
            if i > start: out.append(run[start:i + 1])
            seg, sd = run[i:j + 1], side[i:j + 1]
            left = [p for p, x in zip(seg, sd) if x > 0]
            right = [p for p, x in zip(seg, sd) if x <= 0]
            out += [left, right]
            start = j
        i = j + 1
    if start < n - 1 or not out: out.append(run[start:])
    return [r for r in out if len(r) >= 2] or [run]


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


# ---------------------------------------------------------------- no crossing lines
DUP_TOL = 1.0     # m: a pass this close to another line of the same kind measures the same edge


def _near_line(p, line, tol):
    return any(_seg_dist(p, a, b) <= tol for a, b in zip(line, line[1:]))


def drop_double_pass(lines, tol=DUP_TOL):
    """The same crest/toe measured twice (two files, or out and back) gives two lines on top
    of each other, which then cross. By hand one pass is deleted. Here: points at the END of
    a shorter line (or the whole line) that lie within tol of a longer line of the same kind
    are removed. Junction points (23) are never removed. Returns (lines, removed points)."""
    lines = sorted((l[:] for l in lines), key=len, reverse=True)
    removed = []
    for i in range(len(lines)):
        s = lines[i]
        if len(s) < 2: continue
        others = [l for j, l in enumerate(lines) if j < i and len(l) >= 2]
        if not others: continue
        near = [JUNC not in p['cls'] and any(_near_line(p, o, tol) for o in others) for p in s]
        if all(near):
            removed += s; lines[i] = []; continue
        a = 0
        while a < len(s) and near[a]: a += 1
        b = len(s)
        while b > a and near[b - 1]: b -= 1
        if a >= 2 or len(s) - b >= 2:
            cut_a = a if a >= 2 else 0
            cut_b = b if len(s) - b >= 2 else len(s)
            removed += s[:cut_a] + s[cut_b:]
            lines[i] = s[cut_a:cut_b]
    return [l for l in lines if l], removed


def drop_self_pass(line, tol=DUP_TOL):
    """Inside one line: a stretch measured twice (out and back, or two joined runs that
    overlap). Points lying within tol of a LATER, non-neighbouring part of the same line are
    the first copy; blocks of >= 2 such points are removed (by hand the first pass is deleted)."""
    n = len(line)
    mark = [False] * n
    for i, p in enumerate(line):
        if JUNC in p['cls']: continue
        for k in range(i + 3, n - 1):
            if _seg_dist(p, line[k], line[k + 1]) <= tol:
                mark[i] = True; break
    keep, removed, i = [], [], 0
    while i < n:
        if not mark[i]: keep.append(line[i]); i += 1; continue
        j = i
        while j < n and mark[j]: j += 1
        if j - i >= 2:
            removed += line[i:j]
            rest = line[j:]
            # out and back: the kept (return) pass runs the other way -> continue from its far end
            if keep and rest and d(keep[-1], rest[-1]) < d(keep[-1], rest[0]):
                return keep + rest[::-1], removed
        else:
            keep += line[i:j]
        i = j
    return keep, removed


def fix_crossings(lines):
    """Crossings left between different lines. Two ways out, the cheapest that clears the
    crossing without making a new one:
      - remove one point next to a line end (a toe shot just past a crest), never a 23;
      - cut the line at the crossing edge with the bigger height jump (by hand the line is
        split there: it jumped from one bench to the next).
    Lines are changed in place. Returns (removed points, cut edges as point pairs)."""
    removed, cuts, stuck = [], [], set()
    for _ in range(100):
        total = line_crossings(lines)
        def key(x): return (id(lines[x[0]][x[1]]), id(lines[x[0]][x[1] + 1]), id(lines[x[2]][x[3]]), id(lines[x[2]][x[3] + 1]))
        xs = [x for x in total if key(x) not in stuck]
        if not xs: break
        i, ei, j, ej = xs[0]
        best = None
        for li, idx in ((i, ei), (i, ei + 1), (j, ej), (j, ej + 1)):
            l = lines[li]; p = l[idx]
            if JUNC in p['cls']: continue
            rank = min(idx, len(l) - 1 - idx)
            if rank > 1: continue
            trial = [l[:idx] + l[idx + 1:]]
            test = lines[:li] + trial + lines[li + 1:]
            if len(line_crossings(test)) >= len(total): continue
            if best is None or rank < best[0]: best = (rank, li, trial, ('punt', p))
        for li, k in ((i, ei), (j, ej)):
            l = lines[li]; p, q = l[k], l[k + 1]
            trial = [x for x in (l[:k + 1], l[k + 1:]) if len(x) >= 2]
            test = lines[:li] + trial + lines[li + 1:]
            if len(line_crossings(test)) >= len(total): continue
            rank = 2 + 1.0 / (1.0 + abs(p['z'] - q['z']))
            if best is None or rank < best[0]: best = (rank, li, trial, ('cut', p, q))
        if not best: stuck.add(key(xs[0])); continue
        _, li, trial, what = best
        lines[li:li + 1] = trial
        if what[0] == 'punt': removed.append(what[1])
        else: cuts.append((what[1], what[2]))
    return removed, cuts


def untangle(line, max_rounds=200):
    """2-opt: while two edges of the line cross, reverse the part between them. The ends stay,
    each move makes the line shorter, so it stops; a line shot out and back becomes one line
    ordered along the edge (as done by hand)."""
    s = line[:]
    for _ in range(max_rounds):
        hit = None
        for i in range(len(s) - 3):
            for j in range(i + 2, len(s) - 1):
                if _segx(s[i], s[i + 1], s[j], s[j + 1]):
                    hit = (i, j); break
            if hit: break
        if not hit: return s
        i, j = hit
        s[i + 1:j + 1] = s[i + 1:j + 1][::-1]
    return s


def line_crossings(lines):
    """Crossing edges between different lines -> [(line i, edge ei, line j, edge ej)], i < j.
    Edge ei joins lines[i][ei] and lines[i][ei + 1]."""
    out = []
    for i, x in enumerate(lines):
        for j in range(i + 1, len(lines)):
            y = lines[j]
            for ei in range(len(x) - 1):
                a, b = x[ei], x[ei + 1]
                for ej in range(len(y) - 1):
                    c, e = y[ej], y[ej + 1]
                    if max(a['e'], b['e']) < min(c['e'], e['e']) or min(a['e'], b['e']) > max(c['e'], e['e']): continue
                    if max(a['n'], b['n']) < min(c['n'], e['n']) or min(a['n'], b['n']) > max(c['n'], e['n']): continue
                    if _segx(a, b, c, e): out.append((i, ei, j, ej))
    return out


def tidy_lines(lines, gap):
    """drop_self_pass + drop_double_pass -> join again -> untangle every line.
    Returns (lines, removed points)."""
    removed = []
    out = []
    for l in lines:
        k, r = drop_self_pass(l); removed += r
        if k: out.append(k)
    lines, r = drop_double_pass(out); removed += r
    lines = merge_runs(lines, gap)
    return [untangle(l) for l in lines], removed


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
            L.append(f"{num}, {p['n']:.3f}, {p['e']:.3f}, {p['z']:.3f}, {p['name']},{date},{LABEL}")
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    open(path, 'w', newline='\r\n').write('\n'.join(L) + '\n')


def remove_doubles(pts, tol_xy=0.05, tol_z=0.05):
    """Only true doubles (same spot shot twice): keep the first, report the rest."""
    kept, removed = [], []
    cell = collections.defaultdict(list)
    for p in pts:
        cx, cy = int(p['e'] // 1), int(p['n'] // 1)
        twin = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in cell[(cx + dx, cy + dy)]:
                    if d(p, q) <= tol_xy and abs(p['z'] - q['z']) <= tol_z:
                        twin = q; break
        if twin:
            removed.append((p, twin)); continue
        cell[(cx, cy)].append(p); kept.append(p)
    return kept, removed


def flag_heights(pts, lines, radius=10.0, max_dev=1.5):
    """Suspicious elevations are only REPORTED, never deleted.
    Crest/toe: compared with its neighbours on the same line.
    Spot: compared with the median of nearby spot points."""
    flags = []
    for kind, runs in lines.items():
        for r in runs:
            for i in range(1, len(r) - 1):
                ref = (r[i - 1]['z'] + r[i + 1]['z']) / 2
                if abs(r[i]['z'] - ref) > max_dev:
                    flags.append((r[i], r[i]['z'] - ref, 'crest' if kind == CREST else 'toe'))
    spots = [p for p in pts if SPOT in p['cls']]
    for p in spots:
        near = sorted((q for q in spots if q is not p and d(p, q) <= radius), key=lambda q: d(p, q))[:8]
        if len(near) >= 4:
            zs = sorted(q['z'] for q in near); med = zs[len(zs) // 2]
            if abs(p['z'] - med) > max_dev:
                flags.append((p, p['z'] - med, 'spot'))
    return flags


def file_date(name):
    """Date written in a file name: 26102026, 26-10-2026 or 20261026."""
    s = re.sub(r'[-_. ]', '', os.path.basename(name))
    for m in re.finditer(r'\d{8}', s):
        t = m.group()
        for y, mo, dd in ((t[4:], t[2:4], t[:2]), (t[:4], t[4:6], t[6:])):
            if y.startswith('20') and 1 <= int(mo) <= 12 and 1 <= int(dd) <= 31:
                return (int(y), int(mo), int(dd))
    return None


def excavator_points(raw_files, warn=None, spread_max=1.0):
    """Unit positions: one point per unit code. The FIRST shot is used (what was chosen most
    often by hand, 14 of 21 cases on 22-26 Oct). When the shots of one unit lie more than
    spread_max apart they are probably different positions: the unit is added to `warn`
    so it can be picked by hand.
    Night shift (NS) when the file name says NS or carries an earlier date than the
    newest file (last night's recording); otherwise day shift (DS)."""
    shots = {'ds': collections.OrderedDict(), 'ns': collections.OrderedDict()}
    newest = max((file_date(f) for f in raw_files if file_date(f)), default=None)
    for f in raw_files:
        named_ns = re.search(r'(^|[_\-\s])NS([_\-\s.]|$)', os.path.basename(f).upper())
        older = file_date(f) and newest and file_date(f) < newest
        shift = 'ns' if named_ns or older else 'ds'
        for p in read_raw(f):
            if 'EXCA' in classify(p['code']):
                shots[shift].setdefault(p['code'], []).append(dict(p, name=p['code']))
    out = {}
    for shift, units in shots.items():
        out[shift] = []
        for code, ps in units.items():
            out[shift].append(ps[0])
            spread = max(d(a, b) for a in ps for b in ps)
            if warn is not None and spread > spread_max:
                warn.append(f"{shift.upper()} {code}: {len(ps)} tembakan berjarak sampai {spread:.1f} m "
                            f"(dipakai tembakan pertama, titik {ps[0]['row'] + 1} di {ps[0]['file']})")
    return out


def write_exca(path, title, date, pts):
    write_str(path, title, date, [(1, [p], False) for p in pts])


# ---------------------------------------------------------------- road (code 7)
def _axis(chunk):
    """Principal direction of a cross-section (2D PCA)."""
    me = sum(p['e'] for p in chunk) / len(chunk); mn = sum(p['n'] for p in chunk) / len(chunk)
    see = sum((p['e'] - me) ** 2 for p in chunk); snn = sum((p['n'] - mn) ** 2 for p in chunk)
    sen = sum((p['e'] - me) * (p['n'] - mn) for p in chunk)
    th = 0.5 * math.atan2(2 * sen, see - snn)
    ue, un = math.cos(th), math.sin(th)
    resid = max(abs(-(p['e'] - me) * un + (p['n'] - mn) * ue) for p in chunk)
    return (me, mn), (ue, un), resid


def road_sections(seq, n_fixed=None):
    """Road is shot as cross-sections of n points each (field habit: 5). With n_fixed=None,
    pick n (3..7) whose consecutive chunks are the straightest lines across the road."""
    best = None
    for n in ([n_fixed] if n_fixed else range(3, 8)):
        if len(seq) < 2 * n: continue
        chunks = [seq[i:i + n] for i in range(0, len(seq) - len(seq) % n, n)]
        score = sum(_axis(c)[2] for c in chunks) / len(chunks) + 0.5 * (len(seq) % n)
        if best is None or score < best[0]: best = (score, n, chunks)
    return best


def build_road(seq, n_fixed=5, max_resid=1.0):
    """Returns (strings, ok). Same lateral position in every cross-section -> one line;
    middle position -> 77 (centre), boundary = first section + outer edges + last section.
    ok=False (check by hand) when points don't split evenly into straight cross-sections,
    e.g. at a junction."""
    best = road_sections(seq, n_fixed)
    if not best: return [(ROAD_EDGE, seq, False)], False
    score, n, chunks = best
    ok = len(seq) % n == 0 and max(_axis(c)[2] for c in chunks) <= max_resid
    ordered, prev_axis = [], None
    centres = [_axis(c)[0] for c in chunks]
    for i, c in enumerate(chunks):
        (me, mn), _, _ = _axis(c)
        # signed distance across the road (left of the road direction = negative)
        j0, j1 = max(0, i - 1), min(len(chunks) - 1, i + 1)
        de, dn = centres[j1][0] - centres[j0][0], centres[j1][1] - centres[j0][1]
        L = math.hypot(de, dn) or 1.0
        ordered.append(sorted(c, key=lambda p: ((p['e'] - me) * dn - (p['n'] - mn) * de) / L))
    strings = []
    for lane in range(n):
        line = [sec[lane] for sec in ordered]
        strings.append((ROAD_CENTRE if n % 2 and lane == n // 2 else ROAD_EDGE, line, False))
    ring = ordered[0] + [sec[-1] for sec in ordered[1:]] + ordered[-1][::-1][1:] + [sec[0] for sec in ordered[-2:0:-1]]
    strings.insert(0, (BND, ring, True))
    return strings, ok


def _seg_dist(p, a, b):
    ax, ay, bx, by = a['e'], a['n'], b['e'], b['n']
    L2 = (bx - ax) ** 2 + (by - ay) ** 2
    t = 0 if L2 == 0 else max(0, min(1, ((p['e'] - ax) * (bx - ax) + (p['n'] - ay) * (by - ay)) / L2))
    return math.hypot(p['e'] - ax - t * (bx - ax), p['n'] - ay - t * (by - ay))


def follow_strings(hull, lines, max_dev=6.0):
    """Where two consecutive boundary points lie on the same crest/toe string, walk the
    boundary along that string point by point (as done by hand) instead of cutting across.
    Only when the string stays close to the cut (max_dev) so the boundary never folds inward."""
    where = {}
    for li, r in enumerate(lines):
        for i, p in enumerate(r): where.setdefault(id(p), []).append((li, i))
    ring = hull + hull[:1]
    detours = {}
    for e, (a, b) in enumerate(zip(ring, ring[1:])):
        best = None
        for la, ia in where.get(id(a), []):
            for lb, ib in where.get(id(b), []):
                if la != lb or abs(ia - ib) < 2: continue
                step = 1 if ib > ia else -1
                mid = lines[la][ia + step:ib:step]
                if all(_seg_dist(p, a, b) <= max_dev for p in mid) and (best is None or len(mid) < len(best)):
                    best = mid
        if best and not any(id(p) in {id(h) for h in hull} for p in best):
            detours[e] = best
    def build(chosen):
        out, used = [], set()
        for e, a in enumerate(hull):
            out.append(a)
            for p in chosen.get(e, []):
                if id(p) not in used: out.append(p); used.add(id(p))
        return out

    # accept detours one by one, keeping only those that leave a simple (non-crossing) ring
    chosen = {}
    for e in sorted(detours, key=lambda e: -len(detours[e])):
        trial = dict(chosen); trial[e] = detours[e]
        if _simple(build(trial)): chosen = trial
    return build(chosen)


def _simple(ring):
    """True when the closed ring has no crossing edges and no repeated coordinates."""
    if len({(round(p['e'], 3), round(p['n'], 3)) for p in ring}) != len(ring): return False
    n = len(ring); segs = [(ring[i], ring[(i + 1) % n]) for i in range(n)]
    for i in range(n):
        a1, b1 = segs[i]
        x1, x2 = min(a1['e'], b1['e']), max(a1['e'], b1['e'])
        y1, y2 = min(a1['n'], b1['n']), max(a1['n'], b1['n'])
        for j in range(i + 2, n - (1 if i == 0 else 0)):
            a2, b2 = segs[j]
            if max(a2['e'], b2['e']) < x1 or min(a2['e'], b2['e']) > x2 or \
               max(a2['n'], b2['n']) < y1 or min(a2['n'], b2['n']) > y2: continue
            if _segx(a1, b1, a2, b2) or _touch(a1, b1, a2, b2): return False
    return True


def _touch(p1, p2, p3, p4):
    """Non-adjacent edges touching (a vertex lying on the other edge)."""
    return any(_seg_dist(p, a, b) < 1e-6 for p, a, b in
               ((p1, p3, p4), (p2, p3, p4), (p3, p1, p2), (p4, p1, p2)))


# ---------------------------------------------------------------- boundary: dig long edges
DIG_EDGE = 5.0    # m: boundary edges longer than this are dug inwards (manual: few > 10 m)
DIG_DEPTH = 0.3   # dug point at most this fraction of the edge length inside
DIG_CAP = 2.0     # m: and at most this far inside
def _in_tri(a, b, c, p):
    def s(p1, p2, p3): return (p1['e'] - p3['e']) * (p2['n'] - p3['n']) - (p2['e'] - p3['e']) * (p1['n'] - p3['n'])
    d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0; pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def edge_grid(edges, G=10.0):
    cell = collections.defaultdict(list)
    for a, b in edges:
        for cx in range(int(min(a['e'], b['e']) // G), int(max(a['e'], b['e']) // G) + 1):
            for cy in range(int(min(a['n'], b['n']) // G), int(max(a['n'], b['n']) // G) + 1):
                cell[(cx, cy)].append((a, b))
    return cell, G


def _crosses_lines(a, b, grid):
    cell, G = grid
    for cx in range(int(min(a['e'], b['e']) // G), int(max(a['e'], b['e']) // G) + 1):
        for cy in range(int(min(a['n'], b['n']) // G), int(max(a['n'], b['n']) // G) + 1):
            for c, e in cell.get((cx, cy), ()):
                if _segx(a, b, c, e): return True
    return False


def dig(ring, pts, max_edge, line_grid, max_iter=5000, depth=DIG_DEPTH):
    """Replace a boundary edge a-b longer than max_edge by a-p-b, p the inside point that
    keeps both new edges shortest, when the triangle a-p-b holds no other point and the
    new edges cross neither the boundary nor a crest/toe string."""
    on = {id(p) for p in ring}
    free = [p for p in pts if id(p) not in on]
    cell = collections.defaultdict(list); G = max(5.0, max_edge)
    for p in free: cell[(int(p['e'] // G), int(p['n'] // G))].append(p)
    it = 0; i = 0
    while i < len(ring) and it < max_iter:
        a, b = ring[i], ring[(i + 1) % len(ring)]
        L = d(a, b)
        if L <= max_edge: i += 1; continue
        it += 1
        cx0, cx1 = int((min(a['e'], b['e']) - L / 2) // G), int((max(a['e'], b['e']) + L / 2) // G)
        cy0, cy1 = int((min(a['n'], b['n']) - L / 2) // G), int((max(a['n'], b['n']) + L / 2) // G)
        cand = [p for cx in range(cx0, cx1 + 1) for cy in range(cy0, cy1 + 1) for p in cell.get((cx, cy), ())
                if id(p) not in on and max(d(a, p), d(p, b)) < L and _seg_dist(p, a, b) <= min(depth * L, DIG_CAP)]
        cand.sort(key=lambda p: max(d(a, p), d(p, b)))
        done = False
        for p in cand[:12]:
            # p must lie on the inner side of a->b (the ring is clockwise from _knn_hull)
            side = (b['e'] - a['e']) * (p['n'] - a['n']) - (b['n'] - a['n']) * (p['e'] - a['e'])
            if side > 0 and _area_sign(ring) < 0: continue
            if side < 0 and _area_sign(ring) > 0: continue
            if any(q is not p and id(q) not in on and _in_tri(a, p, b, q) for cx in range(cx0, cx1 + 1)
                   for cy in range(cy0, cy1 + 1) for q in cell.get((cx, cy), ())): continue
            if _crosses_lines(a, p, line_grid) or _crosses_lines(p, b, line_grid): continue
            trial = ring[:i + 1] + [p] + ring[i + 1:]
            if not _simple_near(trial, i + 1): continue
            ring = trial; on.add(id(p)); done = True
            break
        if not done: i += 1
    return ring


def _area_sign(ring):
    return sum(a['e'] * b['n'] - b['e'] * a['n'] for a, b in zip(ring, ring[1:] + ring[:1]))


def _simple_near(ring, k):
    """Only the two edges touching ring[k] are new: check them against all others."""
    n = len(ring)
    new = [((k - 1) % n, k), (k, (k + 1) % n)]
    for i0, i1 in new:
        a, b = ring[i0], ring[i1]
        for j in range(n):
            c, e = ring[j], ring[(j + 1) % n]
            if j in (i0, (i0 - 1) % n, i1, (i1) % n) or c is a or c is b or e is a or e is b: continue
            if _segx(a, b, c, e): return False
    return True


def convert(raw_files, out_path, title, date, line_gap=8.0, area_link=12.0, k=8, profile=None,
            follow=True, max_dev=6.0, zigzag=False, road_sink=None, tidy=True, dig_edge=DIG_EDGE):
    """road_sink: a list -> road strings are appended there (one daily jalan file built by
    the caller) instead of writing <out>_jalan.str next to the area file."""
    num = NUMBERING[profile or detect_profile(raw_files)]
    pts, report, road = [], collections.Counter(), []
    road_ok = True
    for f in raw_files:
        for p in read_raw(f):
            p['cls'] = classify(p['code'])
            if not p['cls']: report['tanpa kode (dilewati)'] += 1; continue
            if 'EXCA' in p['cls']: report['posisi unit EX (dipisah)'] += 1; continue
            if ROAD in p['cls']: road.append(p); continue
            pts.append(p)
    if road:
        rs, ok = build_road(road)
        road_ok = ok
        if road_sink is not None: road_sink += rs
        else: write_str(out_path[:-4] + '_jalan.str', title + '_jalan', date, rs)
        report['titik jalan (dipindah ke _jalan.str)'] = len(road)
        if not ok: report['jalan PERLU DICEK (penampang tidak teratur)'] = 1

    pts, doubles = remove_doubles(pts)
    report['titik double (dihapus)'] = len(doubles)
    strings = []
    # per file keeps the instrument order meaningful
    by_file = collections.defaultdict(list)
    for p in pts: by_file[p['file']].append(p)
    lines, zig_flags, zig_runs = {}, [], []
    for kind in (CREST, TOE):
        runs = []
        for fp in by_file.values():
            for r in runs_for(fp, kind, line_gap):
                parts = unzip_zigzag(r)
                if len(parts) > 1:
                    zig_flags.append((r[0], 0.0, f"zig-zag {r[0]['name']}..{r[-1]['name']}: mungkin 2 garis berdekatan"))
                    zig_runs.append(r)
                runs += parts if zigzag else [r]
        lines[kind] = merge_runs(runs, line_gap)
    dropped, cuts = [], []
    if tidy:
        for kind in (CREST, TOE):
            lines[kind], r = tidy_lines(lines[kind], line_gap); dropped += r
        both = lines[CREST] + lines[TOE]
        r, cuts = fix_crossings(both); dropped += r
        def crest_line(l): return any(CREST in p['cls'] and JUNC not in p['cls'] for p in l)
        lines[CREST] = [l for l in both if crest_line(l)]
        lines[TOE] = [l for l in both if not crest_line(l)]
        report['titik crest/toe ganda (dibuang, lihat _CEK.str)'] = len(dropped)
        report['garis dipotong agar tidak bersilangan'] = len(cuts)
    gone = {id(p) for p in dropped}
    pts = [p for p in pts if id(p) not in gone]
    areas = clusters(pts, area_link)
    all_lines = lines[CREST] + lines[TOE]
    grid = edge_grid([(a, b) for l in all_lines for a, b in zip(l, l[1:])])
    hulls = []
    for a in areas:
        if len(a) < 10: continue
        h = concave_hull(a, k)
        if not h: continue
        if follow: h = follow_strings(h, all_lines, max_dev)
        if dig_edge: h = dig(h, a, dig_edge, grid)
        hulls.append(h)
    for h in hulls: strings.append((BND, h, True))
    for kind, no in ((CREST, num['crest']), (TOE, num['toe'])):
        for r in lines[kind]:
            if len(r) >= 2: strings.append((no, r, False))
    for p in pts:
        if JUNC in p['cls']: strings.append((JUNC, [p], False))
    for fp in by_file.values():
        for code in sorted({p['code'] for p in fp if SPOT in p['cls']}):
            same = [p for p in fp if p['code'] == code or SPOT not in p['cls']]
            for r in runs_for(same, SPOT, 15.0):
                strings.append((num['spot'].get(code, int(code)), r, False))
    write_str(out_path, title, date, strings)
    flags = flag_heights(pts, lines) + zig_flags
    report['garis zig-zag (dicek manual)'] = len(zig_flags)
    report['tinggi mencurigakan (dicek manual)'] = len(flags)
    write_report(out_path[:-4] + '_LAPORAN.txt', doubles, flags)
    items = []
    for p, q in doubles:
        items.append((CEK_DOUBLE, [p], f"CEK_DOUBLE sama dgn {q['name']} dz {p['z'] - q['z']:+.3f}m"))
    for p, dev, kind in flags:
        if not kind.startswith('zig-zag'):
            items.append((CEK_TINGGI, [p], f"CEK_TINGGI {kind} {dev:+.2f}m"))
    for r in zig_runs:
        items.append((CEK_ZIGZAG, r, f"CEK_ZIGZAG {r[0]['name']}-{r[-1]['name']} mungkin 2 garis"))
    for p in dropped:
        items.append((CEK_GANDA, [p], "CEK_GANDA crest/toe diukur dua kali, titik dibuang"))
    for p, q in cuts:
        items.append((CEK_POTONG, [p, q], f"CEK_POTONG garis diputus {p['name']}-{q['name']} (bersilangan)"))
    if road and not road_ok:
        items.append((CEK_JALAN, road, "CEK_JALAN penampang tidak teratur"))
    write_check_str(out_path[:-4] + '_CEK.str', title + '_CEK', date, items)
    return strings, report, areas


def write_check_str(path, title, date, items):
    """items: (string number, [points], finding). Written as a text .str for Surpac with the same
    description order as the progress files: D1 point, D2 date, D3 finding.
    Nothing is written when there is nothing to check."""
    if not items: return
    L = [f'{title},{date},0,0', '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000']
    for num, pts, info in items:
        for p in pts:
            L.append(f"{num}, {p['n']:.3f}, {p['e']:.3f}, {p['z']:.3f}, {p['name']},{date},{info}")
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    open(path, 'w', newline='\r\n').write('\n'.join(L) + '\n')


def write_report(path, doubles, flags):
    L = ['TITIK DOUBLE (dihapus otomatis, yang pertama disimpan)',
         'file\tnama\tkode\tdobel_dengan\tjarak_m\tbeda_tinggi_m']
    for p, q in doubles:
        L.append(f"{p['file']}\t{p['name']}\t{p['code']}\t{q['name']}\t{d(p, q):.3f}\t{p['z'] - q['z']:+.3f}")
    L += ['', 'TINGGI MENCURIGAKAN (TIDAK dihapus, silakan cek manual)',
          'file\tnama\tkode\tjenis\tnorthing\teasting\televasi\tselisih_m']
    for p, dev, kind in sorted(flags, key=lambda x: -abs(x[1])):
        L.append(f"{p['file']}\t{p['name']}\t{p['code']}\t{kind}\t{p['n']:.3f}\t{p['e']:.3f}\t{p['z']:.3f}\t{dev:+.2f}")
    open(path, 'w', newline='\r\n').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    out, title, date, *files = sys.argv[1:]
    s, rep, areas = convert(files, out, title, date)
    print(out, collections.Counter(n for n, _, _ in s), dict(rep), 'areas:', len(areas))
    folder = os.path.dirname(out) or '.'
    for shift, ex in excavator_points(files).items():
        if ex:
            write_exca(os.path.join(folder, f'{title}_exa_{shift}.str'), f'{title}_exa_{shift}', date, ex)
            print(f'exa_{shift}:', [p['code'] for p in ex])
