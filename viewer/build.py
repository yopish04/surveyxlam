"""Gabung src/ menjadi satu file SMA_Viewer.html (offline, tanpa pustaka luar)."""
import pathlib
d = pathlib.Path(__file__).parent
h = (d/'src/index.html').read_text(encoding='utf-8')
h = h.replace('/*CSS*/', (d/'src/style.css').read_text(encoding='utf-8'))
h = h.replace('/*PARSER*/', (d/'src/parser.js').read_text(encoding='utf-8'))
h = h.replace('/*TIN*/', (d/'src/tin.js').read_text(encoding='utf-8'))
h = h.replace('/*VOL*/', (d/'src/vol.js').read_text(encoding='utf-8'))
h = h.replace('/*PROGRES*/', (d/'src/progres.js').read_text(encoding='utf-8'))
h = h.replace('/*WORKER*/', (d/'src/worker.js').read_text(encoding='utf-8'))
app = (d/'src/app.js').read_text(encoding='utf-8').replace('/*TOOLS*/', (d/'src/tools.js').read_text(encoding='utf-8')).replace('/*TAURI*/', (d/'src/tauri.js').read_text(encoding='utf-8')).replace('/*NAV*/', (d/'src/nav.js').read_text(encoding='utf-8'))
h = h.replace('/*APP*/', app)
(d/'SMA_Viewer.html').write_text(h, encoding='utf-8')
print('SMA_Viewer.html', len(h.encode()), 'byte')
