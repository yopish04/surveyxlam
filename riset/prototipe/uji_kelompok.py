"""Compare automatic file grouping with the manual grouping (which finished .str used which .txt)."""
import sys, os, glob, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peta_kode import raw_index, read_str
from kelompok_area import group

ok_all = tot = 0
for folder in sys.argv[1:]:
    R = raw_index(folder)
    truth = collections.defaultdict(set)
    for f in glob.glob(os.path.join(folder, '*.str')):
        n = os.path.basename(f)[:-4]
        if any(k in n.lower() for k in ('exa', 'exca', 'jalan', 'clip')): continue
        for s in read_str(f):
            for p in s:
                h = R.get(p[1:3])
                if h: truth[h[0][0]].add(n)
    g, _ = group(sorted(glob.glob(os.path.join(folder, '*.txt'))))
    auto = {os.path.basename(f): k for k, fs in g.items() for f in fs}
    man = {f: next(iter(a)) for f, a in truth.items()}
    files = sorted(set(man) & set(auto))
    # partition equality: two files together in manual <=> together in auto
    bad = set()
    for a in files:
        for b in files:
            if (man[a] == man[b]) != (auto[a] == auto[b]): bad |= {a, b}
    print(f"##### {folder.split('/')[-3]}: {len(files) - len(bad)}/{len(files)} file masuk kelompok yang benar")
    for k, fs in g.items():
        mk = sorted({man.get(os.path.basename(f), '?') for f in fs})
        print(f"  {k:18s} -> manual {mk}  ({len(fs)} file)")
    for f in sorted(bad): print(f"  SALAH: {f[:55]} auto={auto[f]} manual={man[f]}")
    ok_all += len(files) - len(bad); tot += len(files)
print(f'TOTAL: {ok_all}/{tot} file dikelompokkan sama dengan manual')
