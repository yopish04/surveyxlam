/* ---------- alat survey: CREATE DTM, STRING OVER DTM, volume, update progress, section ---------- */
const strLayers = () => S.layers.filter((L) => L.kind === 'str');
const dtmLayers = () => S.layers.filter((L) => L.kind === 'dtm');
const byId = (id) => S.layers.find((L) => String(L.id) === String(id));
function rangesOf(s) {
  const out = [];
  for (const part of String(s).split(/[,;\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) out.push([+m[1], +m[2]]); else if (/^\d+$/.test(part)) out.push([+part, +part]);
  }
  return out;
}
function fillSelect(sel, list, empty, prefer) {
  const v = sel.value, seen = new Set((sel.dataset.seen || '').split(',').filter(Boolean));
  sel.innerHTML = (empty ? `<option value="">${empty}</option>` : '') + list.map((L) => `<option value="${L.id}">${esc(L.name)}</option>`).join('');
  const p = prefer ? prefer(list) : null;
  if (p && !seen.has(String(p.id))) sel.value = p.id;                // layer baru yang cocok: pilih otomatis
  else if ([...sel.options].some((o) => o.value === v && v !== '')) sel.value = v;
  else if (p) sel.value = p.id;
  sel.dataset.seen = list.map((L) => L.id).join(',');
}
function fillChecks(box, list, prefer) {
  const was = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
  const seen = new Set((box.dataset.seen || '').split(',').filter(Boolean));
  box.innerHTML = list.length ? list.map((L) => `<label class="chk"><input type="checkbox" value="${L.id}" ${was.has(String(L.id)) || (!seen.has(String(L.id)) && prefer && prefer(L)) ? 'checked' : ''}> ${esc(L.name)}</label>`).join('') : '<span class="muted">Belum ada file .str</span>';
  box.dataset.seen = list.map((L) => L.id).join(',');
}
const checked = (box) => [...box.querySelectorAll('input:checked')].map((i) => byId(i.value)).filter(Boolean);
const isBdy = (L) => /_bdy\b|bdy|boundary/i.test(L.name);
const isHarian = (L) => /^\d{6}(?!\d)|^\d{8}(?!\d)/.test(L.name);
const isGlobal = (L) => !isBdy(L) && !isHarian(L) && !/_CEK|_sod/i.test(L.name);
const lastOf = (f) => (list) => { const c = list.filter(f); return c[c.length - 1]; };

function refreshTools() {
  const sl = strLayers(), dl = dtmLayers();
  fillSelect($('#dtmSrc'), sl, null, lastOf(isGlobal));
  fillSelect($('#sodSrc'), sl, null, (l) => l[l.length - 1]);
  fillSelect($('#sodDtm'), dl, null, (l) => l[l.length - 1]);
  fillSelect($('#volA'), dl, null, (l) => l[0]);
  fillSelect($('#volB'), dl, null, (l) => l[l.length - 1]);
  fillSelect($('#volBdy'), sl, null, lastOf(isBdy));
  fillSelect($('#upG'), sl, null, lastOf(isGlobal));
  fillSelect($('#upBdy'), sl, '(tidak ada)', lastOf(isBdy));
  fillChecks($('#upHarian'), sl, isHarian);
  fillChecks($('#upB'), sl, isHarian);
  $('#volBtn').disabled = dl.length < 2;
  $('#sodBtn').disabled = !dl.length || !sl.length;
  autoKemarin();
  $('#secInfo').textContent = dl.length ? 'Garis section = garis Ukur. Klik titik di mode Ukur, lalu Buat section.' : 'Buka atau buat DTM dulu.';
}

/* ---------- simpan file ---------- */
S.dir = null;
async function pickDir() {
  if (!window.showDirectoryPicker) { alert('Browser ini tidak bisa memilih folder. Hasil akan diunduh ke folder Downloads.'); return; }
  try { S.dir = await window.showDirectoryPicker({ id: 'smaOut', mode: 'readwrite' }); }
  catch (e) { return; }
  for (const el of document.querySelectorAll('.dirName')) el.textContent = S.dir.name;
}
async function saveFile(name, bytes) {
  if (S.dir) {
    try {
      let exists = true;
      try { await S.dir.getFileHandle(name); } catch (e) { exists = false; }
      if (exists && !confirm(`${name} sudah ada di folder ${S.dir.name}. Timpa?`)) return false;
      const fh = await S.dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
      await w.write(bytes); await w.close(); msg(`Disimpan: ${name} → ${S.dirPath || S.dir.name}`, 'ok'); navRefreshDir(S.dir); return true;
    } catch (e) { alert('Gagal menulis ke folder: ' + e.message + '\nFile diunduh saja.'); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes])); a.download = name;
  msg(`Diunduh: ${name} (folder Downloads). Pilih folder kerja di Navigator supaya tersimpan langsung.`, 'w');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}
const latin1 = (t) => { const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i) & 255; return u; };
async function addLayerFromBytes(name, bytes) {
  const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const r = await parseFile(name, raw.slice(0));
  const old = S.layers.find((L) => L.kind === 'str' && L.name === name);
  if (old) removeLayer(old);
  return addStr(name, r, raw);
}

/* ---------- simpan .dtm (format teks Surpac) ----------
   Spesifikasi riset/volume/update_harian.py dtm_text(): header '<nama>.str,0;algorithm=standard;fields=x,y', tepi TIN sebagai
   string 1 (tertutup), OBJECT 1, TRISOLATION 1 (neighbours=yes), lalu tiap segitiga: no, titik1-3, tetangga1-3, END.
   Nomor titik = nomor baris di .str pasangannya (mulai 1, baris pemisah 0 ikut dihitung), sama dengan cara Surpac. */
