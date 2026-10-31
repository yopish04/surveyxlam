# SMA Viewer

Aplikasi survey ringan yang kompatibel dengan file Surpac.
- Bentuknya satu file HTML, dibuka di Chrome atau Edge.
- Berjalan offline, tanpa instalasi dan tanpa pustaka luar.
- Pekerjaan berat dijalankan di Web Worker.

| Tab | Isi | Uji |
|---|---|---|
| Layer / tampilan | `.str` teks/biner, `.dtm` teks/biner, `.shp`; tampilan Plan/3D | pembacaan sama dengan `strio.py` |
| Identify / Ukur | koordinat, jarak datar/miring/di permukaan DTM, bearing, grade; salin ke Excel, simpan `.str`, SOD garis ukur | jarak DTM = Python ±1 mm |
| Section | profil semua DTM yang tampil sepanjang garis ukur, dengan titik di setiap perpotongan sisi segitiga | – |
| DTM | lihat rincian di bawah | lihat rincian di bawah |
| Volume | cut/fill eksak per segmen boundary, common area, volume hari ini, report cetak/PDF, CSV | lihat rincian di bawah |
| Update | update harian, potong progress (DALAM/LUAR), boundary TAMBAH/KURANGI/IRISAN | lihat rincian di bawah |

**DTM**
- CREATE DTM: Delaunay sweep-hull ditambah breakline (port `cdt2.py`); kalau ada seri ko-sirkular, dipilih diagonal NW–SE.
- String over DTM (SOD): string ditempel ke DTM.
- Uji:
  - LD03: identik dengan TIN Surpac.
  - Tofu 9: 99,76% sisi sama, waktu 1,9 detik.

**Volume**
- Uji dengan TIN Surpac:
  - LD03: selisih ±0,008 m³ dari PDF.
  - Tofu 9: selisih 5 m³ dari 5,68 juta m³ (0,0001%), waktu 15 detik.

**Update**
- Port dari `progres.py`.
- Uji: hasil byte-identik dengan Python dan Excel (LD03, Tofu 9).

**TXT ke STR** (*Survey › TXT ke STR*)
- Data mentah alat (.txt, format tab maupun `kode N E Z nama`) menjadi .str: crest/toe, spot, titik 23, boundary per area, jalan, posisi exca DS/NS, dan `_CEK.str` untuk titik yang perlu dicek.
- Port dari `riset/prototipe/raw2str.py` + `proses_job.py`; tebakan area dan profil dari nama file seperti *Siapkan Job* di Excel (`SurveyPanel.bas`).
- Hasil disimpan ke `<folder simpan>\STR` (bisa diganti), gabungan semua area di `STR\gabung\<tag>.str`, log di `<tag>_LOG.txt`.
- Uji: `uji/run_raw_parity.sh` membuat data mentah sintetis lalu membandingkan semua .str dengan Python, byte per byte (8 set data: sama semua).

Kode sumber ada di `src/`: `parser.js`, `tin.js`, `vol.js`, `progres.js`, `raw.js`, `worker.js`, `app.js`, `tools.js`, `index.html`, `style.css`.
Jalankan `python3 build.py` untuk membuat `SMA_Viewer.html`.
