/* SMA Viewer - CREATE DTM: Delaunay (sweep-hull) + breakline dipaksa (Sloan), meniru riset/volume/cdt2.py
   yang identik dengan TIN Surpac di LD03.
   Aturan: string boundary (default 1) tidak dipakai; string spot = titik saja; segmen lain = breakline;
   titik kembar (dibulatkan mm) memakai kemunculan pertama; breakline yang memotong breakline terpasang dilewati;
   breakline yang melewati titik lain dipecah di titik itu. */
'use strict';

function orient(X, a, b, c) {
  return (X[2 * b] - X[2 * a]) * (X[2 * c + 1] - X[2 * a + 1]) - (X[2 * b + 1] - X[2 * a + 1]) * (X[2 * c] - X[2 * a]);
}
function inCircleDet(X, a, b, c, d) {      // > 0: d di dalam lingkaran abc (abc CCW)
  const ax = X[2 * a] - X[2 * d], ay = X[2 * a + 1] - X[2 * d + 1];
  const bx = X[2 * b] - X[2 * d], by = X[2 * b + 1] - X[2 * d + 1];
  const cx = X[2 * c] - X[2 * d], cy = X[2 * c + 1] - X[2 * d + 1];
  return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
}

/* ---------- Delaunay sweep-hull. X = Float64Array [x0,y0,x1,y1,...] tanpa titik kembar ---------- */
function delaunay(X, tie = true) {
  const n = X.length >> 1;
  const maxT = Math.max(2 * n - 5, 1);
  let T = new Int32Array(maxT * 3), H = new Int32Array(maxT * 3), tl = 0;
  const hullPrev = new Int32Array(n), hullNext = new Int32Array(n), hullTri = new Int32Array(n);
  const hashSize = Math.ceil(Math.sqrt(n)), hullHash = new Int32Array(hashSize).fill(-1);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const x = X[2 * i], y = X[2 * i + 1]; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
  const d2 = (i, x, y) => { const dx = X[2 * i] - x, dy = X[2 * i + 1] - y; return dx * dx + dy * dy; };
  let i0 = 0, i1 = 0, i2 = 0, md = Infinity;
  for (let i = 0; i < n; i++) { const d = d2(i, cx0, cy0); if (d < md) { i0 = i; md = d; } }
  const i0x = X[2 * i0], i0y = X[2 * i0 + 1];
  md = Infinity;
  for (let i = 0; i < n; i++) { if (i === i0) continue; const d = d2(i, i0x, i0y); if (d < md && d > 0) { i1 = i; md = d; } }
  const circR = (ax, ay, bx, by, cx, cy) => {
    const dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay, bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
    const x = (ey * bl - dy * cl) * d, y = (dx * cl - ex * bl) * d; return x * x + y * y;
  };
  let mr = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    const r = circR(i0x, i0y, X[2 * i1], X[2 * i1 + 1], X[2 * i], X[2 * i + 1]);
    if (r < mr) { i2 = i; mr = r; }
  }
  if (mr === Infinity) return { triangles: new Int32Array(0), halfedges: new Int32Array(0) };
  if (orient(X, i0, i1, i2) < 0) { const t = i1; i1 = i2; i2 = t; }
  // pusat lingkaran luar segitiga awal
  const ax = X[2 * i0], ay = X[2 * i0 + 1], bx = X[2 * i1], by = X[2 * i1 + 1], qx = X[2 * i2], qy = X[2 * i2 + 1];
  const dx = bx - ax, dy = by - ay, ex = qx - ax, ey = qy - ay, bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, dd = 0.5 / (dx * ey - dy * ex);
  const cx = ax + (ey * bl - dy * cl) * dd, cy = ay + (dx * cl - ex * bl) * dd;
  const dist = new Float64Array(n), ids = new Uint32Array(n);
  for (let i = 0; i < n; i++) { dist[i] = d2(i, cx, cy); ids[i] = i; }
  ids.sort((a, b) => dist[a] - dist[b] || a - b);
  const hashKey = (x, y) => {
    const ddx = x - cx, ddy = y - cy, p = ddx / (Math.abs(ddx) + Math.abs(ddy));
    return Math.floor((ddy > 0 ? 3 - p : 1 + p) / 4 * hashSize) % hashSize;
  };
  const link = (a, b) => { H[a] = b; if (b !== -1) H[b] = a; };
  const addT = (a, b, c, ha, hb, hc) => { const t = tl; T[t] = a; T[t + 1] = b; T[t + 2] = c; link(t, ha); link(t + 1, hb); link(t + 2, hc); tl += 3; return t; };
  let hullStart = i0;
  hullNext[i0] = hullPrev[i2] = i1; hullNext[i1] = hullPrev[i0] = i2; hullNext[i2] = hullPrev[i1] = i0;
  hullTri[i0] = 0; hullTri[i1] = 1; hullTri[i2] = 2;
  hullHash[hashKey(ax, ay)] = i0; hullHash[hashKey(bx, by)] = i1; hullHash[hashKey(qx, qy)] = i2;
  addT(i0, i1, i2, -1, -1, -1);
  let stack = new Int32Array(1024);
  const legalize = (a) => {
    let i = 0, ar = 0;
    for (;;) {
      const b = H[a], a0 = a - a % 3;
      ar = a0 + (a + 2) % 3;
      if (b === -1) { if (i === 0) break; a = stack[--i]; continue; }
      const b0 = b - b % 3, al = a0 + (a + 1) % 3, bl2 = b0 + (b + 2) % 3;
      const p0 = T[ar], pr = T[a], pl = T[al], p1 = T[bl2];
      const det = inCircleDet(X, p0, pr, pl, p1);
      let flipIt = det > 0;
      if (tie) {            // 4 titik satu lingkaran (grid drone): pilih diagonal condong NW-SE seperti Surpac
        const L2 = (X[2 * pr] - X[2 * pl]) ** 2 + (X[2 * pr + 1] - X[2 * pl + 1]) ** 2;
        if (Math.abs(det) <= 1e-9 * L2 * L2) flipIt = (X[2 * p1] - X[2 * p0]) * (X[2 * p1 + 1] - X[2 * p0 + 1]) < 0;
      }
      if (flipIt) {
        T[a] = p1; T[b] = p0;
        const hbl = H[bl2];
        if (hbl === -1) { let e = hullStart; do { if (hullTri[e] === bl2) { hullTri[e] = a; break; } e = hullPrev[e]; } while (e !== hullStart); }
        link(a, hbl); link(b, H[ar]); link(ar, bl2);
        const br = b0 + (b + 1) % 3;
        if (i >= stack.length) { const s = new Int32Array(stack.length * 2); s.set(stack); stack = s; }
        stack[i++] = br;
      } else { if (i === 0) break; a = stack[--i]; }
    }
    return ar;
  };
  let xp = NaN, yp = NaN;
  for (let k = 0; k < n; k++) {
    const i = ids[k], x = X[2 * i], y = X[2 * i + 1];
    if (x === xp && y === yp) continue;
    xp = x; yp = y;
    if (i === i0 || i === i1 || i === i2) continue;
    let start = 0;
    for (let j = 0, key = hashKey(x, y); j < hashSize; j++) { start = hullHash[(key + j) % hashSize]; if (start !== -1 && start !== hullNext[start]) break; }
    start = hullPrev[start];
    let e = start, q;
    while (q = hullNext[e], !(orient(X, e, q, i) < 0)) { e = q; if (e === start) { e = -1; break; } }
    if (e === -1) continue;
    let t = addT(e, i, hullNext[e], -1, -1, hullTri[e]);
    hullTri[i] = legalize(t + 2); hullTri[e] = t;
    let nn = hullNext[e];
    while (q = hullNext[nn], orient(X, nn, q, i) < 0) { t = addT(nn, i, q, hullTri[i], -1, hullTri[nn]); hullTri[i] = legalize(t + 2); hullNext[nn] = nn; nn = q; }
    if (e === start) {
      while (q = hullPrev[e], orient(X, q, e, i) < 0) { t = addT(q, i, e, -1, hullTri[e], hullTri[q]); legalize(t + 2); hullTri[q] = t; hullNext[e] = e; e = q; }
    }
    hullStart = hullPrev[i] = e; hullNext[e] = hullPrev[nn] = i; hullNext[i] = nn;
    hullHash[hashKey(x, y)] = i; hullHash[hashKey(X[2 * e], X[2 * e + 1])] = e;
  }
  return { triangles: T.subarray(0, tl), halfedges: H.subarray(0, tl) };
}

