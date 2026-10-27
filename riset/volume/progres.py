"""Referensi (spesifikasi) untuk add-in Excel "Update Progress" dan macro Surpac.

1. potong(): potong file progress (.str teks / biner) dengan boundary
   - boundary dari satu atau beberapa file, nomor string boundary dipilih
   - mode 'dalam' = buang titik di dalam boundary (Surpac STRING CLIP OUTSIDE, untuk update global)
     mode 'luar'  = buang titik di luar boundary (ambil area)
   - titik tepat di garis boundary (<= 1 cm) dihitung di dalam
   - opsional: titik potong di garis boundary ditambahkan (default tidak, seperti manual)
   - opsional: string harian langsung ditambahkan (kecuali string boundary-nya)
   - laporan _CEK: ujung garis lama yang terpotong dan dekat boundary (untuk dicek manual)
2. boundary_op(): A + B (gabung), A - B (kurangi), A x B (irisan) dengan nomor string pilihan.
3. nama_tanggal(): ganti/tambah tanggal di nama file (otomatis dari file harian atau manual).

Satu file boundary: aturan genap-ganjil (segmen di dalam segmen = lubang), seperti Surpac.
Beberapa file boundary: titik "di dalam" kalau di dalam salah satu file.
"""
import os, re, datetime, struct, math

EDGE_TOL = 0.01
SPOT = (500, 600, 602)
REC = struct.Struct('>iddd')
BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


# ----------------------------------------------------------------------------- baca / tulis
def baca(path):
    """-> dict(head=[field..], binary=bool, segs=[[(num, n, e, z, desc), ...], ...])"""
    raw = open(path, 'rb').read()
    i1 = raw.index(b'\n') + 1; i2 = raw.index(b'\n', i1) + 1
    head = raw[:i1].decode('latin1').rstrip('\r\n').split(',')
    rest = raw[i2:]
    binary = rest[:5] == b'\x00' * 5
    segs, cur = [], []
    if binary:
        pos = 5
        while pos + 28 <= len(rest):
            num, y, x, z = REC.unpack_from(rest, pos)
            e = rest.index(b'\x00', pos + 28)
            d = rest[pos + 28:e].decode('latin1'); pos = e + 1
            if num == 0:
                if cur: segs.append(cur)
                cur = []
                if d.strip() == 'END': break
            else:
                cur.append((num, y, x, z, d))
    else:
        for l in rest.decode('latin1').splitlines():
            p = l.split(',')
            if len(p) < 4: continue
            try: num = int(float(p[0]))
            except ValueError: continue
            if num == 0:
                if cur: segs.append(cur)
                cur = []
                if len(p) > 4 and p[4].strip() == 'END': break
                continue
            d = ','.join(p[4:]).lstrip(' ')
            cur.append((num, float(p[1]), float(p[2]), float(p[3]), d))
    if cur: segs.append(cur)
    return dict(head=head, binary=binary, segs=segs)


AXIS = '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000'


def tulis(path, head, segs, binary):
    h = ','.join(head)
    if binary:
        out = bytearray((h + '\r\n' + AXIS + '\r\n').encode('latin1')); out += b'\x00' * 5
        for s in segs:
            for num, y, x, z, d in s:
                out += REC.pack(num, y, x, z); out += d.encode('latin1') + b'\x00'
            out += REC.pack(0, 0, 0, 0) + b'\x00'
        out += REC.pack(0, 0, 0, 0) + b'END\x00'
        open(path, 'wb').write(out); return
    L = [h, AXIS]
    for s in segs:
        for num, y, x, z, d in s:
            L.append(f'{num}, {y:.3f}, {x:.3f}, {z:.3f}, {d}')
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    open(path, 'w', newline='\r\n', encoding='latin1').write('\n'.join(L) + '\n')


