// Dipakai run_report.sh: isi template bawaan dan template kustom dengan xlsx.js.
const XL = require(process.argv[2]); const fs = require('fs');
(async () => {
  const items = [{ area: 'pit_tofu3', first_dtm: 'base.dtm', second_dtm: '2026_10_26_update_topo_pit_tofu3.dtm', bdy: 'b.str', cut: 149094.2705, fill: 21.5402, nett: -149072.7303, nett_kemarin: -30007.1 },
                 { area: 'quarry_tf1', first_dtm: 'base_q.dtm', second_dtm: 'q.dtm', bdy: 'q_bdy.str', cut: 1000, fill: 0, nett: -1000, nett_kemarin: NaN }];
  const v = XL.blankRest(XL.valuesOf('2026-10-26', items, '26-Oct-26'));
  const d = await XL.defaultTemplate(); fs.writeFileSync('template_bawaan.xlsx', d);
  const a = await XL.fill(d, v); fs.writeFileSync('hasil_bawaan.xlsx', a.data); console.log('bawaan: sel terisi', a.filled, 'kurang', a.missing.join(','));
  const b = await XL.fill(fs.readFileSync('template_kustom.xlsx'), v); fs.writeFileSync('hasil_kustom.xlsx', b.data); console.log('kustom: sel terisi', b.filled, 'kurang', b.missing.join(','));
})();