/* ---------- jaring halfedge yang bisa di-flip ---------- */
class HMesh {
  constructor(X, D, n) {
    this.X = X; this.T = D.triangles; this.H = D.halfedges;
    this.vt = new Int32Array(n).fill(-1);
    for (let e = 0; e < this.T.length; e++) this.vt[this.T[e]] = e;
  }
  nx(e) { return e - e % 3 + (e + 1) % 3; }
  pv(e) { return e - e % 3 + (e + 2) % 3; }
  /* halfedge keluar dari a (urutan bebas) */
  out(a) {
    const s = this.vt[a]; if (s < 0) return [];
    const r = [s]; let e = s;
    for (let g = 0; g < 10000; g++) { const t = this.H[this.pv(e)]; if (t === -1) break; e = t; if (e === s) return r; r.push(e); }
    e = s;
    for (let g = 0; g < 10000; g++) { const t = this.H[e]; if (t === -1) break; e = this.nx(t); if (e === s) break; r.push(e); }
    return r;
  }
  find(u, v) { for (const e of this.out(u)) if (this.T[this.nx(e)] === v) return e; return -1; }   // halfedge u->v
  has(u, v) { return this.find(u, v) >= 0 || this.find(v, u) >= 0; }
  opp(e) { return this.T[this.pv(e)]; }
  /* flip sisi u-v kalau segiempatnya cembung; hasil [p,q] diagonal baru atau null */
  flip(u, v) {
    let a = this.find(u, v); if (a < 0) return null;
    const b = this.H[a]; if (b === -1) return null;
    const X = this.X, p = this.T[this.pv(a)], q = this.T[this.pv(b)];
    if (!(orient(X, p, q, u) * orient(X, p, q, v) < 0)) return null;
    const a0 = a - a % 3, b0 = b - b % 3, ar = a0 + (a + 2) % 3, al = a0 + (a + 1) % 3, bl = b0 + (b + 2) % 3, br = b0 + (b + 1) % 3;
    const p0 = this.T[ar], pr = this.T[a], pl = this.T[al], p1 = this.T[bl];
    this.T[a] = p1; this.T[b] = p0;
    const H = this.H, hbl = H[bl], har = H[ar];
    H[a] = hbl; if (hbl !== -1) H[hbl] = a;
    H[b] = har; if (har !== -1) H[har] = b;
    H[ar] = bl; H[bl] = ar;
    this.vt[p0] = ar; this.vt[p1] = a; this.vt[pl] = al; this.vt[pr] = br;
    return [p, q];
  }
}

