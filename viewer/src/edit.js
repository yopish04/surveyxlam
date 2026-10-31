/* ---------- EDIT Tahap 1 (seperti menu Edit Surpac): POINT move/insert/delete/properties, SEGMENT delete/reverse/
   renumber/break/join, UNDO/REDO. Alur Surpac: pilih fungsi, ikuti petunjuk di status bar, Esc = selesai.
   Hasil edit ditulis ulang dengan PG.tulis (sama byte per byte dengan Python/Excel; teks atau biner sesuai file asli),
   lalu layer dibangun ulang. Undo menyimpan isi file sebelum setiap edit. */
const ED = { undo: [], redo: [], st: {} };
/* model edit dari layer: segmen = titik berurutan dengan nomor string sama (dipisah baris 0) */
function edSegs(L) {
  const r = L.r, out = []; let cur = null;
  for (let i = 0; i < r.rows; i++) {
    const s = r.sn[i];
    if (!s) { cur = null; continue; }
    if (!cur || cur.s !== s) { cur = { s, pts: [], rows: [] }; out.push(cur); }
    cur.pts.push([r.y[i], r.x[i], r.z[i], pointInfo(L, i).d]); cur.rows.push(i);
  }
  return out;
}
const edWhere = (segs, row) => { for (let k = 0; k < segs.length; k++) { const j = segs[k].rows.indexOf(row); if (j >= 0) return [k, j]; } return [-1, -1]; };
async function edRebuild(L, bytes, edited = true) {
  const r = await parseFile(L.name, bytes.slice().buffer);
  for (const D of [...L.dtms]) { removeLayer(D); msg(`${D.name} dilepas: nomor baris ${L.name} berubah. Buat DTM lagi.`, 'w'); }
  const keep = { id: L.id, vis: L.vis, open: L.open, strs: L.strs, active: S.active === L };
  const N = addStr(L.name, r, bytes.slice().buffer);
  for (const [s, st] of N.strs) { const o = keep.strs.get(s); if (o) { st.vis = o.vis; st.color = o.color; st.auto = o.auto; } }
  buildColors(N); buildIndex(N);
  N.id = keep.id; N.vis = keep.vis; N.open = keep.open; N.edited = edited;
  S.layers.splice(S.layers.indexOf(N), 1); S.layers[S.layers.indexOf(L)] = N;
  for (const b of ['vbo', 'cbo', 'lineIbo', 'ptIbo']) if (L[b]) gl.deleteBuffer(L[b]);
  S.active = keep.active ? N : S.active === N ? L : S.active;
  S.sel = S.sel.filter((g) => g.L !== L); S.hover = null; S.hoverSeg = null; S.dirty = true;
  renderLayers();
  return N;
}
async function edApply(L, segs, label) {
  if (!L.raw) { msg(`${L.name} tidak bisa diedit (bukan file .str).`, 'w'); return null; }
  const H = PG.baca(L.raw), before = new Uint8Array(L.raw).slice();
  const bytes = PG.tulis(H.head, segs.filter((g) => g.pts.length).map((g) => g.pts.map((p) => [g.s, p[0], p[1], p[2], p[3]])), H.binary, H.axis);
  ED.undo.push({ id: L.id, bytes: before, label, edited: !!L.edited }); if (ED.undo.length > 100) ED.undo.shift();
  ED.redo = [];
  const N = await edRebuild(L, bytes);
  msg(`EDIT ${label} — ${L.name} (Ctrl+Z = undo)`, 'ok');
  return N;
}
async function edUndo(redo = false) {
  const A = redo ? ED.redo : ED.undo, B = redo ? ED.undo : ED.redo, e = A.pop();
  if (!e) { msg(redo ? 'Tidak ada yang bisa di-redo.' : 'Tidak ada yang bisa di-undo.', 'w'); return; }
  const L = S.layers.find((x) => x.id === e.id && x.kind === 'str');
  if (!L) { msg('Layer untuk undo sudah ditutup.', 'w'); return; }
  B.push({ id: L.id, bytes: new Uint8Array(L.raw).slice(), label: e.label, edited: !!L.edited });
  await edRebuild(L, e.bytes, e.edited);
  msg(`${redo ? 'REDO' : 'UNDO'} ${e.label} — ${L.name}`, 'ok');
}
/* fungsi edit: snap() = mode snap kursor, seg = sorot segmen, prompt(), click(px, py) */
const pickPoint = (px, py) => { const c = cursorAt(px, py, 'point'); return c && c.L.raw ? c : null; };
const pickSeg = (px, py) => { const h = hit(px, py, 12); return h.e && h.e.d <= 10 && h.e.L.raw ? segOf(h.e.L, h.e.i) : null; };
const EDIT = {
  ptMove: {
    name: 'Point move', snap: () => (ED.st.p ? S.snap : 'point'),
    prompt: () => (ED.st.p ? `Point move: klik lokasi baru (snap ${SNAP[S.snap][0]}${S.snap === 'plane' ? ', Z titik tetap' : ''}). Esc = batal.` : 'Point move: klik titik yang dipindah.'),
    async click(px, py) {
      if (!ED.st.p) { ED.st.p = pickPoint(px, py); if (!ED.st.p) msg('Tidak ada titik string di bawah kursor.', 'w'); prompt_(); return; }
      const c = cursorAt(px, py); if (!c) { msg(`Snap ${SNAP[S.snap][0]}: tidak ada posisi di bawah kursor.`, 'w'); return; }
      const p = ED.st.p, segs = edSegs(p.L), [k, j] = edWhere(segs, p.i), q = segs[k].pts[j];
      segs[k].pts[j] = [c.y, c.x, S.snap === 'plane' ? q[2] : c.z, q[3]];
      ED.st = {}; await edApply(p.L, segs, `point move str ${segs[k].s}`);
    },
  },
  ptIns: {
    name: 'Point insert', snap: () => 'line',
    prompt: () => 'Point insert: klik di garis segmen; titik baru disisipkan di posisi itu (Z mengikuti garis).',
    async click(px, py) {
      const c = cursorAt(px, py, 'line'); if (!c || !c.L.raw || c.s === undefined) { msg('Klik tepat di garis segmen (bukan string spot).', 'w'); return; }
      const segs = edSegs(c.L), [k, j] = edWhere(segs, c.i), d = segs[k].pts[j][3];
      segs[k].pts.splice(j + 1, 0, [c.y, c.x, c.z, d]);
      await edApply(c.L, segs, `point insert str ${segs[k].s}`);
    },
  },
  ptDel: {
    name: 'Point delete', snap: () => 'point', prompt: () => 'Point delete: klik titik yang dihapus (berulang). Esc = selesai.',
    async click(px, py) {
      const p = pickPoint(px, py); if (!p) { msg('Tidak ada titik string di bawah kursor.', 'w'); return; }
      const segs = edSegs(p.L), [k, j] = edWhere(segs, p.i); segs[k].pts.splice(j, 1);
      await edApply(p.L, segs, `point delete str ${segs[k].s}`);
    },
  },
  ptEdit: {
    name: 'Point properties edit', snap: () => 'point', prompt: () => 'Point properties: klik titik untuk mengubah Y, X, Z, deskripsi.',
    async click(px, py) {
      const p = pickPoint(px, py); if (!p) { msg('Tidak ada titik string di bawah kursor.', 'w'); return; }
      const segs = edSegs(p.L), [k, j] = edWhere(segs, p.i), q = segs[k].pts[j];
      const v = await edForm(`String ${segs[k].s} · titik ${j + 1}`, [['Y', q[0].toFixed(3)], ['X', q[1].toFixed(3)], ['Z', q[2].toFixed(3)], ['Deskripsi', q[3]]]);
      if (!v) return;
      const num = (t, o) => { const x = parseFloat(String(t).replace(',', '.')); return isFinite(x) ? x : o; };
      segs[k].pts[j] = [num(v[0], q[0]), num(v[1], q[1]), num(v[2], q[2]), v[3]];
      await edApply(p.L, segs, `point properties str ${segs[k].s}`);
    },
  },
  segDel: {
    name: 'Segment delete', snap: () => 'point', seg: true, prompt: () => 'Segment delete: klik segmen yang dihapus (berulang). Esc = selesai.',
    async click(px, py) {
      const g = pickSeg(px, py); if (!g) { msg('Klik di garis segmen.', 'w'); return; }
      const segs = edSegs(g.L), [k] = edWhere(segs, g.a); segs.splice(k, 1);
      await edApply(g.L, segs, `segment delete str ${g.s}`);
    },
  },
  segRev: {
    name: 'Segment reverse', snap: () => 'point', seg: true, prompt: () => 'Segment reverse: klik segmen untuk membalik arahnya.',
    async click(px, py) {
      const g = pickSeg(px, py); if (!g) { msg('Klik di garis segmen.', 'w'); return; }
      const segs = edSegs(g.L), [k] = edWhere(segs, g.a); segs[k].pts.reverse();
      await edApply(g.L, segs, `segment reverse str ${g.s}`);
    },
  },
  segRenum: {
    name: 'Segment renumber', snap: () => 'point', seg: true, prompt: () => 'Segment renumber: klik segmen lalu isi nomor string baru.',
    async click(px, py) {
      const g = pickSeg(px, py); if (!g) { msg('Klik di garis segmen.', 'w'); return; }
      const v = await edForm(`Segmen string ${g.s}`, [['Nomor string baru', String(g.s)]]); if (!v) return;
      const n = parseInt(v[0], 10); if (!(n > 0 && n < 2147483647)) { msg('Nomor string harus bilangan bulat > 0.', 'w'); return; }
      const segs = edSegs(g.L), [k] = edWhere(segs, g.a); segs[k].s = n;
      await edApply(g.L, segs, `segment renumber ${g.s} → ${n}`);
    },
  },
  segBreak: {
    name: 'Segment break', snap: () => 'point', prompt: () => 'Segment break: klik titik tempat segmen diputus (titik itu jadi ujung kedua bagian).',
    async click(px, py) {
      const p = pickPoint(px, py); if (!p) { msg('Tidak ada titik string di bawah kursor.', 'w'); return; }
      const segs = edSegs(p.L), [k, j] = edWhere(segs, p.i), g = segs[k], P = g.pts, n = P.length;
      const closed = n > 2 && P[0][0] === P[n - 1][0] && P[0][1] === P[n - 1][1];
      if (closed) {                                       // segmen tertutup: dibuka di titik ini
        const ring = P.slice(0, n - 1), jj = j % (n - 1);
        g.pts = ring.slice(jj).concat(ring.slice(0, jj + 1));
      } else {
        if (j === 0 || j === n - 1) { msg('Titik itu sudah ujung segmen; pilih titik di tengah.', 'w'); return; }
        segs.splice(k, 1, { s: g.s, pts: P.slice(0, j + 1) }, { s: g.s, pts: P.slice(j) });
      }
      await edApply(p.L, segs, `segment break str ${g.s}${closed ? ' (dibuka)' : ''}`);
    },
  },
  segJoin: {
    name: 'Segment join', snap: () => 'point', seg: true,
    prompt: () => (ED.st.a ? `Segment join: klik segmen kedua di dekat ujung yang disambung (segmen pertama: string ${ED.st.a.s}).` : 'Segment join: klik segmen pertama di dekat ujung yang disambung.'),
    async click(px, py) {
      const h = hit(px, py, 12); if (!h.e || h.e.d > 10 || !h.e.L.raw) { msg('Klik di garis segmen.', 'w'); return; }
      const g = segOf(h.e.L, h.e.i), c = ground(px, py), r = g.L.r;
      const nearEnd = (q) => { if (!S.plan && h.v) return h.v.i - g.a < g.b - h.v.i ? 0 : 1; const d0 = Math.hypot(r.x[g.a] - q.x, r.y[g.a] - q.y), d1 = Math.hypot(r.x[g.b] - q.x, r.y[g.b] - q.y); return d0 < d1 ? 0 : 1; };
      if (!ED.st.a) { ED.st.a = Object.assign(g, { end: nearEnd(c) }); S.sel = [g]; S.dirty = true; prompt_(); return; }
      const A = ED.st.a; ED.st = {}; S.sel = [];
      if (A.L !== g.L) { msg('Kedua segmen harus di layer yang sama.', 'w'); prompt_(); return; }
      if (A.a === g.a) { msg('Pilih segmen lain.', 'w'); prompt_(); return; }
      const segs = edSegs(g.L), [ka] = edWhere(segs, A.a), [kb] = edWhere(segs, g.a);
      let pa = segs[ka].pts.slice(), pb = segs[kb].pts.slice();
      if (A.end === 0) pa.reverse();                       // ujung yang disambung di akhir A
      if (nearEnd(c) === 1) pb.reverse();                  // ujung yang disambung di awal B
      const last = pa[pa.length - 1], first = pb[0];
      if (last[0] === first[0] && last[1] === first[1] && last[2] === first[2]) pb.shift();   // titik sama tidak digandakan
      segs[ka] = { s: segs[ka].s, pts: pa.concat(pb) }; segs.splice(kb, 1);
      await edApply(g.L, segs, `segment join str ${A.s} + ${g.s}`);
    },
  },
};
Object.assign(TOOL_NAME, Object.fromEntries(Object.entries(EDIT).map(([k, v]) => [k, v.name])));
/* form kecil (pengganti beberapa prompt) */
function edForm(title, fields) {
  return new Promise((res) => {
    let dl = $('#edDlg');
    if (!dl) { dl = document.createElement('dialog'); dl.id = 'edDlg'; document.body.appendChild(dl); }
    dl.innerHTML = `<form method="dialog" class="form" style="min-width:320px"><div class="big">${esc(title)}</div>${fields.map(([l, v], i) => `<label>${esc(l)}<input name="f${i}" value="${esc(v)}"></label>`).join('')}
      <div class="acts"><button value="ok" class="primary">OK</button><button value="batal" formnovalidate>Batal</button></div></form>`;
    dl.onclose = () => res(dl.returnValue === 'ok' ? fields.map((_, i) => dl.querySelector(`[name=f${i}]`).value) : null);
    dl.returnValue = ''; dl.showModal(); dl.querySelector('input').select();
  });
}
