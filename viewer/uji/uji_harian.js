// Dipakai run_harian.sh: Proses Harian di aplikasi desktop tiruan (Tauri palsu -> sistem file sungguhan).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], PAGE = process.argv[3], OUT = process.argv[4];
const map = (p) => { const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(p); return path.join(ROOT, m[1].toUpperCase(), m[2].replace(/\\/g, '/')); };
const ent = (name, st) => ({ name, dir: st.isDirectory(), size: st.isDirectory() ? 0 : st.size, modified: st.mtimeMs });
const DB = { rows: [{ id: 1, tanggal: '2026-10-25', pit: 'pit_tofu3', first_dtm: 'base_pit_tofu3.dtm', second_dtm: '2026_10_25_update_topo_pit_tofu3.dtm', bdy: '2026_10_25_update_topo_pit_tofu3_bdy.str', string_no: 1, cut: 30007.1, fill: 0, nett: -30007.1, cut_area: 2800, fill_area: 0, segments: '[]', created_at: '2026-10-25 18:00:00' }], id: 1 };
const urut = (a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.id - a.id);
const H = {
  list_dir: ({ path: p }) => fs.readdirSync(map(p)).map((n) => ent(n, fs.statSync(path.join(map(p), n)))),
  stat_path: ({ path: p }) => { try { return ent(path.basename(map(p)), fs.statSync(map(p))); } catch (e) { return null; } },
  read_file: ({ path: p }) => ({ __b64: fs.readFileSync(map(p)).toString('base64') }),
  write_file: (_, b64, hd) => { const p = decodeURIComponent(hd['x-path']); fs.writeFileSync(map(p), Buffer.from(b64, 'base64')); return null; },
  make_dir: ({ path: p }) => { fs.mkdirSync(map(p), { recursive: true }); return null; },
  // tiruan SQLite dengan aturan db.rs: simpan menggantikan pit + tanggal + DTM kedua yang sama
  startup_files: () => [],
  vol_save: ({ rec }) => { DB.rows = DB.rows.filter((v) => !(v.pit === rec.pit && v.tanggal === rec.tanggal && v.second_dtm === rec.second_dtm)); DB.rows.push({ ...rec, id: ++DB.id, created_at: '2026-10-26 18:00:00' }); return DB.id; },
  vol_last: ({ pit, before }) => DB.rows.filter((v) => v.pit === pit && v.tanggal < before).sort(urut)[0] || null,
  vol_history: ({ pit, limit }) => DB.rows.filter((v) => !pit || v.pit === pit).sort(urut).slice(0, limit),
  vol_delete: ({ id }) => { const n = DB.rows.length; DB.rows = DB.rows.filter((v) => v.id !== id); return n - DB.rows.length; },
};
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  page.on('dialog', (d) => { console.log('DIALOG', d.message().slice(0, 100)); d.accept(); });
  await page.exposeFunction('__tinv', async (cmd, args, b64, hd) => H[cmd](args, b64, hd));
  await page.addInitScript(() => {
    const ab = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
    window.__pick = [];
    window.__TAURI__ = { core: { invoke: async (c, a, o) => { if (/^engine_/.test(c)) throw new Error('mesin JS'); const r = a instanceof Uint8Array ? await window.__tinv(c, null, b64(a), (o && o.headers) || {}) : await window.__tinv(c, a || {}, null, null); return r && r.__b64 !== undefined ? ab(r.__b64) : r; } }, dialog: { open: async () => window.__pick.shift() || null } };
  });
  await page.goto('file://' + PAGE); await page.waitForTimeout(400);
  await page.evaluate(() => window.__pick.push('D:\\kerja')); await page.evaluate(() => document.querySelector('[data-cmd=navAdd]').click()); await page.waitForTimeout(700);
  await page.locator('#tree .tn', { hasText: 'mentah' }).first().dblclick(); await page.waitForTimeout(500);
  await page.locator('#tree .tn', { hasText: '26102026_PIT_TF3.txt' }).first().dblclick(); await page.waitForTimeout(1500);
  const tbl = await page.locator('#harTbl').evaluate((t) => [...t.rows].map((r) => [...r.cells].map((c) => { const s = c.querySelector('select'); return s ? s.value || '—' : c.textContent; }).join(' | ')).join('\n'));
  console.log('pemetaan:\n' + tbl + '\n' + await page.locator('#harInfo').innerText());
  const t0 = Date.now(); await page.click('#harBtn');
  await page.waitForFunction(() => document.querySelector('#harRes').textContent.length > 0, null, { timeout: 120000 }); const ms = Date.now() - t0;
  console.log(`hasil (${ms} ms):\n` + await page.locator('#harRes').innerText());
  await page.screenshot({ path: OUT + '/h1_hasil.png' });
  // riwayat volume
  await page.evaluate(() => document.querySelector('[data-cmd=riw]').click()); await page.waitForTimeout(500);
  console.log('riwayat:\n' + (await page.locator('#riwTbl').innerText()).split('\n').map((l) => '  ' + l).join('\n') + '\n  ' + await page.locator('#riwWhere').innerText());
  await page.click('#riwXls'); await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/h2_riwayat.png' });
  await page.locator('#riwTbl a[data-del]').first().click(); await page.waitForTimeout(400);
  console.log('setelah hapus 1 baris:', (await page.locator('#riwWhere').innerText()), '| tersimpan di mock:', DB.rows.length);
  console.log('folder kerja:', fs.readdirSync(path.join(ROOT, 'D/kerja')).join(', '));
  console.log('--- error JS ---\n' + (errs.join('\n') || '(tidak ada)'));
  await b.close();
})();
