"""Fix a finished .str where spot code 500 was written as string 602 instead of 600.
Only spot points whose raw code is 500 are renumbered; everything else is copied as is.
A spot segment that mixes codes 500 and 602 is split where the code changes.

python3 koreksi_spot.py <folder with raw .txt> <output folder> file1.str [file2.str ...]
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from peta_kode import raw_index

WRONG, RIGHT = 602, 600


def fix(path, R, out):
    lines = open(path, encoding='latin1').read().splitlines()
    res, changed, prev = lines[:2], 0, None
    for l in lines[2:]:
        p = [x.strip() for x in l.split(',')]
        if p[0] != str(WRONG):
            res.append(l); prev = None; continue
        hit = R.get((round(float(p[1]), 3), round(float(p[2]), 3)))
        new = RIGHT if hit and hit[0][2] == '500' else WRONG
        if prev is not None and new != prev:
            res.append('0, 0.000, 0.000, 0.000,')       # split mixed segment
        res.append(l.replace(f'{WRONG},', f'{new},', 1) if new != WRONG else l)
        changed += new != WRONG; prev = new
    open(os.path.join(out, os.path.basename(path)), 'w', newline='\r\n').write('\n'.join(res) + '\n')
    return changed


if __name__ == '__main__':
    folder, out, *files = sys.argv[1:]
    os.makedirs(out, exist_ok=True)
    R = raw_index(folder)
    for f in files:
        print(f'{os.path.basename(f)}: {fix(f, R, out)} titik spot 602 -> 600')