function dtmText(strName, r, tris) {
  const nt = tris.length / 3, edge = new Map(), key = (a, b) => a * 4294967296 + b;
  for (let i = 0; i < nt; i++) for (let k = 0; k < 3; k++) edge.set(key(tris[3 * i + k], tris[3 * i + (k + 1) % 3]), i + 1);
  // tepi TIN: sisi tanpa tetangga, disambung jadi ring
  const nxt = new Map();
  for (let i = 0; i < nt; i++) for (let k = 0; k < 3; k++) { const a = tris[3 * i + k], b = tris[3 * i + (k + 1) % 3]; if (!edge.has(key(b, a))) nxt.set(a, b); }
  const rings = [], used = new Set();
  for (const s of [...nxt.keys()].sort((a, b) => r.y[a] - r.y[b] || r.x[a] - r.x[b])) {
    if (used.has(s)) continue;
    const ring = []; let v = s;
    while (v !== undefined && !used.has(v)) { used.add(v); ring.push(v); v = nxt.get(v); }
    if (ring.length >= 3) rings.push(ring);
  }
  const f = (v) => v.toFixed(3), L = [`${strName},0;algorithm=standard;fields=x,y`];
  for (const ring of rings) { for (const v of ring.concat(ring[0])) L.push(`1, ${f(r.y[v])}, ${f(r.x[v])}, ${f(r.z[v])}, `); L.push('0, 0.000, 0.000, 0.000,'); }
  if (!rings.length) L.push('0, 0.000, 0.000, 0.000,');
  L.push('0, 0.000, 0.000, 0.000, END', 'OBJECT, 1, ', 'TRISOLATION, 1, neighbours=yes,validated=true,closed=no,algorithm=retriangulation');
  for (let i = 0; i < nt; i++) {
    const t = [tris[3 * i], tris[3 * i + 1], tris[3 * i + 2]];
    const nb = [0, 1, 2].map((k) => edge.get(key(t[(k + 1) % 3], t[k])) || 0);
    L.push(`${i + 1}, ${t[0] + 1}, ${t[1] + 1}, ${t[2] + 1}, ${nb[0]}, ${nb[1]}, ${nb[2]}, `);
  }
  L.push('END');
  return L.join('\r\n') + '\r\n';
}
const dtmFileName = (D) => D.name.replace(/ \(dibuat\)$/, '').replace(/\.dtm$/i, '') + '.dtm';
async function saveDtm(D) {
  if (!D || D.kind !== 'dtm') { msg('Pilih layer DTM dulu (klik namanya di panel Layers).', 'w'); return false; }
  const strName = D.src.name, name = dtmFileName(D);
  const ok = await saveFile(name, latin1(dtmText(strName, D.src.r, D.tris)));
  // .dtm merujuk nomor baris .str: pastikan .str pasangannya ada di folder yang sama
  if (ok && S.dir && D.src.raw) { let ada = true; try { await S.dir.getFileHandle(strName); } catch (e) { ada = false; } if (!ada) await saveFile(strName, new Uint8Array(D.src.raw)); }
  return ok;
}

/* ---------- CREATE DTM ---------- */
async function doCreateDtm() {
  const L = byId($('#dtmSrc').value); if (!L) return;
  const out = $('#dtmOut');
  busy(`Membuat DTM dari ${L.name}…`);
  const t0 = performance.now();
  try {
    const r = await run('dtm', { r: { rows: L.r.rows, x: L.r.x, y: L.r.y, sn: L.r.sn }, skip: rangesOf($('#dtmSkip').value), spot: rangesOf($('#dtmSpot').value) });
    const ms = performance.now() - t0;
    for (const D of L.dtms.filter((d) => d.created)) removeLayer(D);
    const nm = L.name.replace(/\.str$/i, '') + '.dtm';
    attachDtm(nm, { tris: r.tris, strName: L.name }, L);
    const D = L.dtms[L.dtms.length - 1]; D.created = true; D.name = nm + ' (dibuat)';
    out.innerHTML = `<div class="big">DTM jadi: ${r.ntri.toLocaleString('id-ID')} segitiga</div>
      <table><tr><td>Titik dipakai</td><td>${r.npts.toLocaleString('id-ID')}</td></tr><tr><td>Breakline dilewati</td><td>${r.skipped}</td></tr><tr><td>Waktu</td><td>${(ms / 1000).toFixed(1)} detik</td></tr></table>
      <div class="muted">Aturan sama dengan CREATE DTM Surpac: string ${esc($('#dtmSkip').value)} tidak dipakai, string ${esc($('#dtmSpot').value)} = titik saja, string lain = breakline.</div>
      <div class="acts"><button id="dtmSave">Simpan ${esc(nm)}</button></div>`;
    $('#dtmSave').onclick = (e) => saveDtm(D).then((ok) => ok && flash(e.target, 'Tersimpan ✓'));
    renderLayers(); S.dirty = true;
    msg(`CREATE DTM ${L.name}: ${r.ntri.toLocaleString('id-ID')} segitiga, ${r.skipped} breakline dilewati, ${(ms / 1000).toFixed(1)} s`, 'ok');
  } catch (e) { out.textContent = 'Gagal: ' + e.message.split('\n')[0]; msg('CREATE DTM gagal: ' + e.message.split('\n')[0], 'e'); }
  busy(null);
}

