"""Group the day's raw .txt files into areas (one finished .str per area), the way it is done
by hand in Surpac. Step 1 guesses the area from the file name; step 2 joins files of the same
kind that lie on top of each other (e.g. REHENDLING-TF03 measured inside rehandling LD03).

python3 kelompok_area.py <folder with .txt>
"""
import sys, os, re, glob, math, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raw2str import read_raw

# kind -> words that identify it in a file name (checked in this order)
KINDS = [
    ('exca', ('REC', 'EXA', 'EXC', 'EXCA')),
    ('abaikan', ('GCP',)),
    ('base', ('BASE', 'BES')),
    ('pelebaran', ('PELEBARAN', 'LAMINATING')),
    ('rehandling', ('REH', 'RH')),
    ('dumpingan', ('DUMP', 'DAMP', 'WSD', 'WASTE', 'WST', 'WD')),
    ('quarry', ('QUAR',)),
    ('pit', ('PIT',)),
]
# kinds that are one file per day no matter where they were measured
ONE_PER_DAY = {'dumpingan'}
NEAR_JOIN = 15.0    # m: same kind + points this close -> same area


def kind_of(name):
    runs = re.findall(r'[A-Z]+', os.path.splitext(name)[0].upper())   # letters only: DSPIT, PITTF
    for kind, words in KINDS:
        for w in words:
            if any(r == w or r.startswith(w) or r.endswith(w) or (len(w) >= 3 and w in r)
                   for r in runs):
                return kind
    return 'lain'


def location_of(name):
    """TF3 / TF03 / TOFU-03 -> tofu3, LD-03 / LD03 -> ld3, TOS17 -> tos17, rehanlidng-05 -> ld5.
    Takes at most two digits so a glued date (TF0325-10-2026) is not read as the number."""
    u = os.path.splitext(name)[0].upper()
    for pat, lab in ((r'LD[\s_-]*(0\d|\d{1,2})(?!\d)', 'ld{:02d}'),
                     (r'LD[\s_-]*(0\d|\d)', 'ld{:02d}'),
                     (r'RE?H[A-Z]*[\s_-]*(0\d)', 'ld{:02d}'),
                     (r'TOS[\s_-]*(\d{1,2})', 'tos{}'),
                     (r'(?:TOFU|TF)[\s_-]*(0\d|\d)', 'tofu{}')):
        m = re.search(pat, u)
        if m: return lab.format(int(m.group(1)))
    return ''


def _close(a, b, tol):
    cell = collections.defaultdict(list)
    for p in a: cell[(int(p['e'] // tol), int(p['n'] // tol))].append(p)
    for q in b:
        cx, cy = int(q['e'] // tol), int(q['n'] // tol)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for p in cell[(cx + dx, cy + dy)]:
                    if math.hypot(p['e'] - q['e'], p['n'] - q['n']) <= tol: return True
    return False


def group(files):
    info = {}
    for f in files:
        b = os.path.basename(f)
        pts = [p for p in read_raw(f) if p['code'].isdigit()]
        info[f] = dict(kind=kind_of(b), loc=location_of(b), pts=pts)
    groups = collections.OrderedDict()
    for f, i in info.items():
        if i['kind'] in ('exca', 'abaikan') or not i['pts']: continue
        key = i['kind'] if i['kind'] in ONE_PER_DAY else f"{i['kind']}_{i['loc']}".rstrip('_')
        groups.setdefault(key, []).append(f)
    # join groups of the same kind that overlap on the ground (name gave no/other location)
    keys = list(groups)
    for a in keys:
        for b in keys:
            if a == b or a not in groups or b not in groups: continue
            if info[groups[a][0]]['kind'] != info[groups[b][0]]['kind']: continue
            pa = [p for f in groups[a] for p in info[f]['pts']]
            pb = [p for f in groups[b] for p in info[f]['pts']]
            if _close(pa, pb, NEAR_JOIN):
                keep, drop = (a, b) if ('_' in a and '_' not in b) or len(pa) >= len(pb) else (b, a)
                groups[keep] += groups.pop(drop)
    skipped = [f for f, i in info.items() if i['kind'] in ('exca', 'abaikan') or not i['pts']]
    return groups, skipped


if __name__ == '__main__':
    g, skip = group(sorted(glob.glob(os.path.join(sys.argv[1], '*.txt'))))
    for k, fs in g.items():
        print(k, [os.path.basename(f) for f in fs])
    print('tidak dikelompokkan:', [os.path.basename(f) for f in skip])
