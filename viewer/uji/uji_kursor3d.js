// Uji kursor 3D ala Surpac (snap Bidang/Titik/Garis/Segitiga DTM, camera target) dengan mouse sungguhan.
const { chromium } = require('playwright');
const [PAGE, D, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + PAGE); await page.waitForTimeout(300);
  await page.setInputFiles('#fileIn', [D + '/boundary_pit.str', D + '/2026_10_26_update_topo.str']); await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('[data-cmd=dtm]').click());
  await page.selectOption('#dtmSrc', { label: '2026_10_26_update_topo.str' }).catch(() => {});
  await page.evaluate(() => { const s = document.querySelector('#dtmSrc'); s.value = [...s.options].find((o) => o.textContent.includes('2026_10_26')).value; document.querySelector('#dtmBtn').click(); });
  await page.waitForTimeout(2500); await page.evaluate(() => { document.querySelector('#tDtm').hidden = true; });
  await page.evaluate(() => { SMA.setPlan(false); SMA.S.cam.az = 30; SMA.S.cam.el = 35; SMA.zoomAll(); }); await page.waitForTimeout(300);
  const ok = (c, t) => console.log((c ? 'OK   ' : 'GAGAL ') + t);
  const proj = (p) => page.evaluate((p) => { const S = SMA.S, c = SMA.camera(), O = S.origin, M = c.M, r = document.querySelector('#gl').getBoundingClientRect();
    const X = p.x - O[0], Y = p.y - O[1], Z = (p.z - O[2]) * S.ex, w = M[3] * X + M[7] * Y + M[11] * Z + M[15];
    return [r.left + ((M[0] * X + M[4] * Y + M[8] * Z + M[12]) / w + 1) * c.W / 2, r.top + (1 - (M[1] * X + M[5] * Y + M[9] * Z + M[13]) / w) * c.H / 2]; }, p);
  const zAt = (x, y) => page.evaluate(([x, y]) => SMA.zAt(x, y), [x, y]);
  const status = () => page.locator('#sXY').innerText();
  // 1. tanpa fungsi: kursor di permukaan DTM di 3D -> koordinat DTM
  let [mx, my] = await proj({ x: 350122.5, y: 9650082.5, z: await zAt(350122.5, 9650082.5) });
  await page.evaluate(() => { for (const L of SMA.S.layers) if (L.strs && L.strs.get(500)) L.strs.get(500).vis = false; SMA.S.dirty = true; });
  await page.mouse.move(mx, my); await page.waitForTimeout(150);
  ok((await status()).startsWith('DTM:'), 'tanpa fungsi di 3D: status bar menunjukkan koordinat di permukaan DTM → ' + await status());
  // 2. Bearing and distance, snap Segitiga DTM (4): dua klik di permukaan
  await page.keyboard.press('m'); await page.keyboard.press('4');
  ok((await page.locator('#sPrompt').innerText()).includes('Snap: Segitiga DTM'), 'tombol 4 → snap Segitiga DTM: ' + await page.locator('#sPrompt').innerText());
  const clicks = [[mx + 7, my + 9], [mx - 120, my + 60]];
  for (const [x, y] of clicks) { await page.mouse.move(x, y); await page.waitForTimeout(80); await page.mouse.click(x, y); await page.waitForTimeout(80); }
  let m = await page.evaluate(() => SMA.S.meas.map((p) => ({ ...p })));
  let good = m.length === 2;
  for (let k = 0; k < m.length; k++) { const z = await zAt(m[k].x, m[k].y), [sx, sy] = await proj(m[k]); good = good && m[k].m === 'tri' && Math.abs(m[k].z - z) < 1e-6 && Math.hypot(sx - clicks[k][0], sy - clicks[k][1]) < 1.0; console.log(`     titik ${k + 1}: Z ${m[k].z.toFixed(3)} = DTM ${z.toFixed(3)}, proyeksi selisih ${Math.hypot(sx - clicks[k][0], sy - clicks[k][1]).toFixed(3)} px`); }
  ok(good, 'snap DTM: titik ada di permukaan DTM dan tepat di bawah kursor');
  await page.screenshot({ path: OUT + '/11_kursor3d_dtm.png' });
  await page.keyboard.press('Escape');
  // 3. snap Bidang (1) dengan bidang Z 95
  await page.evaluate(() => SMA.setPlaneZ(95)); await page.keyboard.press('1');
  await page.mouse.move(700, 450); await page.waitForTimeout(80); await page.mouse.click(700, 450); await page.waitForTimeout(80);
  m = await page.evaluate(() => SMA.S.meas.map((p) => ({ ...p }))); let [sx, sy] = await proj(m[0]);
  ok(m.length === 1 && m[0].m === 'plane' && m[0].z === 95 && Math.hypot(sx - 700, sy - 450) < 1.0, `snap Bidang Z 95: titik di bidang (Z ${m[0] && m[0].z}), selisih proyeksi ${Math.hypot(sx - 700, sy - 450).toFixed(3)} px; status: ${await page.locator('#sPlane').innerText()}`);
  await page.keyboard.press('Escape');
  // 4. snap Garis (3): dekat sisi bawah boundary (Y 9650050) di 3D
  await page.keyboard.press('3');
  let [ax, ay] = await proj({ x: 350070, y: 9650050, z: 100 }), [bx, by] = await proj({ x: 350130, y: 9650050, z: 100 });
  const cx = ax + (bx - ax) * 0.37 + 2, cy = ay + (by - ay) * 0.37 - 2;
  await page.mouse.move(cx, cy); await page.waitForTimeout(80); await page.mouse.click(cx, cy); await page.waitForTimeout(80);
  m = await page.evaluate(() => SMA.S.meas.map((p) => ({ ...p })));
  ok(m.length === 1 && m[0].m === 'line' && Math.abs(m[0].y - 9650050) < 1e-6 && m[0].x > 350050 && m[0].x < 350150 && m[0].z === 100, `snap Garis: titik tepat di garis boundary Y ${m[0] && m[0].y.toFixed(3)} X ${m[0] && m[0].x.toFixed(3)} Z ${m[0] && m[0].z}`);
  await page.keyboard.press('Escape');
  // 5. snap Titik (2): sudut boundary
  await page.keyboard.press('2'); [sx, sy] = await proj({ x: 350050, y: 9650050, z: 100 });
  await page.mouse.move(sx + 6, sy - 5); await page.waitForTimeout(80); await page.mouse.click(sx + 6, sy - 5); await page.waitForTimeout(80);
  m = await page.evaluate(() => SMA.S.meas.map((p) => ({ ...p })));
  ok(m.length === 1 && m[0].m === 'point' && m[0].x === 350050 && m[0].y === 9650050, 'snap Titik di 3D: tepat di sudut boundary');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  ok(await page.evaluate(() => SMA.S.tool === null), 'Esc → keluar fungsi');
  // 6. Select camera target lalu putar: titik target tetap di tengah layar
  await page.evaluate(() => document.querySelector('[data-cmd=target]').click());
  const tz = await zAt(350100, 9650100); [sx, sy] = await proj({ x: 350100, y: 9650100, z: tz });
  await page.mouse.move(sx, sy); await page.waitForTimeout(80); await page.mouse.click(sx, sy); await page.waitForTimeout(150);
  const tgt = await page.evaluate(() => { const t = SMA.S.cam.t, O = SMA.S.origin; return { x: t[0] + O[0], y: t[1] + O[1], z: t[2] / SMA.S.ex + O[2] }; });
  ok(Math.hypot(tgt.x - 350100, tgt.y - 9650100) < 0.6 && Math.abs(tgt.z - tz) < 0.6 && await page.evaluate(() => SMA.S.tool === null), `Select camera target: pusat putar Y ${tgt.y.toFixed(2)} X ${tgt.x.toFixed(2)} Z ${tgt.z.toFixed(2)}`);
  const before = await proj(tgt);
  await page.mouse.move(500, 300); await page.mouse.down({ button: 'right' }); await page.mouse.move(600, 380, { steps: 8 });
  await page.screenshot({ path: OUT + '/12_putar_target.png' });
  await page.mouse.up({ button: 'right' });
  const after = await proj(tgt), r = await page.evaluate(() => { const r = document.querySelector('#gl').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  ok(Math.hypot(after[0] - r[0], after[1] - r[1]) < 1 && Math.hypot(before[0] - r[0], before[1] - r[1]) < 1, `putar: camera target tetap di tengah layar (sebelum ${before.map((v) => v.toFixed(1))}, sesudah ${after.map((v) => v.toFixed(1))}, tengah ${r.map((v) => v.toFixed(1))})`);
  // 7. kecepatan hover 3D dengan DTM
  await page.keyboard.press('m'); await page.keyboard.press('4');
  const ms = await page.evaluate(() => { const t0 = performance.now(); for (let k = 0; k < 100; k++) SMA.cursorAt(500 + k * 3, 300 + k * 2, 'tri'); return (performance.now() - t0) / 100; });
  ok(ms < 8, `hover 3D snap DTM: ${ms.toFixed(2)} ms per gerak`);
  console.log('--- error JS ---\n' + (errs.join('\n') || '(tidak ada)'));
  await b.close();
})();
