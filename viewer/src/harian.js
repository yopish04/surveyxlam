/* ---------- PROSES HARIAN: satu klik ----------
   TXT -> STR harian -> update global + boundary (= Update harian / Excel) -> CREATE DTM -> volume (base vs global baru
   di dalam boundary baru) -> report + riwayat. Mesin yang dipakai sama dengan tool masing-masing, jadi hasilnya sama.
   Per area dicari di folder kerja: global lama YYYY_MM_DD_update_topo_<area>.str (tanggal terbaru sebelum hari proses),
   boundary lama <global>_bdy.str, dan base (file berisi "base" + nama area; pilihan disimpan di sma_harian.json). */
const HAR = { files: [], cfg: { base: {} }, rows: [] };
const HAR_CFG = 'sma_harian.json';
const ymdOf = (t) => (t ? t[0] * 10000 + t[1] * 100 + t[2] : 0);
const GLOBAL_RE = /^(\d{4})_(\d{2})_(\d{2})_update_topo_(.+)\.str$/i;
/* semua .str/.dtm di folder kerja (sampai 2 tingkat subfolder) */
async function harList() {
  const out = [];
  const walk = async (dir, rel, depth) => {
    for await (const e of dir.values()) {
      if (e.kind === 'directory') { if (depth > 0 && !/^(gabung|backup)/i.test(e.name)) await walk(e, rel.concat(e.name), depth - 1); }
      else if (/\.(str|dtm)$/i.test(e.name)) out.push({ name: e.name, rel: rel.concat(e.name).join('\\'), h: e, dir });
    }
  };
  if (S.dir) await walk(S.dir, [], 2);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
async function harLoadCfg() {
  HAR.cfg = { base: {} };
  if (!S.dir) return;
  try { const f = await (await S.dir.getFileHandle(HAR_CFG)).getFile(); HAR.cfg = Object.assign({ base: {} }, JSON.parse(await f.text())); } catch (e) { /* belum ada */ }
}
async function harSaveCfg() {
  if (!S.dir) return;
  try { const w = await (await S.dir.getFileHandle(HAR_CFG, { create: true })).createWritable(); await w.write(new TextEncoder().encode(JSON.stringify(HAR.cfg, null, 1))); await w.close(); } catch (e) { msg('Tidak bisa menyimpan ' + HAR_CFG + ': ' + e.message, 'w'); }
}
/* pasangan otomatis per area */
function harGuess(area, day) {
  const a = area.toLowerCase(), f = HAR.files;
  let g = null;
  for (const x of f) {
    const m = GLOBAL_RE.exec(x.name); if (!m || /_bdy$/i.test(m[4]) || m[4].toLowerCase() !== a) continue;
    const d = +m[1] * 10000 + +m[2] * 100 + +m[3];
    if (d < day && (!g || d > g.d)) g = { d, x };
  }
  const glob = g ? g.x : null;
  const bdy = glob ? f.find((x) => x.dir === glob.dir && x.name.toLowerCase() === glob.name.toLowerCase().replace(/\.str$/, '_bdy.str')) : null;
  const saved = HAR.cfg.base[a], loc = RAW.locationOf(area) || a;
  const base = (saved && f.find((x) => x.rel === saved)) || f.find((x) => /base/i.test(x.name) && x.name.toLowerCase().includes(a) && /\.str$/i.test(x.name))
    || f.find((x) => /base/i.test(x.name) && x.name.toLowerCase().includes(loc));
  return { glob, bdy, base };
}
async function harRefresh() {
  const box = $('#harTbl');
  if (!RJ.files.length) { box.innerHTML = '<tr><td class="muted" colspan="4">Pilih folder data mentah dulu.</td></tr>'; return; }
  if (!S.dir) { box.innerHTML = '<tr><td class="muted" colspan="4">Set work directory dulu (folder berisi file global, boundary dan base).</td></tr>'; return; }
  HAR.files = await harList(); await harLoadCfg();
  let job; try { job = RAW.jobFromRows(RJ.rows, harOpts()); } catch (e) { box.innerHTML = `<tr><td class="muted" colspan="4">${esc(e.message)}</td></tr>`; return; }
  const date = RAW.resolveDate(job.date, RJ.files.map((f) => f.name)), day = ymdOf(PG.tglTeks(date, '')) || 99999999;
  HAR.rows = job.rows.filter((r) => r.kind === 'AREA').map((r) => ({ area: r.name, ...harGuess(r.name, day) }));
  const opt = (sel, re) => `<option value="">—</option>` + HAR.files.filter((x) => re.test(x.name)).map((x) => `<option value="${esc(x.rel)}"${sel === x ? ' selected' : ''}>${esc(x.rel)}</option>`).join('');
  box.innerHTML = HAR.rows.map((r, i) => `<tr data-i="${i}"><td>${esc(r.area)}</td><td><select data-f="glob">${opt(r.glob, /\.str$/i)}</select></td>
    <td><select data-f="bdy">${opt(r.bdy, /\.str$/i)}</select></td><td><select data-f="base">${opt(r.base, /\.(str|dtm)$/i)}</select></td></tr>`).join('');
  $('#harInfo').textContent = `Tanggal proses ${date}. Global lama = update_topo terbaru sebelum tanggal ini; base diingat per area di ${HAR_CFG}.`;
}
function harOpts() { return { date: $('#rawTgl').value.trim() || 'auto', label: $('#rawLabel').value.trim() || 'RTK_SMA', roadCode: $('#rawJalan').value.trim(), dsName: $('#rawDs').value.trim() || 'exa_ds' }; }
$('#harTbl').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-i]'), f = e.target.dataset.f; if (!tr || !f) return;
  HAR.rows[+tr.dataset.i][f] = HAR.files.find((x) => x.rel === e.target.value) || null;
});
const harBytes = async (x) => new Uint8Array(await (await x.h.getFile()).arrayBuffer());
async function harWrite(dir, name, bytes) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(bytes); await w.close();
}
const harRings = (r, no = 1) => bdyRings({ r }, no);
/* TIN untuk volume: .dtm (segitiga Surpac, butuh .str-nya di folder yang sama) atau .str (CREATE DTM, aturan sama dengan tool DTM) */
async function harTin(x, label) {
  if (/\.dtm$/i.test(x.name)) {
    const d = await parseFile(x.name, (await harBytes(x)).buffer);
    const sx = HAR.files.find((f) => f.dir === x.dir && f.name.toLowerCase() === String(d.strName).toLowerCase());
    if (!sx) throw new Error(`${x.name} butuh ${d.strName} di folder yang sama`);
    const r = await parseFile(sx.name, (await harBytes(sx)).buffer);
    return { r, tris: d.tris, name: x.name };
  }
  const r = await parseFile(x.name, (await harBytes(x)).buffer);
  return { r, ...(await harDtm(r)), name: x.name.replace(/\.str$/i, '.dtm'), label };
}
async function harDtm(r) {
  const d = await run('dtm', { r: { rows: r.rows, x: r.x, y: r.y, sn: r.sn }, skip: rangesOf($('#dtmSkip').value), spot: rangesOf($('#dtmSpot').value) });
  return { tris: d.tris, ntri: d.ntri, skipped: d.skipped };
}
const harVol = (A, B, rings) => run('vol', { first: { x: A.r.x, y: A.r.y, z: A.r.z, tris: A.tris }, second: { x: B.r.x, y: B.r.y, z: B.r.z, tris: B.tris }, rings });
async function doHarian() {
  if (!RJ.files.length) { alert('Pilih folder data mentah dulu.'); return; }
  if (!S.dir) { alert('Set work directory dulu (folder berisi file global, boundary dan base).'); return; }
  if (!HAR.rows.length) await harRefresh();
  const t0 = performance.now(), out = [], log = [];
  busy('Proses harian: TXT ke STR…');
  try {
    // 1. TXT -> STR (sama dengan tombol Proses)
    const job = RAW.jobFromRows(RJ.rows, harOpts());
    const used = new Set(job.rows.flatMap((r) => (Array.isArray(r.files) ? r.files : [])));
    const files = RJ.files.filter((f) => used.has(f.name)).map((f) => [f.name, f.data.slice()]);
    const raw = await run('raw', { job, files }, files.map(([, d]) => d.buffer));
    const where = await rawSave($('#rawOut').value.trim(), raw.files.map((f) => ({ name: f.name, data: f.data.slice() })));
    if (!where) { busy(null); return; }
    log.push(`TXT ke STR ${raw.tag}: ${raw.files.filter((f) => /\.str$/i.test(f.name)).length} file .str → ${where}`);
    const tgl = PG.tglTeks(raw.date, '');
    if (!tgl) throw new Error(`Tanggal "${raw.date}" tidak dikenali; isi Tanggal mis. 2026-10-27`);
    const dt = new Date(tgl[0], tgl[1] - 1, tgl[2]), iso = `${tgl[0]}-${String(tgl[1]).padStart(2, '0')}-${String(tgl[2]).padStart(2, '0')}`;
    // 2-6 per area
    for (const row of HAR.rows) {
      const area = job.rows.find((r) => r.kind === 'AREA' && r.name === row.area), fname = (/^\d{6}_|^\d{8}_/.test(row.area) ? row.area : raw.tag + '_' + row.area) + '.str';
      const harian = raw.files.find((f) => f.name === fname);
      if (!area || !harian) { log.push(`${row.area}: file harian tidak ditemukan`); continue; }
      if (!row.glob) { log.push(`${row.area}: tidak ada global lama (YYYY_MM_DD_update_topo_${row.area}.str) — hanya TXT ke STR`); out.push({ area: row.area, skip: 'tanpa global lama' }); continue; }
      busy(`Proses harian ${row.area}: update global + boundary…`);
      const gB = await harBytes(row.glob), bB = row.bdy ? await harBytes(row.bdy) : null;
      const up = await run('update', { jenis: 'harian', g: gB.buffer.slice(0), gName: row.glob.name, bdy: bB ? bB.buffer.slice(0) : null, bdyName: row.bdy ? row.bdy.name : '', bdyNo: 1,
        harian: [harian.data.slice().buffer], harianNames: [fname], harianNo: 1, tgl: iso });
      const gNew = up.files[0], bNew = up.files.find((f) => /_bdy\.str$/i.test(f.name)), cek = up.files.find((f) => /_CEK\.str$/i.test(f.name));
      for (const f of up.files) await harWrite(row.glob.dir, f.name, f.data.slice());
      const dirPath = (row.glob.rel.includes('\\') ? (S.dirPath || S.dir.name) + '\\' + row.glob.rel.replace(/\\[^\\]*$/, '') : (S.dirPath || S.dir.name));
      log.push(`${row.area}: ${up.files.map((f) => f.name).join(', ')} → ${dirPath} (titik ${up.st.titik_awal} → ${up.st.titik_akhir}${up.cek ? `, ${up.cek} titik _CEK` : ''})`);
      const rec = { area: row.area, files: up.files.map((f) => f.name), st: up.st };
      if (!row.base || !bNew) { log.push(`${row.area}: ${!row.base ? 'base belum dipilih' : 'boundary baru tidak ada'} — volume dilewati`); out.push(Object.assign(rec, { skip: !row.base ? 'base belum dipilih' : 'tanpa boundary' })); continue; }
      // 3. CREATE DTM (global baru, global lama) + base
      busy(`Proses harian ${row.area}: CREATE DTM…`);
      const rNew = await parseFile(gNew.name, gNew.data.slice().buffer), Dn = { r: rNew, ...(await harDtm(rNew)), name: gNew.name.replace(/\.str$/i, '.dtm') };
      const Db = await harTin(row.base, 'base'), Do = await harTin(row.glob, 'lama');
      const rB = await parseFile(bNew.name, bNew.data.slice().buffer), rings = harRings(rB);
      // 4. volume base -> global baru di dalam boundary baru, dan kemarin: base -> global lama di dalam boundary lama
      busy(`Proses harian ${row.area}: volume…`);
      const res = await harVol(Db, Dn, rings);
      let kem = NaN, resOld = null;
      if (bB) { const rBo = await parseFile(row.bdy.name, bB.buffer.slice(0)); const ro = harRings(rBo); if (ro.length) { resOld = await harVol(Db, Do, ro); kem = volTotals(resOld).nett; } }
      const T = volTotals(res);
      // 5. report + riwayat
      const V = { A: Db.name, B: Dn.name, bdy: bNew.name, no: 1, res, date: dt };
      const html = volReportHtml(V, kem), repName = gNew.name.replace(/\.str$/i, '') + '_vol.html';
      await harWrite(row.glob.dir, repName, latin1(unescape(encodeURIComponent(html))));
      const pi = pitInfo(bNew.name, Dn.name);
      if (window.SMA_DB) SMA_DB.save({ tanggal: pi.tgl, pit: pi.pit, first_dtm: V.A, second_dtm: V.B, bdy: V.bdy, string_no: 1, cut: T.cut, fill: T.fill, nett: T.nett, cut_area: T.cutArea, fill_area: T.fillArea, segments: JSON.stringify(res) });
      // tampil sebagai layer: global baru + DTM-nya, boundary baru
      await addLayerFromBytes(gNew.name, gNew.data.slice()); const Lg = S.layers.find((L) => L.kind === 'str' && L.name === gNew.name);
      if (Lg) { attachDtm(Dn.name, { tris: Dn.tris.slice(), strName: gNew.name }, Lg); const D = Lg.dtms[Lg.dtms.length - 1]; D.created = true; }
      await addLayerFromBytes(bNew.name, bNew.data.slice());
      if (cek) await addLayerFromBytes(cek.name, cek.data.slice());
      log.push(`${row.area}: DTM ${Dn.ntri} segitiga; volume ${Db.name} → ${Dn.name}: nett ${fv(T.nett)} m³${isNaN(kem) ? '' : `, kemarin ${fv(kem)}, hari ini ${fv(T.nett - kem)}`} → ${repName}`);
      out.push(Object.assign(rec, { T, kem, html, repName, V }));
      HAR.cfg.base[row.area.toLowerCase()] = row.base.rel;
    }
    await harSaveCfg(); navRefresh(); renderLayers(); zoomAll();
    const ms = performance.now() - t0;
    HAR.last = out;
    $('#harRes').innerHTML = `<div class="big">Proses harian selesai (${(ms / 1000).toFixed(1)} detik) · ${esc(raw.date)}</div>
      <table class="mini"><thead><tr><th>Area</th><th>Nett</th><th>Nett kemarin</th><th>Hari ini</th><th></th></tr></thead><tbody>
      ${out.map((o, i) => o.T ? `<tr><td>${esc(o.area)}</td><td>${fv(o.T.nett)}</td><td>${isNaN(o.kem) ? '–' : fv(o.kem)}</td><td><b>${isNaN(o.kem) ? '–' : fv(o.T.nett - o.kem)}</b></td><td><button data-i="${i}">Report</button></td></tr>`
        : `<tr><td>${esc(o.area)}</td><td colspan="4" class="muted">${esc(o.skip)}</td></tr>`).join('')}</tbody></table>
      <pre>${esc(log.join('\n'))}</pre>`;
    $('#harRes tbody').onclick = (e) => { const i = e.target.dataset.i; if (i !== undefined) showReport(out[i].html, out[i].repName); };
    msg(`PROSES HARIAN ${raw.date}: ${out.filter((o) => o.T).length} area dengan volume, ${out.filter((o) => !o.T).length} tanpa volume`, 'ok');
    for (const l of log) msg(l, /dilewati|tidak ada|tidak ditemukan/.test(l) ? 'w' : '');
  } catch (e) { $('#harRes').textContent = 'Gagal: ' + e.message.split('\n')[0]; msg('PROSES HARIAN gagal: ' + e.message.split('\n')[0], 'e'); }
  busy(null);
}
$('#harBtn').onclick = doHarian;
$('#harScan').onclick = harRefresh;
