/* SMA Viewer - TXT ke STR: data mentah alat (.txt) -> file string Surpac (.str).
   Port langsung riset/prototipe/raw2str.py + proses_job.py (hasil diuji sama byte per byte dengan Python),
   ditambah tebakan area dari nama file seperti "Siapkan Job" di add-in Excel (SurveyPanel.bas).
   Murni (tanpa DOM), jalan di worker, thread utama, dan Node (uji). */
'use strict';
const RAW = (() => {
const CREST = 'CREST', TOE = 'TOE', SPOT = 'SPOT', ROAD = 'ROAD', EXCA = 'EXCA', JUNCC = 'JUNC';
const JUNC = 23, BND = 1, ROAD_EDGE = 7, ROAD_CENTRE = 77;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CEK_DOUBLE = 9001, CEK_TINGGI = 9002, CEK_ZIGZAG = 9003, CEK_JALAN = 9004, CEK_EXCA = 9005;
const CEK_GANDA = 9007, CEK_POTONG = 9008;
const NUMBERING = {
  harian: { crest: 5, toe: 6, spot: { 500: 600, 602: 602 } },
  base: { crest: 2, toe: 3, spot: { 500: 500, 602: 602 } },
  tetap: { crest: 2, toe: 3, spot: {} },
};
const BASE_WORDS = ['BASE', 'DUMP', 'DAMPING', 'WASTE', 'WSD', 'WD_', 'WD-', 'PELEBARAN', 'FILL'];
const DUP_TOL = 1.0, DIG_EDGE = 5.0, DIG_DEPTH = 0.3, DIG_CAP = 2.0;
const AXIS = '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000';

/* ---------- aritmetika persis seperti Python ---------- */
function fdiv(a, b) {             // a // b untuk float (CPython float_floor_div)
  let mod = a % b, div = (a - mod) / b;
  if (mod && ((b < 0) !== (mod < 0))) { mod += b; div -= 1.0; }
  if (!div) return 0;
  let fl = Math.floor(div); if (div - fl > 0.5) fl += 1.0;
  return fl;
}
function pmod(a, b) { let m = a % b; if (m && ((b < 0) !== (m < 0))) m += b; return m; }
function fixed(x, nd) {           // f"{x:.{nd}f}" (setengah ke genap pada nilai biner yang tepat sama di tengah)
  if (Object.is(x, -0)) return '-' + (0).toFixed(nd);
  let s = x.toFixed(nd);
  const t = Math.abs(x).toFixed(Math.min(100, nd + 25)), tail = t.slice(t.length - 25);
  if (/^50*$/.test(tail)) {        // tepat di tengah: toFixed membulatkan menjauhi nol, Python ke genap
    const lo = t.slice(0, t.length - 25);
    const last = +lo[lo.length - 1];
    if (last % 2 === 0) s = (x < 0 ? '-' : '') + lo;
  }
  return s;
}
const signed = (x, nd) => { const s = fixed(x, nd); return s[0] === '-' ? s : '+' + s; };
// math.hypot CPython 3.12+ (vector_norm: kuadrat tanpa galat + koreksi diferensial)
const SPLIT = 134217729;          // 2^27 + 1 (Veltkamp)
function twoProd(a, b) { const p = a * b, A = SPLIT * a, ah = A - (A - a), al = a - ah, B = SPLIT * b, bh = B - (B - b), bl = b - bh; return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl]; }
function fastSum(a, b) { const x = a + b, z = x - a; return [x, b - z]; }
function hyp(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  if (a === Infinity || b === Infinity) return Infinity;
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  const max = Math.max(a, b);
  if (max === 0) return 0;
  let e = Math.ceil(Math.log2(max));
  while (max * Math.pow(2, -e) >= 1) e++;
  while (max * Math.pow(2, -e) < 0.5) e--;
  const scale = Math.pow(2, -e);
  let csum = 1.0, f1 = 0.0, f2 = 0.0;
  for (let x of [a, b]) { x *= scale; const pr = twoProd(x, x), sm = fastSum(csum, pr[0]); csum = sm[0]; f1 += pr[1]; f2 += sm[1]; }
  let h = Math.sqrt(csum - 1.0 + (f1 + f2));
  const pr = twoProd(-h, h), sm = fastSum(csum, pr[0]); csum = sm[0]; f1 += pr[1]; f2 += sm[1];
  const x = csum - 1.0 + (f1 + f2);
  h += x / (2.0 * h);
  return h / scale;
}
// sum() CPython 3.12+ untuk float (Neumaier)
function psum(arr) {
  let f = 0.0, c = 0.0;
  for (const x of arr) { const t = f + x; if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x; else c += (x - t) + f; f = t; }
  if (c && Number.isFinite(c)) f += c;
  return f;
}
const d = (a, b) => hyp(a.n - b.n, a.e - b.e);
const isNum = (t) => { t = String(t).trim().replace(/(\d)_(?=\d)/g, '$1'); return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) || /^[+-]?(inf|infinity|nan)$/i.test(t); };
const pyFloat = (t) => { t = String(t).trim().replace(/(\d)_(?=\d)/g, '$1'); const m = /^([+-]?)(inf|infinity|nan)$/i.exec(t); if (m) return /nan/i.test(m[2]) ? NaN : (m[1] === '-' ? -Infinity : Infinity); return parseFloat(t); };
const isDigits = (s) => /^[0-9]+$/.test(s);
const WS = /[\s\x1c-\x1f\x85]+/;
const pySplit = (l) => l.split(WS).filter((x) => x !== '');
const pyStrip = (s) => s.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/g, '');
const baseName = (f) => f.replace(/^.*[\\/]/, '');
const latin1 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, Math.min(u.length, i + 8192))); return s; };
const enc = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[i] = c < 256 ? c : 63; } return u; };
const u8 = (b) => b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
function stableSort(arr, key, reverse = false) {
  const k = arr.map((x, i) => [key(x), i]);
  k.sort((a, b) => { const c = cmp(a[0], b[0]); return (reverse ? -c : c) || a[1] - b[1]; });
  return k.map(([, i]) => arr[i]);
}
function cmp(a, b) {
  if (Array.isArray(a)) { for (let i = 0; i < a.length; i++) { const c = cmp(a[i], b[i]); if (c) return c; } return 0; }
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ---------- tanggal ---------- */
const surpacDate = (y, m, dd) => `${String(dd).padStart(2, '0')}-${MONTHS[m - 1]}-${String(y % 100).padStart(2, '0')}`;
function fileDate(name) {        // 26102026, 26-10-2026, 20261026 -> [y, m, d]
  const s = baseName(name).replace(/[-_. ]/g, '');
  for (const m of s.matchAll(/\d{8}/g)) {
    const t = m[0];
    for (const [y, mo, dd] of [[t.slice(4), t.slice(2, 4), t.slice(0, 2)], [t.slice(0, 4), t.slice(4, 6), t.slice(6)]])
      if (y.startsWith('20') && +mo >= 1 && +mo <= 12 && +dd >= 1 && +dd <= 31) return [+y, +mo, +dd];
  }
  return null;
}
function resolveDate(value, files) {
  const v = (value || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v); if (m) return surpacDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); if (m) return surpacDate(+m[3], +m[2], +m[1]);
  if (v && v.toLowerCase() !== 'auto') return v;
  const ds = files.map(fileDate).filter(Boolean);
  if (ds.length) { const b = ds.reduce((a, x) => (cmp(x, a) > 0 ? x : a)); return surpacDate(...b); }
  const t = new Date(); return surpacDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
}
function tagOf(date) {           // 26-Oct-26 -> 261026
  const p = date.split('-');
  if (p.length !== 3) return date.replace(/-/g, '');
  const mi = MONTHS.indexOf(p[1].slice(0, 3).charAt(0).toUpperCase() + p[1].slice(1, 3).toLowerCase());
  return `${String(+p[0]).padStart(2, '0')}${String(mi + 1).padStart(2, '0')}${p[2].slice(-2)}`;
}
const fullName = (tag, name) => (/^\d{6}_/.test(name) || /^\d{8}_/.test(name) ? name : `${tag}_${name}`);