# ----------------------------------------------------------------------------- tanggal / nama
def tgl_dari_file(path, head=None):
    """Tanggal data harian: dari awal nama file (ddmmyy / ddmmyyyy / yyyy_mm_dd), kalau tidak ada dari header."""
    b = os.path.basename(path)
    m = re.match(r'(\d{4})_(\d{2})_(\d{2})', b)
    if m: return datetime.date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r'(\d{2})(\d{2})(\d{4})(?!\d)', b) or None
    if m: return datetime.date(int(m[3]), int(m[2]), int(m[1]))
    m = re.match(r'(\d{2})(\d{2})(\d{2})(?!\d)', b)
    if m: return datetime.date(2000 + int(m[3]), int(m[2]), int(m[1]))
    head = head or baca(path)['head']
    if len(head) > 1:
        m = re.match(r'\s*(\d{1,2})-(\w{3})-(\d{2})', head[1])
        if m: return datetime.date(2000 + int(m[3]), BULAN.index(m[2].title()) + 1, int(m[1]))
    return None


def tgl_surpac(d): return f'{d.day:02d}-{BULAN[d.month - 1]}-{d.year % 100:02d}'


def nama_tanggal(nama, d):
    """2026_10_26_update_topo_x -> 2026_10_27_update_topo_x ; 261026_x -> 271026_x ; lain: diberi awalan."""
    base, ext = os.path.splitext(nama)
    t = f'{d.year:04d}_{d.month:02d}_{d.day:02d}'
    if re.match(r'\d{4}_\d{2}_\d{2}', base): return t + base[10:] + ext
    if re.match(r'\d{8}(?!\d)', base): return f'{d.day:02d}{d.month:02d}{d.year:04d}' + base[8:] + ext
    if re.match(r'\d{6}(?!\d)', base): return f'{d.day:02d}{d.month:02d}{d.year % 100:02d}' + base[6:] + ext
    return t + '_' + base + ext


