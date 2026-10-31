'use strict';
/* SMA Viewer - tampilan ringan file Surpac. WebGL2 murni, tanpa pustaka luar, bisa dibuka offline. */
(() => {
const $ = (s) => document.querySelector(s);
const canvas = $('#gl');
const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
if (!gl) { document.body.innerHTML = '<p style="padding:20px">Browser ini tidak mendukung WebGL2. Pakai Chrome atau Edge versi baru.</p>'; return; }

/* ---------- matriks (kolom-mayor) ---------- */
const M4 = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
  look(e, R, U, F) { // basis kamera: kanan R, atas U, depan F
    const o = new Float32Array(16);
    o[0] = R[0]; o[4] = R[1]; o[8] = R[2];
    o[1] = U[0]; o[5] = U[1]; o[9] = U[2];
    o[2] = -F[0]; o[6] = -F[1]; o[10] = -F[2];
    o[12] = -(R[0] * e[0] + R[1] * e[1] + R[2] * e[2]);
    o[13] = -(U[0] * e[0] + U[1] * e[1] + U[2] * e[2]);
    o[14] = (F[0] * e[0] + F[1] * e[1] + F[2] * e[2]);
    o[15] = 1; return o;
  },
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ---------- shader ---------- */
function prog(vs, fs) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.bindAttribLocation(p, 1, 'c'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
const meshP = prog(`#version 300 es
in vec3 p; uniform mat4 M; uniform float ex; out vec3 w; out float zr;
void main(){ vec3 q=vec3(p.xy,p.z*ex); w=q; zr=p.z; gl_Position=M*vec4(q,1.); }`,
`#version 300 es
precision highp float; in vec3 w; in float zr; uniform vec2 zrng; uniform int mode; uniform vec3 L; out vec4 o;
vec3 ramp(float t){
  vec3 c0=vec3(.17,.37,.66),c1=vec3(.25,.65,.63),c2=vec3(.55,.78,.42),c3=vec3(.89,.76,.35),c4=vec3(.71,.39,.24);
  if(t<.25) return mix(c0,c1,t*4.); if(t<.5) return mix(c1,c2,(t-.25)*4.); if(t<.75) return mix(c2,c3,(t-.5)*4.); return mix(c3,c4,(t-.75)*4.);
}
void main(){ vec3 n=normalize(cross(dFdx(w),dFdy(w))); if(n.z<0.) n=-n; float d=max(dot(n,L),0.);
  vec3 c = mode==0 ? ramp(clamp((zr-zrng.x)/max(zrng.y-zrng.x,1e-6),0.,1.)) : vec3(.8);
  o=vec4(c*(.35+.65*d),1.); }`);
const lineP = prog(`#version 300 es
in vec3 p; in vec3 c; uniform mat4 M; uniform float ex; uniform float ps; out vec3 vc;
void main(){ vc=c; gl_PointSize=ps; gl_Position=M*vec4(p.xy,p.z*ex,1.); }`,
`#version 300 es
precision mediump float; in vec3 vc; out vec4 o; void main(){ o=vec4(vc,1.); }`);

/* ---------- keadaan ---------- */
const S = {
  layers: [], origin: null, ex: 1, plan: true, tool: 'ident', showPts: false, spot: parseRange('500-999'),
  cam: { t: [0, 0, 0], dist: 1000, az: 0, el: 90, fov: 45 * Math.PI / 180 },
  picks: [], meas: [], measOpen: false, pending: [], dirty: true, nextId: 1,
};
const PAL = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#ff8fab', '#469990', '#b39ddb', '#9a6324', '#a52a2a', '#00c08b', '#808000', '#1e88e5'];
const colorOf = (num) => num === 1 ? '#e6194b' : PAL[(num - 1) % PAL.length];
const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function parseRange(s) {
  const out = [];
  for (const part of String(s).split(/[,;\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) out.push([+m[1], +m[2]]); else if (/^\d+$/.test(part)) out.push([+part, +part]);
  }
  return (n) => out.some(([a, b]) => n >= a && n <= b);
}

/* ---------- pekerja latar: baca file, DTM, volume, update ---------- */
let worker = null, wid = 0; const wcb = new Map();
try {
  const src = ['parserSrc', 'tinSrc', 'volSrc', 'progresSrc', 'workerSrc'].map((id) => $('#' + id).textContent).join('\n;\n');
  worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = (ev) => {
    const d = ev.data, f = wcb.get(d.id); if (!f) return;
    if (d.progress) { f.prog && f.prog(...d.progress); return; }
    wcb.delete(d.id); f.done(d);
  };
  worker.onerror = (e) => { e.preventDefault && e.preventDefault(); worker = null; for (const f of wcb.values()) f.done({ err: 'worker' }); wcb.clear(); };
} catch (e) { worker = null; }
/* jalankan pekerjaan berat di worker (atau di thread utama kalau worker tidak ada) */
function run(cmd, args, transfer = [], prog = null) {
  const local = () => Promise.resolve().then(() => smaJob(cmd, args, prog)[0]);
  if (!worker) return local();
  return new Promise((res, rej) => {
    const id = ++wid;
    wcb.set(id, { prog, done: (d) => d.err === 'worker' ? local().then(res, rej) : d.err ? rej(new Error(d.err)) : res(d.r) });
    worker.postMessage({ id, cmd, args }, transfer);
  });
}
function parseFile(name, buf) { return run('parse', { name, buf }, [buf]); }

/* ---------- memuat file ---------- */
const busy = (t) => { $('#busy').hidden = !t; if (t) $('#busyTxt').textContent = t; };
async function loadFiles(files) {
  files = [...files].sort((a, b) => (a.name.toLowerCase().endsWith('.dtm') ? 1 : 0) - (b.name.toLowerCase().endsWith('.dtm') ? 1 : 0));
  const msgs = [];
  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop();
    if (!['str', 'dtm', 'shp'].includes(ext)) { msgs.push(`${f.name}: jenis file belum didukung`); continue; }
    busy(`Membaca ${f.name} (${(f.size / 1048576).toFixed(1)} MB)…`);
    try {
      const t0 = performance.now();
      const buf = await f.arrayBuffer(), raw = ext === 'str' ? buf.slice(0) : null;
      const r = await parseFile(f.name, buf);
      r.ms = performance.now() - t0;
      if (r.kind === 'dtm') addDtm(f.name, r, msgs); else addStr(f.name, r, raw);
      msg(`Buka ${f.name}: ${r.kind === 'dtm' ? (r.tris.length / 3).toLocaleString('id-ID') + ' segitiga' : (r.rows).toLocaleString('id-ID') + ' baris'}${r.binary ? ' (biner)' : ''}, ${Math.round(r.ms)} ms`);
    } catch (e) { msgs.push(`${f.name}: gagal dibaca (${e.message.split('\n')[0]})`); }
  }
  busy(null);
  if (S.pending.length) msgs.push(...S.pending.map((d) => `${d.name} butuh file ${d.r.strName}. Buka juga file .str itu.`));
  renderLayers(); zoomAll();
  for (const m of msgs) msg(m, 'w');
  if (msgs.length) $('#msgwin').classList.remove('min');
}

function addStr(name, r, raw = null) {
  if (!S.origin) {
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (let i = 0; i < r.rows; i++) if (r.sn[i]) { if (r.x[i] < mx) mx = r.x[i]; if (r.y[i] < my) my = r.y[i]; if (r.z[i] < mz) mz = r.z[i]; }
    if (!isFinite(mx)) { mx = my = mz = 0; }
    S.origin = [Math.floor(mx / 100) * 100, Math.floor(my / 100) * 100, Math.floor(mz / 10) * 10];
  }
  const [E0, N0, Z0] = S.origin, n = r.rows;
  const pos = new Float32Array(n * 3);
  const strs = new Map(); let seg = 0;
  const segNo = new Int32Array(n), ptNo = new Int32Array(n), segCnt = new Map();
  let cur = 0, k = 0, b0 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const s = r.sn[i];
    if (!s) { cur = 0; continue; }
    pos[3 * i] = r.x[i] - E0; pos[3 * i + 1] = r.y[i] - N0; pos[3 * i + 2] = r.z[i] - Z0;
    if (cur !== s || i === 0 || !r.sn[i - 1]) { segCnt.set(s, (segCnt.get(s) || 0) + 1); cur = s; k = 0; seg++; }
    segNo[i] = segCnt.get(s); ptNo[i] = ++k;
    const st = strs.get(s); if (st) st.count++; else strs.set(s, { count: 1, segs: 0, vis: true, color: colorOf(s) });
    for (let a = 0; a < 3; a++) { const v = pos[3 * i + a]; if (v < b0[a]) b0[a] = v; if (v > b0[a + 3]) b0[a + 3] = v; }
  }
  for (const [s, c] of segCnt) strs.get(s).segs = c;
  // string spot yang sangat rapat (titik drone) disembunyikan dulu supaya garis tetap terbaca; bisa dicentang di panel
  for (const [s, st] of strs) if (S.spot(s) && st.count > 20000) { st.vis = false; st.auto = true; }
  const L = { id: S.nextId++, kind: 'str', name, r, raw, pos, strs, segNo, ptNo, segs: seg, bbox: b0, vis: true, open: false, dtms: [] };
  L.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, L.vbo); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  L.cbo = gl.createBuffer(); L.lineIbo = gl.createBuffer(); L.ptIbo = gl.createBuffer();
  buildColors(L); buildIndex(L);
  S.layers.push(L); S.active = L;
  // DTM yang menunggu .str ini
  for (const d of [...S.pending]) if (d.r.strName.toLowerCase() === name.toLowerCase()) { S.pending.splice(S.pending.indexOf(d), 1); attachDtm(d.name, d.r, L); }
  return L;
}

function buildColors(L) {
  const n = L.r.rows, c = new Uint8Array(n * 3), sn = L.r.sn, cache = new Map();
  for (const [s, st] of L.strs) cache.set(s, hex2rgb(st.color));
  for (let i = 0; i < n; i++) { const s = sn[i]; if (!s) continue; const v = cache.get(s); c[3 * i] = v[0]; c[3 * i + 1] = v[1]; c[3 * i + 2] = v[2]; }
  gl.bindBuffer(gl.ARRAY_BUFFER, L.cbo); gl.bufferData(gl.ARRAY_BUFFER, c, gl.STATIC_DRAW); S.dirty = true;
}

/* indeks garis & titik dikelompokkan per nomor string supaya bisa disembunyikan per string tanpa membangun ulang */
function buildIndex(L) {
  const sn = L.r.sn, n = L.r.rows;
  const nums = [...L.strs.keys()].sort((a, b) => a - b);
  const lineCnt = new Map(), ptCnt = new Map();
  for (const s of nums) { lineCnt.set(s, 0); ptCnt.set(s, 0); }
  const spot = (s) => S.spot(s);
  for (let i = 0; i < n; i++) {
    const s = sn[i]; if (!s) continue;
    const single = (i === 0 || !sn[i - 1]) && (i + 1 >= n || !sn[i + 1]);
    if (spot(s) || single || S.showPts) ptCnt.set(s, ptCnt.get(s) + 1);
    if (!spot(s) && i + 1 < n && sn[i + 1]) lineCnt.set(s, lineCnt.get(s) + 2);
  }
  const lo = new Map(), po = new Map(); let a = 0, b = 0;
  for (const s of nums) { lo.set(s, a); a += lineCnt.get(s); po.set(s, b); b += ptCnt.get(s); }
  const li = new Uint32Array(a), pi = new Uint32Array(b);
  const lw = new Map(lo), pw = new Map(po);
  for (let i = 0; i < n; i++) {
    const s = sn[i]; if (!s) continue;
    const single = (i === 0 || !sn[i - 1]) && (i + 1 >= n || !sn[i + 1]);
    if (spot(s) || single || S.showPts) { const k = pw.get(s); pi[k] = i; pw.set(s, k + 1); }
    if (!spot(s) && i + 1 < n && sn[i + 1]) { const k = lw.get(s); li[k] = i; li[k + 1] = i + 1; lw.set(s, k + 2); }
  }
  L.lineR = new Map(nums.map((s) => [s, [lo.get(s), lineCnt.get(s)]]));
  L.ptR = new Map(nums.map((s) => [s, [po.get(s), ptCnt.get(s)]]));
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.lineIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, li, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.ptIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pi, gl.STATIC_DRAW);
  S.dirty = true;
}

