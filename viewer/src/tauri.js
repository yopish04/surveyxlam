/* ---------- jembatan ke aplikasi desktop (Tauri + Rust) ----------
   Hanya aktif kalau halaman berjalan di dalam SMA Survey Desktop (window.__TAURI__ ada).
   - TAURI_FS: folder/file lewat Rust (path Windows asli, Z:\ baca saja ditolak di Rust juga)
   - run(): CREATE DTM, volume, update dikerjakan mesin Rust (sma-core, multi-core); kalau gagal kembali ke mesin JS
   - riwayat volume di SQLite */
const TA = window.__TAURI__;
const inv = (c, a, o) => TA.core.invoke(c, a, o);
const pjoin = (a, b) => a.replace(/[\\/]+$/, '') + '\\' + b;
const pname = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
if (TA) {
  class TFile {
    constructor(path, size, mod) { this.kind = 'file'; this.path = path; this.name = pname(path); this.size = size; this.mod = mod; }
    async getFile() { const buf = await inv('read_file', { path: this.path }); return new File([buf], this.name, { lastModified: this.mod || Date.now() }); }
    async createWritable() {
      const parts = [], path = this.path;
      return {
        write: async (d) => { parts.push(d instanceof Uint8Array ? d : new Uint8Array(d.buffer || d)); },
        close: async () => { const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; } await inv('write_file', all, { headers: { 'x-path': encodeURIComponent(path) } }); },
      };
    }
    async isSameEntry(o) { return !!o && o.path === this.path; }
    async move(n) { const np = pjoin(this.path.replace(/[\\/][^\\/]*$/, ''), n); await inv('rename_path', { from: this.path, to: np }); this.path = np; this.name = n; }
  }
  class TDir {
    constructor(path) { this.kind = 'directory'; this.path = path; this.name = pname(path); }
    async *values() { for (const e of await inv('list_dir', { path: this.path })) yield e.dir ? new TDir(pjoin(this.path, e.name)) : new TFile(pjoin(this.path, e.name), e.size, e.modified); }
    async getFileHandle(name, opt = {}) {
      const p = pjoin(this.path, name), st = await inv('stat_path', { path: p });
      if (!st) { if (!opt.create) throw new DOMException('tidak ada', 'NotFoundError'); return new TFile(p, 0, Date.now()); }
      if (st.dir) throw new DOMException('folder', 'TypeMismatchError');
      return new TFile(p, st.size, st.modified);
    }
    async getDirectoryHandle(name, opt = {}) {
      const p = pjoin(this.path, name), st = await inv('stat_path', { path: p });
      if (!st) { if (!opt.create) throw new DOMException('tidak ada', 'NotFoundError'); await inv('make_dir', { path: p }); }
      return new TDir(p);
    }
    async removeEntry(name, opt = {}) { await inv('remove_path', { path: pjoin(this.path, name), recursive: !!opt.recursive }); }
    async isSameEntry(o) { return !!o && o.path === this.path; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }
  window.TAURI_FS = {
    dir: (p) => new TDir(p),
    async pickDir(ro) {
      const p = await TA.dialog.open({ directory: true, title: ro ? 'Pilih folder server (baca saja), mis. Z:\\' : 'Pilih folder kerja, mis. D:\\yopi' });
      return p ? new TDir(Array.isArray(p) ? p[0] : p) : null;
    },
  };

  /* ---- paket biner untuk mesin Rust: [u32 panjang JSON][JSON][bagian-bagian, masing-masing kelipatan 8 byte] ---- */
  const asU8 = (p) => p instanceof Uint8Array ? p : p instanceof ArrayBuffer ? new Uint8Array(p) : new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
  const pad8 = (n) => Math.ceil(n / 8) * 8;
  function pack(head, parts) {
    const bs = parts.map(asU8); head.lens = bs.map((b) => b.length);
    const hj = new TextEncoder().encode(JSON.stringify(head)), hl = pad8(4 + hj.length);
    const out = new Uint8Array(hl + bs.reduce((a, b) => a + pad8(b.length), 0));
    new DataView(out.buffer).setUint32(0, hj.length, true); out.set(hj, 4);
    let o = hl; for (const b of bs) { out.set(b, o); o += pad8(b.length); }
    return out;
  }
  function unpack(buf) {
    const u = new Uint8Array(buf), L = new DataView(u.buffer, u.byteOffset).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(u.subarray(4, 4 + L)));
    let o = pad8(4 + L); const parts = (head.lens || []).map((n) => { const b = u.slice(o, o + n); o += pad8(n); return b; });
    return { head, parts };
  }
  const f64 = (a) => a instanceof Float64Array ? a : Float64Array.from(a);
  const rustJob = {
    async dtm(a) {
      const head = { rows: a.r.rows, skip: a.skip.map(([x, y]) => `${x}-${y}`).join(','), spot: a.spot.map(([x, y]) => `${x}-${y}`).join(',') };
      const r = unpack(await inv('engine_dtm', pack(head, [f64(a.r.x), f64(a.r.y), Int32Array.from(a.r.sn)])));
      const tris = new Int32Array(r.parts[0].buffer);
      return { tris, ntri: tris.length / 3, npts: r.head.npts, skipped: r.head.skipped, flips: r.head.flips, engine: 'rust' };
    },
    async vol(a) {
      const head = { n1: a.first.x.length, t1: a.first.tris.length, n2: a.second.x.length, t2: a.second.tris.length, rings: a.rings.map((r) => r.length) };
      const parts = [f64(a.first.x), f64(a.first.y), f64(a.first.z), f64(a.second.x), f64(a.second.y), f64(a.second.z), ...a.rings.map(f64), Int32Array.from(a.first.tris), Int32Array.from(a.second.tris)];
      return await inv('engine_vol', pack(head, parts));
    },
    async update(a) {
      const files = [a.g, ...(a.bdy ? [a.bdy] : []), ...(a.harian || []), ...(a.bdys || [])];
      const head = { ...a, g: undefined, bdy: undefined, harian: undefined, bdys: undefined, hasBdy: !!a.bdy, nHarian: (a.harian || []).length, nBdys: (a.bdys || []).length };
      const r = unpack(await inv('engine_update', pack(head, files)));
      return { ...r.head, files: r.head.files.map((f, i) => ({ name: f.name, data: r.parts[i] })) };
    },
  };
  const runJs = run;
  run = async (cmd, args, transfer, prog) => {
    if (rustJob[cmd]) {
      try { const t0 = performance.now(); const r = await rustJob[cmd](args); msg(`Mesin Rust: ${cmd} ${Math.round(performance.now() - t0)} ms`); return r; }
      catch (e) { msg(`Mesin Rust gagal (${String(e).slice(0, 120)}); pakai mesin JavaScript.`, 'w'); }
    }
    return runJs(cmd, args, transfer, prog);
  };

  /* ---- riwayat volume (SQLite) ---- */
  window.SMA_DB = {
    save: (rec) => inv('vol_save', { rec }).catch((e) => msg('Gagal menyimpan riwayat volume: ' + e, 'e')),
    last: (pit, before) => inv('vol_last', { pit, before }).catch(() => null),
    history: (pit) => inv('vol_history', { pit, limit: 60 }).catch(() => []),
  };

  /* ---- file yang dibuka dari Windows Explorer (klik dua kali .str/.dtm) ---- */
  inv('startup_files').then(async (paths) => {
    if (!paths || !paths.length) return;
    const files = [];
    for (const p of paths) {
      const fh = await TAURI_FS.dir(p.replace(/[\\/][^\\/]*$/, '')).getFileHandle(pname(p)).catch(() => null);
      if (fh) files.push({ kind: 'file', name: fh.name, h: fh, parent: { h: TAURI_FS.dir(p.replace(/[\\/][^\\/]*$/, '')), kids: null }, root: { ro: true } });
    }
    for (const f of files) { const kids = []; for await (const h of f.parent.h.values()) kids.push({ kind: h.kind, name: h.name, h }); f.parent.kids = kids; }
    openNodes(files);
  }).catch(() => {});
  document.title = 'SMA Survey Desktop';
  $('#menubar .brand').textContent = 'SMA Survey Desktop';
}