# ----------------------------------------------------------------------------- geometri dasar
class Bdy:
    """Kumpulan ring dari SATU file (genap-ganjil), dengan indeks pita-Y supaya cepat."""
    def __init__(self, rings, band=5.0):
        self.rings = [r for r in rings if len(r) >= 3]
        self.E = []
        for r in self.rings:
            n = len(r)
            for i in range(n):
                p, q = r[i], r[(i + 1) % n]
                if (p[0], p[1]) != (q[0], q[1]): self.E.append((p[0], p[1], q[0], q[1]))
        xs = [c for e in self.E for c in (e[0], e[2])]; ys = [c for e in self.E for c in (e[1], e[3])]
        self.x0, self.x1, self.y0, self.y1 = min(xs), max(xs), min(ys), max(ys)
        self.band = band
        self.idx = {}
        for k, (x1, y1, x2, y2) in enumerate(self.E):
            for b in range(int((min(y1, y2) - EDGE_TOL - self.y0) // band), int((max(y1, y2) + EDGE_TOL - self.y0) // band) + 1):
                self.idx.setdefault(b, []).append(k)

    def status(self, x, y):
        """1 = di dalam (atau di garis), 0 = di luar."""
        if x < self.x0 - EDGE_TOL or x > self.x1 + EDGE_TOL or y < self.y0 - EDGE_TOL or y > self.y1 + EDGE_TOL: return 0
        c = False
        for k in self.idx.get(int((y - self.y0) // self.band), ()):
            x1, y1, x2, y2 = self.E[k]
            dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
            t = ((x - x1) * dx + (y - y1) * dy) / L
            t = 0.0 if t < 0 else 1.0 if t > 1 else t
            if (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2 <= EDGE_TOL * EDGE_TOL: return 1
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * dx / dy: c = not c
        return 1 if c else 0

    def jarak(self, x, y, maks):
        best = maks * maks + 1
        for b in range(int((y - maks - self.y0) // self.band), int((y + maks - self.y0) // self.band) + 1):
            for k in self.idx.get(b, ()):
                x1, y1, x2, y2 = self.E[k]
                dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
                t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / L))
                best = min(best, (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2)
        return math.sqrt(best)

    def potong_ruas(self, p, q):
        """Titik potong ruas p-q (e,n) dengan garis boundary terdekat ke p -> (t) atau None."""
        best = None
        for (x1, y1, x2, y2) in self.E:
            d = (q[0] - p[0]) * (y2 - y1) - (q[1] - p[1]) * (x2 - x1)
            if abs(d) < 1e-12: continue
            t = ((x1 - p[0]) * (y2 - y1) - (y1 - p[1]) * (x2 - x1)) / d
            u = ((x1 - p[0]) * (q[1] - p[1]) - (y1 - p[1]) * (q[0] - p[0])) / d
            if 0 <= t <= 1 and 0 <= u <= 1 and (best is None or t < best): best = t
        return best


def rings_dari(segs, no):
    return [[(r[2], r[1], r[3], r[4]) for r in s] for s in segs if s[0][0] == no and len(s) >= 3]


def buka_ring(r):
    if len(r) > 1 and abs(r[0][0] - r[-1][0]) < 1e-9 and abs(r[0][1] - r[-1][1]) < 1e-9: return r[:-1]
    return r


# ----------------------------------------------------------------------------- 1. potong
def potong(progres, boundaries, mode='dalam', harian=(), string_bdy_harian=None,
           titik_potong=False, cek=2.0, sambung=0.0):
    """progres: dict dari baca(); boundaries: list of (dict baca, nomor string);
    harian: list dict baca yang ditambahkan (string boundary-nya dibuang).
    -> segs baru, statistik, daftar titik cek."""
    B = [Bdy([buka_ring(r) for r in rings_dari(b['segs'], no)]) for b, no in boundaries]
    B = [b for b in B if b.rings]
    def dalam(x, y): return any(b.status(x, y) for b in B)
    buang = (lambda x, y: dalam(x, y)) if mode == 'dalam' else (lambda x, y: not dalam(x, y))
    st = dict(titik_awal=0, titik_dibuang=0, titik_potong=0, titik_harian=0, sambungan=0)
    out, cekl, sisa = [], [], []
    for s in progres['segs']:
        st['titik_awal'] += len(s)
        flags = [buang(r[2], r[1]) for r in s]
        if not any(flags): out.append(s); continue
        st['titik_dibuang'] += sum(flags)
        garis = len(s) > 1 and s[0][0] not in SPOT
        pieces, cur = [], []
        for i, r in enumerate(s):
            if flags[i]:
                if cur:
                    if titik_potong and garis: cur.append(_titik_pada(B, cur[-1], r))
                    pieces.append(cur); cur = []
            else:
                if not cur and i > 0 and titik_potong and garis and flags[i - 1]:
                    cur.append(_titik_pada(B, r, s[i - 1]))
                cur.append(r)
        if cur: pieces.append(cur)
        if garis:
            for pi, p in enumerate(pieces):
                ujung = []
                if p[0] is not s[0]: ujung.append(0)
                if p[-1] is not s[-1]: ujung.append(1)
                if ujung: sisa.append((p, ujung))
        if titik_potong and garis: st['titik_potong'] += sum(len(p) for p in pieces) - (len(s) - sum(flags))
        out += pieces
        if garis and cek and mode == 'dalam':
            for p in pieces:
                for r in {id(p[0]): p[0], id(p[-1]): p[-1]}.values():
                    if r[4].startswith('POTONG'): continue
                    if min(b.jarak(r[2], r[1], cek) for b in B) <= cek: cekl.append(r)
    # tambah harian
    add = []
    for h in harian:
        nb = string_bdy_harian
        add += [s for s in h['segs'] if s[0][0] != nb]
    st['titik_harian'] = sum(map(len, add))
    if sambung > 0 and add and sisa:
        out, add, st['sambungan'] = _sambung(out, add, sisa, sambung)
    if add:
        nums = sorted(set(s[0][0] for s in out) | set(s[0][0] for s in add))
        by_old, by_add = {}, {}
        for s in out: by_old.setdefault(s[0][0], []).append(s)
        for s in add: by_add.setdefault(s[0][0], []).append(s)
        if _urut(out):
            out = [s for n in nums for s in by_add.get(n, []) + by_old.get(n, [])]
        else:                                   # file lama tidak urut nomor string: harian di akhir
            out = out + add
    st['titik_akhir'] = sum(map(len, out))
    return out, st, cekl


def _sambung(out, add, sisa, jarak):
    """Sambung ujung garis harian ke ujung garis lama yang terpotong (nomor string sama, jarak <= jarak),
    seperti edit manual. Garis lama yang disambung pindah ke posisi garis harian."""
    cand = []
    for di, d in enumerate(add):
        if len(d) < 2 or d[0][0] in SPOT: continue
        for de in (0, 1):
            pd = d[0] if de == 0 else d[-1]
            for oi, (o, ujung) in enumerate(sisa):
                if o[0][0] != d[0][0]: continue
                for oe in ujung:
                    po = o[0] if oe == 0 else o[-1]
                    dist = math.hypot(pd[1] - po[1], pd[2] - po[2])
                    if dist <= jarak: cand.append((dist, di, de, oi, oe))
    cand.sort()
    used_d, used_o, used_old = set(), set(), set()
    ext = {}                                   # di -> [awal_tambahan, akhir_tambahan]
    n = 0
    for dist, di, de, oi, oe in cand:
        if (di, de) in used_d or oi in used_old: continue
        used_d.add((di, de)); used_old.add(oi)
        o = sisa[oi][0]
        seq = o if oe == (1 if de == 0 else 0) else o[::-1]     # arah supaya menyambung
        e = ext.setdefault(di, [[], []])
        e[de] = seq
        n += 1
    hapus = {id(sisa[oi][0]) for oi in used_old}
    out = [s for s in out if id(s) not in hapus]
    new_add = []
    for di, d in enumerate(add):
        if di in ext:
            a, b = ext[di]
            num = d[0][0]
            seg = [(num,) + tuple(x[1:]) for x in a] + list(d) + [(num,) + tuple(x[1:]) for x in b]
            new_add.append(seg)
        else:
            new_add.append(d)
    return out, new_add, n


def _urut(segs):
    return all(a[0][0] <= b[0][0] for a, b in zip(segs, segs[1:]))


def _titik_pada(B, keep, gone):
    """Titik potong ruas keep->gone dengan boundary: z interpolasi, deskripsi dari titik yang disimpan."""
    best = None
    for b in B:
        t = b.potong_ruas((keep[2], keep[1]), (gone[2], gone[1]))
        if t is not None and (best is None or t < best): best = t
    t = 0.0 if best is None else best
    return (keep[0], keep[1] + t * (gone[1] - keep[1]), keep[2] + t * (gone[2] - keep[2]),
            keep[3] + t * (gone[3] - keep[3]), 'POTONG,' + keep[4])


# ----------------------------------------------------------------------------- 2. boundary
def _area(r):
    a = 0.0
    for p, q in zip(r, r[1:] + r[:1]): a += p[0] * q[1] - q[0] * p[1]
    return a / 2


def _inside_set(rings, x, y):
    c = False
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c


def _on_set(rings, x, y, tol=1e-4):
    for r in rings:
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i][:2], r[(i + 1) % n][:2]
            dx, dy = x2 - x1, y2 - y1; L = dx * dx + dy * dy
            t = 0 if L == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L))
            if (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2 < tol * tol: return (dx, dy)
    return None


def _orient(rings):
    """Luar = berlawanan jarum jam, lubang = searah (kedalaman genap-ganjil). -> rings, flag dibalik."""
    out, flip = [], []
    for i, r in enumerate(rings):
        x, y = r[0][0], r[0][1]
        depth = sum(1 for j, o in enumerate(rings) if j != i and _inside_set([o], x, y))
        want_ccw = depth % 2 == 0
        f = (_area(r) > 0) != want_ccw
        out.append(r[::-1] if f else list(r)); flip.append(f)
    return out, flip


def _split(ring, others, is_a=True, desc=None, own=None):
    """Potong sisi ring di titik potong / sentuh dengan sisi set lain -> list (p, q, idx sisi asal).
    Titik potong baru (seperti Surpac): z = (2*zA + zB)/3, deskripsi = titik pertama ring harian terakhir."""
    TOL = 1e-9
    OE = [(r[j], r[(j + 1) % len(r)], k) for k, r in enumerate(others) for j in range(len(r))]
    out = []
    n = len(ring)
    for i in range(n):
        p, q = ring[i], ring[(i + 1) % n]
        ts = {0.0: None, 1.0: None}
        ex, ey = q[0] - p[0], q[1] - p[1]; L2 = ex * ex + ey * ey
        if L2 == 0: continue
        bx0, bx1, by0, by1 = min(p[0], q[0]) - 1e-6, max(p[0], q[0]) + 1e-6, min(p[1], q[1]) - 1e-6, max(p[1], q[1]) + 1e-6
        for a, b, ko in OE:
            if max(a[0], b[0]) < bx0 or min(a[0], b[0]) > bx1 or max(a[1], b[1]) < by0 or min(a[1], b[1]) > by1: continue
            d = ex * (b[1] - a[1]) - ey * (b[0] - a[0])
            if abs(d) > 1e-12 * max(1.0, L2):
                t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d
                u = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / d
                if TOL < t < 1 - TOL and -1e-9 <= u <= 1 + 1e-9:
                    uu = min(1.0, max(0.0, u)); zo = a[2] + uu * (b[2] - a[2]); zs = p[2] + t * (q[2] - p[2])
                    ts[t] = ((2 * zs + zo) / 3 if is_a else (2 * zo + zs) / 3, ko if is_a else own)
            else:   # sejajar: titik ujung sisi lain yang terletak di sisi ini
                for w in (a, b):
                    t = ((w[0] - p[0]) * ex + (w[1] - p[1]) * ey) / L2
                    if TOL < t < 1 - TOL and abs((w[0] - p[0]) * ey - (w[1] - p[1]) * ex) / math.sqrt(L2) < 1e-6:
                        ts[t] = (w[2], ko if is_a else own)
        pts = []
        for t in sorted(ts):
            if t == 0.0: pts.append(p)
            elif t == 1.0: pts.append(q)
            else: pts.append((p[0] + t * ex, p[1] + t * ey, ts[t][0], p[3], 'baru', ts[t][1]))
        out += [(u, v, i) for u, v in zip(pts, pts[1:])]
    return out


def boundary_op(A, B, op='tambah'):
    """A, B: list ring (e, n, z, desc). op: 'tambah' (A+B), 'kurangi' (A-B), 'irisan' (A x B).
    Ring A yang tidak tersentuh disalin apa adanya (urutan, titik awal, arah)."""
    A0 = [buka_ring(r) for r in A if len(r) >= 3]; B0 = [buka_ring(r) for r in B if len(r) >= 3]
    A1, fa = _orient(A0); B1, fb = _orient(B0)
    def cls(pieces, other):
        res = []
        for p, q, i in pieces:
            mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
            on = _on_set(other, mx, my)
            if on is not None:
                res.append((p, q, i, 'sama' if on[0] * (q[0] - p[0]) + on[1] * (q[1] - p[1]) > 0 else 'lawan'))
            else:
                res.append((p, q, i, 'dalam' if _inside_set(other, mx, my) else 'luar'))
        return res
    PA = [cls(_split(r, B1, True), B1) for r in A1]
    PB = [cls(_split(r, A1, False, own=k), A1) for k, r in enumerate(B1)]
    keepA = {'tambah': ('luar', 'sama'), 'kurangi': ('luar', 'lawan'), 'irisan': ('dalam', 'sama')}[op]
    keepB = {'tambah': ('luar',), 'kurangi': ('dalam',), 'irisan': ('dalam',)}[op]
    revB = op == 'kurangi'
    hasil = []   # (urutan, ring)
    pieces = []  # (p, q, sumber)
    for k, ps in enumerate(PA):
        utuh = all(c == 'luar' for *_, c in ps) if op != 'irisan' else all(c == 'dalam' for *_, c in ps)
        if utuh and len(ps) == len(A1[k]):
            hasil.append((('A', k), A0[k])); continue
        pieces += [(p, q, ('A', k)) for p, q, i, c in ps if c in keepA]
    for k, ps in enumerate(PB):
        utuh = all(c in keepB for *_, c in ps) and len(ps) == len(B1[k])
        if utuh and not revB:
            hasil.append((('B', k), B0[k])); continue
        for p, q, i, c in ps:
            if c in keepB: pieces.append((q, p, ('B', k)) if revB else (p, q, ('B', k)))
    key = lambda p: (round(p[0], 4), round(p[1], 4))
    nxt = {}
    for pc in pieces: nxt.setdefault(key(pc[0]), []).append(pc)
    used = set()
    # mulai dari titik pertama ring asal kalau masih ada, supaya urutan dan titik awal sama dengan manual
    def prio(pc):
        src = pc[2]; R = (A1 if src[0] == 'A' else B1)[src[1]]
        return (src[0] != 'A', src[1], 0 if key(pc[0]) == key(R[0]) else 1)
    starts = sorted(pieces, key=prio)
    for st in starts:
        if id(st) in used: continue
        ring, cur = [], st
        while cur is not None and id(cur) not in used:
            used.add(id(cur)); ring.append(cur[0])
            cand = [c for c in nxt.get(key(cur[1]), []) if id(c) not in used]
            cur = cand[0] if cand else None
        if len(ring) >= 3:
            src = st[2]
            flip = (fa if src[0] == 'A' else fb)[src[1]]
            if flip: ring = ring[::-1]                      # kembali ke arah asal
            dsc = None
            if src[0] == 'A':
                ring, g = _awal_seperti_surpac(ring, B0, key)
                if g is not None: dsc = B0[g][0][3]     # deskripsi = titik pertama ring harian
            if dsc is not None:
                ring = [(p[0], p[1], p[2], dsc) for p in ring]
            hasil.append((src, ring))
    order = {('A', k): k for k in range(len(A1))}
    order.update({('B', k): len(A1) + k for k in range(len(B1))})
    hasil.sort(key=lambda h: order[h[0]])
    return [[p[:4] for p in r] for _, r in hasil]


def _awal_seperti_surpac(ring, B0, key):
    """Titik awal ring hasil gabungan, seperti Surpac (ring harian digabung satu per satu):
    ring harian terakhir yang menyentuh = g. Kalau titik pertama ring g ada di hasil -> mulai di situ.
    Kalau tidak, telusuri ring g mundur dari titik pertamanya sampai bertemu titik potong -> mulai di situ."""
    kb = [{key(p): j for j, p in enumerate(b)} for b in B0]
    g = None
    for p in ring:
        if len(p) > 4: c = p[5]
        else: c = max((k for k in range(len(B0)) if key(p) in kb[k]), default=None)
        if c is not None and (g is None or c > g): g = c
    if g is None: return ring, None
    kr = [key(p) for p in ring]
    b = B0[g]
    if key(b[0]) in kr:
        j = kr.index(key(b[0])); return ring[j:] + ring[:j], g
    n = len(b)
    for i in range(n - 1, -1, -1):            # sisi b[i] -> b[i+1], mundur dari titik pertama
        u, v = b[i], b[(i + 1) % n]
        dx, dy = v[0] - u[0], v[1] - u[1]; L2 = dx * dx + dy * dy
        if L2 == 0: continue
        best = None
        for j, p in enumerate(ring):
            if len(p) > 4 and p[5] == g:
                t = ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / L2
                if -1e-9 <= t <= 1 + 1e-9 and abs((p[0] - u[0]) * dy - (p[1] - u[1]) * dx) / math.sqrt(L2) < 1e-6:
                    if best is None or t > best[0]: best = (t, j)
        if best: return ring[best[1]:] + ring[:best[1]], g
        if key(u) in kr:
            j = kr.index(key(u)); return ring[j:] + ring[:j], g
    return ring, g


def tulis_boundary(path, nama, tgl, rings, no, head=None, binary=False):
    head = list(head or [nama, tgl, '0', '0'])
    head[0] = nama; head[1] = tgl
    segs = [[(no, p[1], p[0], p[2], p[3]) for p in r + r[:1]] for r in rings]
    tulis(path, head, segs, binary)