function addDtm(name, r, msgs) {
  const want = r.strName.toLowerCase();
  const src = [...S.layers].reverse().find((L) => L.kind === 'str' && L.name.toLowerCase() === want);
  if (!src) { S.pending.push({ name, r }); return; }
  attachDtm(name, r, src);
}
function attachDtm(name, r, src) {
  const t = r.tris; let bad = 0;
  for (let i = 0; i < t.length; i++) if (t[i] < 0 || t[i] >= src.r.rows || !src.r.sn[t[i]]) { bad++; t[i] = 0; }
  let zmin = Infinity, zmax = -Infinity; const p = src.pos;
  for (let i = 0; i < t.length; i++) { const z = p[3 * t[i] + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  const D = { id: S.nextId++, kind: 'dtm', name, r, src, tris: t, ntri: t.length / 3, vis: true, shade: 0, wire: false, zr: [zmin, zmax], bad };
  D.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, D.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, t, gl.STATIC_DRAW);
  src.dtms.push(D); S.layers.push(D); S.dirty = true;
}
function buildWire(D) {
  const t = D.tris, e = new Uint32Array(t.length * 2);
  for (let i = 0, k = 0; i < t.length; i += 3) { e[k++] = t[i]; e[k++] = t[i + 1]; e[k++] = t[i + 1]; e[k++] = t[i + 2]; e[k++] = t[i + 2]; e[k++] = t[i]; }
  D.wireIbo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, D.wireIbo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, e, gl.STATIC_DRAW); D.nwire = e.length;
}

