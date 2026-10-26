# Prototipe: data mentah alat → file string Surpac otomatis

Tujuan: menggantikan pekerjaan manual dari `.txt` (hasil RTK) sampai `.str` siap DTM,
termasuk penyusunan crest/toe dan pembuatan boundary per area.
Prototipe ditulis dalam Python murni supaya algoritmanya mudah dipindah ke VBA (add-in Excel).

## Aturan yang dibaca dari pekerjaan manual 26-10-2026

| Kode di alat | Arti | Nomor string di `.str` |
|---|---|---|
| `2` | Crest (rata-rata ±2–3 m lebih tinggi dari toe) | **5** |
| `3` | Toe | **6** |
| `23` | Titik pertemuan crest dan toe | masuk ke **5** dan **6**, plus titik tunggal **23** |
| `500`, `602` | Spot / topo | **602** |
| `EX…`, `EXA_…`, `EXC.…`, `Bolong` | Posisi unit/alat | dipisah ke file `exa_ds` / `exa_ns` (string 1, satu titik per unit) |
| kosong | Tanpa kode | dibuang |
| — | Boundary luar per area, tertutup, dibentuk dari titik yang sudah ada | **1** |

Kolom deskripsi diisi nama titik (Point Name), lalu tanggal, lalu `RTK_SMA`.

## Cara kerja otomatis

1. **Klasifikasi** setiap titik berdasarkan kode (tabel di atas).
2. **Garis crest/toe:** titik dengan kode yang sama dan berurutan saat ditembak disambung.
   Garis diputus kalau berganti kode atau jaraknya > 8 m. Potongan garis lalu digabung
   lewat ujung terdekat (≤ 8 m). Titik `23` diperlakukan sebagai ujung garis alami.
3. **Area:** titik dikelompokkan kalau jaraknya ≤ 12 m satu sama lain. Area yang terpisah
   otomatis menjadi kelompok sendiri.
4. **Boundary:** *concave hull* k-nearest-neighbour (Moreira & Santos) per area, hanya memakai
   titik yang sudah ada (sama seperti cara manual).
5. Tulis `.str` dengan format yang sama seperti file manual.

## Hasil dibanding pekerjaan manual (4 file, 26-10-2026)

| File | Area (manual / auto) | Kemiripan boundary (IoU) | Crest cocok | Toe cocok |
|---|---|---|---|---|
| pit_tofu3 | 3 / 3 | 0,970 | 97 % | 95 % |
| pit_tofu9 | 2 / 2 | 0,958 | 91 % | 93 % |
| quarry_tofu1 | 3 / 3 | 0,974 | 90 % | 84 % |
| rehandling_ld03 | 1 / 1 | 0,971 | 97 % | 85 % |
| **Total** | **9 / 9** | | **94 %** (543/576 sambungan) | **92 %** (511/556) |

"Cocok" artinya sambungan antar dua titik yang sama persis dengan sambungan manual.
Sebagian selisih terjadi karena di versi manual ada titik crest/toe yang sengaja dibuang
(salah tembak/duplikat), sedangkan prototipe masih memakainya.

## Uji 3 hari (24, 25, 26 Okt 2026), batas antar-area 12 m

`python3 evaluasi_semua.py <folder24> <folder25> <folder26>`

| Tanggal | File | Area (manual / auto) | IoU boundary | Crest | Toe |
|---|---|---|---|---|---|
| 24 | pit_tofu3 | 2 / 2 | 0,93 | 94 % | 88 % |
| 24 | rehendling_ld03 | 1 / 1 | 0,98 | 89 % | 88 % |
| 24 | rehenling_ld05 | 1 / 1 | 0,98 | 86 % | 81 % |
| 25 | base_pelebaran-tos09 | 1 / 1 | 0,90 | 93 % | 94 % |
| 25 | pit_tofu3 | 6 / 5 | 0,95 | 91 % | 90 % |
| 25 | pit_tofu9 | 2 / 2 | 0,98 | 77 % | 92 % |
| 25 | quari_tf1 | 2 / 2 | 0,98 | 95 % | 89 % |
| 25 | rehenling_ld_03 | 1 / 1 | 0,95 | 92 % | 89 % |
| 25 | waste_tf9 | 1 / 1 | 0,98 | 87 % | 79 % |
| 26 | 4 file (lihat tabel di atas) | 9 / 9 | 0,96–0,97 | 90–97 % | 84–95 % |
| | **Total 13 file** | **12/13 sama** | **rata-rata 0,96** | **91 %** | **89 %** |

