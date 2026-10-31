/* SMA Viewer - update progress: port riset/volume/progres.py (hasil sama dengan add-in Excel dan Python).
   potong(): potong file progress dengan boundary (DALAM = buang titik di dalam, LUAR = buang di luar),
   boundaryOp(): A + B / A - B / irisan dengan aturan Surpac, updateHarian(): alur harian lengkap. */
'use strict';
const PG = (() => {
const EDGE_TOL = 0.01, SPOT = new Set([500, 600, 602]);
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AXIS = '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000';
const lat = (u, a, b) => { let s = ''; for (let i = a; i < b; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, Math.min(b, i + 8192))); return s; };

/* titik = [num, n(y), e(x), z, desc] ; segmen = array titik */
function baca(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  const i1 = u.indexOf(10) + 1, i2 = u.indexOf(10, i1) + 1;
  const head = lat(u, 0, i1).replace(/[\r\n]+$/, '').split(',');
  const axis = lat(u, i1, i2).replace(/[\r\n]+$/, '');
  const binary = u[i2] === 0 && u[i2 + 1] === 0 && u[i2 + 2] === 0 && u[i2 + 3] === 0 && u[i2 + 4] === 0;
  const segs = []; let cur = [];
  if (binary) {
    let pos = i2 + 5;
    while (pos + 28 <= u.length) {
      const num = dv.getInt32(pos), y = dv.getFloat64(pos + 4), x = dv.getFloat64(pos + 12), z = dv.getFloat64(pos + 20);
      const e = u.indexOf(0, pos + 28); const d = lat(u, pos + 28, e); pos = e + 1;
      if (num === 0) { if (cur.length) segs.push(cur); cur = []; if (d.trim() === 'END') break; }
      else cur.push([num, y, x, z, d]);
    }
  } else {
    const lines = lat(u, i2, u.length).split(/\r\n|\r|\n/);
    for (const l of lines) {
      const p = l.split(','); if (p.length < 4) continue;
      const num = Math.trunc(parseFloat(p[0])); if (isNaN(num)) continue;
      if (num === 0) { if (cur.length) segs.push(cur); cur = []; if (p.length > 4 && p[4].trim() === 'END') break; continue; }
      cur.push([num, parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]), p.slice(4).join(',').replace(/^ +/, '')]);
    }
  }
  if (cur.length) segs.push(cur);
  return { head, axis, binary, segs };
}

function f3(v) {                       // seperti Python f'{v:.3f}'
  let s = v.toFixed(3); if (s === '-0.000') s = '-0.000'; return s;
}
function tulis(head, segs, binary, axis = AXIS) {
  const h = head.join(',');
  if (binary) {
    let n = h.length + axis.length + 4 + 5 + 33;
    for (const s of segs) { for (const r of s) n += 29 + r[4].length; n += 29; }
    const buf = new ArrayBuffer(n), u = new Uint8Array(buf), dv = new DataView(buf); let p = 0;
    const put = (str) => { for (let i = 0; i < str.length; i++) u[p++] = str.charCodeAt(i) & 255; };
    const rec = (num, y, x, z) => { dv.setInt32(p, num); dv.setFloat64(p + 4, y); dv.setFloat64(p + 12, x); dv.setFloat64(p + 20, z); p += 28; };
    put(h + '\r\n' + axis + '\r\n'); p += 5;
    for (const s of segs) { for (const r of s) { rec(r[0], r[1], r[2], r[3]); put(r[4]); u[p++] = 0; } rec(0, 0, 0, 0); u[p++] = 0; }
    rec(0, 0, 0, 0); put('END'); u[p++] = 0;
    return u.subarray(0, p);
  }
  const L = [h, axis];
  for (const s of segs) { for (const r of s) L.push(`${r[0]}, ${f3(r[1])}, ${f3(r[2])}, ${f3(r[3])}, ${r[4]}`); L.push('0, 0.000, 0.000, 0.000,'); }
  L.push('0, 0.000, 0.000, 0.000, END');
  const t = L.join('\r\n') + '\r\n', u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i) & 255;
  return u;
}

