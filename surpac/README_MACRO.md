# Macro Surpac SMA Survey (Update Progress)

Tiga macro di Surpac yang memakai **mesin yang sama dengan tombol Excel** (add-in `SurveySMA.xlam`).
Karena mesinnya sama, hasil dari Surpac dan dari Excel identik.

| Macro | Guna |
|---|---|
| `sma_update_harian.tcl` | Langkah-langkahnya: (1) global lama dipotong dengan boundary harian; (2) data harian ditambahkan; (3) bdy lama + boundary harian; (4) file `_CEK.str`. Hasil langsung dibuka di layer baru. Opsional: membuka form CREATE DTM dan DTM CUT AND FILL VOLUMES. |
| `sma_potong.tcl` | Memotong file progress dengan 1–2 file boundary. Nomor string boundary bisa dipilih, mode DALAM atau LUAR, dan data harian bisa ditambahkan sekaligus. |
| `sma_boundary.tcl` | Operasi boundary: A + B (TAMBAH), A − B (KURANGI), atau irisan (IRISAN). Nomor string A dan B bisa dipilih. |

Pendukung:

- `sma_lib.tcl` berisi setelan dan fungsi bersama.
- `sma_survey.vbs` adalah jembatan ke Excel. Excel dibuka tersembunyi lalu ditutup lagi.

## Pasang

1. Salin semua file `sma_*.tcl` dan `sma_survey.vbs` ke `D:\yopi\SurveySMA\surpac\`.
2. Add-in harus ada di `D:\yopi\SurveySMA\SurveySMA.xlam` (versi yang sudah berisi modul SurveyUpdate).
   Kalau foldernya lain, ubah `SMA(xlam)` di `sma_lib.tcl`.
3. Folder hasil default adalah `D:\yopi\SurveySMA\hasil_update` (`SMA(folder)` di `sma_lib.tcl`).
   Folder Y:\, Z:\ dan \\server tidak pernah ditulisi.

## Toolbar "SMA Survey" di Surpac

1. Buka menu **Customise → Customise menus and toolbars**.
2. Buat toolbar baru dengan nama `SMA Survey`.
3. Tambah item jenis **TCL Script** untuk masing-masing macro: `sma_update_harian.tcl`, `sma_potong.tcl`, `sma_boundary.tcl`.
4. Beri label tombol, misalnya *Update Harian*, *Potong*, *Boundary*, lalu simpan.

## Catatan

- Satu kali proses butuh beberapa detik ekstra karena Excel harus dibuka di belakang layar.
- `CREATE DTM` dan `DTM CUT AND FILL VOLUMES` hanya dibuka formnya; isian dan Apply tetap dilakukan sendiri.
  Supaya bisa jalan otomatis penuh, perlu satu kali **MACRO RECORD** dari kedua fungsi itu
  untuk mendapatkan id form dan nama field di Surpac 6.6.2.
- File `_CEK.str` (string 9006) berisi ujung garis crest/toe lama yang terpotong dan masih ≤ 2 m dari
  boundary harian. Titik-titik ini sering dirapikan saat edit manual, jadi perlu dicek.
