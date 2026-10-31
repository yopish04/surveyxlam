/* SMA Viewer - DTM CUT AND FILL VOLUMES secara eksak (bukan grid).
   Beda tinggi d = DTM kedua - DTM pertama linear di tiap irisan (segitiga DTM1 ∩ segitiga DTM2).
   Irisan dipotong garis d = 0, lalu diintegralkan di dalam boundary dengan teorema Green:
   batas daerah = sisi irisan yang di dalam boundary + ruas boundary yang di dalam irisan.
   Tiap segmen boundary dihitung sendiri, seperti report Surpac. */
'use strict';

function triGrid(D, x0, y0) {           // D: {x,y,z (Float64 per baris), tris}
  const t = D.tris, n = t.length / 3, X = D.x, Y = D.y;
  let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
  for (let i = 0; i < t.length; i++) { const x = X[t[i]], y = Y[t[i]]; if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
  const cs = Math.max(Math.sqrt((a1 - a0) * (b1 - b0) / Math.max(n, 1)) * 1.5, 0.2);
  const nx = Math.ceil((a1 - a0) / cs) + 1, ny = Math.ceil((b1 - b0) / cs) + 1;
  const bb = new Int32Array(n * 4);
  for (let j = 0; j < n; j++) {
    const p = t[3 * j], q = t[3 * j + 1], r = t[3 * j + 2];
    bb[4 * j] = Math.floor((Math.min(X[p], X[q], X[r]) - a0) / cs); bb[4 * j + 1] = Math.floor((Math.max(X[p], X[q], X[r]) - a0) / cs);
    bb[4 * j + 2] = Math.floor((Math.min(Y[p], Y[q], Y[r]) - b0) / cs); bb[4 * j + 3] = Math.floor((Math.max(Y[p], Y[q], Y[r]) - b0) / cs);
  }
  const cnt = new Uint32Array(nx * ny + 1);
  for (let j = 0; j < n; j++) for (let yy = bb[4 * j + 2]; yy <= bb[4 * j + 3]; yy++) for (let xx = bb[4 * j]; xx <= bb[4 * j + 1]; xx++) cnt[yy * nx + xx + 1]++;
  for (let c = 0; c < nx * ny; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(0, nx * ny), list = new Uint32Array(cnt[nx * ny]);
  for (let j = 0; j < n; j++) for (let yy = bb[4 * j + 2]; yy <= bb[4 * j + 3]; yy++) for (let xx = bb[4 * j]; xx <= bb[4 * j + 1]; xx++) list[fill[yy * nx + xx]++] = j;
  return { a0, b0, cs, nx, ny, cnt, list };
}

/* grid ruas boundary: untuk titik-di-dalam (sinar ke +x per baris) dan mencari ruas di sekitar irisan */
function ringIndex(R) {                  // R: Float64Array [x0,y0,x1,y1,...] lokal, CCW, tertutup implisit
  const m = R.length / 2;
  let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
  for (let i = 0; i < m; i++) { const x = R[2 * i], y = R[2 * i + 1]; if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
  const cs = Math.max(Math.sqrt((a1 - a0) * (b1 - b0) / Math.max(m, 1)) * 2, 0.5);
  const nx = Math.ceil((a1 - a0) / cs) + 1, ny = Math.ceil((b1 - b0) / cs) + 1;
  const cells = new Map(), rows = Array.from({ length: ny }, () => []);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, x1 = R[2 * i], y1 = R[2 * i + 1], x2 = R[2 * j], y2 = R[2 * j + 1];
    const ia = Math.floor((Math.min(x1, x2) - a0) / cs), ib = Math.floor((Math.max(x1, x2) - a0) / cs);
    const ja = Math.floor((Math.min(y1, y2) - b0) / cs), jb = Math.floor((Math.max(y1, y2) - b0) / cs);
    for (let yy = ja; yy <= jb; yy++) { rows[yy].push(i); for (let xx = ia; xx <= ib; xx++) { const k = yy * nx + xx; let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); } }
  }
  return { R, m, a0, b0, a1, b1, cs, nx, ny, cells, rows };
}
function inRing(G, x, y) {
  if (x < G.a0 || x > G.a1 || y < G.b0 || y > G.b1) return false;
  const R = G.R, m = G.m, row = G.rows[Math.min(G.ny - 1, Math.floor((y - G.b0) / G.cs))];
  let c = false;
  for (const i of row) {
    const j = (i + 1) % m, x1 = R[2 * i], y1 = R[2 * i + 1], x2 = R[2 * j], y2 = R[2 * j + 1];
    if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) c = !c;
  }
  return c;
}
function edgesNear(G, x0, y0, x1, y1, stamp, tag) {
  const out = [];
  const ia = Math.max(0, Math.floor((x0 - G.a0) / G.cs)), ib = Math.min(G.nx - 1, Math.floor((x1 - G.a0) / G.cs));
  const ja = Math.max(0, Math.floor((y0 - G.b0) / G.cs)), jb = Math.min(G.ny - 1, Math.floor((y1 - G.b0) / G.cs));
  for (let yy = ja; yy <= jb; yy++) for (let xx = ia; xx <= ib; xx++) {
    const c = G.cells.get(yy * G.nx + xx); if (!c) continue;
    for (const e of c) if (stamp[e] !== tag) { stamp[e] = tag; out.push(e); }
  }
  return out;
}