/* ---------- string di atas DTM (SOD) ---------- */
function legCross(D, ax, ay, bx, by) {
  const g = dtmGrid(D), P = D.src.r, t = D.tris, ts = [];
  const cells = new Set(), L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / (g.cs * 0.5)));
  for (let k = 0; k <= n; k++) {
    const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
    const i = Math.floor((x - g.x0) / g.cs), j = Math.floor((y - g.y0) / g.cs);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.ny) cells.add(jj * g.nx + ii); }
  }
  const seen = new Set();
  for (const c of cells) for (let k = g.cnt[c]; k < g.cnt[c + 1]; k++) {
    const q = g.list[k]; if (seen.has(q)) continue; seen.add(q);
    for (let e = 0; e < 3; e++) {
      const u = t[3 * q + e], v = t[3 * q + (e + 1) % 3], cx = P.x[u], cy = P.y[u], dx = P.x[v], dy = P.y[v];
      const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx); if (den === 0) continue;
      const s = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den, w = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
      if (s > 1e-9 && s < 1 - 1e-9 && w >= 0 && w <= 1) ts.push(s);
    }
  }
  ts.sort((a, b) => a - b);
  return ts.filter((v, i) => i === 0 || v - ts[i - 1] > 1e-9);
}
/* pts: [{x,y,z,d}] -> titik di atas DTM; tambah = titik baru di tiap sisi segitiga yang dilewati */
function drape(D, pts, tambah) {
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], za = dtmZ(D, a.x, a.y);
    out.push({ x: a.x, y: a.y, z: isNaN(za) ? a.z : za, d: a.d || '', luar: isNaN(za) });
    if (!tambah || k + 1 >= pts.length) continue;
    const b = pts[k + 1];
    for (const s of legCross(D, a.x, a.y, b.x, b.y)) {
      const x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s, z = dtmZ(D, x, y);
      if (!isNaN(z)) out.push({ x, y, z, d: 'SOD' });
    }
  }
  return out;
}
const len2 = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; };
const len3 = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y, p[i].z - p[i - 1].z); return s; };
function strText(name, segs, axisHead) {   // segs: [{s, pts:[{x,y,z,d}]}]
  const now = new Date(), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];
  const L = [axisHead || `${name},${String(now.getDate()).padStart(2, '0')}-${mon}-${String(now.getFullYear()).slice(2)},0,0`,
    '0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000'];
  for (const g of segs) { for (const p of g.pts) L.push(`${g.s}, ${p.y.toFixed(3)}, ${p.x.toFixed(3)}, ${p.z.toFixed(3)}, ${p.d || ''}`); L.push('0, 0.000, 0.000, 0.000,'); }
  L.push('0, 0.000, 0.000, 0.000, END');
  return latin1(L.join('\r\n') + '\r\n');
}
let sodLast = null;
async function doSod() {
  const L = byId($('#sodSrc').value), D = byId($('#sodDtm').value); if (!L || !D) return;
  const want = rangesOf($('#sodStr').value), ok = (s) => !want.length || want.some(([a, b]) => s >= a && s <= b);
  const r = L.r, segs = []; let cur = null;
  for (let i = 0; i < r.rows; i++) {
    const s = r.sn[i];
    if (!s) { cur = null; continue; }
    if (!ok(s)) continue;
    if (!cur) { cur = { s, pts: [] }; segs.push(cur); }
    cur.pts.push({ x: r.x[i], y: r.y[i], z: r.z[i], d: new TextDecoder('latin1').decode(r.descBuf.subarray(r.descOff[i], r.descOff[i + 1])) });
  }
  busy('Menempel string ke DTM…');
  await new Promise((f) => setTimeout(f, 30));
  const tambah = $('#sodAdd').checked, res = segs.map((g) => ({ s: g.s, seg: 0, pts: drape(D, g.pts, tambah), n0: g.pts.length }));
  const cnt = new Map(); for (const g of res) { cnt.set(g.s, (cnt.get(g.s) || 0) + 1); g.seg = cnt.get(g.s); }
  const name = L.name.replace(/\.str$/i, '') + '_sod.str';
  const bytes = strText(name.replace(/\.str$/, ''), res);
  await addLayerFromBytes(name, bytes);
  sodLast = { name, bytes, res };
  const luar = res.reduce((a, g) => a + g.pts.filter((p) => p.luar).length, 0);
  $('#sodOut').innerHTML = `<div class="big">${res.length} segmen ditempel ke ${esc(D.name)}</div>
    <table class="mini"><thead><tr><th>String</th><th>Seg</th><th>Titik</th><th>Datar (m)</th><th>3D (m)</th></tr></thead><tbody>
    ${res.slice(0, 200).map((g) => `<tr><td>${g.s}</td><td>${g.seg}</td><td>${g.n0} → ${g.pts.length}</td><td>${len2(g.pts).toFixed(3)}</td><td>${len3(g.pts).toFixed(3)}</td></tr>`).join('')}</tbody></table>
    ${res.length > 200 ? `<div class="muted">… ${res.length - 200} segmen lagi (lengkap di Salin ke Excel)</div>` : ''}
    ${luar ? `<div class="warn">${luar} titik di luar DTM: Z-nya tidak diubah.</div>` : ''}
    <div class="acts"><button id="sodSave">Simpan ${esc(name)}</button><button id="sodCopy">Salin ke Excel</button></div>`;
  $('#sodSave').onclick = () => saveFile(name, bytes);
  $('#sodCopy').onclick = (e) => { copyText(['String\tSegmen\tTitik\tDatar\t3D', ...res.map((g) => [g.s, g.seg, g.pts.length, len2(g.pts).toFixed(3), len3(g.pts).toFixed(3)].join('\t'))].join('\r\n')); flash(e.target, 'Tersalin ✓'); };
  busy(null); renderLayers();
}
/* garis ukur ditempel ke DTM teratas lalu disimpan */
async function measSod() {
  const D = [...S.layers].reverse().find((x) => x.kind === 'dtm' && x.vis);
  if (!D || S.meas.length < 2) { alert('Perlu garis ukur (≥ 2 titik) dan DTM yang tampil.'); return; }
  const pts = drape(D, S.meas.map((p) => ({ x: p.x, y: p.y, z: isNaN(p.z) ? 0 : p.z })), true);
  const s = Math.max(1, parseInt($('#measNo').value) || 1);
  const name = 'garis_ukur_sod';
  await saveFile(name + '.str', strText(name, [{ s, pts }]));
  $('#measSum').insertAdjacentHTML('beforeend', `<div class="muted">SOD ke ${esc(D.name)}: ${pts.length} titik, datar ${len2(pts).toFixed(3)} m, 3D ${len3(pts).toFixed(3)} m.</div>`);
}

