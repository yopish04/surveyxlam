"""Baca/tulis Surpac .str (teks atau biner) dan .dtm (TIN Surpac)."""
import struct, numpy as np

REC = struct.Struct('>iddd')

def is_binary(path):
    with open(path, 'rb') as f:
        f.readline(); f.readline(); b = f.read(64)
    return b[:5] == b'\x00' * 5 or b'\x00' in b

def read_str(path):
    """-> header(str), list of segments; segment = list of (num, n, e, z, desc)."""
    segs, cur = [], []
    with open(path, 'rb') as f:
        head = f.readline().decode('latin1').rstrip('\r\n'); f.readline()
        rest = f.read()
    if is_binary(path):
        pos = 5 if rest[:5] == b'\x00' * 5 else 0
        while pos + REC.size <= len(rest):
            num, y, x, z = REC.unpack_from(rest, pos)
            e = rest.find(b'\x00', pos + REC.size)
            if e < 0: e = len(rest)
            desc = rest[pos + REC.size:e].decode('latin1'); pos = e + 1
            if num == 0:
                if cur: segs.append(cur)
                cur = []
                if desc.strip().endswith('END'): break
            else:
                cur.append((num, y, x, z, desc))
    else:
        for l in rest.decode('latin1').splitlines():
            p = [s.strip() for s in l.split(',')]
            if not p or p[0] == '': continue
            num = int(float(p[0]))
            if num == 0:
                if cur: segs.append(cur)
                cur = []
                if len(p) > 4 and p[4].endswith('END'): break
                continue
            cur.append((num, float(p[1]), float(p[2]), float(p[3]), ','.join(p[4:])))
    if cur: segs.append(cur)
    return head, segs

def write_str(path, head, segs, binary=False):
    axis = '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000'
    if binary:
        with open(path, 'wb') as f:
            f.write((head + '\r\n').encode('latin1')); f.write((axis + '\r\n').encode()); f.write(b'\x00' * 5)
            for s in segs:
                for num, y, x, z, d in s:
                    f.write(REC.pack(num, y, x, z)); f.write(d.encode('latin1')); f.write(b'\x00')
                f.write(REC.pack(0, 0, 0, 0)); f.write(b'\x00')
            f.write(REC.pack(0, 0, 0, 0)); f.write(b'END\x00')
        return
    L = [head, axis]
    for s in segs:
        for num, y, x, z, d in s:
            L.append(f'{num}, {y:.3f}, {x:.3f}, {z:.3f}, {d}')
        L.append('0, 0.000, 0.000, 0.000,')
    L.append('0, 0.000, 0.000, 0.000, END')
    with open(path, 'w', newline='\r\n', encoding='latin1') as f:
        f.write('\n'.join(L) + '\n')

def read_dtm(dtm_path, str_path):
    """TIN Surpac: segitiga merujuk nomor urut titik di file .str (mulai 1).
    -> P (N,3) array [e, n, z], T (M,3) indeks 0-based."""
    _, segs = read_str(str_path)
    # nomor titik di .dtm menghitung juga baris pemisah segmen (0, ...) -> isi NaN
    rows = []
    for s in segs:
        rows += [(r[2], r[1], r[3]) for r in s]; rows.append((np.nan,) * 3)
    P = np.array(rows)
    tris = []; intri = False
    for l in open(dtm_path, encoding='latin1'):
        if l.startswith('TRISOLATION'): intri = True; continue
        if not intri: continue
        p = l.split(',')
        if len(p) >= 4 and p[0].strip().isdigit():
            tris.append((int(p[1]), int(p[2]), int(p[3])))
    return P, np.array(tris) - 1


def read_dtm_any(dtm_path, str_path):
    """.dtm teks atau biner. Biner: baris header, 5 byte nol, string hull seperti .str biner sampai END,
    lalu rekaman: int32 jenis (1=OBJECT, 2=TRISOLATION, 3=segitiga), int32 id, [segitiga: 6 x int32 v1 v2 v3 n1 n2 n3],
    deskripsi diakhiri NUL. -> P (baris .str), T (indeks 0-based)."""
    import struct
    d = open(dtm_path, 'rb').read()
    i = d.index(b'\n') + 1
    if d[i:i + 5] != b'\x00' * 5:
        return read_dtm(dtm_path, str_path)
    _, segs = read_str(str_path)
    rows = []
    for s in segs:
        rows += [(r[2], r[1], r[3]) for r in s]; rows.append((np.nan,) * 3)
    P = np.array(rows)
    p = d.index(b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00END\x00', i) + 32
    tris = []
    n = len(d)
    while p + 8 <= n:
        typ, ident = struct.unpack_from('>ii', d, p); p += 8
        if typ not in (1, 2, 3): break
        if typ == 3:
            v = struct.unpack_from('>6i', d, p); p += 24
            tris.append(v[:3])
        e = d.find(b'\x00', p)
        if e < 0: break
        p = e + 1
    return P, np.array(tris) - 1
