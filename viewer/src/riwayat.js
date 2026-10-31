/* ---------- riwayat volume + report harian Excel ----------
   Desktop: SQLite (tauri.js). Browser: IndexedDB dengan aturan yang sama (hitung ulang pit + tanggal + DTM kedua
   yang sama menggantikan yang lama; "kemarin" = catatan terakhir pit itu sebelum tanggalnya). */
if (!window.SMA_DB) {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('smaVolume', 1); r.onupgradeneeded = () => r.result.createObjectStore('volumes', { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = async () => { const db = await open(); return new Promise((res, rej) => { const q = db.transaction('volumes').objectStore('volumes').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  const tx = async (fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('volumes', 'readwrite'), s = t.objectStore('volumes'); const out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  const urut = (a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id);
  window.SMA_DB = {
    async save(rec) {
      try {
        const old = (await all()).filter((v) => v.pit === rec.pit && v.tanggal === rec.tanggal && v.second_dtm === rec.second_dtm);
        const now = new Date(), p2 = (v) => String(v).padStart(2, '0');
        return await tx((s) => { for (const v of old) s.delete(v.id); const r = { ...rec }; delete r.id; r.created_at = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`; return s.add(r); });
      } catch (e) { msg('Gagal menyimpan riwayat volume: ' + e, 'e'); return null; }
    },
    async last(pit, before) { try { return (await all()).filter((v) => v.pit === pit && v.tanggal < before).sort(urut)[0] || null; } catch (e) { return null; } },
    async history(pit, limit = 60) { try { return (await all()).filter((v) => !pit || v.pit === pit).sort(urut).slice(0, limit); } catch (e) { return []; } },
    del: (id) => tx((s) => s.delete(id)),
    where: 'browser ini (IndexedDB)',
  };
}

/* report harian ke template Excel: template_report_harian.xlsx di folder kerja (dibuat dari template bawaan kalau belum ada) */
const TPL_NAME = 'template_report_harian.xlsx';
async function reportExcel(iso, items) {
  let tpl = null;
  if (S.dir) { try { tpl = new Uint8Array(await (await (await S.dir.getFileHandle(TPL_NAME)).getFile()).arrayBuffer()); } catch (e) { /* belum ada */ } }
  if (!tpl) {
    tpl = await XL.defaultTemplate();
    if (S.dir) { await saveFile(TPL_NAME, tpl.slice()); msg(`${TPL_NAME} dibuat di folder kerja — tata letaknya bisa diedit di Excel, penanda {{…}} diisi otomatis.`); }
  }
  const t = iso.split('-').map(Number), vals = XL.blankRest(XL.valuesOf(iso, items, PG.tglSurpac(t)));
  const r = await XL.fill(tpl, vals), name = `${iso.replace(/-/g, '_')}_report_harian.xlsx`;
  if (r.missing.length) msg(`Template: penanda tanpa nilai: ${r.missing.slice(0, 8).join(', ')}${r.missing.length > 8 ? ' …' : ''}`, 'w');
  const ok = await saveFile(name, r.data);
  return ok ? name : null;
}

/* jendela Volumes > Riwayat volume */
const RW = { rows: [] };
async function riwRefresh() {
  const all = await SMA_DB.history('', 5000), pit = $('#riwPit').value;
  // hari ini = nett - nett catatan sebelumnya (pit yang sama, tanggal lebih awal)
  const by = new Map();
  for (const v of [...all].sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.id - b.id))) {
    const prev = by.get(v.pit); v.prev = prev ? prev.nett : NaN; v.hari = prev ? v.nett - prev.nett : NaN; by.set(v.pit, v);
  }
  const pits = [...new Set(all.map((v) => v.pit))].sort();
  $('#riwPit').innerHTML = `<option value="">semua pit (${pits.length})</option>` + pits.map((p) => `<option${p === pit ? ' selected' : ''}>${esc(p)}</option>`).join('');
  RW.rows = all.filter((v) => !pit || v.pit === pit);
  const dates = [...new Set(RW.rows.map((v) => v.tanggal))];
  $('#riwTgl').innerHTML = dates.map((d) => `<option>${esc(d)}</option>`).join('');
  $('#riwWhere').textContent = `${RW.rows.length} catatan · disimpan di ${SMA_DB.where || 'aplikasi'}`;
  $('#riwTbl tbody').innerHTML = RW.rows.map((v, i) => `<tr title="${esc(`${v.first_dtm} → ${v.second_dtm} · ${v.bdy} str ${v.string_no} · ${v.created_at || ''}`)}"><td>${esc(v.tanggal)}</td><td>${esc(v.pit)}</td>
    <td>${fv(v.nett)}</td><td>${isNaN(v.prev) ? '–' : fv(v.prev)}</td><td><b>${isNaN(v.hari) ? '–' : fv(v.hari)}</b></td><td>${fv(v.cut)}</td><td>${fv(v.fill)}</td>
    <td>${esc(v.second_dtm)}</td><td><a data-del="${i}" title="Hapus catatan ini">✕</a></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Belum ada riwayat. Hitung volume (Volumes › DTM cut and fill) atau jalankan Proses Harian.</td></tr>';
}
const riwTsv = (sep) => [['Tanggal', 'Pit', 'Nett', 'Nett sebelumnya', 'Hari ini', 'Cut', 'Fill', 'Cut area', 'Fill area', 'First DTM', 'Second DTM', 'Boundary', 'String'].join(sep),
  ...RW.rows.map((v) => [v.tanggal, v.pit, v.nett.toFixed(3), isNaN(v.prev) ? '' : v.prev.toFixed(3), isNaN(v.hari) ? '' : v.hari.toFixed(3), v.cut.toFixed(3), v.fill.toFixed(3), (v.cut_area || 0).toFixed(3), (v.fill_area || 0).toFixed(3), v.first_dtm, v.second_dtm, v.bdy, v.string_no].join(sep))].join('\r\n');
$('#riwPit').onchange = riwRefresh;
$('#riwCopy').onclick = (e) => { copyText(riwTsv('\t')); flash(e.target, 'Tersalin ✓'); };
$('#riwCsv').onclick = () => saveFile('riwayat_volume.csv', latin1(riwTsv(';')));
$('#riwTbl').addEventListener('click', async (e) => {
  const i = e.target.dataset && e.target.dataset.del; if (i === undefined) return;
  const v = RW.rows[+i]; if (!confirm(`Hapus catatan ${v.pit} tanggal ${v.tanggal} (nett ${fv(v.nett)})?`)) return;
  await SMA_DB.del(v.id); msg(`Riwayat dihapus: ${v.pit} ${v.tanggal}`); riwRefresh();
});
$('#riwXls').onclick = async () => {
  const d = $('#riwTgl').value; if (!d) return;
  const items = RW.rows.filter((v) => v.tanggal === d).map((v) => ({ area: v.pit, first_dtm: v.first_dtm, second_dtm: v.second_dtm, bdy: v.bdy, cut: v.cut, fill: v.fill, nett: v.nett, nett_kemarin: v.prev }));
  const name = await reportExcel(d, items); if (name) msg(`Report Excel ${d}: ${name}`, 'ok');
};