/* ---------- volume ---------- */
let volLast = null;
const tinOf = (D) => ({ x: D.src.r.x, y: D.src.r.y, z: D.src.r.z, tris: D.tris });
function bdyRings(L, no) {
  const r = L.r, out = []; let cur = [];
  for (let i = 0; i < r.rows; i++) { if (r.sn[i] === no) cur.push(r.x[i], r.y[i]); else { if (cur.length >= 6) out.push(Float64Array.from(cur)); cur = []; } }
  if (cur.length >= 6) out.push(Float64Array.from(cur));
  return out;
}
async function doVolume() {
  const A = byId($('#volA').value), B = byId($('#volB').value), Bd = byId($('#volBdy').value), no = parseInt($('#volNo').value) || 1;
  if (!A || !B || !Bd) return;
  if (A === B) { alert('Pilih dua DTM yang berbeda.'); return; }
  const rings = bdyRings(Bd, no);
  if (!rings.length) { alert(`String ${no} tidak ada di ${Bd.name}.`); return; }
  const t0 = performance.now();
  busy('Menghitung volume…');
  try {
    const res = await run('vol', { first: tinOf(A), second: tinOf(B), rings }, [], (ri, f) => busy(`Menghitung volume… segmen ${ri + 1}/${rings.length} (${Math.round(f * 100)}%)`));
    const ms = performance.now() - t0;
    volLast = { A: A.name.replace(' (dibuat)', ''), B: B.name.replace(' (dibuat)', ''), bdy: Bd.name, no, res, ms, date: new Date() };
    renderVolume();
    msg(`VOLUME ${volLast.A} → ${volLast.B} (${Bd.name} str ${no}): nett ${fv(volTotals(res).nett)} m³, ${(ms / 1000).toFixed(1)} s`, 'ok');
    if (window.SMA_DB) {          // aplikasi desktop: simpan ke riwayat volume (SQLite)
      const T = volTotals(res), pi = pitInfo(Bd.name, volLast.B);
      SMA_DB.save({ tanggal: pi.tgl, pit: pi.pit, first_dtm: volLast.A, second_dtm: volLast.B, bdy: Bd.name, string_no: no, cut: T.cut, fill: T.fill, nett: T.nett, cut_area: T.cutArea, fill_area: T.fillArea, segments: JSON.stringify(res) });
    }
  } catch (e) { $('#volOut').textContent = 'Gagal: ' + e.message.split('\n')[0]; }
  busy(null);
}
const fv = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/* nama pit & tanggal dari nama boundary: 2026_10_27_update_topo_x_bdy.str -> pit update_topo_x, 2026-10-27 */
function pitInfo(name, dtmName = '') {
  const re = /^(\d{4})_(\d{2})_(\d{2})_?(.*)$/, b = name.replace(/\.[^.]*$/, ''), m = b.match(re);
  const pit = (m ? m[4] : b).replace(/_bdy$/i, '');
  // tanggal: dari nama boundary, kalau tidak ada dari nama DTM kedua, terakhir tanggal lokal hari ini (bukan UTC)
  const k = m || dtmName.replace(/\.[^.]*$/, '').match(re), now = new Date(), p2 = (v) => String(v).padStart(2, '0');
  return { pit, tgl: k ? `${k[1]}-${k[2]}-${k[3]}` : `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}` };
}
function autoKemarin() {
  const Bd = byId($('#volBdy').value); if (!window.SMA_DB || !Bd || $('#volKemarin').dataset.manual) return;
  const B = byId($('#volB').value), pi = pitInfo(Bd.name, B ? B.name.replace(' (dibuat)', '') : '');
  SMA_DB.last(pi.pit, pi.tgl).then((r) => { if (r) { $('#volKemarin').value = r.nett.toFixed(3); $('#volKemarin').title = `dari riwayat ${r.tanggal} (${r.second_dtm})`; renderVolume(); } });
}
function volTotals(res) { const T = { cut: 0, cutArea: 0, fill: 0, fillArea: 0, nett: 0, common: 0 }; for (const v of res) for (const k in T) T[k] += v[k]; return T; }
function renderVolume() {
  const V = volLast; if (!V) return;
  const T = volTotals(V.res), kem = parseFloat(String($('#volKemarin').value).replace(/,/g, ''));
  const row = (k, v) => `<tr><td>${k}</td><td>${fv(v.cut)}</td><td>${fv(v.cutArea)}</td><td>${fv(v.fill)}</td><td>${fv(v.fillArea)}</td><td><b>${fv(v.nett)}</b></td><td>${fv(v.common)}</td></tr>`;
  $('#volOut').innerHTML = `<div class="big">Nett ${fv(T.nett)} m³</div>
    ${isNaN(kem) ? '' : `<div>Volume hari ini (nett − nett kemarin): <b>${fv(T.nett - kem)} m³</b></div>`}
    <div class="muted">${esc(V.A)} → ${esc(V.B)} · ${esc(V.bdy)} string ${V.no} · ${(V.ms / 1000).toFixed(1)} detik</div>
    <div class="scroll"><table class="mini"><thead><tr><th>Seg</th><th>Cut</th><th>Cut area</th><th>Fill</th><th>Fill area</th><th>Nett</th><th>Common</th></tr></thead>
    <tbody>${V.res.map((v, i) => row(i + 1, v)).join('')}${row('<b>Total</b>', T)}</tbody></table></div>
    <div class="acts"><button id="volCopy">Salin ke Excel</button><button id="volCsv">Simpan CSV</button><button id="volRep">Report (cetak / PDF)</button></div>`;
  $('#volCopy').onclick = (e) => { copyText(volTsv('\t')); flash(e.target, 'Tersalin ✓'); };
  $('#volCsv').onclick = () => saveFile(V.B.replace(/\.dtm$/i, '') + '_vol.csv', latin1(volTsv(';')));
  $('#volRep').onclick = volReport;
}
function volTsv(sep) {
  const V = volLast, T = volTotals(V.res), n = (v) => v.toFixed(3);
  const L = [['Segment', 'Cut Vol', 'Cut Area', 'Fill Vol', 'Fill Area', 'Nett Vol', 'Common Area'].join(sep)];
  V.res.forEach((v, i) => L.push([i + 1, n(v.cut), n(v.cutArea), n(v.fill), n(v.fillArea), n(v.nett), n(v.common)].join(sep)));
  L.push(['Total', n(T.cut), n(T.cutArea), n(T.fill), n(T.fillArea), n(T.nett), n(T.common)].join(sep));
  return L.join('\r\n');
}
function volReport() {
  const V = volLast, kem = parseFloat(String($('#volKemarin').value).replace(/,/g, ''));
  const html = volReportHtml(V, kem);
  // aplikasi desktop (Tauri) menolak window.open: tampilkan report di jendela dalam aplikasi
  const w = window.TAURI_FS ? null : window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); return; }
  showReport(html, V.B.replace(/\.dtm$/i, '') + '_vol.html');
}
/* report DTM CUT AND FILL (format Surpac) — dipakai tool Volume dan Proses Harian */
function volReportHtml(V, kem) {
  const T = volTotals(V.res);
  const d = V.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rows = V.res.map((v, i) => `<tr><td>${i + 1}</td><td>${fv(v.cut)}</td><td>${fv(v.cutArea)}</td><td>${fv(v.fill)}</td><td>${fv(v.fillArea)}</td><td>${fv(v.nett)}</td><td>${fv(v.nett)}</td><td>${fv(v.common)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(V.B)} - volume</title>
  <style>body{font:12px Arial,sans-serif;margin:28px;color:#000}h1{font-size:15px;text-align:center}table{border-collapse:collapse;width:100%;margin-top:6px}
  td,th{padding:3px 6px;text-align:right;white-space:nowrap}th{border-bottom:1px solid #000}td:first-child,th:first-child{text-align:left}tr.t td{border-top:1px solid #000;font-weight:bold}
  .k td{text-align:left;padding:1px 6px}.n{color:#555;margin-top:18px;font-size:11px}@media print{button{display:none}}</style></head><body>
  <button onclick="print()">Cetak / Simpan PDF</button>
  <h1>DTM CUT AND FILL VOLUME REPORT</h1><div style="text-align:right">${d}</div>
  <table class="k"><tr><td>First DTM:</td><td>${esc(V.A)}</td></tr><tr><td>Second DTM:</td><td>${esc(V.B)}</td></tr>
  <tr><td>Boundary file:</td><td>${esc(V.bdy)}</td></tr><tr><td>Boundary string:</td><td>${V.no}</td></tr><tr><td>Number of segments:</td><td>${V.res.length}</td></tr></table>
  <h3>Volumes</h3><table><thead><tr><th>Segment</th><th>Cut Vol</th><th>Cut Area</th><th>Fill Vol</th><th>Fill Area</th><th>Nett Vol</th><th>Nett Tonnage</th><th>Common Area</th></tr></thead>
  <tbody>${rows}<tr class="t"><td>Total</td><td>${fv(T.cut)}</td><td>${fv(T.cutArea)}</td><td>${fv(T.fill)}</td><td>${fv(T.fillArea)}</td><td>${fv(T.nett)}</td><td>${fv(T.nett)}</td><td>${fv(T.common)}</td></tr></tbody></table>
  ${isNaN(kem) ? '' : `<p><b>Volume hari ini</b> = ${fv(T.nett)} − (${fv(kem)}) = <b>${fv(T.nett - kem)}</b> m³</p>`}
  <div class="n">Dihitung dengan SMA Viewer (metode irisan TIN eksak, density 1.000).</div></body></html>`;
  return html;
}
function showReport(html, name) {
  let dl = $('#repDlg');
  if (!dl) {
    dl = document.createElement('dialog'); dl.id = 'repDlg';
    dl.innerHTML = `<div class="acts" style="justify-content:flex-end;margin:0 0 8px"><button class="primary" data-r="print">Cetak / Simpan PDF</button><button data-r="save">Simpan HTML</button><button data-r="close">Tutup</button></div>
      <iframe style="width:100%;height:calc(100% - 44px);border:1px solid var(--line);background:#fff"></iframe>`;
    dl.style.cssText = 'width:min(1000px,94vw);height:88vh;max-width:none;padding:12px';
    document.body.appendChild(dl);
    dl.addEventListener('click', (e) => {
      const r = e.target.dataset && e.target.dataset.r; if (!r) return;
      if (r === 'print') dl.querySelector('iframe').contentWindow.print();
      else if (r === 'save') saveFile(dl.dataset.name, latin1(unescape(encodeURIComponent(dl.dataset.html))));
      else dl.close();
    });
  }
  dl.dataset.name = name; dl.dataset.html = html;
  dl.querySelector('iframe').srcdoc = html;
  dl.showModal();
}

/* ---------- update progress ---------- */
function upJenis() { const j = $('#upJenis').value; for (const el of document.querySelectorAll('[data-up]')) el.hidden = !el.dataset.up.split(' ').includes(j); }
async function doUpdate() {
  const j = $('#upJenis').value, G = byId($('#upG').value);
  if (!G) { alert('Pilih file utama.'); return; }
  if (!G.raw) { alert('File ini bukan .str.'); return; }
  const args = { jenis: j, g: G.raw.slice(0), gName: G.name, tgl: $('#upTgl').value };
  const tr = [args.g];
  const raws = (list) => list.map((L) => { const b = L.raw.slice(0); tr.push(b); return b; });
  if (j === 'harian') {
    const H = checked($('#upHarian')); if (!H.length) { alert('Centang file harian.'); return; }
    const Bd = byId($('#upBdy').value);
    Object.assign(args, { bdy: Bd ? raws([Bd])[0] : null, bdyName: Bd ? Bd.name : '', bdyNo: parseInt($('#upBdyNo').value) || 1, harian: raws(H), harianNames: H.map((L) => L.name), harianNo: parseInt($('#upHarianNo').value) || 1 });
  } else if (j === 'potong') {
    const Bs = checked($('#upB')), H = $('#upAdd').checked ? checked($('#upHarian')) : [];
    if (!Bs.length) { alert('Centang file boundary.'); return; }
    Object.assign(args, { bdys: raws(Bs), bdyNames: Bs.map((L) => L.name), bdyNo: parseInt($('#upBNo').value) || 1, mode: $('#upMode').value, harian: raws(H), harianNames: H.map((L) => L.name), titikPotong: $('#upTitik').checked, outName: $('#upNama').value.trim() });
  } else {
    const Bs = checked($('#upB')); if (!Bs.length) { alert('Centang boundary B.'); return; }
    Object.assign(args, { gNo: parseInt($('#upGNo').value) || 1, bdys: raws(Bs), bdyNames: Bs.map((L) => L.name), bdyNo: parseInt($('#upBNo').value) || 1, op: $('#upOp').value, outName: $('#upNama').value.trim() });
  }
  busy('Memproses…');
  const t0 = performance.now();
  try {
    const r = await run('update', args, tr);
    const ms = performance.now() - t0;
    for (const f of r.files) await addLayerFromBytes(f.name, f.data);
    const st = r.st ? `<tr><td>Titik awal</td><td>${r.st.titik_awal.toLocaleString('id-ID')}</td></tr><tr><td>Titik dibuang</td><td>${r.st.titik_dibuang.toLocaleString('id-ID')}</td></tr><tr><td>Titik harian ditambah</td><td>${r.st.titik_harian.toLocaleString('id-ID')}</td></tr><tr><td>Titik akhir</td><td>${r.st.titik_akhir.toLocaleString('id-ID')}</td></tr>` : '';
    $('#upOut').innerHTML = `<div class="big">Selesai (${(ms / 1000).toFixed(1)} detik)</div>
      <table>${st}${r.cek ? `<tr><td>Titik dicek (_CEK, string 9006)</td><td>${r.cek}</td></tr>` : ''}</table>
      <div class="files">${r.files.map((f, i) => `<div class="frow"><span>${esc(f.name)}</span><button data-i="${i}">Simpan</button></div>`).join('')}</div>
      <div class="acts"><button id="upAll">Simpan semua</button></div>
      <div class="muted">Hasil sudah dibuka sebagai layer. Folder simpan: <b class="dirName">${S.dir ? esc(S.dir.name) : 'Downloads'}</b>.</div>`;
    $('#upOut .files').onclick = (e) => { const i = e.target.dataset.i; if (i !== undefined) saveFile(r.files[i].name, r.files[i].data).then((ok) => ok && flash(e.target, 'Tersimpan ✓')); };
    $('#upAll').onclick = async (e) => { for (const f of r.files) await saveFile(f.name, f.data); flash(e.target, 'Tersimpan ✓'); };
    renderLayers(); zoomAll();
    msg(`UPDATE (${j}): ${r.files.map((f) => f.name).join(', ')}${r.cek ? ` · ${r.cek} titik _CEK` : ''}`, 'ok');
    if (S.dir && $('#upAuto').checked) { for (const f of r.files) await saveFile(f.name, f.data); }
  } catch (e) { $('#upOut').textContent = 'Gagal: ' + e.message.split('\n')[0]; msg('UPDATE gagal: ' + e.message.split('\n')[0], 'e'); }
  busy(null);
}

/* ---------- section ---------- */
let secLast = null;
function doSection() {
  const D = dtmLayers().filter((x) => x.vis);
  if (!D.length) { alert('Tampilkan minimal satu DTM.'); return; }
  if (S.meas.length < 2) { alert('Buat garis dulu di mode Ukur (klik ≥ 2 titik).'); setTool('meas'); return; }
  const m = S.meas, ch = [];       // {c, x, y}
  let c0 = 0;
  for (let k = 0; k + 1 < m.length; k++) {
    const a = m[k], b = m[k + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    const ts = new Set([0]);
    for (const d of D) for (const s of legCross(d, a.x, a.y, b.x, b.y)) ts.add(s);
    if (k + 2 === m.length) ts.add(1);
    for (const s of [...ts].sort((p, q) => p - q)) ch.push({ c: c0 + s * L, x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    c0 += L;
  }
  const z = D.map((d) => ch.map((p) => dtmZ(d, p.x, p.y)));
  secLast = { D, ch, z };
  const W = 400, H = 220, pad = 38;
  let zmin = Infinity, zmax = -Infinity;
  for (const r of z) for (const v of r) if (!isNaN(v)) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
  if (!isFinite(zmin)) { $('#secOut').textContent = 'Garis tidak melewati DTM.'; return; }
  const span = Math.max(zmax - zmin, 1); zmin -= span * 0.05; zmax += span * 0.05;
  const cl = ch[ch.length - 1].c || 1, sx = (c) => pad + c / cl * (W - pad - 8), sy = (v) => H - 22 - (v - zmin) / (zmax - zmin) * (H - 32);
  const cols = ['#d64545', '#1f6feb', '#2e9d5b', '#c47f00', '#8e44ad'];
  const paths = z.map((r, i) => {
    let d = '', pen = false;
    r.forEach((v, j) => { if (isNaN(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + sx(ch[j].c).toFixed(1) + ',' + sy(v).toFixed(1); pen = true; });
    return `<path d="${d}" fill="none" stroke="${cols[i % cols.length]}" stroke-width="1.6"/>`;
  }).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => { const v = zmin + f * (zmax - zmin); return `<text x="${pad - 4}" y="${sy(v) + 3}" text-anchor="end">${v.toFixed(0)}</text><line x1="${pad}" x2="${W - 8}" y1="${sy(v)}" y2="${sy(v)}" class="gr"/>`; }).join('')
    + [0, 0.5, 1].map((f) => `<text x="${sx(f * cl)}" y="${H - 6}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${(f * cl).toFixed(0)} m</text>`).join('');
  $('#secOut').innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="sec">${ticks}${paths}</svg>
    <div class="legend">${D.map((d, i) => `<span><i style="background:${cols[i % cols.length]}"></i>${esc(d.name)}</span>`).join('')}</div>
    <div class="muted">Panjang ${f3(cl)} m · ${ch.length} titik (tiap perpotongan sisi segitiga).</div>
    <div class="acts"><button id="secCopy">Salin ke Excel</button></div>`;
  $('#secCopy').onclick = (e) => {
    const L = [['Jarak', 'Y', 'X', ...D.map((d) => 'Z ' + d.name)].join('\t')];
    ch.forEach((p, j) => L.push([p.c.toFixed(3), p.y.toFixed(3), p.x.toFixed(3), ...z.map((r) => isNaN(r[j]) ? '' : r[j].toFixed(3))].join('\t')));
    copyText(L.join('\r\n')); flash(e.target, 'Tersalin ✓');
  };
}

$('#dtmBtn').onclick = doCreateDtm;
$('#sodBtn').onclick = doSod;
$('#volBtn').onclick = doVolume;
$('#volKemarin').oninput = (e) => { e.target.dataset.manual = e.target.value ? '1' : ''; renderVolume(); };
$('#volBdy').addEventListener('change', autoKemarin);
$('#volB').addEventListener('change', autoKemarin);
$('#upJenis').onchange = upJenis; upJenis();
$('#upBtn').onclick = doUpdate;
$('#secBtn').onclick = doSection;
$('#measSod').onclick = measSod;
refreshTools();

/* ---------- TXT ke STR: data mentah alat -> .str (port raw2str.py / add-in Excel) ---------- */
const RJ = { files: [], rows: [], src: '' };
async function rawLoadDir(h, label) {
  const files = [];
  busy('Membaca file .txt…');
  try {
    for await (const e of h.values()) if (e.kind === 'file' && /\.txt$/i.test(e.name)) {
      const f = await e.getFile(); files.push({ name: e.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
  } catch (err) { msg('Tidak bisa membaca folder: ' + err.message, 'e'); }
  busy(null);
  rawSet(files, label || h.path || h.name);
}
function rawSet(files, src) {
  RJ.files = files; RJ.src = src;
  RJ.rows = RAW.prepare(files);
  $('#rawRes').innerHTML = '';
  renderRaw(); showTab('tRaw'); harRefresh();
  if (!files.length) msg(`Tidak ada file .txt di ${src}`, 'w');
  else msg(`TXT ke STR: ${files.length} file .txt dari ${src}. Periksa kolom Area dan Profil, lalu Proses.`);
}
function renderRaw() {
  $('#rawSrc').textContent = RJ.src ? `${RJ.src} · ${RJ.files.length} file .txt` : 'Belum ada data.';
  const prof = ['harian', 'base', 'tetap', 'exca'];
  $('#rawTbl').innerHTML = RJ.rows.map((r, i) => `<tr data-i="${i}" class="${r.use ? '' : 'off'}"><td><input type="checkbox" data-f="use" ${r.use ? 'checked' : ''}></td>
    <td title="${esc(r.file)}">${esc(r.file)}</td><td>${esc(r.kind)}</td><td><input data-f="area" value="${esc(r.area)}"></td>
    <td><select data-f="profile"><option value=""></option>${prof.map((p) => `<option${p === r.profile ? ' selected' : ''}>${p}</option>`).join('')}</select></td><td>${esc(r.date)}</td></tr>`).join('')
    || '<tr><td colspan="6" class="muted">—</td></tr>';
}
$('#rawTbl').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-i]'), f = e.target.dataset.f; if (!tr || !f) return;
  const r = RJ.rows[+tr.dataset.i];
  r[f] = f === 'use' ? e.target.checked : e.target.value.trim();
  tr.classList.toggle('off', !r.use);
  harRefresh();
});
$('#rawDir').onclick = async () => {
  let h = null;
  if (window.TAURI_FS) h = await TAURI_FS.pickDir(true);
  else if (window.showDirectoryPicker) { try { h = await window.showDirectoryPicker({ id: 'smaRaw', mode: 'read' }); } catch (e) { return; } }
  else { $('#rawFileIn').click(); return; }
  if (h) await rawLoadDir(h);
};
$('#rawNav').onclick = () => {
  let n = NAV.sel; if (n && n.kind !== 'directory') n = n.parent;
  if (!n) { msg('Pilih folder (atau file .txt) di Navigator dulu.', 'w'); return; }
  rawLoadDir(n.h, pathOf(n));
};
$('#rawFileIn').onchange = async (e) => {
  const files = [];
  for (const f of e.target.files) files.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
  e.target.value = '';
  rawSet(files, 'file pilihan');
};
/* simpan hasil ke folder simpan/<subfolder> (nama 'gabung/x.str' = subfolder gabung) */
async function rawDir(parts, create) { let d = S.dir; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; }
async function rawSave(sub, files) {
  if (!S.dir) { for (const f of files) await saveFile(f.name.replace(/\//g, '_'), f.data); return 'Downloads'; }
  const base = sub.split(/[\\/]+/).filter(Boolean);
  let ada = 0;
  for (const f of files) {
    const parts = f.name.split('/');
    try { await (await rawDir(base.concat(parts.slice(0, -1)), false)).getFileHandle(parts[parts.length - 1]); ada++; } catch (e) { /* belum ada */ }
  }
  if (ada && !confirm(`${ada} file hasil sudah ada di ${S.dirPath || S.dir.name}\\${base.join('\\')}. Timpa?`)) return null;
  for (const f of files) {
    const parts = f.name.split('/'), d = await rawDir(base.concat(parts.slice(0, -1)), true);
    const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
    await w.write(f.data); await w.close();
  }
  navRefresh();
  return [S.dirPath || S.dir.name, ...base].join('\\');
}
async function doRaw() {
  if (!RJ.files.length) { alert('Pilih folder data mentah dulu.'); return; }
  let job;
  try { job = RAW.jobFromRows(RJ.rows, { date: $('#rawTgl').value.trim() || 'auto', label: $('#rawLabel').value.trim() || 'RTK_SMA', roadCode: $('#rawJalan').value.trim(), dsName: $('#rawDs').value.trim() || 'exa_ds' }); }
  catch (e) { alert(e.message); return; }
  const used = new Set(job.rows.flatMap((r) => (Array.isArray(r.files) ? r.files : [])));
  const files = RJ.files.filter((f) => used.has(f.name)).map((f) => [f.name, f.data.slice()]);
  busy('TXT ke STR…');
  const t0 = performance.now();
  try {
    const r = await run('raw', { job, files }, files.map(([, d]) => d.buffer));
    const ms = performance.now() - t0;
    const where = await rawSave($('#rawOut').value.trim(), r.files);
    const strs = r.files.filter((f) => /\.str$/i.test(f.name));
    $('#rawRes').innerHTML = `<div class="big">Selesai (${(ms / 1000).toFixed(1)} detik) · tanggal ${esc(r.date)}</div>
      <div class="muted">${where ? `${r.files.length} file disimpan ke <b>${esc(where)}</b>` : 'Tidak disimpan (dibatalkan).'}</div>
      <pre>${esc(r.log.join('\n'))}</pre>
      <div class="files">${strs.map((f, i) => `<div class="frow"><span>${esc(f.name)}</span><button data-i="${i}">Buka</button></div>`).join('')}</div>`;
    $('#rawRes .files').onclick = (e) => { const i = e.target.dataset.i; if (i !== undefined) addLayerFromBytes(strs[i].name.split('/').pop(), strs[i].data.slice()).then(() => { renderLayers(); zoomAll(); }); };
    if ($('#rawOpen').checked) {
      const areaNames = new Set(job.rows.filter((x) => x.kind === 'AREA').map((x) => x.name));
      for (const f of strs) if (!f.name.includes('/') && !/_CEK\.str$/i.test(f.name) && [...areaNames].some((a) => f.name.endsWith(a + '.str'))) await addLayerFromBytes(f.name, f.data.slice());
      renderLayers(); zoomAll();
    }
    msg(`TXT ke STR ${r.tag}: ${strs.length} file .str${where ? ' → ' + where : ''}`, 'ok');
    for (const l of r.log) if (/PERLU|CEK/.test(l)) msg(l.trim(), 'w');
  } catch (e) { $('#rawRes').textContent = 'Gagal: ' + e.message.split('\n')[0]; msg('TXT ke STR gagal: ' + e.message.split('\n')[0], 'e'); }
  busy(null);
}
$('#rawBtn').onclick = doRaw;
