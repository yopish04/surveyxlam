"""Gabung src/ menjadi satu file SMA_Viewer.html (offline, tanpa pustaka luar)."""
import pathlib
d = pathlib.Path(__file__).parent
h = (d/'src/index.html').read_text(encoding='utf-8')
h = h.replace('/*CSS*/', (d/'src/style.css').read_text(encoding='utf-8'))
h = h.replace('/*PARSER*/', (d/'src/parser.js').read_text(encoding='utf-8'))
h = h.replace('/*APP*/', (d/'src/app.js').read_text(encoding='utf-8'))
(d/'SMA_Viewer.html').write_text(h, encoding='utf-8')
print('SMA_Viewer.html', len(h.encode()), 'byte')
