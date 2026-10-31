# SMA Viewer

Viewer ringan untuk file Surpac. Bentuknya satu file HTML, dibuka di Chrome/Edge, offline, tanpa instalasi.

- Membaca `.str` (teks/biner), `.dtm` (teks/biner, dipilih bersama `.str`-nya), dan `.shp`.
- Tampak plan dan 3D (WebGL2), pembesaran Z, layer, dan string per nomor (tampil/sembunyi, warna).
- Identify titik: string, segmen, titik, Y, X, Z, deskripsi.
- Ukur: jarak datar, jarak miring, jarak mengikuti permukaan DTM (sampel tiap 1 m), bearing DMS, grade.
- Salin tabel ke Excel (TSV). Titik juga bisa disimpan sebagai `.str` Surpac.

Kode ada di `src/` (`parser.js`, `app.js`, `style.css`, `index.html`). Jalankan `python3 build.py` untuk membuat `SMA_Viewer.html`.
Pembaca file sudah diuji: hasilnya sama dengan `riset/volume/strio.py` untuk LD03 dan Tofu 9 (888.676 titik, 1.759.530 segitiga; terbaca < 1 detik).
