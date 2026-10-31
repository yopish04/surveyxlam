/* SMA Viewer - pekerja latar (Web Worker): baca file, CREATE DTM, volume, update progress.
   Digabung dengan parser.js, tin.js, vol.js, progres.js saat build. */
'use strict';
function rangePred(list) { return (n) => list.some(([a, b]) => n >= a && n <= b); }
function smaJob(cmd, a, progress) {
  if (cmd === 'parse') { const r = parseAny(a.name, a.buf); r.name = a.name; return [r, transferList(r)]; }
  if (cmd === 'dtm') {
    const r = createDtm(a.r, { skip: rangePred(a.skip), spot: rangePred(a.spot) });
    return [r, [r.tris.buffer]];
  }
  if (cmd === 'vol') return [cutFill(a.first, a.second, a.rings, progress), []];
  if (cmd === 'update') {
    const b = (x) => PG.baca(x);
    let r;
    if (a.jenis === 'harian') r = PG.updateHarian(b(a.g), a.gName, a.bdy ? b(a.bdy) : null, a.bdyName, a.bdyNo, a.harian.map(b), a.harianNames, a.harianNo, a.tgl);
    else if (a.jenis === 'potong') {
      const tgl = PG.tglTeks(a.tgl, PG.baseName((a.harianNames[0] || a.bdyNames[0] || '')), null);
      if (!tgl) throw new Error('Tanggal tidak ditemukan; isi tanggal');
      const out = a.outName || PG.namaTanggal(PG.baseName(a.gName) + '.str', tgl);
      r = PG.jalankanPotong(b(a.g), a.gName, a.bdys.map(b), a.bdyNo, a.mode, a.harian.map(b), out, tgl, a.titikPotong, 2.0);
      r.tgl = tgl;
    } else {
      const tgl = PG.tglTeks(a.tgl, PG.baseName(a.bdyNames[0] || ''), null);
      if (!tgl) throw new Error('Tanggal tidak ditemukan; isi tanggal');
      const out = a.outName || PG.namaTanggal(PG.baseName(a.gName) + '.str', tgl);
      r = PG.jalankanBdy(b(a.g), a.gNo, a.bdys.map(b), a.bdyNo, a.op, out, tgl, a.gNo);
      r.tgl = tgl;
    }
    return [r, r.files.map((f) => f.data.buffer)];
  }
  throw new Error('perintah tidak dikenal: ' + cmd);
}
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof module === 'undefined') {
  self.onmessage = (ev) => {
    const { id, cmd, args } = ev.data;
    try {
      const [r, tr] = smaJob(cmd, args, (ri, f) => self.postMessage({ id, progress: [ri, f] }));
      self.postMessage({ id, r }, tr);
    } catch (err) { self.postMessage({ id, err: String(err && err.stack || err) }); }
  };
}