/* poligon cembung: array datar [x,y,...] CCW. potong dengan setengah bidang a + b x + c y >= 0 */
function clipHalf(P, a, b, c) {
  const out = [], n = P.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, x1 = P[2 * i], y1 = P[2 * i + 1], x2 = P[2 * j], y2 = P[2 * j + 1];
    const f1 = a + b * x1 + c * y1, f2 = a + b * x2 + c * y2;
    if (f1 >= 0) out.push(x1, y1);
    if ((f1 >= 0) !== (f2 >= 0)) { const t = f1 / (f1 - f2); out.push(x1 + t * (x2 - x1), y1 + t * (y2 - y1)); }
  }
  // buang titik kembar berurutan (sisi panjang nol)
  const o2 = [];
  for (let i = 0; i < out.length; i += 2) {
    if (!o2.length || Math.abs(out[i] - o2[o2.length - 2]) > 1e-9 || Math.abs(out[i + 1] - o2[o2.length - 1]) > 1e-9) o2.push(out[i], out[i + 1]);
  }
  while (o2.length >= 4 && Math.abs(o2[0] - o2[o2.length - 2]) <= 1e-9 && Math.abs(o2[1] - o2[o2.length - 1]) <= 1e-9) o2.length -= 2;
  return o2;
}
function clipTri(P, x1, y1, x2, y2, x3, y3) {     // P ∩ segitiga CCW
  const E = [[x1, y1, x2, y2], [x2, y2, x3, y3], [x3, y3, x1, y1]];
  for (const [ax, ay, bx, by] of E) {
    // kiri dari a->b: (bx-ax)(y-ay) - (by-ay)(x-ax) >= 0
    P = clipHalf(P, -(bx - ax) * ay + (by - ay) * ax, -(by - ay), (bx - ax));
    if (P.length < 6) return P;
  }
  return P;
}
/* kontribusi Green ruas (x0,y0)->(x1,y1) untuk f = al + be x + ga y */
function seg(x0, y0, x1, y1, al, be, ga) {
  const dy = y1 - y0, dx = x1 - x0;
  return dy * (al * (x0 + x1) / 2 + be * (x0 * x0 + x0 * x1 + x1 * x1) / 6) - ga * dx * (y0 * y0 + y0 * y1 + y1 * y1) / 6;
}
function polyInt(P, al, be, ga) {
  let s = 0; const n = P.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += seg(P[2 * i], P[2 * i + 1], P[2 * j], P[2 * j + 1], al, be, ga); }
  return s;
}
/* integral f di (P ∩ ring), P cembung CCW, ring CCW (Weiler-Atherton + Green):
   potongan ring di dalam P dirangkai; ujung masuk/keluar ada di tepi P; tepi P dari titik keluar
   (searah CCW) sampai titik masuk berikutnya ikut menjadi batas daerah. */