/* ---------- baca .txt ---------- */
function readRaw(name, buf) {
  const pts = [], file = baseName(name);
  const lines = latin1(u8(buf)).split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85]/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.forEach((l, i) => {
    if (l.includes('\t')) {
      const p = l.split('\t');
      if (p.length < 4 || !isNum(p[1]) || !isNum(p[2]) || !isNum(p[3])) return;
      pts.push({ file, row: i, name: pyStrip(p[0]), n: pyFloat(p[1]), e: pyFloat(p[2]), z: pyFloat(p[3]), code: p.length > 4 ? pyStrip(p[4]) : '' });
    } else {
      const p = pySplit(l);
      if (p.length < 5 || !(isNum(p[1]) && isNum(p[2]) && isNum(p[3]))) return;
      pts.push({ file, row: i, name: p[4], n: pyFloat(p[1]), e: pyFloat(p[2]), z: pyFloat(p[3]), code: p[0] });
    }
  });
  return pts;
}
function rawFormat(buf) {         // 'B' kalau baris pertama yang berisi data berformat kode N E Z nama
  for (const l of latin1(u8(buf)).split(/\r?\n/)) {
    if (l.includes('\t')) { const p = l.split('\t'); if (p.length >= 4 && isNum(p[1])) return 'A'; }
    else if (l.trim()) { const p = pySplit(l); if (p.length >= 5 && isNum(p[1]) && isNum(p[2])) return 'B'; }
  }
  return 'A';
}
function classify(code, roadCode = '7') {
  if (code === '2') return new Set([CREST]);
  if (code === '3') return new Set([TOE]);
  if (code === '23') return new Set([CREST, TOE, JUNCC]);
  if (code === roadCode) return new Set([ROAD]);
  if (code === '') return new Set();
  if (isDigits(code)) return new Set([SPOT]);
  return new Set([EXCA]);
}
const isJ = (p) => p.cls.has(JUNCC);

