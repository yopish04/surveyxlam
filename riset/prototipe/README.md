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
3. **Area:** titik dikelompokkan kalau jaraknya ≤ 20 m satu sama lain. Area yang terpisah
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
