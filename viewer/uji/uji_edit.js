// Uji edit Tahap 1 dengan klik mouse sungguhan; tiap hasil Save layer dibandingkan dengan acuan Python (progres.baca/tulis).
const { chromium } = require('playwright'); const fs = require('fs'), cp = require('child_process'), path = require('path');
const [PAGE, REPO, FILE, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  let fill = null; page.on('dialog', (d) => d.accept());
  await page.goto('file://' + PAGE); await page.waitForTimeout(300);
  const name = path.basename(FILE); await page.setInputFiles('#fileIn', [FILE]); await page.waitForTimeout(1200);
  const ok = (c, t) => { console.log((c ? 'OK   ' : 'GAGAL ') + t); if (!c) process.exitCode = 1; };
  // segmen sekarang (= urutan segmen file) dan posisi layar titik ke-j di segmen k, setelah kamera dipusatkan ke titik itu
  const segs = () => page.evaluate((n) => { const L = SMA.S.layers.find((x) => x.name === n), r = L.r, out = []; let cur = null;
    for (let i = 0; i < r.rows; i++) { const s = r.sn[i]; if (!s) { cur = null; continue; } if (!cur || cur.s !== s) { cur = { s, rows: [] }; out.push(cur); } cur.rows.push(i); } return out; }, name);
  const at = async (k, j, t = 0, j2 = null) => page.evaluate(([n, k, j, t, j2]) => {
    const S = SMA.S, L = S.layers.find((x) => x.name === n), r = L.r, out = []; let cur = null;
    for (let i = 0; i < r.rows; i++) { const s = r.sn[i]; if (!s) { cur = null; continue; } if (!cur || cur.s !== s) { cur = { s, rows: [] }; out.push(cur); } cur.rows.push(i); }
    const i0 = out[k].rows[j], i1 = j2 === null ? i0 : out[k].rows[j2], O = S.origin;
    const X = r.x[i0] + (r.x[i1] - r.x[i0]) * t, Y = r.y[i0] + (r.y[i1] - r.y[i0]) * t;
    S.cam.t = [X - O[0], Y - O[1], (r.z[i0] - O[2]) * S.ex]; S.cam.dist = 25 / Math.tan(S.cam.fov / 2); S.dirty = true;
    const c = SMA.camera(), M = c.M, x = X - O[0], y = Y - O[1], z = (r.z[i0] - O[2]) * S.ex, w = M[3] * x + M[7] * y + M[11] * z + M[15], R = document.querySelector('#gl').getBoundingClientRect();
    return [R.left + ((M[0] * x + M[4] * y + M[8] * z + M[12]) / w + 1) * c.W / 2, R.top + (1 - (M[1] * x + M[5] * y + M[9] * z + M[13]) / w) * c.H / 2];
  }, [name, k, j, t, j2]);
  const click = async (xy) => { await page.mouse.move(xy[0], xy[1]); await page.waitForTimeout(60); await page.mouse.click(xy[0], xy[1]); await page.waitForTimeout(250); };
  const tool = async (t) => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.evaluate((t) => document.querySelector(`[data-cmd=${t}]`).click(), t); };
  const saved = async () => { await page.evaluate((n) => { SMA.S.active = SMA.S.layers.find((x) => x.name === n); }, name);
    const [d] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.querySelector('[data-cmd=save]').click())]); const p = OUT + '/app.str'; await d.saveAs(p); return fs.readFileSync(p); };
  const ops = [];
  const check = async (label) => {
    fs.writeFileSync(OUT + '/ops.json', JSON.stringify(ops));
    cp.execFileSync('python3', [path.join(REPO, 'viewer/uji/ref_edit.py'), REPO, FILE, OUT + '/ops.json', OUT + '/ref.str']);
    const a = await saved(), r = fs.readFileSync(OUT + '/ref.str');
    ok(Buffer.compare(a, r) === 0, `${label}: sama byte per byte dengan acuan Python (${a.length} byte)`);
  };
  const orig = fs.readFileSync(FILE);
  // 1 point delete
  await tool('ptDel'); await click(await at(4, 5)); ops.push(['ptDel', 4, 5]); await check('Point delete (segmen 4 titik 6)');
  // 2 segment reverse
  await tool('segRev'); await click(await at(10, 3, 0.5, 4)); ops.push(['segRev', 10]); await check('Segment reverse (segmen 10)');
  // 3 segment renumber -> 7
  await tool('segRenum'); await click(await at(11, 3, 0.5, 4)); await page.waitForSelector('#edDlg[open]'); await page.fill('#edDlg [name=f0]', '7'); await page.click('#edDlg button[value=ok]'); await page.waitForTimeout(300);
  ops.push(['segRenum', 11, 7]); await check('Segment renumber (segmen 11 → string 7)');
  // 4 segment break at vertex 8
  await tool('segBreak'); await click(await at(5, 8)); ops.push(['segBreak', 5, 8]); await check('Segment break (segmen 5 di titik 9)');
  // 5 segment join: akhir segmen 2 + awal segmen 3
  let S = await segs(); const n2 = S[2].rows.length;
  await tool('segJoin'); await click(await at(2, n2 - 2, 0.8, n2 - 1)); await click(await at(3, 1, 0.8, 0)); ops.push(['segJoin', 2, 1, 3, 0]); await check('Segment join (akhir segmen 2 + awal segmen 3)');
  // 6 point move dengan snap Titik ke lokasi titik lain
  S = await segs(); const tgt = await page.evaluate(([n, rows]) => { const r = SMA.S.layers.find((x) => x.name === n).r, i = rows[0]; return [r.y[i], r.x[i], r.z[i]]; }, [name, S[29].rows]);
  await tool('ptMove'); await page.keyboard.press('2'); await click(await at(7, 2)); await click(await at(29, 0)); ops.push(['ptMove', 7, 2, ...tgt]); await check('Point move ke titik lain (snap Titik)');
  // 7 segment delete (titik 23 tunggal)
  await tool('segDel'); await click(await at(33, 0)); ops.push(['segDel', 33]); await check('Segment delete (spot 600, segmen 33)');
  // point properties: Z dan deskripsi lewat form
  await tool('ptEdit'); await click(await at(4, 2)); await page.waitForSelector('#edDlg[open]');
  const cur = await page.evaluate(() => [...document.querySelectorAll('#edDlg input')].map((x) => x.value));
  await page.fill('#edDlg [name=f2]', '123.456'); await page.fill('#edDlg [name=f3]', 'EDIT,26-Oct-26,RTK_SMA'); await page.click('#edDlg button[value=ok]'); await page.waitForTimeout(300);
  ops.push(['ptEdit', 4, 2, +cur[0], +cur[1], 123.456, 'EDIT,26-Oct-26,RTK_SMA']); await check('Point properties (Z 123.456, deskripsi baru)');
  // break segmen tertutup (boundary) -> dibuka di titik itu
  await tool('segBreak'); await click(await at(0, 10)); ops.push(['segBreak', 0, 10]); await check('Segment break pada segmen tertutup (dibuka di titik 11)');
  const final = await saved();
  // 8 point insert di tengah sisi (snap Garis): posisi tepat di garis, Z interpolasi
  await tool('ptIns'); S = await segs(); const before = S[8].rows.length; await click(await at(8, 0, 0.37, 1));
  const ins = await page.evaluate(([n]) => { const L = SMA.S.layers.find((x) => x.name === n), r = L.r, out = []; let cur = null;
    for (let i = 0; i < r.rows; i++) { const s = r.sn[i]; if (!s) { cur = null; continue; } if (!cur || cur.s !== s) { cur = { s, rows: [] }; out.push(cur); } cur.rows.push(i); }
    const g = out[8].rows; return { n: g.length, p: [0, 1, 2].map((k) => [r.x[g[k]], r.y[g[k]], r.z[g[k]]]) }; }, [name]);
  const [A, P, B] = ins.p, t = ((P[0] - A[0]) * (B[0] - A[0]) + (P[1] - A[1]) * (B[1] - A[1])) / ((B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2);
  const off = Math.abs((P[0] - A[0]) * (B[1] - A[1]) - (P[1] - A[1]) * (B[0] - A[0])) / Math.hypot(B[0] - A[0], B[1] - A[1]);
  ok(ins.n === before + 1 && off < 0.002 && Math.abs(P[2] - (A[2] + (B[2] - A[2]) * t)) < 0.002, `Point insert: titik baru di garis (jarak ${off.toFixed(4)} m, t=${t.toFixed(3)}), Z interpolasi ${P[2].toFixed(3)}`);
  // 9 undo semua -> file asli, redo semua -> hasil akhir (sebelum insert)
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  for (let k = 0; k < 10; k++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(150); }
  ok(Buffer.compare(await saved(), orig) === 0, 'Undo 10x: kembali sama persis dengan file asli');
  for (let k = 0; k < 9; k++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(150); }
  ok(Buffer.compare(await saved(), final) === 0, 'Redo 9x: sama persis dengan hasil edit 1–9');
  const lname = await page.locator('#layers .lname').first().innerText(); ok(lname.startsWith('* '), 'layer diedit bertanda *: ' + lname);
  await page.screenshot({ path: OUT + '/e1.png' });
  console.log('--- error JS ---\n' + (errs.join('\n') || '(tidak ada)'));
  await b.close();
})();