/* ---------- garis crest/toe ---------- */
function runsFor(pts, kind, gap) {
  const runs = []; let cur = [];
  for (const p of pts) {
    if (p.cls.has(kind)) { if (cur.length && d(cur[cur.length - 1], p) > gap) { runs.push(cur); cur = []; } cur.push(p); }
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}
function unzipZigzag(run, minOff = 0.3, minPts = 5, win = 2) {
  const n = run.length;
  if (n < minPts) return [run];
  const cen = [];
  for (let i = 0; i < n; i++) {
    const w = run.slice(Math.max(0, i - win), i + win + 1);
    cen.push([psum(w.map((p) => p.e)) / w.length, psum(w.map((p) => p.n)) / w.length]);
  }
  const side = [];
  for (let i = 0; i < n; i++) {
    const a = cen[Math.max(0, i - 1)], b = cen[Math.min(n - 1, i + 1)];
    const de = b[0] - a[0], dn = b[1] - a[1], L = hyp(de, dn) || 1.0;
    const off = (de * (run[i].n - cen[i][1]) - dn * (run[i].e - cen[i][0])) / L;
    side.push(Math.abs(off) < minOff ? 0 : off > 0 ? 1 : -1);
  }
  const half = 3, zig = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const w = side.slice(Math.max(0, i - half), i + half + 1).filter((x) => x);
    let flips = 0; for (let k = 1; k < w.length; k++) if (w[k - 1] !== w[k]) flips++;
    zig[i] = w.length >= 5 && flips >= (w.length - 1) / 2 && w.filter((x) => x === 1).length >= 2 && w.filter((x) => x === -1).length >= 2;
  }
  let out = [], start = 0, i = 0;
  while (i < n) {
    if (!zig[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && zig[j + 1]) j++;
    if (j - i + 1 >= minPts) {
      if (i > start) out.push(run.slice(start, i + 1));
      const seg = run.slice(i, j + 1), sd = side.slice(i, j + 1);
      out.push(seg.filter((_, k) => sd[k] > 0), seg.filter((_, k) => sd[k] <= 0));
      start = j;
    }
    i = j + 1;
  }
  if (start < n - 1 || !out.length) out.push(run.slice(start));
  out = out.filter((r) => r.length >= 2);
  return out.length ? out : [run];
}
function mergeRuns(runs, gap) {
  runs = runs.map((r) => r.slice());
  for (;;) {
    let best = null;
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i], b = runs[j];
      for (const ea of [0, -1]) for (const eb of [0, -1]) {
        const pa = ea === 0 ? a[0] : a[a.length - 1], pb = eb === 0 ? b[0] : b[b.length - 1];
        if (isJ(pa) || isJ(pb)) continue;
        const dist = d(pa, pb);
        if (dist <= gap && (best === null || dist < best[0])) best = [dist, i, j, ea, eb];
      }
    }
    if (!best) return runs;
    const [, i, j, ea, eb] = best;
    let a = runs[i], b = runs[j];
    if (ea === 0) a = a.slice().reverse();
    if (eb === -1) b = b.slice().reverse();
    runs[i] = a.concat(b); runs.splice(j, 1);
  }
}
function segDist(p, a, b) {
  const ax = a.e, ay = a.n, bx = b.e, by = b.n;
  const L2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.e - ax) * (bx - ax) + (p.n - ay) * (by - ay)) / L2));
  return hyp(p.e - ax - t * (bx - ax), p.n - ay - t * (by - ay));
}
const nearLine = (p, line, tol) => { for (let k = 0; k + 1 < line.length; k++) if (segDist(p, line[k], line[k + 1]) <= tol) return true; return false; };
function dropDoublePass(lines, tol = DUP_TOL) {
  lines = stableSort(lines.map((l) => l.slice()), (l) => l.length, true);
  const removed = [];
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (s.length < 2) continue;
    const others = lines.filter((l, j) => j < i && l.length >= 2);
    if (!others.length) continue;
    const near = s.map((p) => !isJ(p) && others.some((o) => nearLine(p, o, tol)));
    if (near.every(Boolean)) { removed.push(...s); lines[i] = []; continue; }
    let a = 0; while (a < s.length && near[a]) a++;
    let b = s.length; while (b > a && near[b - 1]) b--;
    if (a >= 2 || s.length - b >= 2) {
      const ca = a >= 2 ? a : 0, cb = s.length - b >= 2 ? b : s.length;
      removed.push(...s.slice(0, ca), ...s.slice(cb));
      lines[i] = s.slice(ca, cb);
    }
  }
  return [lines.filter((l) => l.length), removed];
}
function dropSelfPass(line, tol = DUP_TOL) {
  const n = line.length, mark = new Array(n).fill(false);
  line.forEach((p, i) => {
    if (isJ(p)) return;
    for (let k = i + 3; k < n - 1; k++) if (segDist(p, line[k], line[k + 1]) <= tol) { mark[i] = true; break; }
  });
  let keep = []; const removed = []; let i = 0;
  while (i < n) {
    if (!mark[i]) { keep.push(line[i]); i++; continue; }
    let j = i; while (j < n && mark[j]) j++;
    if (j - i >= 2) {
      removed.push(...line.slice(i, j));
      const rest = line.slice(j);
      if (keep.length && rest.length && d(keep[keep.length - 1], rest[rest.length - 1]) < d(keep[keep.length - 1], rest[0]))
        return [keep.concat(rest.slice().reverse()), removed];
    } else keep = keep.concat(line.slice(i, j));
    i = j;
  }
  return [keep, removed];
}
function segx(p1, p2, p3, p4) {
  const o = (a, b, c) => (b.e - a.e) * (c.n - a.n) - (b.n - a.n) * (c.e - a.e);
  if (p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4) return false;
  return (o(p1, p2, p3) * o(p1, p2, p4) < 0) && (o(p3, p4, p1) * o(p3, p4, p2) < 0);
}
function lineCrossings(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const x = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const y = lines[j];
      for (let ei = 0; ei < x.length - 1; ei++) {
        const a = x[ei], b = x[ei + 1];
        for (let ej = 0; ej < y.length - 1; ej++) {
          const c = y[ej], e = y[ej + 1];
          if (Math.max(a.e, b.e) < Math.min(c.e, e.e) || Math.min(a.e, b.e) > Math.max(c.e, e.e)) continue;
          if (Math.max(a.n, b.n) < Math.min(c.n, e.n) || Math.min(a.n, b.n) > Math.max(c.n, e.n)) continue;
          if (segx(a, b, c, e)) out.push([i, ei, j, ej]);
        }
      }
    }
  }
  return out;
}
function fixCrossings(lines) {    // lines diubah di tempat; -> [titik dibuang, potongan]
  const removed = [], cuts = [], stuck = new Set();
  const ids = new Map(); let nid = 0; const id = (p) => { if (!ids.has(p)) ids.set(p, ++nid); return ids.get(p); };
  for (let it = 0; it < 100; it++) {
    const total = lineCrossings(lines);
    const key = (x) => [id(lines[x[0]][x[1]]), id(lines[x[0]][x[1] + 1]), id(lines[x[2]][x[3]]), id(lines[x[2]][x[3] + 1])].join(',');
    const xs = total.filter((x) => !stuck.has(key(x)));
    if (!xs.length) break;
    const [i, ei, j, ej] = xs[0];
    let best = null;
    for (const [li, idx] of [[i, ei], [i, ei + 1], [j, ej], [j, ej + 1]]) {
      const l = lines[li], p = l[idx];
      if (isJ(p)) continue;
      const rank = Math.min(idx, l.length - 1 - idx);
      if (rank > 1) continue;
      const trial = [l.slice(0, idx).concat(l.slice(idx + 1))];
      const test = lines.slice(0, li).concat(trial, lines.slice(li + 1));
      if (lineCrossings(test).length >= total.length) continue;
      if (best === null || rank < best[0]) best = [rank, li, trial, ['punt', p]];
    }
    for (const [li, k] of [[i, ei], [j, ej]]) {
      const l = lines[li], p = l[k], q = l[k + 1];
      const trial = [l.slice(0, k + 1), l.slice(k + 1)].filter((x) => x.length >= 2);
      const test = lines.slice(0, li).concat(trial, lines.slice(li + 1));
      if (lineCrossings(test).length >= total.length) continue;
      const rank = 2 + 1.0 / (1.0 + Math.abs(p.z - q.z));
      if (best === null || rank < best[0]) best = [rank, li, trial, ['cut', p, q]];
    }
    if (!best) { stuck.add(key(xs[0])); continue; }
    const [, li, trial, what] = best;
    lines.splice(li, 1, ...trial);
    if (what[0] === 'punt') removed.push(what[1]); else cuts.push([what[1], what[2]]);
  }
  return [removed, cuts];
}
function untangle(line, maxRounds = 200) {
  const s = line.slice();
  for (let r = 0; r < maxRounds; r++) {
    let hit = null;
    for (let i = 0; i < s.length - 3 && !hit; i++)
      for (let j = i + 2; j < s.length - 1; j++) if (segx(s[i], s[i + 1], s[j], s[j + 1])) { hit = [i, j]; break; }
    if (!hit) return s;
    const [i, j] = hit;
    const mid = s.slice(i + 1, j + 1).reverse();
    s.splice(i + 1, j - i, ...mid);
  }
  return s;
}
function tidyLines(lines, gap) {
  let removed = [];
  const out = [];
  for (const l of lines) { const [k, r] = dropSelfPass(l); removed = removed.concat(r); if (k.length) out.push(k); }
  let [ls, r] = dropDoublePass(out); removed = removed.concat(r);
  ls = mergeRuns(ls, gap);
  return [ls.map((l) => untangle(l)), removed];
}

