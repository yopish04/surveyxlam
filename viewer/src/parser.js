/* SMA Viewer - pembaca file Surpac (.str/.dtm teks & biner) dan ESRI .shp.
   Dipakai di Web Worker dan di thread utama (cadangan), juga di uji Node.
   Hasil str: { kind:'str', head, rows, x,y,z (Float64, baris pemisah = NaN), sn (Int32 nomor string, 0 = pemisah),
               descBuf (Uint8 latin1), descOff (Uint32, rows+1) }
   Hasil dtm: { kind:'dtm', strName, tris (Int32, indeks baris .str 0-based, 3 per segitiga), objects } */
'use strict';

function _lineEnd(u, p) { while (p < u.length && u[p] !== 10) p++; return p; }
function _latin1(u, a, b) {
  let s = '';
  for (let i = a; i < b; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, Math.min(b, i + 8192)));
  return s;
}

class RowBuf {
  constructor(cap) { this.n = 0; this.cap = cap; this.x = new Float64Array(cap); this.y = new Float64Array(cap); this.z = new Float64Array(cap); this.sn = new Int32Array(cap); this.dOff = new Uint32Array(cap + 1); this.dBuf = new Uint8Array(cap * 8); this.dLen = 0; }
  grow() {
    const c = this.cap * 2;
    for (const k of ['x', 'y', 'z']) { const a = new Float64Array(c); a.set(this[k]); this[k] = a; }
    const s = new Int32Array(c); s.set(this.sn); this.sn = s;
    const o = new Uint32Array(c + 1); o.set(this.dOff); this.dOff = o; this.cap = c;
  }
  push(sn, y, x, z, u, da, db) {
    if (this.n >= this.cap) this.grow();
    const i = this.n++;
    this.sn[i] = sn; this.y[i] = y; this.x[i] = x; this.z[i] = z;
    const L = db - da;
    if (this.dLen + L > this.dBuf.length) { const b = new Uint8Array(Math.max(this.dBuf.length * 2, this.dLen + L + 1024)); b.set(this.dBuf.subarray(0, this.dLen)); this.dBuf = b; }
    if (L > 0) { this.dBuf.set(u.subarray(da, db), this.dLen); this.dLen += L; }
    this.dOff[i + 1] = this.dLen;
  }
  sep() {   // pemisah segmen = satu baris (dihitung oleh nomor titik di .dtm); pemisah ganda diabaikan
    if (this.n === 0 || this.sn[this.n - 1] === 0) return;
    this.push(0, NaN, NaN, NaN, null, 0, 0);
  }
  done(head) {
    if (this.n > 0 && this.sn[this.n - 1] !== 0) this.sep();
    const n = this.n;
    return { kind: 'str', head, rows: n, x: this.x.slice(0, n), y: this.y.slice(0, n), z: this.z.slice(0, n), sn: this.sn.slice(0, n), descOff: this.dOff.slice(0, n + 1), descBuf: this.dBuf.slice(0, this.dLen) };
  }
}

/* rekaman biner Surpac: int32 BE nomor, float64 BE y, x, z, deskripsi diakhiri NUL; nomor 0 = pemisah, deskripsi END = selesai */
function _parseBinRecords(u, dv, p, R) {
  const n = u.length;
  while (p + 28 <= n) {
    const num = dv.getInt32(p, false);
    const y = dv.getFloat64(p + 4, false), x = dv.getFloat64(p + 12, false), z = dv.getFloat64(p + 20, false);
    let e = p + 28; while (e < n && u[e] !== 0) e++;
    if (num === 0) {
      R.sep();
      if (e - p - 28 >= 3 && u[e - 3] === 69 && u[e - 2] === 78 && u[e - 1] === 68) return e + 1;   // END
    } else R.push(num, y, x, z, u, p + 28, e);
    p = e + 1;
  }
  return p;
}

/* baris teks: nomor, y, x, z, deskripsi... */
function _parseTextRows(u, p, R, stopAtTri) {
  const n = u.length;
  while (p < n) {
    const e = _lineEnd(u, p);
    let b = e; if (b > p && u[b - 1] === 13) b--;
    if (b > p) {
      if (stopAtTri && (u[p] === 79 || u[p] === 84)) return p;     // OBJECT / TRISOLATION
      const c = [];               // posisi koma
      for (let i = p; i < b && c.length < 4; i++) if (u[i] === 44) c.push(i);
      const f0 = _latin1(u, p, c.length ? c[0] : b).trim();
      if (f0 !== '') {
        const num = Math.trunc(parseFloat(f0));
        if (num === 0) {
          R.sep();
          if (c.length >= 4 && _latin1(u, c[3] + 1, b).trim().endsWith('END')) return e + 1;
        } else if (c.length >= 3) {
          const y = parseFloat(_latin1(u, c[0] + 1, c[1])), x = parseFloat(_latin1(u, c[1] + 1, c[2]));
          const z = parseFloat(_latin1(u, c[2] + 1, c.length >= 4 ? c[3] : b));
          let da = c.length >= 4 ? c[3] + 1 : b;
          while (da < b && u[da] === 32) da++;
          let db = b; while (db > da && u[db - 1] === 32) db--;
          R.push(num, y, x, z, u, da, db);
        }
      }
    }
    p = e + 1;
  }
  return p;
}