Tidak bisa diuji: `241026_dumpingan` dan `241026_pit_tofu9`, karena file mentahnya
(`24102026-Dumpingan WSDM-TF01.txt`, `24102026_pitDS_TF09C.txt`) rusak di arsip.
Di `251026_pit_tofu3`, dua area yang bersentuhan (< 8 m) masih tergabung jadi satu.

## Nomor string (dipelajari dari pekerjaan manual 22–26 Okt 2026)

| Jenis area (dari nama file) | Crest (2) | Toe (3) | Spot kode 500 | Spot kode 602 | Kode angka lain (mis. 800) |
|---|---|---|---|---|---|
| Pit, rehandling, quarry (`harian`) | 5 | 6 | **600** | 602 | nomor sama dengan kode |
| Base, dumping, waste, pelebaran, fill (`base`) | 2 | 3 | 500 | 602 | nomor sama dengan kode |

Boundary selalu `1`, titik `23` masuk crest + toe + string `23`, jalan `7`/`77`.

Spot kode 500 → **600** dipakai di 14 dari 18 file pit/rehandling (22–25 Okt). Hanya file
26 Okt yang memakai 602 untuk kode 500, sehingga dianggap pengecualian. Jenis area ditebak
dari nama file (`BASE`, `DUMP`, `DAMPING`, `WASTE`, `WSD`, `WD_`, `PELEBARAN`, `FILL` → base)
dan nanti bisa dipilih manual di panel.

Uji 5 hari (`evaluasi_semua.py`, 21 file yang file mentahnya lengkap): nomor spot sama
100 % untuk 22–25 Okt; crest 87 %, toe 89 % sambungan sama; jumlah area sama di 18/21 file,
rata-rata IoU boundary 0,96.

## Jalan (kode 7)

Titik kode 7 **dikeluarkan** dari file utama dan dibuat file sendiri `<judul>_jalan.str`,
sama seperti cara manual.

Di lapangan jalan ditembak per **penampang melintang 5 titik**: tepi luar, tepi dalam,
tengah, tepi dalam, tepi luar. Prototipe:
1. memotong urutan titik kode 7 menjadi penampang berisi 5 titik;
2. mengurutkan titik dalam setiap penampang berdasarkan jarak tegak lurus terhadap arah jalan;
3. menyambung posisi yang sama antar penampang: tepi → string **7**, tengah → string **77**;
4. boundary **1** = penampang pertama + tepi terluar + penampang terakhir.

| Tanggal | Hasil |
|---|---|
| 25 Okt (20 titik, 4 penampang) | **100 % sama** dengan manual: garis 7 (12/12), 77 (3/3), boundary (14/14) |
| 24 Okt (46 titik, ada simpangan/cabang) | Tidak bisa disusun otomatis → ditandai **"jalan PERLU DICEK"** di laporan |

Jumlah titik per penampang (5) nanti menjadi pengaturan.

## Pembersihan data & posisi unit

| Hal | Perlakuan | Alasan |
|---|---|---|
| Titik **double** (jarak ≤ 5 cm dan beda tinggi ≤ 5 cm) | **Dihapus otomatis**, yang pertama disimpan | Titik yang berjarak 20–50 cm tetap dipakai di versi manual, jadi batasnya dibuat ketat |
| **Tinggi mencurigakan** (> 1,5 m dari tetangga pada garis yang sama / median spot sekitar) | **Tidak dihapus**, hanya dicatat di `*_LAPORAN.txt` untuk dicek manual | Supaya tidak ada data yang hilang |
| **Posisi unit** (EX/EXA/EXC/Bolong) | Satu titik per unit, **tembakan terakhir** yang dipakai, string 1, deskripsi = kode unit | Sama dengan file `exa_ds` / `exa_ns` manual |
| **DS / NS** | NS jika nama file berisi `NS` atau tanggal di nama file lebih lama dari file terbaru (rekaman semalam); selain itu DS | Hasil 26-10-2026: DS 8/8 dan NS 6/6 sama persis dengan manual |

## Menjalankan

```
python3 raw2str.py hasil.str judul 26-Oct-26 file1.txt file2.txt ...
python3 evaluasi.py <folder data> <folder output>          # bandingkan dengan .str manual
python3 gambar_banding.py manual.str auto.str gambar.png "judul"
```

Folder `hasil/` berisi data koordinat dan tidak ikut di-commit (lihat `.gitignore`).

## Proses satu hari penuh

Alur manual: beberapa `.txt` → masing-masing jadi `.str` → digabung per area di Surpac
(`261026_pit_tofu9.str`, dst.) → semua area digabung jadi `str gabung/261026.str`.

