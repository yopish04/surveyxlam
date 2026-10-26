"""How is the boundary built? Share of boundary edges that run along a crest/toe string,
and how many boundary edges the automatic boundary shares with the manual one."""
import sys, os, glob, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peta_kode import raw_index, read_str
import raw2str as auto

SKIP = ('exa', 'exca', 'jalan', 'clip')
def E(segs, nums):
    return {frozenset([a[1:3], b[1:3]]) for s in segs if s[0][0] in nums
            for a, b in zip(s, s[1:]) if a[1:3] != b[1:3]}

tot = collections.Counter()
for folder in sys.argv[1:]:
    R = raw_index(folder)
    for f in sorted(glob.glob(os.path.join(folder, '*.str'))):
        n = os.path.basename(f)[:-4]
        if any(s in n.lower() for s in SKIP): continue
        M = read_str(f); pts = [p for s in M for p in s]
        hit = [R.get(p[1:3]) for p in pts]
        if sum(1 for h in hit if not h) > 0.05 * len(pts): continue
        srcs = sorted({h[0][0] for h in hit if h})
        o = os.path.join(folder, '_auto', n + '_AUTO.str'); os.makedirs(os.path.dirname(o), exist_ok=True)
        auto.convert([os.path.join(folder, x) for x in srcs], o, n, 'x')
        A = read_str(o)
        lines = {k for k in {x[0][0] for x in M} if k not in (1, 23, 500, 600, 602, 800)}
        bm, ba = E(M, {1}), E(A, {1})
        along_m = len(bm & E(M, lines)); along_a = len(ba & E(A, lines - {2, 3} | {5, 6} if 5 in lines else lines))
        same = len(bm & ba)
        tot['bm'] += len(bm); tot['along_m'] += along_m; tot['ba'] += len(ba); tot['along_a'] += along_a; tot['same'] += same
        print(f'{n:34s} manual: {len(bm):4d} sisi, {100*along_m/len(bm):3.0f}% ikut crest/toe | '
              f'auto: {len(ba):4d} sisi, {100*along_a/max(1,len(ba)):3.0f}% ikut | sisi sama {100*same/len(bm):3.0f}%')
print(f"TOTAL manual {100*tot['along_m']/tot['bm']:.0f}% sisi boundary mengikuti crest/toe; "
      f"auto {100*tot['along_a']/tot['ba']:.0f}%; sisi boundary sama {100*tot['same']/tot['bm']:.0f}%")