/* sisi yang dipotong ruas a-b (pasangan titik), atau {titik:w} kalau ruas lewat titik w, atau null */
function walk(M, a, b, tol) {
  const X = M.X;
  const L = Math.hypot(X[2 * b] - X[2 * a], X[2 * b + 1] - X[2 * a + 1]);
  const eps = Math.max(1e-7 * Math.max(L, 1) * Math.max(L, 1), tol * L);
  const dot = (p) => (X[2 * p] - X[2 * a]) * (X[2 * b] - X[2 * a]) + (X[2 * p + 1] - X[2 * a + 1]) * (X[2 * b + 1] - X[2 * a + 1]);
  let first = null;
  for (const e of M.out(a)) {
    const p = M.T[M.nx(e)], q = M.T[M.pv(e)];
    const op = orient(X, a, b, p), oq = orient(X, a, b, q);
    if (Math.abs(op) <= eps && dot(p) > 0) return { titik: p };
    if (Math.abs(oq) <= eps && dot(q) > 0) return { titik: q };
    if (op < 0 && 0 < oq) { first = [p, q]; break; }
  }
  if (!first) return null;
  const cross = []; let [p, q] = first;
  for (let g = 0; g < 1000000; g++) {
    cross.push([p, q]);
    const e = M.find(q, p); if (e < 0) return null;
    const r = M.opp(e);
    if (r === b) return cross;
    const o = orient(X, a, b, r);
    if (Math.abs(o) <= eps) return { titik: r };
    if (o < 0) p = r; else q = r;
  }
  return null;
}

