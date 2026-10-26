"""Real test: old global (Surpac) + daily .str -> update_global.py -> compare with the new
global that was made by hand in Surpac."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surpac_bin as sb, update_global as ug

def key(r): return (r[0], round(r[1], 3), round(r[2], 3), round(r[3], 3))

def compare(old, daily, surpac_new, out):
    st = ug.update(old, out, daily)
    A = collections.Counter(key(r) for s in sb.iter_strings(surpac_new) for r in s)
    B = collections.Counter(key(r) for s in sb.iter_strings(out) for r in s)
    O = collections.Counter(key(r) for s in sb.iter_strings(old) for r in s)
    same = sum((A & B).values())
    nums = lambda C: dict(sorted(collections.Counter(k[0] for k in C.elements()).items()))
    print(f"  waktu {st['detik']} s | global lama {st['titik global lama']:,} | dibuang {st.get('titik lama dibuang (di dalam boundary)', 0):,} | harian +{st['titik harian ditambah']:,}")
    print(f"  titik Surpac {sum(A.values()):,} | titik alat {sum(B.values()):,} | SAMA PERSIS {same:,} ({100*same/sum(A.values()):.3f}%)")
    onlyA, onlyB = A - B, B - A
    print('  hanya di Surpac (per string):', nums(onlyA))
    print('  hanya di alat   (per string):', nums(onlyB))
    # where do the differences come from?
    oldA = sum((onlyA & O).values()); oldB = sum((onlyB & O).values())
    print(f'  dari selisih: Surpac menyimpan {oldA} titik lama yang alat buang; alat menyimpan {oldB} titik lama yang Surpac buang')
    return onlyA, onlyB, O

if __name__ == '__main__':
    old, new_surpac, out, *daily = sys.argv[1:]
    compare(old, daily, new_surpac, out)