/* ---------- tanggal / nama ---------- */
function tglDariNama(b, head) {
  let m = b.match(/^(\d{4})_(\d{2})_(\d{2})/); if (m) return [+m[1], +m[2], +m[3]];
  m = b.match(/^(\d{2})(\d{2})(\d{4})(?!\d)/); if (m) return [+m[3], +m[2], +m[1]];
  m = b.match(/^(\d{2})(\d{2})(\d{2})(?!\d)/); if (m) return [2000 + +m[3], +m[2], +m[1]];
  if (head && head.length > 1) { m = head[1].match(/^\s*(\d{1,2})-(\w{3})-(\d{2})/); if (m) { const k = BULAN.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()); if (k >= 0) return [2000 + +m[3], k + 1, +m[1]]; } }
  return null;
}
function tglTeks(v, b, head) {          // "auto" / 2026-10-27 / 27/10/2026 / 20261027 / 27-Oct-26
  v = String(v || '').trim();
  let m;
  if ((m = v.match(/^(20\d{2})(\d{2})(\d{2})$/))) return [+m[1], +m[2], +m[3]];
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return [+m[1], +m[2], +m[3]];
  if ((m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return [+m[3], +m[2], +m[1]];
  if ((m = v.match(/^(\d{1,2})-(\w{3})-(\d{2,4})$/))) { const k = BULAN.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()); if (k >= 0) return [2000 + (+m[3] % 100), k + 1, +m[1]]; }
  if (v && v.toLowerCase() !== 'auto') return null;
  return tglDariNama(b, head);
}
const p2 = (n) => String(n).padStart(2, '0');
const tglSurpac = (d) => `${p2(d[2])}-${BULAN[d[1] - 1]}-${p2(d[0] % 100)}`;
function namaTanggal(nama, d) {
  const i = nama.lastIndexOf('.'), base = i > 0 ? nama.slice(0, i) : nama, ext = i > 0 ? nama.slice(i) : '';
  const t = `${d[0]}_${p2(d[1])}_${p2(d[2])}`;
  if (/^\d{4}_\d{2}_\d{2}/.test(base)) return t + base.slice(10) + ext;
  if (/^\d{8}(?!\d)/.test(base)) return `${p2(d[2])}${p2(d[1])}${d[0]}` + base.slice(8) + ext;
  if (/^\d{6}(?!\d)/.test(base)) return `${p2(d[2])}${p2(d[1])}${p2(d[0] % 100)}` + base.slice(6) + ext;
  return t + '_' + base + ext;
}
function kepala(head, nama, tgl) { const h = head.concat(['0', '0']); return [nama, tgl].concat(h.slice(2, Math.max(4, head.length))); }

/* ---------- geometri ---------- */
class Bdy {
  constructor(rings, band = 5.0) {
    this.rings = rings.filter((r) => r.length >= 3); this.E = [];
    for (const r of this.rings) { const n = r.length; for (let i = 0; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; if (p[0] !== q[0] || p[1] !== q[1]) this.E.push([p[0], p[1], q[0], q[1]]); } }
    this.x0 = Infinity; this.x1 = -Infinity; this.y0 = Infinity; this.y1 = -Infinity;
    for (const e of this.E) { this.x0 = Math.min(this.x0, e[0], e[2]); this.x1 = Math.max(this.x1, e[0], e[2]); this.y0 = Math.min(this.y0, e[1], e[3]); this.y1 = Math.max(this.y1, e[1], e[3]); }
    this.band = band; this.idx = new Map();
    this.E.forEach(([x1, y1, x2, y2], k) => {
      for (let b = Math.floor((Math.min(y1, y2) - EDGE_TOL - this.y0) / band); b <= Math.floor((Math.max(y1, y2) + EDGE_TOL - this.y0) / band); b++) { let l = this.idx.get(b); if (!l) this.idx.set(b, l = []); l.push(k); }
    });
  }
  status(x, y) {
    if (x < this.x0 - EDGE_TOL || x > this.x1 + EDGE_TOL || y < this.y0 - EDGE_TOL || y > this.y1 + EDGE_TOL) return 0;
    let c = false;
    for (const k of this.idx.get(Math.floor((y - this.y0) / this.band)) || []) {
      const [x1, y1, x2, y2] = this.E[k], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
      let t = ((x - x1) * dx + (y - y1) * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
      if ((x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2 <= EDGE_TOL * EDGE_TOL) return 1;
      if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * dx / dy) c = !c;
    }
    return c ? 1 : 0;
  }
  jarak(x, y, maks) {
    let best = maks * maks + 1;
    for (let b = Math.floor((y - maks - this.y0) / this.band); b <= Math.floor((y + maks - this.y0) / this.band); b++) {
      for (const k of this.idx.get(b) || []) {
        const [x1, y1, x2, y2] = this.E[k], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L));
        best = Math.min(best, (x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2);
      }
    }
    return Math.sqrt(best);
  }
  potongRuas(p, q) {
    let best = null;
    for (const [x1, y1, x2, y2] of this.E) {
      const d = (q[0] - p[0]) * (y2 - y1) - (q[1] - p[1]) * (x2 - x1);
      if (Math.abs(d) < 1e-12) continue;
      const t = ((x1 - p[0]) * (y2 - y1) - (y1 - p[1]) * (x2 - x1)) / d, u = ((x1 - p[0]) * (q[1] - p[1]) - (y1 - p[1]) * (q[0] - p[0])) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) best = t;
    }
    return best;
  }
}
const ringsDari = (segs, no) => segs.filter((s) => s[0][0] === no && s.length >= 3).map((s) => s.map((r) => [r[2], r[1], r[3], r[4]]));
function bukaRing(r) { if (r.length > 1 && Math.abs(r[0][0] - r[r.length - 1][0]) < 1e-9 && Math.abs(r[0][1] - r[r.length - 1][1]) < 1e-9) return r.slice(0, -1); return r; }