function perim(P, x, y) {                 // posisi titik di keliling P: indeks sisi + t
  const n = P.length / 2; let best = Infinity, s = 0;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n, ax = P[2 * i], ay = P[2 * i + 1], dx = P[2 * k] - ax, dy = P[2 * k + 1] - ay, L = dx * dx + dy * dy;
    if (L === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)), ex = ax + t * dx - x, ey = ay + t * dy - y, d = ex * ex + ey * ey;
    if (d < best) { best = d; s = i + t; }
  }
  return s;
}
function arcInt(P, s0, s1, fs, res) {     // integral sepanjang keliling P dari s0 ke s1 (CCW)
  const n = P.length / 2;
  if (s1 < s0) s1 += n;
  const pt = (s) => { s = s % n; const i = Math.min(n - 1, Math.floor(s)), t = s - i, k = (i + 1) % n; return [P[2 * i] + t * (P[2 * k] - P[2 * i]), P[2 * i + 1] + t * (P[2 * k + 1] - P[2 * i + 1])]; };
  let a = s0, [ax, ay] = pt(a);
  while (a < s1 - 1e-15) {
    const b = Math.min(s1, Math.floor(a) + 1);
    const [bx, by] = pt(b);
    for (let q = 0; q < fs.length; q++) res[q] += seg(ax, ay, bx, by, fs[q][0], fs[q][1], fs[q][2]);
    a = b; ax = bx; ay = by;
  }
}
function clipInt(P0, G, near, fs0) {
  const R = G.R, m = G.m, n = P0.length / 2, res = new Float64Array(fs0.length);
  // geser ke titik asal di P supaya integral Green tidak kehilangan presisi
  let cx = 0, cy = 0; for (let i = 0; i < n; i++) { cx += P0[2 * i]; cy += P0[2 * i + 1]; } cx /= n; cy /= n;
  const P = new Float64Array(2 * n); for (let i = 0; i < n; i++) { P[2 * i] = P0[2 * i] - cx; P[2 * i + 1] = P0[2 * i + 1] - cy; }
  const fs = fs0.map(([a, b, c]) => [a + b * cx + c * cy, b, c]);
  const ord = near.slice().sort((a, b) => a - b), segs = [];
  for (const e of ord) {
    const j = (e + 1) % m; const x0 = R[2 * e] - cx, y0 = R[2 * e + 1] - cy, x1 = R[2 * j] - cx, y1 = R[2 * j + 1] - cy;
    if (x0 === x1 && y0 === y1) continue;
    let t0 = 0, t1 = 1, e0 = -1, e1 = -1;
    for (let i = 0; i < n && t0 < t1; i++) {
      const k = (i + 1) % n, ax = P[2 * i], ay = P[2 * i + 1], bx = P[2 * k], by = P[2 * k + 1];
      const f0 = (bx - ax) * (y0 - ay) - (by - ay) * (x0 - ax), f1 = (bx - ax) * (y1 - ay) - (by - ay) * (x1 - ax);
      const tl = 1e-6 * Math.hypot(bx - ax, by - ay);
      if (Math.abs(f0) <= tl && Math.abs(f1) <= tl) { t1 = -1; break; }   // ruas boundary berimpit tepi P: tidak memotong isi P
      if (f0 < 0 && f1 < 0) { t1 = -1; break; }
      if (f0 < 0) { const t = f0 / (f0 - f1); if (t > t0) { t0 = t; e0 = i; } }
      else if (f1 < 0) { const t = f0 / (f0 - f1); if (t < t1) { t1 = t; e1 = i; } }
    }
    if (!(t1 - t0 > 1e-12)) continue;
    const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0, bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
    for (let q = 0; q < fs.length; q++) res[q] += seg(ax, ay, bx, by, fs[q][0], fs[q][1], fs[q][2]);
    segs.push({ e, t0, t1, ax, ay, bx, by, e0, e1 });
  }
  const ent = [], ext = [], k = segs.length;
  const onEdge = (i, x, y) => {            // posisi di sisi i; kalau di luar sisi itu (sisi segaris), cari sisi terdekat
    const q = (i + 1) % n, dx = P[2 * q] - P[2 * i], dy = P[2 * q + 1] - P[2 * i + 1], L = dx * dx + dy * dy;
    const t = L ? ((x - P[2 * i]) * dx + (y - P[2 * i + 1]) * dy) / L : -1;
    return t >= -1e-9 && t <= 1 + 1e-9 ? i + Math.max(0, Math.min(1, t)) : perim(P, x, y);
  };
  for (let i = 0; i < k; i++) {
    const s = segs[i], pr = segs[(i - 1 + k) % k], nx = segs[(i + 1) % k];
    const linkedPrev = s.t0 === 0 && pr.t1 === 1 && (pr.e + 1) % m === s.e;
    const linkedNext = s.t1 === 1 && nx.t0 === 0 && (s.e + 1) % m === nx.e;
    if (!linkedPrev) ent.push(s.e0 >= 0 ? onEdge(s.e0, s.ax, s.ay) : perim(P, s.ax, s.ay));
    if (!linkedNext) ext.push(s.e1 >= 0 ? onEdge(s.e1, s.bx, s.by) : perim(P, s.bx, s.by));
  }
  if (!ent.length || !ext.length) {
    // tidak ada ruas boundary yang masuk-keluar P: kalau tidak ada potongan sama sekali, P seluruhnya di dalam
    // atau di luar (cek titik berat P); kalau potongan berupa lingkaran tertutup di dalam P, tepi P di luar boundary
    if (!k && inRing(G, cx, cy)) for (let f = 0; f < fs.length; f++) res[f] += polyInt(P, fs[f][0], fs[f][1], fs[f][2]);
    return Array.from(res);
  }
  ent.sort((a, b) => a - b);
  for (const sx of ext) {
    let se = ent.find((v) => v >= sx);
    if (se === undefined) se = ent[0];
    arcInt(P, sx, se, fs, res);
  }
  return Array.from(res);
}