/* ---------- area + boundary ---------- */
function clusters(pts, link) {
  const cell = new Map(), ck = (x, y) => x + ',' + y;
  pts.forEach((p, idx) => { const k = ck(fdiv(p.e, link), fdiv(p.n, link)); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(idx); });
  const lab = new Array(pts.length).fill(-1); let c = 0;
  for (let s = 0; s < pts.length; s++) {
    if (lab[s] >= 0) continue;
    const stack = [s]; lab[s] = c;
    while (stack.length) {
      const k = stack.pop(), p = pts[k];
      const cx = fdiv(p.e, link), cy = fdiv(p.n, link);
      for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1])
        for (const m of cell.get(ck(cx + dx, cy + dy)) || []) if (lab[m] < 0 && d(p, pts[m]) <= link) { lab[m] = c; stack.push(m); }
    }
    c++;
  }
  const out = new Map();
  lab.forEach((l, i) => { if (!out.has(l)) out.set(l, []); out.get(l).push(pts[i]); });
  return [...out.values()];
}
const ang = (a, b) => Math.atan2(b.n - a.n, b.e - a.e);
function inside(poly, p) {
  let c = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.n > p.n) !== (b.n > p.n) && p.e < (b.e - a.e) * (p.n - a.n) / (b.n - a.n) + a.e) c = !c;
  }
  return c;
}
function concaveHull(pts, k = 8) {
  const uniq = new Map();
  for (const p of pts) { const key = fixed(p.e, 3) + ',' + fixed(p.n, 3); if (!uniq.has(key)) uniq.set(key, p); }
  const P = [...uniq.values()];
  if (P.length < 4) return P;
  k = Math.max(3, k);
  while (k < P.length) {
    const hull = knnHull(P, k);
    if (hull) {
      let ok = true;
      for (let i = 0; i < P.length; i += 3) { const p = P[i]; if (!(inside(hull, p) || hull.includes(p))) { ok = false; break; } }
      if (ok) return hull;
    }
    k += 2;
  }
  return null;
}
function knnHull(P, k) {
  let first = P[0];
  for (const p of P) if (cmp([p.n, p.e], [first.n, first.e]) < 0) first = p;
  const hull = [first]; let cur = first, prevAng = 0.0;
  const remaining = P.filter((p) => p !== first);
  let step = 0;
  for (;;) {
    if (step === 4) remaining.push(first);
    let cand = stableSort(remaining, (p) => d(cur, p)).slice(0, k);
    const turn = (p) => { const a = pmod(prevAng - ang(cur, p), 2 * Math.PI); return a > 1e-12 ? a : 2 * Math.PI; };
    cand = stableSort(cand, turn, true);
    let nxt = null;
    for (const c of cand) {
      const last = c === first ? 1 : 0;
      let ok = true;
      for (let i = 0; i < hull.length - 2 - last; i++) if (segx(cur, c, hull[i], hull[i + 1])) { ok = false; break; }
      if (ok) { nxt = c; break; }
    }
    if (nxt === null) return null;
    if (nxt === first) return hull;
    prevAng = ang(nxt, cur);
    hull.push(nxt); remaining.splice(remaining.indexOf(nxt), 1); cur = nxt; step++;
    if (step > P.length + 5) return null;
  }
}
function followStrings(hull, lines, maxDev = 6.0) {
  const where = new Map();
  lines.forEach((r, li) => r.forEach((p, i) => { if (!where.has(p)) where.set(p, []); where.get(p).push([li, i]); }));
  const ring = hull.concat(hull.slice(0, 1)), inHull = new Set(hull), detours = new Map();
  for (let e = 0; e + 1 < ring.length; e++) {
    const a = ring[e], b = ring[e + 1];
    let best = null;
    for (const [la, ia] of where.get(a) || []) for (const [lb, ib] of where.get(b) || []) {
      if (la !== lb || Math.abs(ia - ib) < 2) continue;
      const step = ib > ia ? 1 : -1, mid = [];
      for (let t = ia + step; step > 0 ? t < ib : t > ib; t += step) mid.push(lines[la][t]);
      if (mid.every((p) => segDist(p, a, b) <= maxDev) && (best === null || mid.length < best.length)) best = mid;
    }
    if (best && !best.some((p) => inHull.has(p))) detours.set(e, best);
  }
  const build = (chosen) => {
    const out = [], used = new Set();
    hull.forEach((a, e) => { out.push(a); for (const p of chosen.get(e) || []) if (!used.has(p)) { out.push(p); used.add(p); } });
    return out;
  };
  let chosen = new Map();
  for (const e of stableSort([...detours.keys()].sort((x, y) => x - y), (e) => -detours.get(e).length)) {
    const trial = new Map(chosen); trial.set(e, detours.get(e));
    if (simple(build(trial))) chosen = trial;
  }
  return build(chosen);
}
function touch(p1, p2, p3, p4) {
  return [[p1, p3, p4], [p2, p3, p4], [p3, p1, p2], [p4, p1, p2]].some(([p, a, b]) => segDist(p, a, b) < 1e-6);
}
function simple(ring) {
  if (new Set(ring.map((p) => fixed(p.e, 3) + ',' + fixed(p.n, 3))).size !== ring.length) return false;
  const n = ring.length, segs = ring.map((p, i) => [p, ring[(i + 1) % n]]);
  for (let i = 0; i < n; i++) {
    const [a1, b1] = segs[i];
    const x1 = Math.min(a1.e, b1.e), x2 = Math.max(a1.e, b1.e), y1 = Math.min(a1.n, b1.n), y2 = Math.max(a1.n, b1.n);
    for (let j = i + 2; j < n - (i === 0 ? 1 : 0); j++) {
      const [a2, b2] = segs[j];
      if (Math.max(a2.e, b2.e) < x1 || Math.min(a2.e, b2.e) > x2 || Math.max(a2.n, b2.n) < y1 || Math.min(a2.n, b2.n) > y2) continue;
      if (segx(a1, b1, a2, b2) || touch(a1, b1, a2, b2)) return false;
    }
  }
  return true;
}
function inTri(a, b, c, p) {
  const s = (p1, p2, p3) => (p1.e - p3.e) * (p2.n - p3.n) - (p2.e - p3.e) * (p1.n - p3.n);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function edgeGrid(edges, G = 10.0) {
  const cell = new Map();
  for (const [a, b] of edges)
    for (let cx = fdiv(Math.min(a.e, b.e), G); cx <= fdiv(Math.max(a.e, b.e), G); cx++)
      for (let cy = fdiv(Math.min(a.n, b.n), G); cy <= fdiv(Math.max(a.n, b.n), G); cy++) {
        const k = cx + ',' + cy; if (!cell.has(k)) cell.set(k, []); cell.get(k).push([a, b]);
      }
  return [cell, G];
}
function crossesLines(a, b, grid) {
  const [cell, G] = grid;
  for (let cx = fdiv(Math.min(a.e, b.e), G); cx <= fdiv(Math.max(a.e, b.e), G); cx++)
    for (let cy = fdiv(Math.min(a.n, b.n), G); cy <= fdiv(Math.max(a.n, b.n), G); cy++)
      for (const [c, e] of cell.get(cx + ',' + cy) || []) if (segx(a, b, c, e)) return true;
  return false;
}
function areaSign(ring) { return psum(ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return a.e * b.n - b.e * a.n; })); }
function simpleNear(ring, k) {
  const n = ring.length, nw = [[pmod(k - 1, n), k], [k, (k + 1) % n]];
  for (const [i0, i1] of nw) {
    const a = ring[i0], b = ring[i1];
    for (let j = 0; j < n; j++) {
      const c = ring[j], e = ring[(j + 1) % n];
      if (j === i0 || j === pmod(i0 - 1, n) || j === i1 || j === i1 % n || c === a || c === b || e === a || e === b) continue;
      if (segx(a, b, c, e)) return false;
    }
  }
  return true;
}
function dig(ring, pts, maxEdge, lineGrid, maxIter = 5000, depth = DIG_DEPTH) {
  const on = new Set(ring), cell = new Map(), G = Math.max(5.0, maxEdge);
  for (const p of pts) if (!on.has(p)) { const k = fdiv(p.e, G) + ',' + fdiv(p.n, G); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); }
  let it = 0, i = 0;
  while (i < ring.length && it < maxIter) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = d(a, b);
    if (L <= maxEdge) { i++; continue; }
    it++;
    const cx0 = fdiv(Math.min(a.e, b.e) - L / 2, G), cx1 = fdiv(Math.max(a.e, b.e) + L / 2, G);
    const cy0 = fdiv(Math.min(a.n, b.n) - L / 2, G), cy1 = fdiv(Math.max(a.n, b.n) + L / 2, G);
    const box = [];
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) for (const p of cell.get(cx + ',' + cy) || []) box.push(p);
    let cand = box.filter((p) => !on.has(p) && Math.max(d(a, p), d(p, b)) < L && segDist(p, a, b) <= Math.min(depth * L, DIG_CAP));
    cand = stableSort(cand, (p) => Math.max(d(a, p), d(p, b)));
    let done = false;
    for (const p of cand.slice(0, 12)) {
      const side = (b.e - a.e) * (p.n - a.n) - (b.n - a.n) * (p.e - a.e);
      if (side > 0 && areaSign(ring) < 0) continue;
      if (side < 0 && areaSign(ring) > 0) continue;
      if (box.some((q) => q !== p && !on.has(q) && inTri(a, p, b, q))) continue;
      if (crossesLines(a, p, lineGrid) || crossesLines(p, b, lineGrid)) continue;
      const trial = ring.slice(0, i + 1).concat([p], ring.slice(i + 1));
      if (!simpleNear(trial, i + 1)) continue;
      ring = trial; on.add(p); done = true;
      break;
    }
    if (!done) i++;
  }
  return ring;
}

