"""Evaluate the automatic conversion against every finished .str in one or more day folders.
Source raw files are found by matching coordinates, and the manual crest/toe string numbers
are detected from the codes, so different numbering per area type does not matter."""
import sys, os, glob, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raw2str as auto
from peta_kode import raw_index, read_str
from shapely.geometry import Polygon
from shapely.ops import unary_union

LINK = float(os.environ.get('LINK', 12))
SKIP = ('exa', 'clip', 'jalan')


def edges(segs, nums):
    E = set()
    for s in segs:
        if s[0][0] not in nums: continue
        for a, b in zip(s, s[1:]):
            if a[1:3] != b[1:3]: E.add(frozenset([a[1:3], b[1:3]]))
    return E


def bpoly(segs):
    return unary_union([Polygon([(x[2], x[1]) for x in s]).buffer(0)
                        for s in segs if s[0][0] == 1 and len(s) > 3])


def main(folders):
    tot = collections.Counter()
    for folder in folders:
        R = raw_index(folder)
        out = os.path.join(folder, '_auto'); os.makedirs(out, exist_ok=True)
        print('#####', os.path.basename(os.path.dirname(os.path.dirname(folder))) or folder)
        for f in sorted(glob.glob(os.path.join(folder, '*.str'))):
            name = os.path.basename(f)[:-4]
            if any(k in name.lower() for k in SKIP): continue
            M = read_str(f)
            pts = [p for s in M for p in s]
            hit = [R.get(p[1:3]) for p in pts]
            miss = sum(1 for h in hit if not h)
            if miss > 0.05 * len(pts):
                print(f'== {name}: DILEWATI, {miss}/{len(pts)} titik tidak ada di file mentah (file mentah rusak/tidak ada)')
                continue
            srcs = sorted({h[0][0] for h in hit if h})
            num_by_code = collections.defaultdict(collections.Counter)
            for p, h in zip(pts, hit):
                if h and p[0] != 1: num_by_code[h[0][2]][p[0]] += 1
            crest_no = num_by_code['2'].most_common(1)[0][0]
            toe_no = num_by_code['3'].most_common(1)[0][0]
            o = os.path.join(out, name + '_AUTO.str')
            s, rep, areas = auto.convert([os.path.join(folder, x) for x in srcs], o, name, 'x', area_link=LINK)
            A = read_str(o)
            row = []
            for lab, mn, an in (('crest', crest_no, 5), ('toe', toe_no, 6)):
                em, ea = edges(M, {mn}), edges(A, {an}); tp = len(em & ea)
                tot[lab + 'tp'] += tp; tot[lab + 'm'] += len(em); tot[lab + 'a'] += len(ea)
                row.append(f'{lab} {100 * tp / max(1, len(em)):.0f}%')
            pm, pa = bpoly(M), bpoly(A)
            iou = pm.intersection(pa).area / pm.union(pa).area if pm.area else 0
            nbm = sum(1 for x in M if x[0][0] == 1); nba = sum(1 for x in A if x[0][0] == 1)
            tot['iou_sum'] += iou; tot['n'] += 1; tot['area_ok'] += nbm == nba
            print(f'== {name}: string crest/toe manual = {crest_no}/{toe_no} | area {nbm}/{nba} | '
                  f'boundary IoU {iou:.3f} | ' + ' | '.join(row) + f" | double {rep['titik double (dihapus)']}")
    for lab in ('crest', 'toe'):
        print(f"TOTAL {lab}: {tot[lab + 'tp']}/{tot[lab + 'm']} = {100 * tot[lab + 'tp'] / tot[lab + 'm']:.1f}% cocok")
    print(f"Boundary: jumlah area sama {tot['area_ok']}/{tot['n']} file, rata-rata IoU {tot['iou_sum'] / tot['n']:.3f}")


if __name__ == '__main__':
    main(sys.argv[1:])
