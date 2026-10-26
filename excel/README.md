# Excel: modul VBA SurveyCore

`SurveyCore.bas` adalah inti logika untuk add-in survey baru: file `.txt` mentah dari alat
menjadi `.str` Surpac. Isinya terjemahan langsung dari prototipe Python di
`riset/prototipe/` (`raw2str.py` + `proses_job.py`), dengan aturan yang sama:

- Kode → nomor string per jenis area (`harian`: 2→5, 3→6, 500→600, 602→602;
  `base`: 2→2, 3→3, 500→500), titik 23 masuk crest + toe + string 23.
- Titik double (≤ 5 cm, beda tinggi ≤ 5 cm) dihapus; file `.txt` tidak pernah diubah.
- Crest/toe disambung per urutan tembak (putus > 8 m), lalu digabung lewat ujung terdekat.
- Area dipisah kalau berjarak > 12 m; boundary (string 1) = concave hull yang menyusuri
  crest/toe terluar, tanpa garis saling silang.
- Jalan (kode 7, bisa diubah) diambil dari semua file area → satu file `_jalan.str`
  (tepi 7, tengah 77, boundary 1, per penampang 5 titik).
- Exca (kode bukan angka: EX…, EXA…, EXC…, Bolong) → satu titik per unit, tembakan pertama;
  peringatan kalau tembakan satu unit berjarak > 1 m.
- Angka dibaca dengan `Val()` dan ditulis dengan `Fmt3()`: selalu titik desimal, aman di
  Windows dengan setelan regional Indonesia.

Masukan berupa daftar pekerjaan (lihat `uji_libreoffice/contoh_job_251026.txt`), yaitu
isi yang nanti diisi lewat panel: folder masuk/keluar, baris AREA, JALAN, EXCA.
Panel Excel cukup memanggil `RunJob` (atau `RunJobFile` dengan file daftar pekerjaan).

## Bukti: hasil VBA = hasil Python

Modul dijalankan di LibreOffice (headless, mode kompatibel VBA) dengan data asli, lalu
setiap file dibandingkan baris demi baris dengan hasil Python:

| Tanggal | File | Hasil |
|---|---|---|
| 22 Okt 2026 | 11 file (8 area, jalan, exa_ds, exa_ns, gabung) | semua sama persis |
| 25 Okt 2026 | 10 file | semua sama persis |
| 26 Okt 2026 | 7 file | semua sama persis |

```
excel/uji_libreoffice/run_lo.sh excel/SurveyCore.bas <job.txt>
```

Catatan kompatibilitas yang ditemukan saat uji: LibreOffice salah membaca
`If ... Then ReDim Preserve ...` dalam satu baris dan `Case n: For ... : Next` dalam satu
baris. Keduanya sudah ditulis dalam bentuk blok, jadi modul berjalan sama di Excel dan
LibreOffice.

## Belum

- Panel (UserForm) dan tombol ribbon belum dibuat. Ini perlu Microsoft Excel di Windows,
  jadi dikerjakan saat terhubung ke PC pengguna.
- Laporan tinggi mencurigakan dan tanda zig-zag baru ada di versi Python.
- Waktu proses di LibreOffice ± 47 detik per hari data; di Excel biasanya lebih cepat,
  tapi angkanya baru bisa dipastikan di PC pengguna.