function cdt(X, n, cons, opt = {}) {
  const tol = opt.tol || 0, sisa = opt.sisa !== false, maxFlips = opt.maxFlips || 20000000;
  const M = new HMesh(X, delaunay(X, opt.tie !== false), n);
  const key = (a, b) => a < b ? a * n + b : b * n + a;
  const fixed = new Set(), skipped = [];
  const work = []; for (let i = cons.length - 2; i >= 0; i -= 2) work.push(cons[i], cons[i + 1]);   // tumpukan: urutan asal
  let flips = 0;
  while (work.length) {
    const b = work.pop(), a = work.pop();
    if (a === b) continue;
    const k = key(a, b);
    if (M.has(a, b)) { fixed.add(k); continue; }
    const w = walk(M, a, b, tol);
    if (w === null) { skipped.push(a, b); continue; }
    if (!Array.isArray(w)) {
      const mid = w.titik;
      if (sisa || tol === 0) work.push(mid, b);
      work.push(a, mid); continue;
    }
    if (w.some(([u, v]) => fixed.has(key(u, v)))) { skipped.push(a, b); continue; }
    const queue = w.slice(); let qh = 0; const nw = []; let guard = 0;
    while (qh < queue.length) {
      let [u, v] = queue[qh++]; guard++;
      if (guard > 50 * (w.length + 5)) break;
      if (!M.has(u, v)) continue;
      if (M.find(u, v) < 0) { const t = u; u = v; v = t; }
      const r = M.flip(u, v);
      if (!r) { queue.push([u, v]); continue; }
      flips++;
      const [p, q] = r;
      if ((p === a && q === b) || (p === b && q === a)) continue;
      const crosses = p !== a && p !== b && q !== a && q !== b &&
        orient(X, a, b, p) * orient(X, a, b, q) < 0 && orient(X, p, q, a) * orient(X, p, q, b) < 0;
      if (crosses) queue.push([p, q]); else nw.push([p, q]);
    }
    if (!M.has(a, b)) { skipped.push(a, b); continue; }
    fixed.add(k);
    let changed = true, it = 0;
    while (changed && it < 20) {
      changed = false; it++;
      for (const pq of nw.slice()) {
        let [p, q] = pq;
        if (fixed.has(key(p, q)) || !M.has(p, q)) continue;
        if (M.find(p, q) < 0) { const t = p; p = q; q = t; }
        const e1 = M.find(p, q), e2 = M.find(q, p);
        if (e1 < 0 || e2 < 0) continue;
        if (inCircleDet(X, p, q, M.opp(e1), M.opp(e2)) > 1e-9) {
          const r = M.flip(p, q);
          if (r) { const ix = nw.findIndex(([s, t]) => s === pq[0] && t === pq[1]); if (ix >= 0) nw.splice(ix, 1); nw.push(r); changed = true; }
        }
      }
    }
    if (flips > maxFlips) break;
  }
  // segitiga akhir
  const T = M.T, out = new Int32Array(T.length);
  out.set(T);
  return { tris: out, skipped: skipped.length / 2, flips };
}

/* dari baris .str (r: hasil parseStr) ke DTM: tris berisi indeks baris .str */
function createDtm(r, opt = {}) {
  const skip = opt.skip || ((s) => s === 1), spot = opt.spot || ((s) => s === 500 || s === 600 || s === 602);
  const n = r.rows, rowOf = [], idx = new Int32Array(n).fill(-1), map = new Map();
  let x0 = Infinity, y0 = Infinity;
  for (let i = 0; i < n; i++) if (r.sn[i] && !skip(r.sn[i])) { if (r.x[i] < x0) x0 = r.x[i]; if (r.y[i] < y0) y0 = r.y[i]; }
  const XY = [];
  for (let i = 0; i < n; i++) {
    const s = r.sn[i]; if (!s || skip(s)) continue;
    const k = Math.round(r.x[i] * 1000) + ',' + Math.round(r.y[i] * 1000);
    let j = map.get(k);
    if (j === undefined) { j = rowOf.length; map.set(k, j); rowOf.push(i); XY.push(r.x[i] - x0, r.y[i] - y0); }
    idx[i] = j;
  }
  const cons = [];
  for (let i = 0; i + 1 < n; i++) {
    const s = r.sn[i];
    if (!s || skip(s) || spot(s) || !r.sn[i + 1]) continue;
    const a = idx[i], b = idx[i + 1];
    if (a !== b) cons.push(a, b);
  }
  const X = new Float64Array(XY);
  const res = cdt(X, rowOf.length, cons, opt);
  const t = res.tris;
  for (let k = 0; k < t.length; k++) t[k] = rowOf[t[k]];
  return { tris: t, ntri: t.length / 3, npts: rowOf.length, skipped: res.skipped, flips: res.flips };
}

if (typeof module !== 'undefined') module.exports = { delaunay, cdt, createDtm };
