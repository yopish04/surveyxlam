"""Update progress harian per area, meniru cara manual di Surpac:

  1. Global lama: titik di dalam boundary harian (string 1 file harian) dibuang (STRING CLIP OUTSIDE).
  2. String harian (kecuali string 1) ditambahkan -> global baru  YYYY_MM_DD_update_topo_<area>.str
  3. DTM dari global baru (constrained Delaunay; string 500/600/602 = spot, lainnya breakline; sama 100% dgn TIN Surpac)  -> .dtm
  4. Boundary progress global = gabungan boundary global lama + boundary harian -> _bdy.str
  5. Volume DTM cut/fill: base (first) vs global baru (second) di dalam _bdy (string 1)
     + volume hari ini = nett baru - nett kemarin  -> _vol.txt

python3 update_harian.py --area rehandling_ld03 --tanggal 2026_10_27 \
    --global-lama X.str --bdy-lama X_bdy.str --base base.str [--base-dtm base.dtm] \
    --harian 271026_rehenling_ld03.str [--harian ...] --keluar folder
"""
import argparse, os, sys, time, datetime
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strio import read_str, write_str, read_dtm
from tin import build_tin, build_tin_cdt
from volume import cut_fill
from poly import union

SPOT = (500, 600, 602)


def rings_of(segs):
    return [[(r[2], r[1], r[3], r[4]) for r in s] for s in segs if s[0][0] == 1 and len(s) >= 3]


def inside_any(rings, x, y):
    c = False
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c