/* ---------- titik double, tinggi mencurigakan ---------- */
function removeDoubles(pts, tolXY = 0.05, tolZ = 0.05) {
  const kept = [], removed = [], cell = new Map();
  for (const p of pts) {
    const cx = fdiv(p.e, 1), cy = fdiv(p.n, 1);
    let twin = null;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const q of cell.get((cx + dx) + ',' + (cy + dy)) || [])
      if (d(p, q) <= tolXY && Math.abs(p.z - q.z) <= tolZ) { twin = q; break; }
    if (twin) { removed.push([p, twin]); continue; }
    const k = cx + ',' + cy; if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); kept.push(p);
  }
  return [kept, removed];
}
function flagHeights(pts, lines, radius = 10.0, maxDev = 1.5) {
  const flags = [];
  for (const [kind, runs] of lines) for (const r of runs)
    for (let i = 1; i < r.length - 1; i++) {
      const ref = (r[i - 1].z + r[i + 1].z) / 2;
      if (Math.abs(r[i].z - ref) > maxDev) flags.push([r[i], r[i].z - ref, kind === CREST ? 'crest' : 'toe']);
    }
  const spots = pts.filter((p) => p.cls.has(SPOT));
  for (const p of spots) {
    const near = stableSort(spots.filter((q) => q !== p && d(p, q) <= radius), (q) => d(p, q)).slice(0, 8);
    if (near.length >= 4) {
      const zs = near.map((q) => q.z).sort((a, b) => a - b), med = zs[Math.floor(zs.length / 2)];
      if (Math.abs(p.z - med) > maxDev) flags.push([p, p.z - med, 'spot']);
    }
  }
  return flags;
}

/* ---------- jalan ---------- */
function axisOf(chunk) {
  const me = psum(chunk.map((p) => p.e)) / chunk.length, mn = psum(chunk.map((p) => p.n)) / chunk.length;
  const see = psum(chunk.map((p) => (p.e - me) ** 2)), snn = psum(chunk.map((p) => (p.n - mn) ** 2));
  const sen = psum(chunk.map((p) => (p.e - me) * (p.n - mn)));
  const th = 0.5 * Math.atan2(2 * sen, see - snn), ue = Math.cos(th), un = Math.sin(th);
  const resid = Math.max(...chunk.map((p) => Math.abs(-(p.e - me) * un + (p.n - mn) * ue)));
  return [[me, mn], [ue, un], resid];
}
function roadSections(seq, nFixed = null) {
  let best = null;
  for (const n of nFixed ? [nFixed] : [3, 4, 5, 6, 7]) {
    if (seq.length < 2 * n) continue;
    const chunks = [];
    for (let i = 0; i < seq.length - (seq.length % n); i += n) chunks.push(seq.slice(i, i + n));
    const score = psum(chunks.map((c) => axisOf(c)[2])) / chunks.length + 0.5 * (seq.length % n);
    if (best === null || score < best[0]) best = [score, n, chunks];
  }
  return best;
}
function buildRoad(seq, nFixed = 5, maxResid = 1.0) {
  const best = roadSections(seq, nFixed);
  if (!best) return [[[ROAD_EDGE, seq, false]], false];
  const [, n, chunks] = best;
  const ok = seq.length % n === 0 && Math.max(...chunks.map((c) => axisOf(c)[2])) <= maxResid;
  const ordered = [], centres = chunks.map((c) => axisOf(c)[0]);
  chunks.forEach((c, i) => {
    const [me, mn] = axisOf(c)[0];
    const j0 = Math.max(0, i - 1), j1 = Math.min(chunks.length - 1, i + 1);
    const de = centres[j1][0] - centres[j0][0], dn = centres[j1][1] - centres[j0][1], L = hyp(de, dn) || 1.0;
    ordered.push(stableSort(c, (p) => ((p.e - me) * dn - (p.n - mn) * de) / L));
  });
  const strings = [];
  for (let lane = 0; lane < n; lane++) strings.push([n % 2 && lane === Math.floor(n / 2) ? ROAD_CENTRE : ROAD_EDGE, ordered.map((s) => s[lane]), false]);
  const last = ordered[ordered.length - 1];
  const ring = ordered[0].concat(ordered.slice(1).map((s) => s[s.length - 1]), last.slice().reverse().slice(1), ordered.slice(1, -1).reverse().map((s) => s[0]));
  strings.unshift([BND, ring, true]);
  return [strings, ok];
}