function cleanRing(r) {               // buang titik kembar berurutan dan titik penutup
  const o = [];
  for (let i = 0; i < r.length; i += 2) if (!o.length || r[i] !== o[o.length - 2] || r[i + 1] !== o[o.length - 1]) o.push(r[i], r[i + 1]);
  while (o.length >= 4 && o[0] === o[o.length - 2] && o[1] === o[o.length - 1]) o.length -= 2;
  return o;
}
function plane(D, t, ox, oy) {    // z = a + b x + c y (koordinat lokal)
  const X = D.x, Y = D.y, Z = D.z, p = D.tris[3 * t], q = D.tris[3 * t + 1], r = D.tris[3 * t + 2];
  const x1 = X[p] - ox, y1 = Y[p] - oy, x2 = X[q] - ox, y2 = Y[q] - oy, x3 = X[r] - ox, y3 = Y[r] - oy;
  const det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  const b = ((Z[q] - Z[p]) * (y3 - y1) - (Z[r] - Z[p]) * (y2 - y1)) / det;
  const c = ((x2 - x1) * (Z[r] - Z[p]) - (x3 - x1) * (Z[q] - Z[p])) / det;
  if (det < 0) return [Z[p] - b * x1 - c * y1, b, c, x1, y1, x3, y3, x2, y2, -det];
  return [Z[p] - b * x1 - c * y1, b, c, x1, y1, x2, y2, x3, y3, det];
}

/* first = DTM pertama (mis. base), second = DTM kedua (update). rings: array Float64Array [x,y,...] koordinat asli.
   -> per segmen {cut, cutArea, fill, fillArea, nett, common} */
