"""Muat ulang boundary: rebuild string 1 of a .str that was edited in Surpac.

The crest/toe/spot strings are kept exactly as they are in the file (the user's edits);
only the boundary (string 1) is thrown away and made again from the points that remain:
  1. points are grouped into areas (<= area_link m apart),
  2. concave hull (k-nearest-neighbour) per area,
  3. the boundary walks along crest/toe strings where it runs beside them,
  4. long edges are "dug" inwards to the nearest point (like the manual boundary,
     which rarely has an edge longer than ~10 m),
  5. no step may make the boundary cross itself or a crest/toe string.

python3 boundary_ulang.py <in.str> <out.str> [--max-edge 8] [--k 8]
Text and binary Surpac .str are both read; the output has the same format as the input.
"""
import sys, os, math, collections, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raw2str import clusters, concave_hull, follow_strings, dig, edge_grid
import surpac_bin

BND = 1
LINE_NUMS = (5, 6, 2, 3)            # crest/toe in 'harian' (5, 6) and 'base' (2, 3)
SKIP_NUMS = (7, 77)                 # road strings never take part in the boundary
CHECK_FIRST = 9001                  # _CEK.str numbers


# ---------------------------------------------------------------- read / write
def is_binary(path):
    with open(path, 'rb') as f:
        f.readline(); f.readline()
        return f.read(5) == b'\x00' * 5


def read_any(path):
    """-> header lines, segments [(num, [point dict])]; each point keeps its full row."""
    segs = []
    if is_binary(path):
        h1, h2 = surpac_bin.read_header(path)
        for seg in surpac_bin.iter_strings(path):
            pts = [dict(n=y, e=x, z=z, desc=desc.decode('latin1'), name=desc.decode('latin1').split(',')[0])
                   for _, y, x, z, desc in seg]
            segs.append((seg[0][0], pts))
        return (h1, h2), segs, True
    lines = open(path, encoding='latin1').read().splitlines()
    cur, num = [], None
    for l in lines[2:]:
        p = [x.strip() for x in l.split(',')]
        if len(p) < 4 or not p[0].lstrip('-').isdigit(): continue
        n = int(p[0])
        if n == 0:
            if cur: segs.append((num, cur))
            cur = []
            if l.strip().endswith('END'): break
            continue
        num = n
        cur.append(dict(n=float(p[1]), e=float(p[2]), z=float(p[3]), name=p[4] if len(p) > 4 else '',
                        desc=','.join(x for x in p[4:])))
    if cur: segs.append((num, cur))
    return (lines[0], lines[1]), segs, False


def write_any(path, header, segs, binary):
    if binary:
        w = surpac_bin.Writer(path, header[0], header[1])
        for num, pts in segs:
            for p in pts: w.point(num, p['n'], p['e'], p['z'], p['desc'].encode('latin1'))
            w.end_string()
        w.close()
        return
    L = [header[0], header[1]]
    for num, pts in segs:
        for p in pts:
            L.append(f"{num}, {p['n']:.3f}, {p['e']:.3f}, {p['z']:.3f}, {p['desc']}")
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    open(path, 'w', newline='\r\n', encoding='latin1').write('\n'.join(L) + '\n')


def _key(p): return (round(p['e'], 3), round(p['n'], 3))


# ---------------------------------------------------------------- main step
def rebuild(segs, area_link=12.0, k=8, max_edge=5.0, max_dev=6.0, follow=True):
    """segs as read by read_any. Returns (segments to write, boundary rings). The strings
    other than 1 are returned unchanged (same points, same descriptions)."""
    keep = [(n, s) for n, s in segs if n != BND]
    # one geometry object per coordinate (first occurrence), so strings share points
    uniq, geo = {}, []
    for n, s in keep:
        geo.append((n, [uniq.setdefault(_key(p), p) for p in s]))
    use = {}
    for n, s in geo:
        if n in SKIP_NUMS or n >= CHECK_FIRST: continue
        for p in s: use[id(p)] = p
    pts = list(use.values())
    lines = [s for n, s in geo if n in LINE_NUMS and len(s) >= 2]
    grid = edge_grid([(a, b) for s in lines for a, b in zip(s, s[1:])])
    rings = []
    for area in clusters(pts, area_link):
        if len(area) < 10: continue
        h = concave_hull(area, k)
        if not h: continue
        if follow: h = follow_strings(h, lines, max_dev)
        if max_edge: h = dig(h, area, max_edge, grid)
        rings.append(h)
    return [(BND, r + r[:1]) for r in rings] + keep, rings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--max-edge', type=float, default=5.0)
    ap.add_argument('--k', type=int, default=8)
    ap.add_argument('--area-link', type=float, default=12.0)
    a = ap.parse_args()
    header, segs, binary = read_any(a.inp)
    out, rings = rebuild(segs, a.area_link, a.k, a.max_edge)
    write_any(a.out, header, out, binary)
    print(f'{os.path.basename(a.out)}: {len(rings)} boundary, '
          f'{sum(len(r) for r in rings)} titik boundary')


if __name__ == '__main__':
    main()