def on_edge(rings, x, y, tol=0.01):
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L))
            if (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2 <= tol * tol: return True
    return False


def dist_edge(rings, x, y):
    best = 1e18
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L))
            best = min(best, (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2)
    return best ** 0.5


def clip_outside(segs, rings, sisa=0.0):
    """Buang titik di dalam (atau tepat di garis) boundary; segmen yang terputus jadi beberapa segmen.
    sisa > 0: ujung potongan garis lama (bukan spot) yang terpotong dan masih <= sisa m dari boundary
    ikut dibuang, seperti pembersihan manual."""
    out, n_out, n_sisa = [], 0, 0
    for s in segs:
        pieces, cur, cut = [], [], False
        for r in s:
            if inside_any(rings, r[2], r[1]) or on_edge(rings, r[2], r[1]):
                n_out += 1; cut = True
                if cur: pieces.append(cur); cur = []
            else:
                cur.append(r)
        if cur: pieces.append(cur)
        if cut and sisa > 0 and s[0][0] not in SPOT:
            trimmed = []
            for p in pieces:
                while p and dist_edge(rings, p[0][2], p[0][1]) <= sisa: p = p[1:]; n_sisa += 1
                while p and dist_edge(rings, p[-1][2], p[-1][1]) <= sisa: p = p[:-1]; n_sisa += 1
                if p: trimmed.append(p)
            pieces = trimmed
        out += pieces
    return out, n_out, n_sisa


def dtm_text(name, P, T, hull):
    """Tulis .dtm Surpac: titik merujuk nomor baris di .str (termasuk baris pemisah)."""
    L = [f'{name}.str,0;algorithm=standard;fields=x,y']
    for e, n, z in hull: L.append(f'1, {n:.3f}, {e:.3f}, {z:.3f}, ')
    L += ['0, 0.000, 0.000, 0.000,', '0, 0.000, 0.000, 0.000, END', 'OBJECT, 1, ',
          'TRISOLATION, 1, neighbours=yes,validated=true,closed=no,algorithm=retriangulation']
    edge = {}
    for i, t in enumerate(T):
        for k in range(3): edge[(t[k], t[(k + 1) % 3])] = i + 1
    for i, t in enumerate(T):
        nb = [edge.get((t[(k + 1) % 3], t[k]), 0) for k in range(3)]   # tetangga di sisi t[k]-t[k+1]
        L.append(f'{i + 1}, {t[0]}, {t[1]}, {t[2]}, {nb[0]}, {nb[1]}, {nb[2]}, ')
    L.append('END')
    return '\n'.join(L) + '\n'


def tin_with_rows(segs):
    """Constrained Delaunay seperti Surpac (spot = titik saja). -> P, T (nomor baris .str, 1-based), T0, dilewati."""
    P, T0, skipped, where = build_tin_cdt(segs, spot=SPOT)
    row = {}; i = 1
    for si, s in enumerate(segs):
        for pi, r in enumerate(s):
            if (si, pi) in where: row.setdefault(where[(si, pi)], i)
            i += 1
        i += 1
    m = np.array([row[k] for k in range(len(P))])
    return P, m[T0], T0, skipped


def fmt(v): return f'{v:,.3f}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--area', required=True); ap.add_argument('--tanggal', required=True)
    ap.add_argument('--global-lama', required=True); ap.add_argument('--bdy-lama', required=True)
    ap.add_argument('--base', required=True); ap.add_argument('--base-dtm')
    ap.add_argument('--harian', required=True, nargs='+'); ap.add_argument('--keluar', required=True)
    ap.add_argument('--grid', type=float, default=0.1)
    ap.add_argument('--sisa', type=float, default=0.0, help='m; buang ujung garis lama terpotong sedekat ini dari boundary')
    a = ap.parse_args()
    t0 = time.time(); os.makedirs(a.keluar, exist_ok=True)
    name = f'{a.tanggal}_update_topo_{a.area}'
    tgl = datetime.datetime.strptime(a.tanggal, '%Y_%m_%d').strftime('%d-%b-%y')
    log = []

    # 1-2 update global
    _, old = read_str(a.global_lama)
    daily = []
    for p in a.harian: daily += read_str(p)[1]
    drings = rings_of(daily)
    kept, n_out, n_sisa = clip_outside(old, drings, a.sisa)
    add = [s for s in daily if s[0][0] != 1]
    order = sorted(set(s[0][0] for s in kept + add))
    segs = [s for n in order for s in [x for x in add if x[0][0] == n] + [x for x in kept if x[0][0] == n]]
    log.append(f'Global lama: {sum(map(len, old))} titik; dibuang di dalam boundary harian: {n_out}; ujung garis lama dekat boundary (<= {a.sisa} m): {n_sisa}')
    log.append(f'Ditambah dari harian: {sum(map(len, add))} titik ({len(drings)} boundary harian)')

    # 3 DTM
    segs2 = segs
    P, T, T0, miss = tin_with_rows(segs)
    head = f'{name},{tgl},{os.path.basename(a.global_lama)} OUTSIDE ' + ' '.join(map(os.path.basename, a.harian)) + ',0'
    write_str(os.path.join(a.keluar, name + '.str'), head, segs2)
    from scipy.spatial import ConvexHull
    hull = P[ConvexHull(P[:, :2]).vertices]
    hull = np.vstack([hull, hull[:1]])
    open(os.path.join(a.keluar, name + '.dtm'), 'w', newline='\r\n').write(dtm_text(name, P, T, hull))
    log.append(f'DTM: {len(T)} segitiga; breakline dilewati (bersilangan) {miss}')

    # 4 boundary global
    _, bold = read_str(a.bdy_lama)
    U = union(rings_of(bold), drings)
    bsegs = [[(1, p[1], p[0], p[2], p[3]) for p in r + r[:1]] for r in U]
    write_str(os.path.join(a.keluar, name + '_bdy.str'), f'{name}_bdy,{tgl},0,0', bsegs)
    log.append(f'Boundary global: {len(U)} segmen, {sum(map(len, U))} titik')

    # 5 volume
    if a.base_dtm: base = read_dtm(a.base_dtm, a.base)
    else:
        bP, bT, _, _ = build_tin_cdt(read_str(a.base)[1], spot=SPOT); base = (bP, bT)
    rings = [np.array([p[:2] for p in r + r[:1]]) for r in U]
    vol = cut_fill(base, (P, T0), rings, a.grid)
    oldtin_P, oldtin_T, _, _ = build_tin_cdt(old, spot=SPOT)
    vol_old = cut_fill(base, (oldtin_P, oldtin_T), [np.array([p[:2] for p in r + r[:1]]) for r in rings_of(bold)], a.grid)
    rep = [f'DTM CUT AND FILL (SMA Survey, uji) - {a.tanggal}',
           f'First DTM : {os.path.basename(a.base_dtm or a.base)}',
           f'Second DTM: {name}.dtm', f'Boundary  : {name}_bdy.str (string 1)', '',
           f'Cut Vol   : {fmt(vol["cut"])}   Cut Area : {fmt(vol["cut_area"])}',
           f'Fill Vol  : {fmt(vol["fill"])}   Fill Area: {fmt(vol["fill_area"])}',
           f'Nett Vol  : {fmt(vol["nett"])}', '',
           f'Nett kemarin (global lama, boundary lama): {fmt(vol_old["nett"])}',
           f'Volume hari ini (BCM)                    : {fmt(vol_old["nett"] - vol["nett"])}', '',
           'LOG:'] + log + [f'Waktu: {time.time() - t0:.1f} s']
    open(os.path.join(a.keluar, name + '_vol.txt'), 'w', newline='\r\n').write('\n'.join(rep) + '\n')
    print('\n'.join(rep))


if __name__ == '__main__':
    main()
