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
- **Tanggal dan label bisa diganti.** `DATE=auto` mengambil tanggal terbaru dari nama file
  `.txt` (26102026, 26-10-2026, 20261026); `DATE=2026-10-27` atau `27/10/2026` memakai hari
  itu; teks lain dipakai apa adanya. Nama bulan selalu bahasa Inggris (`Oct`, bukan `Okt`).
  `LABEL=RTK_SMA` mengisi kolom deskripsi terakhir. Awalan nama file (`271026_`) ikut tanggal.
  Panel memanggil `SetDateLabel` sebelum `RunJob`.

- **Garis tidak bersilangan.** Crest/toe yang diukur dua kali dibuang (lintasan pertama /
  ujung yang menumpuk, ≤ 1 m), garis diurai (2-opt), sisa persilangan diputus di beda tinggi
  terbesar. Titik 23 tidak pernah dibuang. Jumlahnya ditulis di LOG.
- **Boundary lebih rapat**: sisi > 5 m digali ke titik di dalam (≤ 0,3 × sisi, ≤ 2 m) selama tidak
  memotong garis.
- **`ReloadBoundary(masuk, keluar)`**: membuat ulang string 1 dari `.str` yang sudah diedit di
  Surpac (teks atau biner); string lain ditulis apa adanya. Di panel: tombol
  *Muat Ulang Boundary* (file lama disalin dulu ke `backup_boundary\`).

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
| 25 Okt, `DATE=auto` / `DATE=2026-10-27` + `LABEL=RTK_XYZ` | 10 + 10 file | semua sama persis |
| 26 Okt tofu3 + tofu9 (garis rapi + boundary digali) | 2 file | semua sama persis |
| Muat ulang boundary, file manual 26 Okt (teks) dan versi biner | 3 file | sama persis (biner: byte per byte) |

```
excel/uji_libreoffice/run_lo.sh excel/SurveyCore.bas <job.txt>
```

Catatan kompatibilitas yang ditemukan saat uji: LibreOffice salah membaca
`If ... Then ReDim Preserve ...` dalam satu baris dan `Case n: For ... : Next` dalam satu
baris. Keduanya sudah ditulis dalam bentuk blok, jadi modul berjalan sama di Excel dan
LibreOffice.

## Update Progress (SurveyUpdate.bas + SurveyUpdatePanel.bas)

Grup ribbon **Update Progress**: Sheet Update, Isi File, Jalankan Update, Potong Cepat, Boundary Cepat, Cara Pakai.

- **POTONG**: file progress (teks/biner) dipotong dengan boundary dari satu atau banyak file. Nomor string bisa dipilih. Mode DALAM (buang titik di dalam, = Surpac STRING CLIP OUTSIDE) atau LUAR. Data harian bisa langsung ditambahkan. Titik tepat di garis boundary (≤ 1 cm) dihitung di dalam.
- **BDY TAMBAH / KURANGI / IRISAN**: boundary A dan B, masing-masing dengan nomor string pilihan.
- **UPDATE HARIAN** menghasilkan tiga file sekaligus: `YYYY_MM_DD_update_topo_<area>.str`, `..._bdy.str`, dan `..._CEK.str`.

Aturan Surpac yang ditiru untuk gabung boundary:

- z titik potong = (2·zA + zB)/3;
- ring hasil memakai satu deskripsi, yaitu titik pertama ring harian;
- titik awal ring mengikuti ring harian terakhir yang menyentuh.

Hasil uji (spesifikasi `riset/volume/progres.py`):

| Uji | Hasil |
|---|---|
| bdy LD03 26→27 dan 25→26 | identik byte per byte dengan file manual Surpac |
| bdy Tofu 9 (11 segmen, biner) | sama, selisih koordinat ≤ 6e-11 m |
| VBA (LibreOffice) vs Python | 16 kasus (potong DALAM/LUAR, banyak boundary, string 3, titik potong, harian, tambah/kurangi/irisan, update harian): semua byte sama |
| update global vs manual | sama di luar daerah edit manual; selisih volume 0,04 % / 0,002 % |

Uji LibreOffice: `uji_libreoffice/run_update.sh SurveyUpdate.bas job.txt`.

Catatan LibreOffice: `If ... Then ReDim Preserve ...` satu baris tidak jalan, harus ditulis sebagai blok. `2^1024` membuat overflow (tabel Pow2 hanya sampai 2046). Array besar (> ~10 juta elemen) membuat LibreOffice berhenti; di Excel tidak masalah.

## Panel (add-in)

`SurveyPanel.bas` + `ribbon/customUI14.xml` → tab **SMA Survey**: Siapkan Job (sheet Job dari
folder `.txt`), Proses, Folder Hasil, Muat Ulang Boundary, Simpan/Jalankan File Job, Cara Pakai.

## Belum

- Laporan tinggi mencurigakan dan tanda zig-zag baru ada di versi Python.
- Waktu proses di LibreOffice ± 47 detik per hari data; di Excel biasanya lebih cepat,
  tapi angkanya baru bisa dipastikan di PC pengguna.
