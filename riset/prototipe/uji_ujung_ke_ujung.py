"""End-to-end test: ONLY the raw .txt of a day go in (proses_harian: grouping + conversion).
The manual .str files are read afterwards purely as the answer key."""
import sys, os, glob, collections, io, contextlib, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import proses_harian, raw2str
from peta_kode import read_str
from kelompok_area import kind_of, location_of
from evaluasi_semua import edges, bpoly
from peta_kode import raw_index

SKIP = ('exa', 'exca', 'jalan', 'clip')
def key(n):
    k = kind_of(n); l = location_of(n)
    return k if k == 'dumpingan' else f'{k}_{l}'.rstrip('_')

tot = collections.Counter()
for folder in sys.argv[1:]:
    out = os.path.join(folder, '_e2e'); shutil.rmtree(out, ignore_errors=True)
    # step 1: raw .txt only -> all area .str (manual files are not looked at)
    with contextlib.redirect_stdout(io.StringIO()):
        proses_harian.main(folder, out)
    autos = [f for f in glob.glob(os.path.join(out, '*.str')) if '_exa_' not in f and '_jalan' not in f]
    apoly = {f: bpoly(read_str(f)) for f in autos}
    R = raw_index(folder)
    # step 2: compare with the manual answer key
    print('#####', folder.split('/')[-3])
    for f in sorted(glob.glob(os.path.join(folder, '*.str'))):
        n = os.path.basename(f)[:-4]
        if any(s in n.lower() for s in SKIP): continue
        M = read_str(f); pm = bpoly(M)
        pts = [p for s in M for p in s]
        miss = sum(1 for p in pts if p[1:3] not in R)
        if miss > 0.05 * len(pts):
            print(f'  {n:34s} DILEWATI: {miss}/{len(pts)} titik tidak ada di .txt yang dikirim (file mentah rusak)')
            tot['missing'] += 1; continue
        # match the automatic file by location (largest overlap), never by name
        af = max(autos, key=lambda a: pm.intersection(apoly[a]).area)
        A = read_str(af); pa = apoly[af]
        iou = pm.intersection(pa).area / pm.union(pa).area if pm.area else 0
        row = []
        for lab, codes in (('crest', (5, 2)), ('toe', (6, 3))):
            mn = next((c for c in codes if any(s[0][0] == c for s in M)), None)
            an = next((c for c in codes if any(s[0][0] == c for s in A)), None)
            em, ea = edges(M, {mn}), edges(A, {an}); tp = len(em & ea)
            tot[lab + 'tp'] += tp; tot[lab + 'm'] += len(em)
            row.append(f'{lab} {100 * tp / max(1, len(em)):.0f}%')
        nbm = sum(1 for s in M if s[0][0] == 1); nba = sum(1 for s in A if s[0][0] == 1)
        tot['n'] += 1; tot['iou'] += iou; tot['area'] += nbm == nba
        print(f'  {n:34s} <- {os.path.basename(af):28s} area {nbm}/{nba} IoU {iou:.3f} ' + ' '.join(row))
print(f"TOTAL ujung-ke-ujung: {tot['n']} area dibandingkan, {tot['missing']} dilewati (mentah rusak) | "
      f"crest {100*tot['cresttp']/tot['crestm']:.1f}% | toe {100*tot['toetp']/tot['toem']:.1f}% | "
      f"jumlah area sama {tot['area']}/{tot['n']} | IoU rata-rata {tot['iou']/tot['n']:.3f}")