/* ---------- tulis .str ---------- */
function strText(title, date, strings, label) {
  const L = [`${title},${date},0,0`, AXIS];
  for (const [num, seg, closed] of strings) {
    for (const p of closed ? seg.concat([seg[0]]) : seg) L.push(`${num}, ${fixed(p.n, 3)}, ${fixed(p.e, 3)}, ${fixed(p.z, 3)}, ${p.name},${date},${label}`);
    L.push('0, 0.000, 0.000, 0.000,');
  }
  L.push('0, 0.000, 0.000, 0.000, END');
  return L.join('\r\n') + '\r\n';
}
function checkText(title, date, items) {
  if (!items.length) return null;
  const L = [`${title},${date},0,0`, AXIS];
  for (const [num, pts, info] of items) {
    for (const p of pts) L.push(`${num}, ${fixed(p.n, 3)}, ${fixed(p.e, 3)}, ${fixed(p.z, 3)}, ${p.name},${date},${info}`);
    L.push('0, 0.000, 0.000, 0.000,');
  }
  L.push('0, 0.000, 0.000, 0.000, END');
  return L.join('\r\n') + '\r\n';
}

/* ---------- satu area: file .txt -> .str ---------- */
function convert(raws, title, date, o = {}) {
  const lineGap = o.lineGap ?? 8.0, areaLink = o.areaLink ?? 12.0, k = o.k ?? 8, follow = o.follow ?? true, maxDev = o.maxDev ?? 6.0;
  const zigzag = o.zigzag ?? false, tidy = o.tidy ?? true, digEdge = o.digEdge ?? DIG_EDGE, label = o.label || 'RTK_SMA', roadCode = o.roadCode || '7';
  const profile = o.profile || (raws.some((r) => BASE_WORDS.some((w) => baseName(r.name).toUpperCase().includes(w))) ? 'base' : 'harian');
  const num = NUMBERING[profile] || NUMBERING.harian;
  let pts = []; const report = {}, road = [];
  const inc = (k2, v = 1) => { report[k2] = (report[k2] || 0) + v; };
  let roadOk = true;
  const files = [];
  for (const r of raws) for (const p of readRaw(r.name, r.data)) {
    p.cls = classify(p.code, roadCode);
    if (!p.cls.size) { inc('tanpa kode (dilewati)'); continue; }
    if (p.cls.has(EXCA)) { inc('posisi unit EX (dipisah)'); continue; }
    if (p.cls.has(ROAD)) { road.push(p); continue; }
    pts.push(p);
  }
  let roadStrings = [];
  if (road.length) {
    const [rs, ok] = buildRoad(road); roadOk = ok; roadStrings = rs;
    if (!o.roadSink) files.push({ name: title + '_jalan.str', text: strText(title + '_jalan', date, rs, label) });
    else o.roadSink.push(...rs);
    report['titik jalan (dipindah ke file jalan)'] = road.length;
    if (!ok) report['jalan PERLU DICEK (penampang tidak teratur)'] = 1;
  }
  let doubles; [pts, doubles] = removeDoubles(pts);
  report['titik double (dihapus)'] = doubles.length;
  const strings = [];
  const byFile = new Map();
  for (const p of pts) { if (!byFile.has(p.file)) byFile.set(p.file, []); byFile.get(p.file).push(p); }
  const lines = new Map(), zigFlags = [], zigRuns = [];
  for (const kind of [CREST, TOE]) {
    let runs = [];
    for (const fp of byFile.values()) for (const r of runsFor(fp, kind, lineGap)) {
      const parts = unzipZigzag(r);
      if (parts.length > 1) { zigFlags.push([r[0], 0.0, `zig-zag ${r[0].name}..${r[r.length - 1].name}: mungkin 2 garis berdekatan`]); zigRuns.push(r); }
      runs = runs.concat(zigzag ? parts : [r]);
    }
    lines.set(kind, mergeRuns(runs, lineGap));
  }
  let dropped = [], cuts = [];
  if (tidy) {
    for (const kind of [CREST, TOE]) { const [ls, r] = tidyLines(lines.get(kind), lineGap); lines.set(kind, ls); dropped = dropped.concat(r); }
    const both = lines.get(CREST).concat(lines.get(TOE));
    const [r, c] = fixCrossings(both); dropped = dropped.concat(r); cuts = c;
    const crestLine = (l) => l.some((p) => p.cls.has(CREST) && !isJ(p));
    lines.set(CREST, both.filter(crestLine)); lines.set(TOE, both.filter((l) => !crestLine(l)));
    report['titik crest/toe ganda (dibuang, lihat _CEK.str)'] = dropped.length;
    report['garis dipotong agar tidak bersilangan'] = cuts.length;
  }
  const gone = new Set(dropped);
  pts = pts.filter((p) => !gone.has(p));
  const areas = clusters(pts, areaLink);
  const allLines = lines.get(CREST).concat(lines.get(TOE));
  const edges = []; for (const l of allLines) for (let i = 0; i + 1 < l.length; i++) edges.push([l[i], l[i + 1]]);
  const grid = edgeGrid(edges);
  const hulls = [];
  for (const a of areas) {
    if (a.length < 10) continue;
    let h = concaveHull(a, k);
    if (!h) continue;
    if (follow) h = followStrings(h, allLines, maxDev);
    if (digEdge) h = dig(h, a, digEdge, grid);
    hulls.push(h);
  }
  for (const h of hulls) strings.push([BND, h, true]);
  for (const [kind, no] of [[CREST, num.crest], [TOE, num.toe]]) for (const r of lines.get(kind)) if (r.length >= 2) strings.push([no, r, false]);
  for (const p of pts) if (isJ(p)) strings.push([JUNC, [p], false]);
  for (const fp of byFile.values()) {
    const codes = [...new Set(fp.filter((p) => p.cls.has(SPOT)).map((p) => p.code))].sort();
    for (const code of codes) {
      const same = fp.filter((p) => p.code === code || !p.cls.has(SPOT));
      for (const r of runsFor(same, SPOT, 15.0)) strings.push([num.spot[code] !== undefined ? num.spot[code] : parseInt(code, 10), r, false]);
    }
  }
  files.unshift({ name: title + '.str', text: strText(title, date, strings, label) });
  const flags = flagHeights(pts, lines).concat(zigFlags);
  report['garis zig-zag (dicek manual)'] = zigFlags.length;
  report['tinggi mencurigakan (dicek manual)'] = flags.length;
  const items = [];
  for (const [p, q] of doubles) items.push([CEK_DOUBLE, [p], `CEK_DOUBLE sama dgn ${q.name} dz ${signed(p.z - q.z, 3)}m`]);
  for (const [p, dev, kind] of flags) if (!kind.startsWith('zig-zag')) items.push([CEK_TINGGI, [p], `CEK_TINGGI ${kind} ${signed(dev, 2)}m`]);
  for (const r of zigRuns) items.push([CEK_ZIGZAG, r, `CEK_ZIGZAG ${r[0].name}-${r[r.length - 1].name} mungkin 2 garis`]);
  for (const p of dropped) items.push([CEK_GANDA, [p], 'CEK_GANDA crest/toe diukur dua kali, titik dibuang']);
  for (const [p, q] of cuts) items.push([CEK_POTONG, [p, q], `CEK_POTONG garis diputus ${p.name}-${q.name} (bersilangan)`]);
  if (road.length && !roadOk) items.push([CEK_JALAN, road, 'CEK_JALAN penampang tidak teratur']);
  const cek = checkText(title + '_CEK', date, items);
  if (cek) files.push({ name: title + '_CEK.str', text: cek });
  return { strings, report, areas: areas.length, boundaries: hulls.length, files, cek: items.length };
}

