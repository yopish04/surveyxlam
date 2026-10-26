"""Learn the code -> string-number mapping from finished (manual) .str files by matching
coordinates back to the raw instrument .txt files in the same folder."""
import sys, glob, os, collections

def raw_index(folder):
    R = {}
    for f in glob.glob(os.path.join(folder, '*.txt')):
        lines = open(f, encoding='latin1').read().splitlines()[1:]
        for i, l in enumerate(lines):
            p = l.split('\t')
            if len(p) < 4 or not p[0].strip():
                continue
            try:
                k = (round(float(p[1]), 3), round(float(p[2]), 3))
            except ValueError:
                continue
            R.setdefault(k, []).append((os.path.basename(f), i, p[4].strip() if len(p) > 4 else ''))
    return R

def read_str(f):
    segs, cur = [], []
    for l in open(f, encoding='latin1').read().splitlines()[2:]:
        p = [x.strip() for x in l.split(',')]
        if p[0] == '0':
            if cur: segs.append(cur); cur = []
            continue
        cur.append((int(p[0]), round(float(p[1]), 3), round(float(p[2]), 3), p[4] if len(p) > 4 else ''))
    if cur: segs.append(cur)
    return segs

if __name__ == '__main__':
    for folder in sys.argv[1:]:
        R = raw_index(folder)
        print('#####', folder)
        for f in sorted(glob.glob(os.path.join(folder, '*.str'))):
            segs = read_str(f)
            m = collections.defaultdict(collections.Counter); src = collections.Counter(); miss = 0
            for s in segs:
                for p in s:
                    hit = R.get(p[1:3])
                    if not hit: miss += 1; continue
                    m[p[0]][hit[0][2]] += 1; src[hit[0][0]] += 1
            print(f'== {os.path.basename(f)}: {sum(len(s) for s in segs)} titik, {len(segs)} segmen, tak-ketemu-di-raw {miss}')
            print('   string <- kode:', {k: dict(v) for k, v in sorted(m.items())})
            print('   sumber:', dict(src))