/* indeks grid segitiga untuk mencari Z di bawah kursor / jarak mengikuti DTM */
function dtmGrid(D) {
  if (D.grid) return D.grid;
  const P = D.src.r, t = D.tris, n = D.ntri;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < t.length; i++) { const x = P.x[t[i]], y = P.y[t[i]]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cs = Math.max(Math.sqrt((x1 - x0) * (y1 - y0) / Math.max(n, 1)) * 2, 0.5);
  const nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1;
  const cnt = new Uint32Array(nx * ny + 1);
  const each = (j, f) => {
    const a = t[3 * j], b = t[3 * j + 1], c = t[3 * j + 2];
    const ia = Math.floor((Math.min(P.x[a], P.x[b], P.x[c]) - x0) / cs), ib = Math.floor((Math.max(P.x[a], P.x[b], P.x[c]) - x0) / cs);
    const ja = Math.floor((Math.min(P.y[a], P.y[b], P.y[c]) - y0) / cs), jb = Math.floor((Math.max(P.y[a], P.y[b], P.y[c]) - y0) / cs);
    for (let jj = ja; jj <= jb; jj++) for (let ii = ia; ii <= ib; ii++) f(jj * nx + ii);
  };
  for (let j = 0; j < n; j++) each(j, (c) => cnt[c + 1]++);
  for (let c = 0; c < nx * ny; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(), list = new Uint32Array(cnt[nx * ny]);
  for (let j = 0; j < n; j++) each(j, (c) => { list[fill[c]++] = j; });
  return (D.grid = { x0, y0, cs, nx, ny, cnt, list });
}
function dtmZ(D, x, y) {
  const g = dtmGrid(D), P = D.src.r, t = D.tris;
  const i = Math.floor((x - g.x0) / g.cs), j = Math.floor((y - g.y0) / g.cs);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return NaN;
  const c = j * g.nx + i;
  for (let k = g.cnt[c]; k < g.cnt[c + 1]; k++) {
    const q = g.list[k], a = t[3 * q], b = t[3 * q + 1], d = t[3 * q + 2];
    const ax = P.x[a], ay = P.y[a], bx = P.x[b], by = P.y[b], dx = P.x[d], dy = P.y[d];
    const den = (by - dy) * (ax - dx) + (dx - bx) * (ay - dy);
    if (den === 0) continue;
    const l1 = ((by - dy) * (x - dx) + (dx - bx) * (y - dy)) / den, l2 = ((dy - ay) * (x - dx) + (ax - dx) * (y - dy)) / den, l3 = 1 - l1 - l2;
    const e = -1e-9;
    if (l1 >= e && l2 >= e && l3 >= e) return l1 * P.z[a] + l2 * P.z[b] + l3 * P.z[d];
  }
  return NaN;
}
function zAt(x, y) {
  for (let i = S.layers.length - 1; i >= 0; i--) { const D = S.layers[i]; if (D.kind === 'dtm' && D.vis) { const z = dtmZ(D, x, y); if (!isNaN(z)) return z; } }
  return NaN;
}

/* ---------- kamera ---------- */
function camera() {
  const W = canvas.clientWidth || 1, H = canvas.clientHeight || 1, c = S.cam;
  const az = c.az * Math.PI / 180, el = c.el * Math.PI / 180;
  const F = norm([Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), -Math.sin(el)]);
  const R = [Math.cos(az), -Math.sin(az), 0];
  const U = cross(R, F);
  const e = [c.t[0] - F[0] * c.dist, c.t[1] - F[1] * c.dist, c.t[2] - F[2] * c.dist];
  const halfH = c.dist * Math.tan(c.fov / 2), halfW = halfH * W / H;
  const V = M4.look(e, R, U, F);
  const ext = sceneSize() * 4 + c.dist;
  const P = S.plan ? M4.ortho(-halfW, halfW, -halfH, halfH, -ext, ext + c.dist) : M4.persp(c.fov, W / H, Math.max(c.dist * 0.002, 0.05), ext * 2);
  return { M: M4.mul(P, V), R, U, F, e, halfH, halfW, W, H };
}
function sceneSize() {
  const b = sceneBox(); if (!b) return 1000;
  return Math.max(b[3] - b[0], b[4] - b[1], (b[5] - b[2]) * S.ex, 1);
}
function sceneBox() {
  let b = null;
  for (const L of S.layers) {
    if (!L.vis || L.kind !== 'str') continue;
    if (!b) b = L.bbox.slice(); else for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], L.bbox[a]); b[a + 3] = Math.max(b[a + 3], L.bbox[a + 3]); }
  }
  return b;
}
function zoomAll() {
  const b = sceneBox(); if (!b) return;
  const c = S.cam, W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
  c.t = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2 * S.ex];
  const half = Math.max((b[4] - b[1]) / 2, (b[3] - b[0]) / 2 * H / W, 1) * 1.08;
  c.dist = half / Math.tan(c.fov / 2) * (S.plan ? 1 : 1.25);
  S.dirty = true;
}
function setPlan(on) {
  S.plan = on; $('#bPlan').classList.toggle('on', on); $('#b3d').classList.toggle('on', !on);
  if (on) { S.cam.el = 90; S.cam.az = 0; } else if (S.cam.el > 80) { S.cam.el = 35; S.cam.az = 20; }
  S.dirty = true;
}