/* ---------- 1. potong ---------- */
function potong(progres, boundaries, mode = 'dalam', harian = [], strBdyHarian = null, titikPotong = false, cek = 2.0, sambung = 0) {
  const B = boundaries.map(([b, no]) => new Bdy(ringsDari(b.segs, no).map(bukaRing))).filter((b) => b.rings.length);
  const dalam = (x, y) => B.some((b) => b.status(x, y));
  const buang = mode === 'dalam' ? dalam : (x, y) => !dalam(x, y);
  const st = { titik_awal: 0, titik_dibuang: 0, titik_potong: 0, titik_harian: 0, sambungan: 0 };
  let out = []; const cekl = [], sisa = [];
  for (const s of progres.segs) {
    st.titik_awal += s.length;
    const flags = s.map((r) => buang(r[2], r[1]));
    if (!flags.some(Boolean)) { out.push(s); continue; }
    const nb = flags.filter(Boolean).length; st.titik_dibuang += nb;
    const garis = s.length > 1 && !SPOT.has(s[0][0]);
    const pieces = []; let cur = [];
    s.forEach((r, i) => {
      if (flags[i]) { if (cur.length) { if (titikPotong && garis) cur.push(titikPada(B, cur[cur.length - 1], r)); pieces.push(cur); cur = []; } }
      else { if (!cur.length && i > 0 && titikPotong && garis && flags[i - 1]) cur.push(titikPada(B, r, s[i - 1])); cur.push(r); }
    });
    if (cur.length) pieces.push(cur);
    if (garis) for (const p of pieces) { const uj = []; if (p[0] !== s[0]) uj.push(0); if (p[p.length - 1] !== s[s.length - 1]) uj.push(1); if (uj.length) sisa.push([p, uj]); }
    if (titikPotong && garis) st.titik_potong += pieces.reduce((a, p) => a + p.length, 0) - (s.length - nb);
    out.push(...pieces);
    if (garis && cek && mode === 'dalam') {
      for (const p of pieces) {
        const ends = p[0] === p[p.length - 1] ? [p[0]] : [p[0], p[p.length - 1]];
        for (const r of ends) { if (r[4].startsWith('POTONG')) continue; if (Math.min(...B.map((b) => b.jarak(r[2], r[1], cek))) <= cek) cekl.push(r); }
      }
    }
  }
  let add = [];
  for (const h of harian) add = add.concat(h.segs.filter((s) => s[0][0] !== strBdyHarian));
  st.titik_harian = add.reduce((a, s) => a + s.length, 0);
  if (sambung > 0 && add.length && sisa.length) [out, add, st.sambungan] = sambungFn(out, add, sisa, sambung);
  if (add.length) {
    const nums = [...new Set(out.map((s) => s[0][0]).concat(add.map((s) => s[0][0])))].sort((a, b) => a - b);
    const byOld = new Map(), byAdd = new Map();
    for (const s of out) { if (!byOld.has(s[0][0])) byOld.set(s[0][0], []); byOld.get(s[0][0]).push(s); }
    for (const s of add) { if (!byAdd.has(s[0][0])) byAdd.set(s[0][0], []); byAdd.get(s[0][0]).push(s); }
    const urut = out.every((s, i) => i === 0 || out[i - 1][0][0] <= s[0][0]);
    out = urut ? nums.flatMap((n) => (byAdd.get(n) || []).concat(byOld.get(n) || [])) : out.concat(add);
  }
  st.titik_akhir = out.reduce((a, s) => a + s.length, 0);
  return { segs: out, st, cekl };
}
function sambungFn(out, add, sisa, jarak) {
  const cand = [];
  add.forEach((d, di) => {
    if (d.length < 2 || SPOT.has(d[0][0])) return;
    for (const de of [0, 1]) {
      const pd = de === 0 ? d[0] : d[d.length - 1];
      sisa.forEach(([o, uj], oi) => { if (o[0][0] !== d[0][0]) return; for (const oe of uj) { const po = oe === 0 ? o[0] : o[o.length - 1]; const dist = Math.hypot(pd[1] - po[1], pd[2] - po[2]); if (dist <= jarak) cand.push([dist, di, de, oi, oe]); } });
    }
  });
  cand.sort((a, b) => { for (let i = 0; i < 5; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
  const usedD = new Set(), usedOld = new Set(), ext = new Map(); let n = 0;
  for (const [, di, de, oi, oe] of cand) {
    if (usedD.has(di + ',' + de) || usedOld.has(oi)) continue;
    usedD.add(di + ',' + de); usedOld.add(oi);
    const o = sisa[oi][0], seq = oe === (de === 0 ? 1 : 0) ? o : o.slice().reverse();
    if (!ext.has(di)) ext.set(di, [[], []]); ext.get(di)[de] = seq; n++;
  }
  const hapus = new Set([...usedOld].map((oi) => sisa[oi][0]));
  out = out.filter((s) => !hapus.has(s));
  const na = add.map((d, di) => { if (!ext.has(di)) return d; const [a, b] = ext.get(di), num = d[0][0]; return a.map((x) => [num, ...x.slice(1)]).concat(d, b.map((x) => [num, ...x.slice(1)])); });
  return [out, na, n];
}
function titikPada(B, keep, gone) {
  let best = null;
  for (const b of B) { const t = b.potongRuas([keep[2], keep[1]], [gone[2], gone[1]]); if (t !== null && (best === null || t < best)) best = t; }
  const t = best === null ? 0 : best;
  return [keep[0], keep[1] + t * (gone[1] - keep[1]), keep[2] + t * (gone[2] - keep[2]), keep[3] + t * (gone[3] - keep[3]), 'POTONG,' + keep[4]];
}

/* ---------- 2. boundary ---------- */
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
function insideSet(rings, x, y) {
  let c = false;
  for (const r of rings) { const n = r.length; for (let i = 0; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n]; if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) c = !c; } }
  return c;
}
function onSet(rings, x, y, tol = 1e-4) {
  for (const r of rings) {
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
      const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L));
      if ((x1 + t * dx - x) ** 2 + (y1 + t * dy - y) ** 2 < tol * tol) return [dx, dy];
    }
  }
  return null;
}
function orientRings(rings) {
  const out = [], flip = [];
  rings.forEach((r, i) => {
    const x = r[0][0], y = r[0][1];
    const depth = rings.filter((o, j) => j !== i && insideSet([o], x, y)).length;
    const f = (area(r) > 0) !== (depth % 2 === 0);
    out.push(f ? r.slice().reverse() : r.slice()); flip.push(f);
  });
  return [out, flip];
}
function split(ring, others, isA, own) {
  const TOL = 1e-9, OE = [];
  others.forEach((r, k) => { for (let j = 0; j < r.length; j++) OE.push([r[j], r[(j + 1) % r.length], k]); });
  const out = [], n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const ts = new Map([[0, null], [1, null]]);
    const ex = q[0] - p[0], ey = q[1] - p[1], L2 = ex * ex + ey * ey;
    if (L2 === 0) continue;
    const bx0 = Math.min(p[0], q[0]) - 1e-6, bx1 = Math.max(p[0], q[0]) + 1e-6, by0 = Math.min(p[1], q[1]) - 1e-6, by1 = Math.max(p[1], q[1]) + 1e-6;
    for (const [a, b, ko] of OE) {
      if (Math.max(a[0], b[0]) < bx0 || Math.min(a[0], b[0]) > bx1 || Math.max(a[1], b[1]) < by0 || Math.min(a[1], b[1]) > by1) continue;
      const d = ex * (b[1] - a[1]) - ey * (b[0] - a[0]);
      if (Math.abs(d) > 1e-12 * Math.max(1.0, L2)) {
        const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / d;
        if (TOL < t && t < 1 - TOL && u >= -1e-9 && u <= 1 + 1e-9) {
          const uu = Math.min(1, Math.max(0, u)), zo = a[2] + uu * (b[2] - a[2]), zs = p[2] + t * (q[2] - p[2]);
          ts.set(t, [isA ? (2 * zs + zo) / 3 : (2 * zo + zs) / 3, isA ? ko : own]);
        }
      } else {
        for (const w of [a, b]) {
          const t = ((w[0] - p[0]) * ex + (w[1] - p[1]) * ey) / L2;
          if (TOL < t && t < 1 - TOL && Math.abs((w[0] - p[0]) * ey - (w[1] - p[1]) * ex) / Math.sqrt(L2) < 1e-6) ts.set(t, [w[2], isA ? ko : own]);
        }
      }
    }
    const pts = [...ts.keys()].sort((a, b) => a - b).map((t) => t === 0 ? p : t === 1 ? q : [p[0] + t * ex, p[1] + t * ey, ts.get(t)[0], p[3], 'baru', ts.get(t)[1]]);
    for (let k = 0; k + 1 < pts.length; k++) out.push([pts[k], pts[k + 1], i]);
  }
  return out;
}
const key = (p) => (Math.round(p[0] * 1e4) / 1e4) + ',' + (Math.round(p[1] * 1e4) / 1e4);
function boundaryOp(A, B, op = 'tambah') {
  const A0 = A.filter((r) => r.length >= 3).map(bukaRing), B0 = B.filter((r) => r.length >= 3).map(bukaRing);
  const [A1, fa] = orientRings(A0), [B1, fb] = orientRings(B0);
  const cls = (pieces, other) => pieces.map(([p, q, i]) => {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, on = onSet(other, mx, my);
    if (on) return [p, q, i, on[0] * (q[0] - p[0]) + on[1] * (q[1] - p[1]) > 0 ? 'sama' : 'lawan'];
    return [p, q, i, insideSet(other, mx, my) ? 'dalam' : 'luar'];
  });
  const PA = A1.map((r) => cls(split(r, B1, true), B1)), PB = B1.map((r, k) => cls(split(r, A1, false, k), A1));
  const keepA = { tambah: ['luar', 'sama'], kurangi: ['luar', 'lawan'], irisan: ['dalam', 'sama'] }[op];
  const keepB = { tambah: ['luar'], kurangi: ['dalam'], irisan: ['dalam'] }[op];
  const revB = op === 'kurangi';
  const hasil = [], pieces = [];
  PA.forEach((ps, k) => {
    const utuh = op !== 'irisan' ? ps.every((x) => x[3] === 'luar') : ps.every((x) => x[3] === 'dalam');
    if (utuh && ps.length === A1[k].length) { hasil.push([['A', k], A0[k]]); return; }
    for (const [p, q, , c] of ps) if (keepA.includes(c)) pieces.push([p, q, ['A', k]]);
  });
  PB.forEach((ps, k) => {
    const utuh = ps.every((x) => keepB.includes(x[3])) && ps.length === B1[k].length;
    if (utuh && !revB) { hasil.push([['B', k], B0[k]]); return; }
    for (const [p, q, , c] of ps) if (keepB.includes(c)) pieces.push(revB ? [q, p, ['B', k]] : [p, q, ['B', k]]);
  });
  const nxt = new Map();
  for (const pc of pieces) { const k = key(pc[0]); if (!nxt.has(k)) nxt.set(k, []); nxt.get(k).push(pc); }
  const used = new Set();
  const prio = (pc) => { const src = pc[2], R = (src[0] === 'A' ? A1 : B1)[src[1]]; return [src[0] !== 'A' ? 1 : 0, src[1], key(pc[0]) === key(R[0]) ? 0 : 1]; };
  const starts = pieces.map((pc) => [prio(pc), pc]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a[0][2] - b[0][2]).map((x) => x[1]);
  for (const s0 of starts) {
    if (used.has(s0)) continue;
    let ring = [], cur = s0;
    while (cur && !used.has(cur)) {
      used.add(cur); ring.push(cur[0]);
      const cand = (nxt.get(key(cur[1])) || []).filter((c) => !used.has(c));
      cur = cand.length ? cand[0] : null;
    }
    if (ring.length >= 3) {
      const src = s0[2], flip = (src[0] === 'A' ? fa : fb)[src[1]];
      if (flip) ring = ring.reverse();
      let dsc = null;
      if (src[0] === 'A') { let g; [ring, g] = awalSurpac(ring, B0); if (g !== null) dsc = B0[g][0][3]; }
      if (dsc !== null) ring = ring.map((p) => [p[0], p[1], p[2], dsc]);
      hasil.push([src, ring]);
    }
  }
  const order = (s) => s[0] === 'A' ? s[1] : A1.length + s[1];
  hasil.sort((a, b) => order(a[0]) - order(b[0]));
  return hasil.map(([, r]) => r.map((p) => p.slice(0, 4)));
}
function awalSurpac(ring, B0) {
  const kb = B0.map((b) => { const m = new Map(); b.forEach((p, j) => m.set(key(p), j)); return m; });
  let g = null;
  for (const p of ring) {
    let c;
    if (p.length > 4) c = p[5];
    else { c = null; for (let k = 0; k < B0.length; k++) if (kb[k].has(key(p))) c = c === null ? k : Math.max(c, k); }
    if (c !== null && c !== undefined && (g === null || c > g)) g = c;
  }
  if (g === null) return [ring, null];
  const kr = ring.map(key), b = B0[g];
  const rot = (j) => ring.slice(j).concat(ring.slice(0, j));
  if (kr.includes(key(b[0]))) return [rot(kr.indexOf(key(b[0]))), g];
  const n = b.length;
  for (let i = n - 1; i >= 0; i--) {
    const u = b[i], v = b[(i + 1) % n], dx = v[0] - u[0], dy = v[1] - u[1], L2 = dx * dx + dy * dy;
    if (L2 === 0) continue;
    let best = null;
    ring.forEach((p, j) => {
      if (p.length > 4 && p[5] === g) {
        const t = ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / L2;
        if (t >= -1e-9 && t <= 1 + 1e-9 && Math.abs((p[0] - u[0]) * dy - (p[1] - u[1]) * dx) / Math.sqrt(L2) < 1e-6) if (best === null || t > best[0]) best = [t, j];
      }
    });
    if (best) return [rot(best[1]), g];
    if (kr.includes(key(u))) return [rot(kr.indexOf(key(u))), g];
  }
  return [ring, g];
}

