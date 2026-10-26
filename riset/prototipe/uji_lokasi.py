"""Can a raw .txt be assigned to its area purely by WHERE its points are, using yesterday's
area boundaries (string 1 of yesterday's finished .str), ignoring the file name?"""
import sys, os, glob, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peta_kode import raw_index, read_str
from kelompok_area import kind_of, location_of
from raw2str import read_raw
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

SKIP = ('exa', 'exca', 'jalan', 'clip')
def key(strname):  # normalise the user's own area names (rehenling_ld_03 == rehandling_ld03)
    k = kind_of(strname); l = location_of(strname)
    return k if k == 'dumpingan' else f'{k}_{l}'.rstrip('_')

def areas_of(folder):
    A = {}
    for f in glob.glob(os.path.join(folder, '*.str')):
        n = os.path.basename(f)[:-4]
        if any(s in n.lower() for s in SKIP): continue
        polys = [Polygon([(p[2], p[1]) for p in s]).buffer(0) for s in read_str(f) if s[0][0] == 1 and len(s) > 3]
        if polys: A[key(n)] = unary_union(polys)
    return A

def truth(folder):
    R = raw_index(folder); T = {}
    for f in glob.glob(os.path.join(folder, '*.str')):
        n = os.path.basename(f)[:-4]
        if any(s in n.lower() for s in SKIP): continue
        for s in read_str(f):
            for p in s:
                h = R.get(p[1:3])
                if h: T[h[0][0]] = key(n)
    return T

days = sys.argv[1:]; ok = tot = 0
MEM = {}   # area memory: latest boundary of every area ever measured
for prev, cur in zip(days, days[1:]):
    MEM.update(areas_of(prev)); A, T = dict(MEM), truth(cur)
    print('#####', cur.split('/')[-3], '(boundary dari', prev.split('/')[-3] + ')')
    for f in sorted(glob.glob(os.path.join(cur, '*.txt'))):
        b = os.path.basename(f)
        if b not in T: continue
        pts = [p for p in read_raw(f) if p['code'].isdigit()]
        vote = collections.Counter()
        for p in pts:
            pt = Point(p['e'], p['n'])
            best = min(A, key=lambda k: A[k].distance(pt))
            if A[best].distance(pt) <= 50: vote[best] += 1
        guess = vote.most_common(1)[0][0] if vote else '(area baru)'
        hit = guess == T[b]; ok += hit; tot += 1
        print(f"  {'OK ' if hit else 'X  '}{b[:48]:48s} lokasi={guess:18s} manual={T[b]}")
print(f'TOTAL berdasarkan lokasi saja: {ok}/{tot}')