/* ---------- gambar ---------- */
let ovBuf = gl.createBuffer();
function bg() { const v = getComputedStyle(canvas.parentElement).backgroundColor.match(/\d+/g).map(Number); return [v[0] / 255, v[1] / 255, v[2] / 255]; }
function draw() {
  S.dirty = false;
  const dpr = window.devicePixelRatio || 1, W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  gl.viewport(0, 0, W, H);
  const b = bg(); gl.clearColor(b[0], b[1], b[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const cam = camera();
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  // DTM
  gl.useProgram(meshP.p);
  gl.uniformMatrix4fv(meshP.u.M, false, cam.M); gl.uniform1f(meshP.u.ex, S.ex);
  const Ld = norm([-0.5, 0.6, 0.75]); gl.uniform3f(meshP.u.L, Ld[0], Ld[1], Ld[2]);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
  for (const D of S.layers) {
    if (D.kind !== 'dtm' || !D.vis) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, D.src.vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.uniform2f(meshP.u.zrng, D.zr[0], D.zr[1]); gl.uniform1i(meshP.u.mode, D.shade);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, D.ibo); gl.drawElements(gl.TRIANGLES, D.tris.length, gl.UNSIGNED_INT, 0);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  // garis & titik
  gl.useProgram(lineP.p);
  gl.uniformMatrix4fv(lineP.u.M, false, cam.M); gl.uniform1f(lineP.u.ex, S.ex);
  for (const D of S.layers) {
    if (D.kind !== 'dtm' || !D.vis || !D.wire) continue;
    if (!D.wireIbo) buildWire(D);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.src.vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1); gl.vertexAttrib3f(1, 0.15, 0.15, 0.15);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, D.wireIbo); gl.drawElements(gl.LINES, D.nwire, gl.UNSIGNED_INT, 0);
  }
  if (S.plan) gl.disable(gl.DEPTH_TEST);
  gl.uniform1f(lineP.u.ps, 2.5 * dpr);
  for (const L of S.layers) {
    if (L.kind !== 'str' || !L.vis) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, L.vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, L.cbo); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.lineIbo);
    drawRanges(L, L.lineR, gl.LINES);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.ptIbo);
    drawRanges(L, L.ptR, gl.POINTS);
  }
  // overlay: titik identify & garis ukur
  gl.disable(gl.DEPTH_TEST);
  gl.disableVertexAttribArray(1);
  const ov = [], O = S.origin || [0, 0, 0];
  const put = (p) => ov.push(p.x - O[0], p.y - O[1], (isNaN(p.z) ? 0 : p.z) - O[2]);
  for (const p of S.picks) put(p);
  const nPick = S.picks.length;
  for (const p of S.meas) put(p);
  if (ov.length) {
    gl.bindBuffer(gl.ARRAY_BUFFER, ovBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ov), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.uniform1f(lineP.u.ps, 9 * dpr);
    gl.vertexAttrib3f(1, 1, 0.84, 0); if (nPick) gl.drawArrays(gl.POINTS, 0, nPick);
    gl.vertexAttrib3f(1, 1, 0.2, 0.9);
    if (S.meas.length > 1) gl.drawArrays(gl.LINE_STRIP, nPick, S.meas.length);
    gl.uniform1f(lineP.u.ps, 7 * dpr); if (S.meas.length) gl.drawArrays(gl.POINTS, nPick, S.meas.length);
  }
  $('#north').style.transform = `rotate(${-S.cam.az}deg)`;
}
function drawRanges(L, R, mode) {
  // gabungkan rentang string yang berurutan dan sama-sama tampil
  let a = -1, n = 0;
  for (const [s, [off, cnt]] of R) {
    const vis = L.strs.get(s).vis && cnt > 0;
    if (vis && a >= 0 && a + n === off) { n += cnt; continue; }
    if (a >= 0 && n) gl.drawElements(mode, n, gl.UNSIGNED_INT, a * 4);
    a = vis ? off : -1; n = vis ? cnt : 0;
  }
  if (a >= 0 && n) gl.drawElements(mode, n, gl.UNSIGNED_INT, a * 4);
}
(function loop() { if (S.dirty) draw(); requestAnimationFrame(loop); })();
new ResizeObserver(() => { S.dirty = true; }).observe(canvas);