/* ---------- alur (sama dengan VBA PotongProgres / BoundaryOp / UpdateHarian) ---------- */
const baseName = (n) => n.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
function jalankanPotong(g, gName, bds, bdyNo, mode, hr, outName, tgl, titikPotong = false, cek = 2.0) {
  const r = potong(g, bds.map((b) => [b, bdyNo]), mode, hr, bdyNo, titikPotong, mode === 'dalam' ? cek : 0);
  const nama = baseName(outName), ts = tglSurpac(tgl);
  const files = [{ name: nama + '.str', data: tulis(kepala(g.head, nama, ts), r.segs, g.binary, g.axis) }];
  if (r.cekl.length) files.push({ name: nama + '_CEK.str', data: tulis([nama + '_CEK', ts, '0', '0'], r.cekl.map((x) => [[9006, x[1], x[2], x[3], 'CEK,' + x[4]]]), false) });
  return { files, st: r.st, cek: r.cekl.length };
}
function jalankanBdy(a, aNo, bList, bNo, op, outName, tgl, outNo) {
  let B = []; for (const b of bList) B = B.concat(ringsDari(b.segs, bNo));
  const R = boundaryOp(ringsDari(a.segs, aNo), B, op);
  const nama = baseName(outName), ts = tglSurpac(tgl), head = kepala(a.head, nama, ts);
  head[0] = nama; head[1] = ts;
  const no = outNo || aNo;
  const segs = R.map((r) => r.concat([r[0]]).map((p) => [no, p[1], p[0], p[2], p[3]]));
  return { files: [{ name: nama + '.str', data: tulis(head, segs, a.binary, a.axis) }], rings: R.length };
}
/* global lama dipotong boundary harian (DALAM) + string harian; bdy lama + bdy harian */
function updateHarian(g, gName, bdyLama, bdyLamaName, bdyNo, harian, harianNames, harianBdyNo, tglIn) {
  const tgl = tglTeks(tglIn, baseName(harianNames[0] || ''), harian[0] && harian[0].head);
  if (!tgl) throw new Error('Tanggal tidak ditemukan; isi tanggal');
  const outG = namaTanggal(baseName(gName) + '.str', tgl);
  const r1 = jalankanPotong(g, gName, harian, harianBdyNo, 'dalam', harian, outG, tgl, false, 2.0);
  let r2 = null;
  if (bdyLama) r2 = jalankanBdy(bdyLama, bdyNo, harian, harianBdyNo, 'tambah', namaTanggal(baseName(bdyLamaName) + '.str', tgl), tgl, bdyNo);
  return { tgl, files: r1.files.concat(r2 ? r2.files : []), st: r1.st, cek: r1.cek, rings: r2 ? r2.rings : 0 };
}

return { baca, tulis, potong, boundaryOp, ringsDari, jalankanPotong, jalankanBdy, updateHarian, tglTeks, namaTanggal, tglSurpac, baseName };
})();
if (typeof module !== 'undefined') module.exports = PG;