function cutFill(first, second, rings, onProgress) {
  const out = [];
  const g1 = triGrid(first), stamp1 = new Int32Array(first.tris.length / 3).fill(-1);
  let tag = 0;
  for (let ri = 0; ri < rings.length; ri++) {
    const raw = cleanRing(rings[ri]), m = raw.length / 2;
    if (m < 3) { out.push({ cut: 0, cutArea: 0, fill: 0, fillArea: 0, common: 0, nett: 0 }); continue; }
    let ox = 0, oy = 0; for (let i = 0; i < m; i++) { ox += raw[2 * i]; oy += raw[2 * i + 1]; } ox /= m; oy /= m;
    const R = new Float64Array(raw.length);
    let area = 0;
    for (let i = 0; i < m; i++) { R[2 * i] = raw[2 * i] - ox; R[2 * i + 1] = raw[2 * i + 1] - oy; }
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; area += R[2 * i] * R[2 * j + 1] - R[2 * j] * R[2 * i + 1]; }
    if (area < 0) { for (let i = 0, k = m - 1; i < k; i++, k--) { const ax = R[2 * i], ay = R[2 * i + 1]; R[2 * i] = R[2 * k]; R[2 * i + 1] = R[2 * k + 1]; R[2 * k] = ax; R[2 * k + 1] = ay; } }
    const G = ringIndex(R), estamp = new Int32Array(m).fill(-1);
    const acc = { cut: 0, cutArea: 0, fill: 0, fillArea: 0, common: 0 };
    const T2 = second.tris, n2 = T2.length / 3, X2 = second.x, Y2 = second.y;
    for (let t = 0; t < n2; t++) {
      if (onProgress && (t & 0x3ffff) === 0) onProgress(ri, t / n2);
      const p = T2[3 * t], q = T2[3 * t + 1], r = T2[3 * t + 2];
      const bx0 = Math.min(X2[p], X2[q], X2[r]) - ox, bx1 = Math.max(X2[p], X2[q], X2[r]) - ox;
      const by0 = Math.min(Y2[p], Y2[q], Y2[r]) - oy, by1 = Math.max(Y2[p], Y2[q], Y2[r]) - oy;
      if (bx1 < G.a0 || bx0 > G.a1 || by1 < G.b0 || by0 > G.b1) continue;
      const near = edgesNear(G, bx0, by0, bx1, by1, estamp, ++tag);
      if (!near.length && !inRing(G, (bx0 + bx1) / 2, (by0 + by1) / 2)) {
        // seluruh segitiga di luar? cek pusat berat (bbox tanpa ruas boundary -> semua di dalam atau semua di luar)
        const cx = (X2[p] + X2[q] + X2[r]) / 3 - ox, cy = (Y2[p] + Y2[q] + Y2[r]) / 3 - oy;
        if (!inRing(G, cx, cy)) continue;
      }
      const P2 = plane(second, t, ox, oy);
      if (P2[9] <= 0) continue;
      // kandidat segitiga DTM pertama
      const ia = Math.max(0, Math.floor((bx0 + ox - g1.a0) / g1.cs)), ib = Math.min(g1.nx - 1, Math.floor((bx1 + ox - g1.a0) / g1.cs));
      const ja = Math.max(0, Math.floor((by0 + oy - g1.b0) / g1.cs)), jb = Math.min(g1.ny - 1, Math.floor((by1 + oy - g1.b0) / g1.cs));
      const tg = ++tag;
      for (let yy = ja; yy <= jb; yy++) for (let xx = ia; xx <= ib; xx++) {
        const c = yy * g1.nx + xx;
        for (let k = g1.cnt[c]; k < g1.cnt[c + 1]; k++) {
          const u = g1.list[k]; if (stamp1[u] === tg) continue; stamp1[u] = tg;
          const P1 = plane(first, u, ox, oy);
          if (P1[9] <= 0) continue;
          let poly = clipTri([P2[3], P2[4], P2[5], P2[6], P2[7], P2[8]], P1[3], P1[4], P1[5], P1[6], P1[7], P1[8]);
          if (poly.length < 6 || polyInt(poly, 1, 0, 0) < 1e-7) continue;     // irisan nol/serpih (segitiga bertetangga)
          const da = P2[0] - P1[0], db = P2[1] - P1[1], dc = P2[2] - P1[2];      // d = second - first
          const same = Math.abs(da) < 1e-9 && Math.abs(db) < 1e-12 && Math.abs(dc) < 1e-12;
          const ints = (poly2, fs) => near.length ? clipInt(poly2, G, near, fs) : fs.map((f) => polyInt(poly2, f[0], f[1], f[2]));
          if (same) { acc.common += ints(poly, [[1, 0, 0]])[0]; continue; }
          const pf = clipHalf(poly, da, db, dc), pc = clipHalf(poly, -da, -db, -dc);
          if (pf.length >= 6 && polyInt(pf, 1, 0, 0) > 1e-9) { const v = ints(pf, [[da, db, dc], [1, 0, 0]]); acc.fill += v[0]; acc.fillArea += v[1]; }
          if (pc.length >= 6 && polyInt(pc, 1, 0, 0) > 1e-9) { const v = ints(pc, [[-da, -db, -dc], [1, 0, 0]]); acc.cut += v[0]; acc.cutArea += v[1]; }
        }
      }
    }
    acc.nett = acc.fill - acc.cut;
    out.push(acc);
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { cutFill, _t: { triGrid, ringIndex, inRing, clipInt, clipTri, clipHalf, polyInt, plane } };
