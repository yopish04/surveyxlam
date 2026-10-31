// Uji perilaku kursor ala Surpac di SMA_Viewer.html dengan event mouse sungguhan.
const { chromium } = require('playwright'); const fs = require('fs');
const [PAGE, D, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + PAGE); await page.waitForTimeout(300);
  await page.setInputFiles('#fileIn', [D + '/boundary_pit.str', D + '/2026_10_26_update_topo.str']); await page.waitForTimeout(1500);
  const ok = (c, t) => console.log((c ? 'OK   ' : 'GAGAL ') + t);
  const prompt = () => page.locator('#sPrompt').innerText();
  // posisi layar (client) untuk koordinat dunia
  const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const S = SMA.S, c = SMA.camera(), O = S.origin, M = c.M, r = document.querySelector('#gl').getBoundingClientRect();
    const X = x - O[0], Y = y - O[1], Z = (z - O[2]) * S.ex, w = M[3] * X + M[7] * Y + M[11] * Z + M[15];
    return [r.left + ((M[0] * X + M[4] * Y + M[8] * Z + M[12]) / w + 1) * c.W / 2, r.top + (1 - (M[1] * X + M[5] * Y + M[9] * Z + M[13]) / w) * c.H / 2]; }, [x, y, z]);
  ok((await prompt()).includes('Klik garis'), 'awal: tanpa fungsi, petunjuk pilih di status bar → ' + await prompt());
  // 1. hover garis boundary (sisi bawah y=9650050, x 350050..350150) lalu klik
  let [sx, sy] = await scr(350100, 9650050, 100);
  await page.mouse.move(sx, sy + 3); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !!SMA.S.hoverSeg && SMA.S.hoverSeg.s === 1), 'hover di garis boundary → garis disorot');
  await page.mouse.click(sx, sy + 3); await page.waitForTimeout(100);
  ok(await page.evaluate(() => SMA.S.sel.length === 1 && SMA.S.sel[0].s === 1), 'klik garis → segmen terpilih: ' + await prompt());
  await page.screenshot({ path: OUT + '/7_pilih_segmen.png' });
  // 2. klik kanan → menu → Properti segmen
  await page.mouse.click(sx, sy + 3, { button: 'right' }); await page.waitForTimeout(150);
  const menu = await page.locator('#ctx').innerText(); ok(menu.includes('Properti segmen') && menu.includes('Pilih seluruh string 1'), 'klik kanan → menu: ' + menu.replace(/\n/g, ' | '));
  await page.screenshot({ path: OUT + '/8_menu_kanan.png' });
  await page.locator('#ctx a', { hasText: 'Properti segmen' }).click(); await page.waitForTimeout(100);
  const log = await page.locator('#msgwin').innerText(); const line = log.split('\n').filter((l) => l.includes('string 1 segmen')).pop() || '';
  ok(/tertutup/.test(line) && /luas 10\.000,000 m²/.test(line) && /panjang datar 400,000 m/.test(line), 'Properti: ' + line);
  // 3. Esc batal pilih; klik dua kali garis topo string 1 → seluruh string
  await page.keyboard.press('Escape'); ok(await page.evaluate(() => SMA.S.sel.length === 0), 'Esc → pilihan batal');
  [sx, sy] = await scr(350100, 9650200, 100); await page.mouse.dblclick(sx, sy - 2); await page.waitForTimeout(100);
  ok(await page.evaluate(() => SMA.S.sel.length >= 1 && SMA.S.sel[0].L.name.includes('topo')), 'klik dua kali → seluruh string: ' + await prompt());
  await page.keyboard.press('Escape');
  // 4. fungsi Bearing and distance: snap, 2 titik, Backspace, Esc, Esc
  await page.keyboard.press('m'); ok(await page.evaluate(() => SMA.S.tool === 'meas'), 'M → fungsi Bearing and distance: ' + await prompt());
  [sx, sy] = await scr(350050, 9650050, 100); await page.mouse.move(sx + 4, sy - 3); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !!SMA.S.hover), 'kursor dekat titik → kotak snap: ' + await page.locator('#sXY').innerText());
  await page.mouse.click(sx + 4, sy - 3);
  [sx, sy] = await scr(350050, 9650150, 100); await page.mouse.move(sx + 60, sy + 40); await page.waitForTimeout(100);
  await page.screenshot({ path: OUT + '/9_ukur_karet.png' });
  await page.mouse.click(sx + 3, sy + 2); await page.waitForTimeout(100);
  const m = await page.evaluate(() => SMA.S.meas.map((p) => [p.x, p.y, p.snap]));
  ok(m.length === 2 && m[0][2] && m[1][2] && m[0][1] === 9650050 && m[1][1] === 9650150 && m[1][0] === 350050, 'dua titik ukur menempel tepat ke titik: ' + JSON.stringify(m));
  ok((await page.locator('#measSum').innerText()).includes('100,000'), 'jarak datar 100,000 m (sisi boundary)');
  await page.keyboard.press('Backspace'); ok(await page.evaluate(() => SMA.S.meas.length === 1), 'Backspace → batal titik terakhir');
  await page.keyboard.press('Escape'); ok(await page.evaluate(() => SMA.S.tool === 'meas' && !SMA.S.measOpen), 'Esc pertama → garis selesai, fungsi masih aktif');
  await page.keyboard.press('Escape'); ok(await page.evaluate(() => SMA.S.tool === null), 'Esc kedua → fungsi selesai: ' + await prompt());
  // 5. Point properties lalu klik kanan → Selesai
  await page.keyboard.press('i'); [sx, sy] = await scr(350150, 9650050, 100); await page.mouse.click(sx + 5, sy + 5); await page.waitForTimeout(100);
  ok(await page.evaluate(() => SMA.S.picks.length === 1 && SMA.S.picks[0].x === 350150), 'Point properties: klik dekat titik → titik terpilih');
  await page.mouse.click(700, 450, { button: 'right' }); await page.waitForTimeout(100);
  ok((await page.locator('#ctx').innerText()).startsWith('Selesai: Point properties'), 'klik kanan saat fungsi aktif → menu "Selesai"');
  await page.locator('#ctx a').first().click(); ok(await page.evaluate(() => SMA.S.tool === null), 'Selesai → kembali ke mode pilih');
  // 6. tombol tengah = geser, tombol kanan seret = putar 3D
  let t0 = await page.evaluate(() => SMA.S.cam.t.slice());
  await page.mouse.move(700, 400); await page.mouse.down({ button: 'middle' }); await page.mouse.move(800, 450, { steps: 5 }); await page.mouse.up({ button: 'middle' });
  let t1 = await page.evaluate(() => SMA.S.cam.t.slice()); ok(t0[0] !== t1[0] && await page.evaluate(() => SMA.S.plan), 'tombol tengah seret → geser (tetap Plan)');
  await page.mouse.move(700, 400); await page.mouse.down({ button: 'right' }); await page.mouse.move(760, 460, { steps: 6 }); await page.mouse.up({ button: 'right' });
  const cam = await page.evaluate(() => [SMA.S.plan, SMA.S.cam.el, SMA.S.cam.az]);
  ok(!cam[0] && cam[1] < 89.5, 'tombol kanan seret → putar ke 3D: ' + JSON.stringify(cam));
  ok(await page.locator('#ctx').isHidden(), 'seret kanan tidak membuka menu');
  await page.screenshot({ path: OUT + '/10_putar_3d.png' });
  // 7. kecepatan: 1 juta titik spot, hover di Plan
  const ms = await page.evaluate(() => {
    const n = 1000000, txt = ['big,26-Oct-26,0,0', '0, 0, 0, 0, 0, 0, 0'];
    for (let i = 0; i < n; i++) txt.push(`600, ${9650000 + (i % 1000) * 0.2}, ${350000 + Math.floor(i / 1000) * 0.2}, ${100 + (i % 7) * 0.1},`);
    txt.push('0, 0, 0, 0, END'); window.__big = new File([txt.join('\n')], 'big.str'); return 0; });
  await page.evaluate(() => SMA.loadFiles([window.__big])); await page.waitForTimeout(6000); await page.evaluate(() => SMA.setPlan(true)); await page.keyboard.press('m');
  const tm = await page.evaluate(() => { const g = SMA.S.layers.find((L) => L.name === 'big.str'); const t0 = performance.now(); g.grid = null; const G = (() => { SMA.hit(700, 450, 12, true); return performance.now() - t0; })(); const t1 = performance.now(); for (let k = 0; k < 200; k++) SMA.hit(600 + k, 400 + k, 12, true); return [G, (performance.now() - t1) / 200]; });
  ok(tm[1] < 8, `1 juta titik: indeks dibuat ${tm[0].toFixed(0)} ms (sekali), hover ${tm[1].toFixed(2)} ms per gerak`);
  console.log('--- error JS ---\n' + (errs.join('\n') || '(tidak ada)'));
  await b.close();
})();
