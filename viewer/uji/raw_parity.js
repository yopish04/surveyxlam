// Dipakai oleh run_raw_parity.sh. Aturan nama Excel (FullName): nama berawalan tanggal 8 digit tidak diberi tag.
// Bandingkan port JS (viewer/src/raw.js) dengan riset/prototipe/proses_job.py, byte per byte.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RAW = require(process.argv[2]); const PROTO = process.argv[3]; const dirs = process.argv.slice(4);
let fail = 0;
for (const inDir of dirs) {
  const files = fs.readdirSync(inDir).filter((f) => f.endsWith('.txt')).map((name) => ({ name, data: new Uint8Array(fs.readFileSync(path.join(inDir, name))) }));
  const rows = RAW.prepare(files);
  const job = RAW.jobFromRows(rows, { date: 'auto', label: 'RTK_SMA', roadCode: '7' });
  const outPy = inDir + '_py', outJs = inDir + '_js';
  fs.rmSync(outPy, { recursive: true, force: true }); fs.rmSync(outJs, { recursive: true, force: true });
  const jl = [`FOLDER_IN=${inDir}`, `FOLDER_OUT=${outPy}`, 'DATE=auto', 'LABEL=RTK_SMA'];
  for (const r of job.rows) jl.push(r.kind === 'AREA' ? `AREA|${r.name}|${r.profile}|${r.files.join(';')}` : r.kind === 'JALAN' ? `JALAN|${r.name}|7` : `EXCA|${r.name}|${r.files === 'AREA' ? 'AREA' : r.files.join(';')}`);
  fs.writeFileSync(inDir + '_job.txt', jl.join('\n') + '\n');
  const py = cp.execFileSync('python3', [path.join(PROTO, 'proses_job.py'), inDir + '_job.txt'], { encoding: 'utf8' });
  const t0 = Date.now(); const res = RAW.runJob(job, new Map(files.map((f) => [f.name, f.data]))); const ms = Date.now() - t0;
  for (const f of res.files) { const p = path.join(outJs, f.name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.data); }
  const list = (d) => { const o = []; const w = (x) => { for (const e of fs.readdirSync(path.join(d, x))) { const r = path.join(x, e); fs.statSync(path.join(d, r)).isDirectory() ? w(r) : o.push(r); } }; w(''); return o.filter((f) => f.endsWith('.str')).sort(); };
  // aturan nama Excel (FullName): nama yang sudah diawali tanggal 8 digit tidak diberi tag lagi
  for (const f of list(outPy)) { const m = /^\d{6}_(\d{8}_.*)$/.exec(path.basename(f)); if (m) { const src = path.join(outPy, f), txt = fs.readFileSync(src, 'latin1').replace(/^\d{6}_(\d{8}_)/, '$1'); fs.rmSync(src); fs.writeFileSync(path.join(outPy, path.dirname(f), m[1]), txt, 'latin1'); } }
  const a = list(outPy), b = list(outJs);
  console.log(`== ${path.basename(inDir)}: job ${job.rows.map((r) => r.kind[0] + ':' + r.name).join(' ')} | JS ${ms} ms`);
  if (a.join() !== b.join()) { console.log('  DAFTAR FILE BEDA\n  py:', a.join(' '), '\n  js:', b.join(' ')); fail++; }
  for (const f of a.filter((x) => b.includes(x))) {
    const x = fs.readFileSync(path.join(outPy, f)), y = fs.readFileSync(path.join(outJs, f));
    if (Buffer.compare(x, y) === 0) { console.log(`  SAMA  ${f} (${x.length} byte)`); continue; }
    fail++; const lx = x.toString('latin1').split('\r\n'), ly = y.toString('latin1').split('\r\n');
    const i = lx.findIndex((l, k) => l !== ly[k]);
    console.log(`  BEDA  ${f}: baris ${i + 1}\n    py: ${lx[i]}\n    js: ${ly[i]}`);
  }
  console.log('  python:', py.trim().split('\n').join(' | ').slice(0, 400));
  console.log('  js    :', res.log.join(' | ').slice(0, 400));
}
console.log(fail ? `GAGAL: ${fail}` : 'SEMUA SAMA');