/* ---------- posisi unit (exca): satu titik per kode, tembakan pertama ---------- */
function firstShots(raws, spreadMax = 1.0, roadCode = '7') {
  const shots = new Map();
  for (const r of raws) for (const p of readRaw(r.name, r.data))
    if (classify(p.code, roadCode).has(EXCA)) { if (!shots.has(p.code)) shots.set(p.code, []); shots.get(p.code).push({ ...p, name: p.code }); }
  const units = [], warn = [], far = [];
  for (const [code, ps] of shots) {
    units.push(ps[0]);
    let spread = 0; for (const a of ps) for (const b of ps) spread = Math.max(spread, d(a, b));
    if (spread > spreadMax) { warn.push(`${code}: ${ps.length} tembakan berjarak sampai ${fixed(spread, 1)} m (dipakai yang pertama)`); far.push(ps); }
  }
  return [units, warn, far];
}

/* ---------- satu pekerjaan (seperti proses_job.py / tombol Proses di Excel) ----------
   job: { date, label, roadCode, rows: [{kind:'AREA', name, profile, files:[nama]}, {kind:'JALAN', name},
          {kind:'EXCA', name, files:'AREA' | [nama]}] }, raws: Map nama -> isi file
   -> { files: [{name, data}], log: [baris], date, tag } ; file 'gabung/<tag>.str' memakai subfolder */
function runJob(job, raws) {
  const get = (n) => { if (!raws.has(n)) throw new Error('file tidak ada: ' + n); return { name: n, data: raws.get(n) }; };
  const label = job.label || 'RTK_SMA', roadCode = job.roadCode || '7';
  const rows = job.rows;
  const all = rows.flatMap((r) => r.kind === 'AREA' ? r.files : r.kind === 'EXCA' && r.files !== 'AREA' ? r.files : []);
  const date = resolveDate(job.date, all), tag = job.tag || tagOf(date);
  const out = [], log = [], road = [], gabung = [], areaFiles = [];
  for (const r of rows) {
    if (r.kind !== 'AREA') continue;
    const raw = r.files.map(get); areaFiles.push(...r.files);
    const title = fullName(tag, r.name);
    const res = convert(raw, title, date, { profile: r.profile, roadSink: road, label, roadCode });
    gabung.push(...res.strings);
    for (const f of res.files) out.push({ name: f.name, text: f.text });
    log.push(`${title}.str: ${res.areas} area` + Object.entries(res.report).filter(([, v]) => v).map(([k2, v]) => `, ${k2}: ${v}`).join(''));
  }
  for (const r of rows) {
    const title = fullName(tag, r.name);
    if (r.kind === 'JALAN') {
      if (road.length) { out.push({ name: title + '.str', text: strText(title, date, road, label) }); log.push(`${title}.str: ${road.length} string jalan`); }
      else log.push(`${title}: 0 titik kode ${roadCode}, file tidak dibuat`);
    }
    if (r.kind === 'EXCA') {
      const fl = r.files === 'AREA' ? areaFiles : r.files;
      const [units, warn, spread] = firstShots(fl.map(get), 1.0, roadCode);
      out.push({ name: title + '.str', text: strText(title, date, units.map((p) => [1, [p], false]), label) });
      const cek = checkText(title + '_CEK', date, spread.flatMap((ps) => ps.map((p, i) => [CEK_EXCA, [p], `CEK_EXCA tembakan ${i + 1} dari ${ps.length}`])));
      if (cek) out.push({ name: title + '_CEK.str', text: cek });
      log.push(`${title}.str: ${units.length} unit`);
      for (const w of warn) log.push('   PERLU DIPILIH: ' + w);
    }
  }
  out.push({ name: 'gabung/' + tag + '.str', text: strText(tag, date, gabung, label) });
  out.push({ name: tag + '_LOG.txt', text: log.join('\r\n') + '\r\n' });
  return { files: out.map((f) => ({ name: f.name, data: enc(f.text) })), log, date, tag };
}

/* ---------- Siapkan Job: tebak jenis, lokasi, dan nama area dari nama file (port SurveyPanel.bas) ---------- */
const KINDS = [['exca', ['REC', 'EXA', 'EXC', 'EXCA']], ['abaikan', ['GCP']], ['base', ['BASE', 'BES']], ['pelebaran', ['PELEBARAN', 'LAMINATING']],
  ['rehandling', ['REH', 'RH']], ['dumpingan', ['DUMP', 'DAMP', 'WSD', 'WASTE', 'WST', 'WD']], ['quarry', ['QUAR']], ['pit', ['PIT']]];