/* ---------- memilih titik ---------- */
function nearest(px, py, maxPx = 12) {
  const cam = camera(), M = cam.M, W = cam.W, H = cam.H, ex = S.ex;
  let best = null, bd = maxPx * maxPx;
  for (const L of S.layers) {
    if (L.kind !== 'str' || !L.vis) continue;
    const p = L.pos, sn = L.r.sn, n = L.r.rows;
    for (let i = 0; i < n; i++) {
      const s = sn[i]; if (!s) continue;
      const x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2] * ex;
      const w = M[3] * x + M[7] * y + M[11] * z + M[15]; if (w <= 0) continue;
      const sx = ((M[0] * x + M[4] * y + M[8] * z + M[12]) / w + 1) * W / 2 - px;
      const sy = (1 - (M[1] * x + M[5] * y + M[9] * z + M[13]) / w) * H / 2 - py;
      const d = sx * sx + sy * sy;
      if (d < bd && L.strs.get(s).vis) { bd = d; best = { L, i }; }
    }
  }
  return best;
}
function ground(px, py) {      // titik di bidang tampak (plan: koordinat sebenarnya)
  const c = camera(), nx = px / c.W * 2 - 1, ny = 1 - py / c.H * 2, t = S.cam.t, O = S.origin || [0, 0, 0];
  const q = [0, 1, 2].map((a) => t[a] + c.R[a] * nx * c.halfW + c.U[a] * ny * c.halfH);
  return { x: q[0] + O[0], y: q[1] + O[1], q };
}
function pointInfo(L, i) {
  const r = L.r, d = new TextDecoder('latin1').decode(r.descBuf.subarray(r.descOff[i], r.descOff[i + 1]));
  return { layer: L.name, s: r.sn[i], seg: L.segNo[i], pt: L.ptNo[i], x: r.x[i], y: r.y[i], z: r.z[i], d };
}

