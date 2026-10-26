"""Update a big global progress .str with one day's data:
  1. every string of the global file is cut where it enters a daily boundary (string 1 of
     the daily .str); the part inside is dropped, a point is added exactly on the boundary
     (height interpolated) so the remaining string ends on the boundary;
  2. the daily strings are appended.
The global file is streamed line by line (hundreds of MB never sit in memory) and a point is
only tested against a boundary when it falls inside that boundary's bounding box, then
against the boundary edges of its own grid row only. That keeps millions of points fast.

python3 trim_global.py <global.str> <daily.str> [<daily2.str> ...] <out.str>
"""
import sys, os, time, collections

ZERO = '0, 0.000, 0.000, 0.000,'


def read_boundaries(paths):
    polys = []
    for path in paths:
        cur = []
        for l in open(path, encoding='latin1').read().splitlines()[2:]:
            p = [x.strip() for x in l.split(',')]
            if p[0] == '0':
                if len(cur) > 3: polys.append(cur)
                cur = []
            elif p[0] == '1':
                cur.append((float(p[2]), float(p[1])))          # (east, north)
        if len(cur) > 3: polys.append(cur)
    return [Boundary(p) for p in polys]


class Boundary:
    """Polygon with a horizontal band index: a point only checks the edges of its band."""
    BAND = 2.0   # m

    def __init__(self, pts):
        if pts[0] != pts[-1]: pts = pts + [pts[0]]
        self.edges = list(zip(pts, pts[1:]))
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        self.x0, self.x1, self.y0, self.y1 = min(xs), max(xs), min(ys), max(ys)
        self.bands = collections.defaultdict(list)
        for e in self.edges:
            (ax, ay), (bx, by) = e
            for b in range(int((min(ay, by) - self.y0) // self.BAND), int((max(ay, by) - self.y0) // self.BAND) + 1):
                self.bands[b].append(e)

    def on_edge(self, x, y, tol):
        """Point within tol of the boundary line (Surpac removes those too)."""
        if x < self.x0 - tol or x > self.x1 + tol or y < self.y0 - tol or y > self.y1 + tol: return False
        b0, b1 = int((y - tol - self.y0) // self.BAND), int((y + tol - self.y0) // self.BAND)
        for b in range(b0, b1 + 1):
            for (ax, ay), (bx, by) in self.bands.get(b, ()):
                dx, dy = bx - ax, by - ay
                L2 = dx * dx + dy * dy
                t = 0 if L2 == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
                if (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= tol * tol: return True
        return False

    def inside(self, x, y):
        if x < self.x0 or x > self.x1 or y < self.y0 or y > self.y1: return False
        c = False
        for (ax, ay), (bx, by) in self.bands.get(int((y - self.y0) // self.BAND), ()):
            if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                c = not c
        return c

    def crossing(self, p, q):
        """Point where segment p->q (x, y, z) first crosses this boundary."""
        best = None
        for (ax, ay), (bx, by) in self.edges:
            d = (q[0] - p[0]) * (by - ay) - (q[1] - p[1]) * (bx - ax)
            if d == 0: continue
            t = ((ax - p[0]) * (by - ay) - (ay - p[1]) * (bx - ax)) / d
            u = ((ax - p[0]) * (q[1] - p[1]) - (ay - p[1]) * (q[0] - p[0])) / d
            if 0 <= t <= 1 and 0 <= u <= 1 and (best is None or t < best): best = t
        if best is None: best = 0.5
        return (p[0] + best * (q[0] - p[0]), p[1] + best * (q[1] - p[1]), p[2] + best * (q[2] - p[2]))


def trim(global_path, daily_paths, out_path):
    t0 = time.time()
    B = read_boundaries(daily_paths)
    gx0 = min(b.x0 for b in B); gx1 = max(b.x1 for b in B); gy0 = min(b.y0 for b in B); gy1 = max(b.y1 for b in B)
    stats = collections.Counter()

    def which(x, y):
        if x < gx0 or x > gx1 or y < gy0 or y > gy1: return None
        for b in B:
            if b.inside(x, y): return b
        return None

    with open(global_path, encoding='latin1') as fin, open(out_path, 'w', encoding='latin1', newline='\r\n') as out:
        header = [fin.readline().rstrip('\r\n'), fin.readline().rstrip('\r\n')]
        out.write('\n'.join(header) + '\n')
        seg = []                                        # current global string: (x, y, z, line)

        def flush():
            if not seg: return
            piece, prev, prev_in = [], None, None
            for x, y, z, line, num in seg:
                b = which(x, y); stats['titik'] += 1
                if b:
                    stats['dibuang'] += 1
                    if prev is not None and prev_in is None:      # leaving the kept part
                        cx, cy, cz = b.crossing(prev, (x, y, z))
                        piece.append(f'{num}, {cy:.3f}, {cx:.3f}, {cz:.3f}, TRIM')
                        stats['titik potong'] += 1
                    if piece: out.write('\n'.join(piece) + '\n' + ZERO + '\n'); piece = []
                else:
                    if prev is not None and prev_in is not None:  # coming back out of a boundary
                        cx, cy, cz = prev_in.crossing((x, y, z), prev)
                        piece.append(f'{num}, {cy:.3f}, {cx:.3f}, {cz:.3f}, TRIM')
                        stats['titik potong'] += 1
                    piece.append(line)
                prev, prev_in = (x, y, z), b
            if piece: out.write('\n'.join(piece) + '\n' + ZERO + '\n')
            seg.clear()

        for line in fin:
            line = line.rstrip('\r\n')
            p = line.split(',', 4)
            if p[0].strip() == '0':
                flush()
                continue
            seg.append((float(p[2]), float(p[1]), float(p[3]), line, p[0].strip()))
        flush()
        t1 = time.time()
        # append the daily data
        for path in daily_paths:
            L = open(path, encoding='latin1').read().splitlines()[2:]
            body = [l for l in L if not l.rstrip().endswith('END')]
            out.write('\n'.join(body) + '\n')
            stats['titik harian ditambah'] += sum(1 for l in body if not l.startswith('0,'))
        out.write('0, 0.000, 0.000, 0.000, END\n')
    stats['detik trim'] = round(t1 - t0, 1); stats['detik total'] = round(time.time() - t0, 1)
    return stats


if __name__ == '__main__':
    *daily, out = sys.argv[2:]
    s = trim(sys.argv[1], daily, out)
    for k, v in s.items(): print(f'{k}: {v}')
