"""Update a global progress file (Surpac BINARY .str) with one day's area files, the way it is
done by hand in Surpac (learned from 2026_10_26_update_topo_*.str):

  1. global points INSIDE the daily boundaries (string 1 of the daily .str) are removed
     ("OUTSIDE" in Surpac): no new points are added on the boundary and the remaining points
     of a string stay connected;
  2. the daily strings are added, except string 1 (the boundary is only used for trimming);
  3. strings are ordered by string number; within one number the newest data comes first.

The global file is streamed: it is already ordered by string number, so the daily strings of
number n are written just before the old strings of number n. Memory stays small for any size.

python3 update_global.py <old_global.str> <new_global.str> <daily1.str> [<daily2.str> ...]
"""
import sys, os, time, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surpac_bin as sb
from trim_global import Boundary


def read_daily(paths):
    """Daily text .str -> (boundaries, segments). Segment = list of (num, y, x, z, desc)."""
    bounds, segs = [], []
    for path in paths:
        cur = []
        for l in open(path, encoding='latin1').read().splitlines()[2:]:
            p = [x.strip() for x in l.split(',')]
            if p[0] == '0':
                if cur: segs.append(cur)
                cur = []
                continue
            cur.append((int(p[0]), float(p[1]), float(p[2]), float(p[3]),
                        ','.join(p[4:]).encode('latin1')))
        if cur: segs.append(cur)
    for s in segs:
        if s[0][0] == 1 and len(s) > 3:
            bounds.append(Boundary([(r[2], r[1]) for r in s]))
    return bounds, [s for s in segs if s[0][0] != 1]


def update(old_path, new_path, daily_paths, new_name=None, date=None):
    t0 = time.time()
    bounds, daily = read_daily(daily_paths)
    gx0 = min(b.x0 for b in bounds); gx1 = max(b.x1 for b in bounds)
    gy0 = min(b.y0 for b in bounds); gy1 = max(b.y1 for b in bounds)
    by_num = collections.defaultdict(list)
    for s in daily: by_num[s[0][0]].append(s)
    pending = sorted(by_num)                              # daily numbers not written yet

    old_head, axis = sb.read_header(old_path)
    old_fields = old_head.decode('latin1').rstrip('\r\n').split(',')
    style = old_fields[-1] if old_fields[-1].lower().endswith('.ssi') else ''
    new_name = new_name or os.path.splitext(os.path.basename(new_path))[0]
    date = date or old_fields[1]
    daily_names = ' '.join(os.path.basename(p) for p in daily_paths)
    head = f'{new_name},{date},{old_fields[0]}.str OUTSIDE {daily_names},{style}\r\n'.encode('latin1')

    st = collections.Counter()
    w = sb.Writer(new_path, head, axis)

    def write_daily_upto(num):
        while pending and pending[0] <= num:
            n = pending.pop(0)
            for s in by_num[n]:
                for r in s: w.point(*r)
                w.end_string()
                st['titik harian ditambah'] += len(s)

    def inside(x, y):
        if x < gx0 or x > gx1 or y < gy0 or y > gy1: return False
        return any(b.inside(x, y) for b in bounds)

    for seg in sb.iter_strings(old_path):
        write_daily_upto(seg[0][0])
        kept = 0
        for r in seg:
            st['titik global lama'] += 1
            if inside(r[2], r[1]):
                st['titik lama dibuang (di dalam boundary)'] += 1
            else:
                w.point(*r); kept += 1
        if kept: w.end_string()
    write_daily_upto(float('inf'))
    w.close()
    st['detik'] = round(time.time() - t0, 1)
    return st


if __name__ == '__main__':
    s = update(sys.argv[1], sys.argv[2], sys.argv[3:])
    for k, v in s.items(): print(f'{k}: {v:,}' if isinstance(v, int) else f'{k}: {v}')