/* ---------- format ---------- */
const f3 = (v) => isNaN(v) ? '–' : v.toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fx = (v) => isNaN(v) ? '' : v.toFixed(3);
function dms(deg) {
  deg = ((deg % 360) + 360) % 360;
  let d = Math.floor(deg), mf = (deg - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60);
  if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d = (d + 1) % 360; }
  return `${String(d).padStart(3, '0')}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- identify ---------- */
function doIdent(px, py) {
  const h = nearest(px, py);
  if (!h) { $('#identCur').innerHTML = '<span class="muted">Tidak ada titik di dekat kursor.</span>'; return; }
  const p = pointInfo(h.L, h.i); S.picks.push(p); S.dirty = true;
  $('#identCur').innerHTML = `<div class="big">String ${p.s} · segmen ${p.seg} · titik ${p.pt}</div>
    <table><tr><td>Y</td><td>${f3(p.y)}</td></tr><tr><td>X</td><td>${f3(p.x)}</td></tr><tr><td>Z</td><td>${f3(p.z)}</td></tr>
    <tr><td>Desc</td><td>${esc(p.d) || '<span class="muted">–</span>'}</td></tr><tr><td>Layer</td><td>${esc(p.layer)}</td></tr></table>`;
  renderPicks();
}
function renderPicks() {
  $('#identTbl tbody').innerHTML = S.picks.map((p, k) => `<tr><td>${k + 1}</td><td>${p.s}</td><td>${fx(p.y)}</td><td>${fx(p.x)}</td><td>${fx(p.z)}</td><td>${esc(p.d)}</td></tr>`).join('');
}

/* ---------- ukur ---------- */
function doMeasure(px, py) {
  if (!S.measOpen) { S.meas = []; S.measOpen = true; }
  const h = nearest(px, py);
  let p;
  if (h) { const q = pointInfo(h.L, h.i); p = { x: q.x, y: q.y, z: q.z, snap: true }; }
  else if (S.plan) { const g = ground(px, py); p = { x: g.x, y: g.y, z: zAt(g.x, g.y), snap: false }; }
  else return;
  S.meas.push(p); S.dirty = true; renderMeasure();
}
function surfLen(a, b) {      // panjang mengikuti permukaan DTM (sampel tiap 1 m)
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L));
  let s = 0, pz = zAt(a.x, a.y);
  if (isNaN(pz)) return NaN;
  for (let k = 1; k <= n; k++) {
    const t = k / n, z = zAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (isNaN(z)) return NaN;
    s += Math.hypot(L / n, z - pz); pz = z;
  }
  return s;
}
function legs() {
  const out = []; const m = S.meas;
  for (let k = 1; k < m.length; k++) {
    const a = m[k - 1], b = m[k], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, h = Math.hypot(dx, dy);
    out.push({ h, sl: isNaN(dz) ? NaN : Math.hypot(h, dz), br: Math.atan2(dx, dy) * 180 / Math.PI, gr: isNaN(dz) || h === 0 ? NaN : dz / h * 100, dz });
  }
  return out;
}
function renderMeasure() {
  const lg = legs(), m = S.meas;
  $('#measTbl tbody').innerHTML = m.map((p, k) => {
    const l = lg[k - 1];
    return `<tr><td>${k + 1}${p.snap ? '' : '*'}</td><td>${fx(p.y)}</td><td>${fx(p.x)}</td><td>${fx(p.z)}</td><td>${l ? l.h.toFixed(3) : ''}</td><td>${l ? fx(l.sl) : ''}</td><td>${l ? dms(l.br) : ''}</td><td>${l && !isNaN(l.gr) ? l.gr.toFixed(2) + '%' : ''}</td></tr>`;
  }).join('');
  if (!lg.length) { $('#measSum').innerHTML = m.length ? 'Klik titik berikutnya…' : $('#measSum').innerHTML; return; }
  const H = lg.reduce((s, l) => s + l.h, 0), SL = lg.reduce((s, l) => s + l.sl, 0);
  let SF = 0; for (let k = 1; k < m.length; k++) SF += surfLen(m[k - 1], m[k]);
  const last = lg[lg.length - 1];
  $('#measSum').innerHTML = `<div class="big">Datar ${f3(H)} m</div>
    <table><tr><td>Miring (lurus antar titik)</td><td>${f3(SL)} m</td></tr>
    <tr><td>Mengikuti permukaan DTM</td><td>${isNaN(SF) ? '<span class="muted">di luar DTM</span>' : f3(SF) + ' m'}</td></tr>
    <tr><td>Bearing ruas terakhir</td><td>${dms(last.br)}</td></tr><tr><td>ΔZ total</td><td>${f3(m[m.length - 1].z - m[0].z)} m</td></tr></table>
    <div class="muted" style="margin-top:4px">${S.measOpen ? 'Esc = selesai.' : 'Selesai. Klik lagi untuk ukuran baru.'} * = titik bebas (tidak menempel ke titik string).</div>`;
}

/* ---------- ekspor ---------- */
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
}
function flash(btn, t) { const o = btn.textContent; btn.textContent = t; setTimeout(() => { btn.textContent = o; }, 1200); }
const num = (v) => isNaN(v) ? '' : v.toFixed(3);
function saveStr(name, rows) {   // rows: [{s,x,y,z,d}] ; s = null -> pemisah segmen
  const now = new Date(), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];
  const L = [`${name},${String(now.getDate()).padStart(2, '0')}-${mon}-${String(now.getFullYear()).slice(2)},0,0`,
    '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000'];
  for (const r of rows) L.push(r ? `${r.s}, ${r.y.toFixed(3)}, ${r.x.toFixed(3)}, ${(isNaN(r.z) ? 0 : r.z).toFixed(3)}, ${r.d || ''}` : '0, 0.000, 0.000, 0.000,');
  L.push('0, 0.000, 0.000, 0.000, END');
  saveFile(name + '.str', new TextEncoder().encode(L.join('\r\n') + '\r\n'));   // ke folder simpan (Downloads kalau belum dipilih)
}
$('#identCopy').onclick = (e) => { copyText(['No\tString\tSegmen\tTitik\tY\tX\tZ\tDesc\tLayer', ...S.picks.map((p, k) => [k + 1, p.s, p.seg, p.pt, num(p.y), num(p.x), num(p.z), p.d, p.layer].join('\t'))].join('\r\n')); flash(e.target, 'Tersalin ✓'); };
$('#identStr').onclick = () => { if (S.picks.length) saveStr('titik_identify', S.picks.flatMap((p) => [{ s: p.s, x: p.x, y: p.y, z: p.z, d: p.d }, null])); };
$('#identClr').onclick = () => { S.picks = []; renderPicks(); $('#identCur').innerHTML = '<span class="muted">Klik titik di layar.</span>'; S.dirty = true; };
$('#measCopy').onclick = (e) => {
  const lg = legs();
  copyText(['No\tY\tX\tZ\tDatar\tMiring\tBearing\tGrade %', ...S.meas.map((p, k) => { const l = lg[k - 1]; return [k + 1, num(p.y), num(p.x), num(p.z), l ? num(l.h) : '', l ? num(l.sl) : '', l ? dms(l.br) : '', l && !isNaN(l.gr) ? l.gr.toFixed(2) : ''].join('\t'); })].join('\r\n'));
  flash(e.target, 'Tersalin ✓');
};
$('#measStr').onclick = () => { if (S.meas.length) saveStr('garis_ukur', [...S.meas.map((p) => ({ s: 1, x: p.x, y: p.y, z: p.z, d: '' })), null]); };
$('#measClr').onclick = () => { S.meas = []; S.measOpen = false; renderMeasure(); $('#measSum').innerHTML = 'Mode Ukur: klik titik-titik (menempel ke titik terdekat). Esc = selesai.'; S.dirty = true; };

/* ---------- panel layer ---------- */
function renderLayers() {
  const box = $('#layers');
  if (!S.layers.length) { box.innerHTML = '<div class="empty">Belum ada file.</div>'; info(); refreshTools(); return; }
  box.innerHTML = '';
  for (const L of S.layers) {
    const el = document.createElement('div'); el.className = 'layer';
    if (L.kind === 'str') {
      const nums = [...L.strs.keys()].sort((a, b) => a - b);
      const pts = [...L.strs.values()].reduce((s, v) => s + v.count, 0);
      el.innerHTML = `<div class="lrow"><span class="caret">${L.open ? '▾' : '▸'}</span><input type="checkbox" ${L.vis ? 'checked' : ''}>
        <span class="lname" title="${esc(L.name)}">${esc(L.name)}</span><span class="x" title="Tutup layer">✕</span></div>
        <div class="lmeta">${pts.toLocaleString('id-ID')} titik · ${L.segs.toLocaleString('id-ID')} segmen · ${nums.length} string${L.r.binary ? ' · biner' : ''} · ${Math.round(L.r.ms || 0)} ms</div>`;
      if (L.open) {
        const sb = document.createElement('div'); sb.className = 'strs';
        sb.innerHTML = `<div class="srow"><a href="#" data-a="all">semua</a> · <a href="#" data-a="none">tidak ada</a></div>` + nums.map((s) => { const st = L.strs.get(s); return `<div class="srow" data-s="${s}"><input type="checkbox" ${st.vis ? 'checked' : ''}><input type="color" class="sw" value="${st.color}"><span>String ${s}${S.spot(s) ? ' (spot)' : ''}${st.auto && !st.vis ? ' <span class="muted">· disembunyikan</span>' : ''}</span><span class="cnt">${st.count.toLocaleString('id-ID')} / ${st.segs}</span></div>`; }).join('');
        sb.onchange = (e) => {
          const row = e.target.closest('.srow'); if (!row || !row.dataset.s) return; const st = L.strs.get(+row.dataset.s);
          if (e.target.type === 'checkbox') st.vis = e.target.checked; else { st.color = e.target.value; buildColors(L); } info();
          S.dirty = true;
        };
        sb.onclick = (e) => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; e.preventDefault(); for (const st of L.strs.values()) st.vis = a === 'all'; renderLayers(); S.dirty = true; };
        el.appendChild(sb);
      }
      el.querySelector('.caret').onclick = () => { L.open = !L.open; renderLayers(); };
    } else {
      el.innerHTML = `<div class="lrow"><span class="caret"></span><input type="checkbox" ${L.vis ? 'checked' : ''}>
        <span class="lname" title="${esc(L.name)}">${esc(L.name)}</span><span class="x" title="Tutup layer">✕</span></div>
        <div class="lmeta">DTM · ${L.ntri.toLocaleString('id-ID')} segitiga · Z ${(L.zr[0] + S.origin[2]).toFixed(1)}–${(L.zr[1] + S.origin[2]).toFixed(1)}${L.bad ? ` · ${L.bad} indeks salah` : ''}</div>
        <div class="dtmopt"><label><input type="radio" name="sh${L.id}" value="0" ${L.shade === 0 ? 'checked' : ''}> warna elevasi</label><label><input type="radio" name="sh${L.id}" value="1" ${L.shade === 1 ? 'checked' : ''}> abu-abu</label><label><input type="checkbox" class="wire" ${L.wire ? 'checked' : ''}> garis segitiga</label></div>`;
      el.querySelector('.dtmopt').onchange = (e) => { if (e.target.classList.contains('wire')) L.wire = e.target.checked; else L.shade = +e.target.value; S.dirty = true; };
    }
    el.querySelector('.lrow input').onchange = (e) => { L.vis = e.target.checked; S.dirty = true; info(); };
    if (S.active === L) el.querySelector('.lrow').classList.add('act');
    el.querySelector('.lname').onclick = () => { S.active = L; renderLayers(); };
    el.querySelector('.x').onclick = () => removeLayer(L);
    box.appendChild(el);
  }
  info();
  refreshTools();
}
function removeLayer(L) {
  const kill = L.kind === 'str' ? [L, ...L.dtms] : [L];
  for (const k of kill) {
    for (const b of ['vbo', 'cbo', 'lineIbo', 'ptIbo', 'ibo', 'wireIbo']) if (k[b]) gl.deleteBuffer(k[b]);
    S.layers.splice(S.layers.indexOf(k), 1);
    if (S.active === k) S.active = null;
    if (k.kind === 'dtm' && L.kind === 'dtm') k.src.dtms.splice(k.src.dtms.indexOf(k), 1);
  }
  if (!S.layers.length) S.origin = null;
  renderLayers(); S.dirty = true;
}
function info() {
  let p = 0, t = 0;
  for (const L of S.layers) if (L.vis) { if (L.kind === 'str') { for (const st of L.strs.values()) if (st.vis) p += st.count; } else t += L.ntri; }
  $('#sInfo').textContent = S.layers.length ? `${p.toLocaleString('id-ID')} titik · ${t.toLocaleString('id-ID')} segitiga tampil` : '';
}

/* ---------- mouse & keyboard ---------- */
let drag = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey, moved: false }; });
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (S.plan && S.origin) { const g = ground(px, py); $('#sXY').textContent = `Y ${f3(g.y)}   X ${f3(g.x)}   Z ${f3(zAt(g.x, g.y))}`; }
  else if (!S.plan) $('#sXY').textContent = 'Tampak 3D — klik titik untuk koordinat';
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true; drag.x = e.clientX; drag.y = e.clientY;
  const c = S.cam, cam = camera();
  const pan = S.plan ? drag.b === 0 && !drag.sh : (drag.b !== 0 || drag.sh);
  if (pan) {
    const wpp = 2 * cam.halfH / cam.H;
    for (let a = 0; a < 3; a++) c.t[a] += -cam.R[a] * dx * wpp + cam.U[a] * dy * wpp;
  } else if (!S.plan) {
    c.az = (c.az + dx * 0.4) % 360; c.el = Math.max(1, Math.min(89.5, c.el - dy * 0.3));
  }
  S.dirty = true;
});
canvas.addEventListener('pointerup', (e) => {
  const d = drag; drag = null; if (!d || d.moved || d.b !== 0) return;
  const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (S.tool === 'ident') doIdent(px, py); else doMeasure(px, py);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(), g = ground(e.clientX - r.left, e.clientY - r.top), c = S.cam;
  const k = Math.pow(1.0015, e.deltaY);
  for (let a = 0; a < 3; a++) c.t[a] = g.q[a] + (c.t[a] - g.q[a]) * k;
  c.dist *= k; S.dirty = true;
}, { passive: false });
function setTool(t) {
  S.tool = t; $('#bIdent').classList.toggle('on', t === 'ident'); $('#bMeasure').classList.toggle('on', t === 'meas');
  showTab(t === 'ident' ? 'tIdent' : 'tMeasure');
}
/* jendela form mengambang (seperti form fungsi Surpac) */
let winZ = 20;
function showTab(id) {
  const w = document.getElementById(id); if (!w) return;
  if (w.hidden) {
    w.hidden = false;
    const open = [...document.querySelectorAll('.win:not([hidden])')].filter((x) => x !== w).length;
    if (!w.dataset.moved) { w.style.top = (96 + open * 26) + 'px'; w.style.right = (16 + open * 26) + 'px'; w.style.left = 'auto'; }
  }
  w.style.zIndex = ++winZ;
}
for (const w of document.querySelectorAll('.win')) {
  w.addEventListener('pointerdown', () => { w.style.zIndex = ++winZ; });
  w.querySelector('.wx').onclick = () => { w.hidden = true; };
  const t = w.querySelector('.wt');
  t.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = w.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    t.setPointerCapture(e.pointerId);
    const mv = (ev) => { w.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + 'px'; w.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px'; w.style.right = 'auto'; w.dataset.moved = 1; };
    const up = () => { t.removeEventListener('pointermove', mv); t.removeEventListener('pointerup', up); };
    t.addEventListener('pointermove', mv); t.addEventListener('pointerup', up);
  });
}
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { S.measOpen = false; renderMeasure(); }
  else if (k === 'f') zoomAll(); else if (k === 'p') setPlan(true); else if (k === '3') setPlan(false);
  else if (k === 'i') setTool('ident'); else if (k === 'm') setTool('meas');
});
$('#bZoom').onclick = zoomAll;
$('#bPlan').onclick = () => setPlan(true);
$('#b3d').onclick = () => setPlan(false);
$('#bIdent').onclick = () => setTool('ident');
$('#bMeasure').onclick = () => setTool('meas');
$('#zEx').onchange = (e) => { const v = Math.max(0.1, +e.target.value || 1); S.cam.t[2] *= v / S.ex; S.ex = v; S.dirty = true; };
$('#spotIn').onchange = (e) => { S.spot = parseRange(e.target.value); for (const L of S.layers) if (L.kind === 'str') buildIndex(L); renderLayers(); };
$('#showPts').onchange = (e) => { S.showPts = e.target.checked; for (const L of S.layers) if (L.kind === 'str') buildIndex(L); };
$('#bTheme').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('smaTheme', r.dataset.theme); } catch (e) {} S.dirty = true; };
try { const t = localStorage.getItem('smaTheme'); if (t) document.documentElement.dataset.theme = t; else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark'; } catch (e) {}
$('#bHelp').onclick = () => $('#help').showModal();
$('#fileIn').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
const view = $('#view');
view.addEventListener('dragover', (e) => { e.preventDefault(); $('#drop').classList.add('on'); });
view.addEventListener('dragleave', () => $('#drop').classList.remove('on'));
view.addEventListener('drop', (e) => { e.preventDefault(); $('#drop').classList.remove('on'); loadFiles(e.dataTransfer.files); });

/*TOOLS*/
/*TAURI*/
/*NAV*/
window.SMA = { S, run, addStr, attachDtm, navAddRoot, NAV, openNodes, msg, loadFiles, zoomAll, setPlan, setTool, nearest, zAt, camera, draw };   // untuk uji otomatis
})();