```
python3 proses_harian.py <folder .txt hari itu> <folder output>
```

1. **Kelompokkan file per area** (`kelompok_area.py`):
   - jenis area dari kata di nama file: PIT, REH/RH (rehandling), DUMP/DAMP/WSD/WASTE/WD
     (dumpingan, satu file per hari), BASE/BES, PELEBARAN/LAMINATING, QUAR (quarry);
     REC/EXA/EXC = posisi unit, GCP diabaikan;
   - lokasi dari nama file: TF3/TF03/TOFU-03 → tofu3, LD-03 → ld03, TOS17 → tos17;
   - file sejenis yang titiknya bertumpuk di lapangan (≤ 15 m) digabung, misalnya
     `REHENDLING-TF03` yang diukur di dalam rehandling LD03.
2. Setiap area diproses `raw2str.convert` → `<yymmdd>_<area>.str` + `_jalan.str` + `_LAPORAN.txt`.
3. Posisi unit → `<yymmdd>_exa_ds.str` dan `<yymmdd kemarin>_exa_ns.str`.
4. Semua area → `gabung/<yymmdd>.str`.

Uji pengelompokan (`uji_kelompok.py`) terhadap pembagian manual 22–26 Okt:
**52/52 file masuk ke area yang sama.** Satu hari diproses < 1 detik.
Nama area otomatis (mis. `pelebaran_tos17`, `dumpingan`) bisa berbeda dari nama yang biasa
dipakai (`fill_quarry_perluasan_tos9`, `waste_tf9`); nama ini nanti bisa diubah di panel.

## Boundary menyusuri garis crest/toe terluar

Pada boundary manual, 51 % sisinya berjalan tepat di atas garis crest/toe; sisanya lewat
titik spot di tepi area. Versi awal (concave hull saja) hanya 33 %, karena memotong dari
titik ke titik dan melewati titik crest/toe di antaranya.

Perbaikan (`follow_strings`): kalau dua titik boundary berurutan ada di garis crest/toe yang
sama, boundary menyusuri garis itu titik demi titik, selama garisnya tidak menjauh > 6 m
dari potongan lurusnya. Setiap penyusuran hanya dipakai jika boundary tetap tidak saling
silang (`_simple`).

`python3 uji_boundary.py <folder hari 1> ... <folder hari n>`

| | Sebelum | Sesudah |
|---|---|---|
| Sisi boundary yang mengikuti crest/toe (manual: 51 %) | 33 % | **54 %** |
| Sisi boundary yang sama persis dengan manual | 46 % | **64 %** |
| Rata-rata IoU luas boundary | 0,962 | **0,967** |
| Boundary yang saling silang | – | **0 / 38** |

## Update progress global (file biner Surpac)

File progress global per area disimpan Surpac dalam **format biner** (`surpac_bin.py`):
dua baris header teks, 5 byte nol, lalu per titik `int32 nomor string` + `float64 Y, X, Z`
(big-endian) + deskripsi berakhiran NUL; string 0 = pemisah, string 0 "END" = akhir file.
Uji baca lalu tulis ulang kedua file global 26 Okt: **identik byte per byte**.

Cara Surpac meng-update global (dipelajari dari `2026_10_26_update_topo_*.str`):
- header mencatat `<global lama>.str OUTSIDE <boundary harian>.str`;
- titik global lama di dalam boundary harian dibuang, **tanpa** titik potong baru, dan sisa
  titik string tetap tersambung (0 titik lama tersisa di dalam boundary 26);
- data harian ditambahkan tanpa string 1 (boundary);
- string diurutkan per nomor, dan di dalam satu nomor data terbaru ditaruh paling depan.

`update_global.py <global_lama.str> <global_baru.str> <harian1.str> [...]` meniru langkah
itu dengan membaca file secara mengalir.

| Uji | Hasil |
|---|---|
| TOFU 9 global 26 Okt (45 MB, 888.623 titik) | 888.622 titik sama persis dengan hasil Surpac, 2,4 detik |
| TOFU 3 / LD01 global 26 Okt (16.788 titik) | 16.782 titik sama persis, < 0,1 detik |
| Global biner tiruan 272 MB, 5,1 juta titik, 5 boundary | 11,5 detik |

Global 25 Okt (sebelum update) tidak tersedia, jadi global lama direkonstruksi dari global
26 Okt dengan mengeluarkan titik harian 26 Okt. Selisih beberapa titik berasal dari rapikan
manual di Surpac (titik dipindah nomor string / garis baru disambung ke garis lama).