const stripExt = (s) => s.lastIndexOf('.') >= 0 ? s.slice(0, s.lastIndexOf('.')) : s;
const letterRuns = (u) => u.match(/[A-Z]+/g) || [];
function kindOf(fileName) {
  const runs = letterRuns(stripExt(fileName.toUpperCase()));
  for (const [kind, words] of KINDS) for (const w of words)
    if (runs.some((r) => r === w || r.startsWith(w) || r.endsWith(w) || (w.length >= 3 && r.includes(w)))) return kind;
  return 'lain';
}
function digitsAfter(u, p, skipLetters) {
  if (skipLetters) while (p < u.length && u[p] >= 'A' && u[p] <= 'Z') p++;
  while (p < u.length && ' _-'.includes(u[p])) p++;
  let s = ''; while (p < u.length && u[p] >= '0' && u[p] <= '9') s += u[p++];
  return s;
}
function locationOf(fileName) {   // TF3/TF03/TOFU-03 -> tofu3, LD-03 -> ld03, REHANDLING-05 -> ld05, TOS17 -> tos17
  const u = stripExt(fileName.toUpperCase());
  for (let p = u.indexOf('LD'); p >= 0; p = u.indexOf('LD', p + 1)) {
    let dg = digitsAfter(u, p + 2, false);
    if (dg) { dg = dg[0] === '0' || dg.length <= 2 ? dg.slice(0, 2) : dg.slice(0, 1); return 'ld' + String(+dg).padStart(2, '0'); }
  }
  for (const w of ['REH', 'RH']) for (let p = u.indexOf(w); p >= 0; p = u.indexOf(w, p + 1)) {
    const dg = digitsAfter(u, p + w.length, true);
    if (dg.length >= 2 && dg[0] === '0') return 'ld' + dg.slice(0, 2);
  }
  for (let p = u.indexOf('TOS'); p >= 0; p = u.indexOf('TOS', p + 1)) { const dg = digitsAfter(u, p + 3, false); if (dg) return 'tos' + (+dg.slice(0, 2)); }
  const first = (w) => { for (let p = u.indexOf(w); p >= 0; p = u.indexOf(w, p + 1)) { const dg = digitsAfter(u, p + w.length, false); if (dg) return [p, dg]; } return [-1, '']; };
  const lead = (dg) => (dg[0] === '0' && dg.length >= 2 ? dg.slice(0, 2) : dg.slice(0, 1));
  const [pa, da] = first('TOFU'), [pb, db] = first('TF');
  if (pa >= 0 && (pb < 0 || pa <= pb)) return 'tofu' + (+lead(da));
  if (pb >= 0) return 'tofu' + (+lead(db));
  return '';
}
function areaFromFile(fileName) {
  let b = stripExt(fileName); const p = b.lastIndexOf('_');
  if (p >= 0 && b.length - p - 1 === 6 && isDigits(b.slice(p + 1))) b = b.slice(0, p);
  return b.replace(/[_ ]+$/, '');
}
const ymd = (n) => { const f = fileDate(n); return f ? f[0] * 10000 + f[1] * 100 + f[2] : 0; };
const tagOfDay = (v) => String(v % 100).padStart(2, '0') + String(Math.floor(v / 100) % 100).padStart(2, '0') + String(Math.floor(v / 10000) % 100).padStart(2, '0');
/* files: [{name, data}] -> baris job yang bisa diedit: {use, file, kind, area, profile, date} */
function prepare(files) {
  const list = files.slice().sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
  const newest = Math.max(0, ...list.map((f) => ymd(f.name)));
  return list.map((f) => {
    const kind = kindOf(f.name), loc = locationOf(f.name), dd = ymd(f.name);
    let area = '', profile = '', use = true;
    if (kind === 'exca') {
      profile = 'exca';
      const ns = letterRuns(stripExt(f.name.toUpperCase())).includes('NS') || (dd > 0 && newest > 0 && dd < newest);
      area = ns ? tagOfDay(dd) + '_exa_ns' : 'exa_ds';
    } else if (kind === 'abaikan') use = false;
    else if (rawFormat(f.data) === 'B') { profile = 'tetap'; area = areaFromFile(f.name); }
    else {
      profile = ['base', 'pelebaran', 'dumpingan'].includes(kind) ? 'base' : 'harian';
      area = kind === 'dumpingan' ? 'dumpingan' : loc ? kind + '_' + loc : kind;
      if (dd > 0 && newest > 0 && dd < newest) area = tagOfDay(dd) + '_' + area;
    }
    return { use, file: f.name, kind, area, profile, date: dd ? `${String(dd % 100).padStart(2, '0')}-${String(Math.floor(dd / 100) % 100).padStart(2, '0')}-${Math.floor(dd / 10000)}` : '' };
  });
}
/* baris tabel -> job (seperti ProsesJob di Excel): file dengan area sama digabung, exa_ds = unit di file area + file DS */
function jobFromRows(rows, o = {}) {
  const out = [], find = (kind, name) => out.find((r) => r.kind === kind && r.name.toLowerCase() === name.toLowerCase());
  const dsName = o.dsName || 'exa_ds';
  for (const r of rows) {
    if (!r.use || !r.file || !r.area || !r.profile) continue;
    const want = r.profile === 'exca' ? 'EXCA' : 'AREA';
    const k = find(want, r.area);
    if (!k) out.push(want === 'AREA' ? { kind: 'AREA', name: r.area, profile: r.profile, files: [r.file] } : { kind: 'EXCA', name: r.area, files: [r.file] });
    else k.files.push(r.file);
  }
  const areas = out.filter((r) => r.kind === 'AREA');
  if (!areas.length) throw new Error('Tidak ada baris area yang dipakai.');
  const allArea = areas.flatMap((r) => r.files), ds = find('EXCA', dsName);
  if (ds) ds.files = allArea.concat(ds.files); else out.push({ kind: 'EXCA', name: dsName, files: 'AREA' });
  if (o.roadCode !== '') out.push({ kind: 'JALAN', name: 'jalan' });
  return { date: o.date || 'auto', label: o.label || 'RTK_SMA', roadCode: o.roadCode || '7', rows: out };
}

return { readRaw, rawFormat, classify, convert, runJob, prepare, jobFromRows, resolveDate, tagOf, fileDate, kindOf, locationOf, areaFromFile, fixed, fdiv };
})();
if (typeof module !== 'undefined') module.exports = RAW;