function parseStr(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  const e1 = _lineEnd(u, 0), head = _latin1(u, 0, e1).replace(/\r$/, '');
  const e2 = _lineEnd(u, e1 + 1);
  let p = e2 + 1;
  const R = new RowBuf(Math.max(1024, Math.floor(u.length / 40)));
  const probe = u.subarray(p, Math.min(u.length, p + 64));
  const bin = (probe.length >= 5 && probe[0] === 0 && probe[1] === 0 && probe[2] === 0 && probe[3] === 0 && probe[4] === 0) || probe.indexOf(0) >= 0;
  if (bin) {
    if (u[p] === 0 && u[p + 1] === 0 && u[p + 2] === 0 && u[p + 3] === 0 && u[p + 4] === 0) p += 5;
    _parseBinRecords(u, dv, p, R);
  } else _parseTextRows(u, p, R, false);
  const r = R.done(head); r.binary = bin; return r;
}

function parseDtm(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  const e1 = _lineEnd(u, 0), head = _latin1(u, 0, e1).replace(/\r$/, '');
  const strName = head.split(',')[0].trim();
  let p = e1 + 1;
  let tris = new Int32Array(1 << 16), nt = 0, objects = 0;
  const addTri = (a, b, c) => {
    if (nt + 3 > tris.length) { const t = new Int32Array(tris.length * 2); t.set(tris); tris = t; }
    tris[nt++] = a - 1; tris[nt++] = b - 1; tris[nt++] = c - 1;
  };
  const bin = u[p] === 0 && u[p + 1] === 0 && u[p + 2] === 0 && u[p + 3] === 0 && u[p + 4] === 0;
  if (bin) {
    p = _parseBinRecords(u, dv, p + 5, new RowBuf(1024));          // string hull, dilewati
    const n = u.length;
    while (p + 8 <= n) {
      const typ = dv.getInt32(p, false); p += 8;
      if (typ !== 1 && typ !== 2 && typ !== 3) break;
      if (typ === 1) objects++;
      if (typ === 3) { addTri(dv.getInt32(p, false), dv.getInt32(p + 4, false), dv.getInt32(p + 8, false)); p += 24; }
      while (p < n && u[p] !== 0) p++;
      p++;
    }
  } else {
    p = _parseTextRows(u, p, new RowBuf(1024), true);              // hull
    const n = u.length;
    let inTri = false;
    while (p < n) {
      const e = _lineEnd(u, p);
      const c0 = u[p];
      if (c0 === 79) { objects++; inTri = false; }                 // OBJECT
      else if (c0 === 84) inTri = true;                            // TRISOLATION
      else if (c0 === 69) break;                                   // END
      else if (inTri && c0 >= 48 && c0 <= 57) {
        const f = _latin1(u, p, Math.min(e, p + 200)).split(',');
        if (f.length >= 4) addTri(parseInt(f[1]), parseInt(f[2]), parseInt(f[3]));
      }
      p = e + 1;
    }
  }
  return { kind: 'dtm', head, strName, binary: bin, objects, tris: tris.slice(0, nt) };
}

/* ESRI shapefile (.shp): titik, polyline, polygon, multipoint (+Z/M). Hasil seperti str: tiap part = segmen, string 1. */
function parseShp(buf) {
  const dv = new DataView(buf), n = buf.byteLength;
  const R = new RowBuf(1024);
  let p = 100, rec = 0;
  while (p + 12 <= n) {
    const len = dv.getInt32(p + 4, false) * 2; const b = p + 8; p = b + len;
    const t = dv.getInt32(b, true); rec++;
    const hasZ = t === 11 || t === 13 || t === 15 || t === 18;
    if (t === 1 || t === 11 || t === 21) {
      R.push(rec, dv.getFloat64(b + 12, true), dv.getFloat64(b + 4, true), t === 11 ? dv.getFloat64(b + 20, true) : 0, null, 0, 0); R.sep();
    } else if (t === 3 || t === 5 || t === 13 || t === 15 || t === 23 || t === 25) {
      const np = dv.getInt32(b + 36, true), npt = dv.getInt32(b + 40, true);
      const parts = []; for (let i = 0; i < np; i++) parts.push(dv.getInt32(b + 44 + 4 * i, true));
      const xy = b + 44 + 4 * np, zb = xy + 16 * npt + 16;
      for (let k = 0; k < np; k++) {
        const a = parts[k], e = k + 1 < np ? parts[k + 1] : npt;
        for (let i = a; i < e; i++) R.push(rec, dv.getFloat64(xy + 16 * i + 8, true), dv.getFloat64(xy + 16 * i, true), hasZ ? dv.getFloat64(zb + 8 * i, true) : 0, null, 0, 0);
        R.sep();
      }
    } else if (t === 8 || t === 18 || t === 28) {
      const npt = dv.getInt32(b + 36, true), xy = b + 40, zb = xy + 16 * npt + 16;
      for (let i = 0; i < npt; i++) { R.push(rec, dv.getFloat64(xy + 16 * i + 8, true), dv.getFloat64(xy + 16 * i, true), hasZ ? dv.getFloat64(zb + 8 * i, true) : 0, null, 0, 0); R.sep(); }
    }
  }
  const r = R.done('shp'); r.shp = true; return r;
}

function parseAny(name, buf) {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'dtm') return parseDtm(buf);
  if (ext === 'shp') return parseShp(buf);
  return parseStr(buf);
}

function transferList(r) {
  const t = [];
  for (const k of ['x', 'y', 'z', 'sn', 'descOff', 'descBuf', 'tris']) if (r[k]) t.push(r[k].buffer);
  return t;
}

if (typeof module !== 'undefined') module.exports = { parseStr, parseDtm, parseShp, parseAny };
