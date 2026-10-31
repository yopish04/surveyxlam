/* ---------- kerangka mirip Surpac: menu, Navigator (folder kerja), message window, simpan layer ---------- */
function msg(t, kind = '') {
  const box = $('#msgLog'); if (!box) return;
  const d = new Date(), tm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  const el = document.createElement('div'); if (kind) el.className = kind;
  el.innerHTML = `<time>${tm}</time>${esc(t)}`;
  box.appendChild(el); box.scrollTop = box.scrollHeight;
  if (kind === 'e' || kind === 'w') $('#msgwin').classList.remove('min');
}

/* ---- penyimpanan daftar folder (IndexedDB menyimpan izin folder antar sesi) ---- */
const IDB = {
  db() { return new Promise((res, rej) => { const r = indexedDB.open('smaSurvey', 1); r.onupgradeneeded = () => r.result.createObjectStore('roots', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async all() { try { const db = await this.db(); return await new Promise((res) => { const q = db.transaction('roots').objectStore('roots').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (e) { return []; } },
  async put(v) { try { const db = await this.db(); db.transaction('roots', 'readwrite').objectStore('roots').put(v); } catch (e) {} },
  async del(id) { try { const db = await this.db(); db.transaction('roots', 'readwrite').objectStore('roots').delete(id); } catch (e) {} },
};

/* ---- Navigator ---- */
const NAV = { roots: [], sel: null, filter: 'surpac', drag: null };
const EXT_OK = /\.(str|dtm|shp)$/i;
function mkNode(h, parent, root) { return { h, name: h.name, kind: h.kind, parent, root, kids: null, open: false, size: null, mod: null }; }
async function navAddRoot(ro, handle = null) {
  let h = handle;
  if (!h) {
    if (!window.showDirectoryPicker) { alert('Browser ini belum bisa membuka folder. Pakai Google Chrome atau Microsoft Edge versi baru.'); return; }
    try { h = await window.showDirectoryPicker({ id: ro ? 'smaServer' : 'smaKerja', mode: ro ? 'read' : 'readwrite' }); } catch (e) { return; }
  }
  for (const r of NAV.roots) if (await r.node.h.isSameEntry(h)) { msg(`${h.name} sudah ada di Navigator.`); return; }
  const id = Date.now() + Math.random();
  const root = { id, ro, ok: true, node: null };
  root.node = mkNode(h, null, root); root.node.open = true;
  NAV.roots.push(root);
  if (!handle || handle._persist !== false) IDB.put({ id, h, ro });
  await loadKids(root.node);
  if (!ro && !S.dir) setSaveDir(root.node);
  msg(`Folder ${ro ? 'server (baca saja)' : 'kerja'}: ${h.name}`);
  renderTree();
}
async function navRestore() {
  for (const v of await IDB.all()) {
    const root = { id: v.id, ro: v.ro, ok: false, node: null };
    root.node = mkNode(v.h, null, root);
    try { root.ok = (await v.h.queryPermission({ mode: v.ro ? 'read' : 'readwrite' })) === 'granted'; } catch (e) { root.ok = false; }
    NAV.roots.push(root);
    if (root.ok) { root.node.open = true; await loadKids(root.node); if (!v.ro && !S.dir) setSaveDir(root.node); }
  }
  renderTree();
}
async function grant(root) {
  try { root.ok = (await root.node.h.requestPermission({ mode: root.ro ? 'read' : 'readwrite' })) === 'granted'; } catch (e) { root.ok = false; }
  if (root.ok) { root.node.open = true; await loadKids(root.node); if (!root.ro && !S.dir) setSaveDir(root.node); }
  renderTree();
}
async function loadKids(n) {
  const kids = [];
  try { for await (const h of n.h.values()) kids.push(mkNode(h, n, n.root)); }
  catch (e) { msg(`Tidak bisa membaca folder ${n.name}: ${e.message}`, 'e'); }
  kids.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) || a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));
  n.kids = kids;
  // ukuran & tanggal file diisi belakangan (tidak menghambat tampilan)
  (async () => { for (const k of kids) if (k.kind === 'file' && (NAV.filter === 'all' || EXT_OK.test(k.name))) { try { const f = await k.h.getFile(); k.size = f.size; k.mod = f.lastModified; } catch (e) {} } renderTree(); })();
}
function pathOf(n) { const p = []; for (let x = n; x; x = x.parent) p.unshift(x.name); return p.join('\\'); }
function fmtSize(b) { return b == null ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function iconOf(n) {
  if (!n.parent) return '<span class="ti root">▣</span>';
  if (n.kind === 'directory') return '<span class="ti fold"></span>';
  const e = (n.name.split('.').pop() || '').toLowerCase();
  return `<span class="ti ${['str', 'dtm', 'shp'].includes(e) ? e : 'oth'}">${['str', 'dtm', 'shp'].includes(e) ? e.toUpperCase() : ''}</span>`;
}
let rowsMap = [];
function renderTree() {
  const box = $('#tree');
  if (!NAV.roots.length) { box.innerHTML = '<div class="empty">Belum ada folder kerja.<br><a data-cmd="navAdd">Set work directory…</a> (mis. D:\\yopi)<br><a data-cmd="navAddRo">Tambah folder server (baca saja)…</a> (mis. Z:\\)</div>'; return; }
  rowsMap = []; const html = [];
  const walk = (n, d) => {
    const i = rowsMap.push(n) - 1, isDir = n.kind === 'directory';
    if (!isDir && NAV.filter !== 'all' && !EXT_OK.test(n.name)) { rowsMap.pop(); return; }
    const root = !n.parent ? n.root : null;
    const lock = root && !root.ok;
    html.push(`<div class="tn${NAV.sel === n ? ' sel' : ''}${lock ? ' lock' : ''}" data-i="${rowsMap.length - 1}" draggable="${isDir ? 'false' : 'true'}" style="padding-left:${6 + d * 14}px" title="${esc(pathOf(n))}">
      <span class="tc">${isDir ? (n.open ? '▾' : '▸') : ''}</span>${iconOf(n)}<span class="tnm">${esc(n.name)}${lock ? ' — klik untuk izinkan akses' : ''}</span>
      ${root && root.ro ? '<span class="ro">baca saja</span>' : ''}${S.dir && n.h === S.dir ? '<span class="ro" style="color:#2e9d5b;border-color:#2e9d5b">simpan</span>' : ''}<span class="tsz">${isDir ? '' : fmtSize(n.size)}</span></div>`);
    if (isDir && n.open && n.kids) for (const k of n.kids) walk(k, d + 1);
  };
  for (const r of NAV.roots) walk(r.node, 0);
  box.innerHTML = html.join('');
}
async function toggleDir(n) {
  if (!n.parent && !n.root.ok) { await grant(n.root); return; }
  n.open = !n.open;
  if (n.open && !n.kids) await loadKids(n);
  renderTree();
}
async function navRefreshDir(h) {
  const find = (n) => { if (n.h === h) return n; if (n.kids) for (const k of n.kids) { const r = find(k); if (r) return r; } return null; };
  for (const r of NAV.roots) { const n = find(r.node); if (n && n.kids) { await loadKids(n); renderTree(); } }
}
async function navRefresh() { for (const r of NAV.roots) if (r.ok) { const re = async (n) => { if (n.kids) { const open = new Set(n.kids.filter((k) => k.open).map((k) => k.name)); await loadKids(n); for (const k of n.kids) if (open.has(k.name)) { k.open = true; await re(k); } } }; await re(r.node); } renderTree(); }
function setSaveDir(n) {
  if (n.kind !== 'directory') n = n.parent;
  if (!n) return;
  if (n.root.ro) { msg(`${pathOf(n)} adalah folder server (baca saja); tidak dipakai untuk menyimpan.`, 'w'); return; }
  S.dir = n.h; S.dirPath = pathOf(n);
  for (const el of document.querySelectorAll('.dirName')) el.textContent = S.dirPath;
  renderTree();
}

/* buka file dari Navigator: DTM otomatis membuka .str pasangannya dari folder yang sama */
async function openNodes(nodes) {
  const files = [];
  for (const n of nodes) {
    if (n.kind !== 'file') continue;
    if (!EXT_OK.test(n.name)) { msg(`${n.name}: jenis file belum didukung`, 'w'); continue; }
    const f = await n.h.getFile(); files.push(f);
    if (/\.dtm$/i.test(n.name)) {
      const head = new TextDecoder('latin1').decode(await f.slice(0, 400).arrayBuffer()).split(/\r?\n/)[0];
      const sn = head.split(',')[0].trim().toLowerCase();
      if (S.layers.some((L) => L.kind === 'str' && L.name.toLowerCase() === sn) || files.some((x) => x.name.toLowerCase() === sn)) continue;
      if (!n.parent.kids) await loadKids(n.parent);
      const sib = n.parent.kids.find((k) => k.kind === 'file' && k.name.toLowerCase() === sn);
      if (sib) files.push(await sib.h.getFile()); else msg(`${n.name} butuh ${sn}, tetapi file itu tidak ada di folder yang sama.`, 'w');
    }
  }
  if (files.length) await loadFiles(files);
}

/* klik, klik dua kali, seret, klik kanan di Navigator */
const tree = $('#tree');
tree.addEventListener('click', async (e) => {
  const a = e.target.closest('a[data-cmd]'); if (a) return;
  const row = e.target.closest('.tn'); if (!row) return;
  const n = rowsMap[+row.dataset.i]; NAV.sel = n;
  if (n.kind === 'directory' && (e.target.classList.contains('tc') || (!n.parent && !n.root.ok))) { await toggleDir(n); return; }
  for (const r of tree.querySelectorAll('.tn.sel')) r.classList.remove('sel');      // pilih tanpa menggambar ulang (supaya klik dua kali tetap jalan)
  row.classList.add('sel');
});
tree.addEventListener('dblclick', async (e) => {
  const row = e.target.closest('.tn'); if (!row) return;
  const n = rowsMap[+row.dataset.i];
  if (n.kind === 'directory') await toggleDir(n); else await openNodes([n]);
});
tree.addEventListener('dragstart', (e) => { const row = e.target.closest('.tn'); if (!row) return; NAV.drag = rowsMap[+row.dataset.i]; e.dataTransfer.setData('text/plain', NAV.drag.name); e.dataTransfer.effectAllowed = 'copy'; });
tree.addEventListener('dragend', () => { setTimeout(() => { NAV.drag = null; }, 100); });
$('#view').addEventListener('drop', (e) => { if (NAV.drag) { e.preventDefault(); e.stopImmediatePropagation(); $('#drop').classList.remove('on'); const n = NAV.drag; NAV.drag = null; openNodes([n]); } }, true);
tree.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.tn'); if (!row) return;
  e.preventDefault();
  const n = rowsMap[+row.dataset.i]; NAV.sel = n;
  for (const r of tree.querySelectorAll('.tn.sel')) r.classList.remove('sel'); row.classList.add('sel');
  const dir = n.kind === 'directory', ro = n.root.ro, isRoot = !n.parent;
  const items = [
    !dir && ['Buka', () => openNodes([n])],
    dir && [n.open ? 'Tutup folder' : 'Buka folder', () => toggleDir(n)],
    ['Jadikan folder simpan', () => setSaveDir(n), ro],
    dir && ['Folder baru…', () => newFolder(n), ro],
    !isRoot && ['Ganti nama…', () => renameNode(n), ro],
    !isRoot && ['Hapus…', () => deleteNode(n), ro],
    '-',
    ['Salin path', () => copyText(pathOf(n))],
    ['Segarkan', () => (dir ? navRefreshDir(n.h) : navRefreshDir(n.parent.h))],
    isRoot && ['Hapus dari Navigator', () => { NAV.roots = NAV.roots.filter((r) => r !== n.root); IDB.del(n.root.id); if (S.dir === n.h) { S.dir = null; for (const el of document.querySelectorAll('.dirName')) el.textContent = 'Downloads'; } renderTree(); }],
  ].filter(Boolean);
  showCtx(e.clientX, e.clientY, items);
});
function showCtx(x, y, items) {
  const c = $('#ctx');
  c.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<a data-i="${i}" class="${it[2] ? 'dis' : ''}">${esc(it[0])}${it[2] ? '<i>baca saja</i>' : ''}</a>`).join('');
  c.hidden = false;
  c.style.left = Math.min(x, innerWidth - 220) + 'px'; c.style.top = Math.min(y, innerHeight - c.offsetHeight - 8) + 'px';
  c.onclick = (e) => { const a = e.target.closest('a'); if (!a) return; c.hidden = true; items[+a.dataset.i][1](); };
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#ctx')) $('#ctx').hidden = true;
  if (!e.target.closest('.menu')) for (const m of document.querySelectorAll('.menu.open')) m.classList.remove('open');
});
async function newFolder(n) {
  const nm = prompt('Nama folder baru di ' + pathOf(n) + ':'); if (!nm) return;
  try { await n.h.getDirectoryHandle(nm, { create: true }); msg(`Folder baru: ${pathOf(n)}\\${nm}`, 'ok'); n.open = true; await loadKids(n); renderTree(); }
  catch (e) { msg('Gagal membuat folder: ' + e.message, 'e'); }
}
async function renameNode(n) {
  const nm = prompt('Nama baru:', n.name); if (!nm || nm === n.name) return;
  try {
    if (n.h.move) await n.h.move(nm);
    else if (n.kind === 'file') {
      const f = await n.h.getFile(), nh = await n.parent.h.getFileHandle(nm, { create: true }), w = await nh.createWritable();
      await w.write(await f.arrayBuffer()); await w.close(); await n.parent.h.removeEntry(n.name);
    } else throw new Error('ganti nama folder belum didukung browser ini');
    msg(`Ganti nama: ${n.name} → ${nm}`, 'ok'); await loadKids(n.parent); renderTree();
  } catch (e) { msg('Gagal ganti nama: ' + e.message, 'e'); }
}
async function deleteNode(n) {
  const dir = n.kind === 'directory';
  if (!confirm(`Hapus ${dir ? 'folder (beserta isinya)' : 'file'}:\n${pathOf(n)}\n\nFile yang dihapus tidak masuk Recycle Bin.`)) return;
  try { await n.parent.h.removeEntry(n.name, { recursive: dir }); msg(`Dihapus: ${pathOf(n)}`, 'w'); if (NAV.sel === n) NAV.sel = null; await loadKids(n.parent); renderTree(); }
  catch (e) { msg('Gagal menghapus: ' + e.message, 'e'); }
}

/* simpan layer aktif (Save / Save as) */
async function saveLayer(as) {
  const L = S.active && S.active.kind === 'str' ? S.active : null;
  if (!L) { msg('Pilih layer string dulu (klik namanya di panel Layers).', 'w'); return; }
  let name = L.name;
  if (as) { name = prompt('Simpan layer sebagai:', L.name); if (!name) return; if (!/\.str$/i.test(name)) name += '.str'; }
  const bytes = L.raw ? new Uint8Array(L.raw) : null;
  if (!bytes) { msg('Layer ini tidak bisa disimpan.', 'e'); return; }
  await saveFile(name, bytes);
}

/* menu & perintah */
const CMD = {
  navAdd: () => navAddRoot(false), navAddRo: () => navAddRoot(true), navRefresh,
  open: () => $('#fileIn').click(), save: () => saveLayer(false), saveAs: () => saveLayer(true),
  closeAll: () => { for (const L of S.layers.filter((x) => x.kind === 'str')) removeLayer(L); for (const L of [...S.layers]) removeLayer(L); },
  zoom: zoomAll, plan: () => setPlan(true), '3d': () => setPlan(false),
  bg: () => { $('#view').classList.toggle('light'); S.dirty = true; try { localStorage.setItem('smaBg', $('#view').classList.contains('light') ? 'l' : 'd'); } catch (e) {} },
  theme: () => $('#bTheme').click(),
  msg: () => $('#msgwin').classList.toggle('min'), msgClear: () => { $('#msgLog').innerHTML = ''; },
  ident: () => setTool('ident'), meas: () => setTool('meas'), sec: () => showTab('tSec'),
  dtm: () => showTab('tDtm'), sod: () => { showTab('tDtm'); $('#sodSrc').focus(); }, vol: () => showTab('tVol'),
  upHarian: () => { $('#upJenis').value = 'harian'; upJenis(); showTab('tUp'); },
  upPotong: () => { $('#upJenis').value = 'potong'; upJenis(); showTab('tUp'); },
  upBdy: () => { $('#upJenis').value = 'bdy'; upJenis(); showTab('tUp'); },
  help: () => $('#help').showModal(),
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-cmd]');
  if (a && CMD[a.dataset.cmd]) { for (const m of document.querySelectorAll('.menu.open')) m.classList.remove('open'); CMD[a.dataset.cmd](); return; }
  const mb = e.target.closest('.menu>button');
  if (mb) { const m = mb.parentElement, was = m.classList.contains('open'); for (const x of document.querySelectorAll('.menu.open')) x.classList.remove('open'); if (!was) m.classList.add('open'); }
});
document.addEventListener('pointerover', (e) => {      // menu terbuka: pindah menu dengan hover, seperti aplikasi desktop
  const mb = e.target.closest('.menu>button'); if (!mb || !document.querySelector('.menu.open')) return;
  for (const x of document.querySelectorAll('.menu.open')) x.classList.remove('open'); mb.parentElement.classList.add('open');
});
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); saveLayer(e.shiftKey); } else if (k === 'o') { e.preventDefault(); $('#fileIn').click(); }
});
$('#navFilter').onchange = (e) => { NAV.filter = e.target.value; for (const r of NAV.roots) if (r.ok) { const re = async (n) => { if (n.kids) { for (const k of n.kids) if (k.kind === 'file' && k.size == null) { try { const f = await k.h.getFile(); k.size = f.size; } catch (er) {} } for (const k of n.kids) if (k.open) await re(k); } }; re(r.node).then(renderTree); } renderTree(); };
/* pembagi Navigator / Layers */
(() => {
  const sp = $('#splitter'), nav = $('#navPane'), left = $('#left');
  sp.addEventListener('pointerdown', (e) => {
    sp.setPointerCapture(e.pointerId);
    const mv = (ev) => { const r = left.getBoundingClientRect(); const f = Math.max(0.15, Math.min(0.85, (ev.clientY - r.top) / r.height)); nav.style.flex = `0 0 ${f * 100}%`; };
    const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up);
  });
})();
try { if (localStorage.getItem('smaBg') === 'l') $('#view').classList.add('light'); } catch (e) {}
msg('SMA Survey siap. File › Set work directory untuk membuka folder kerja (mis. D:\\yopi).');
if (!window.showDirectoryPicker) msg('Browser ini belum mendukung Navigator folder. Pakai Chrome atau Edge; untuk sementara pakai Open file.', 'w');
navRestore();
