# Riset Add-in Excel: BP-Survey2 & SMAW-Engineering-Mining v6.3

Tanggal analisis: 26 Okt 2026. Metode: kedua `.xlam` dibongkar sebagai ZIP, kode VBA diekstrak dengan `olevba` (oletools 0.60.2), lalu dibaca manual. File tidak dijalankan.
Hasil ekstraksi source lengkap ada di `riset/vba/`.

---

## 1. Ringkasan

| | **BP-Survey2.xlam** | **SMAW-Engineering-Mining_ver6.3.xlam** |
|---|---|---|
| Fungsi | Tools tim **Survey**: import data alat ukur, export Surpac, volume/TOS dome, transformasi koordinat | Tools **Engineering/Reporting** tambang: OEE, PDB/AUDB, QC, fuel, breakdown, TTM, laporan mingguan |
| Tab ribbon | `SMAW - Survey` (9 grup, 38 tombol) | `SMAW - Reporting` (12 grup, ±55 tombol) |
| Ukuran kode | 21 modul, ±3.000 baris | 86 modul, ±33.800 baris |
| Pembuat (metadata) | `Engineering02` / `wda1`, dibuat 2021-07, diubah 2024-12 | `Happy T` / `wda1`, diubah terakhir 2025-11 |
| Perusahaan | PT. Samudera Mulia Abadi (tombol Help) | sama (SMA/SMAW), site terkait IWIP |
| Proteksi VBA | Ada password (proteksi tampilan saja; source tetap bisa dibaca) | sama |

**Kesimpulan keamanan: tidak ada indikasi malware.** Tidak ada download, koneksi internet, PowerShell, atau payload tersembunyi. Detail di bagian 4.

---

## 2. BP-Survey2: apa saja isinya

| Grup ribbon | Tombol → macro | Yang dikerjakan |
|---|---|---|
| Open File | TS Sokkia → `open_sokkia` | Buka file `.sdr` (fixed-width), filter kode `08TP` |
| | RTK Sokkia / Geopanel → `open_rtk_*` | Buka CSV/TXT hasil RTK, susun ulang kolom |
| From Excel | Input → `inputKoordinat` | Buat sheet `Data` (Northing/Easting/Elevasi/No/Kode) |
| Proses File | Save to Surpac → `save_surpac` | Export ke format string Surpac `.str` (CSV + baris `0` dan `END`) |
| | Monitoring → `Moni` | Update chart monitoring (Limonite dump, Wastedam, TOS) |
| | Convert Clockwise → `clockwise` | Cek arah poligon (rumus shoelace); poligon CCW dibalik jadi CW lalu disimpan ke `.str` |
| | ID TOS → `id_tos` | Tentukan dome masuk ke TOS mana (uji point-in-polygon `PtInPoly`) |
| Modify | DOME ID, Numbering, SummaryTOS, Insert Dome | Rapikan ID dome, rekap jumlah dome/WMT per TOS & per kadar (VLGS…VHGS, WST, Boulder) |
| Fix Up | Arrange, Add Sheet, Compare, Match | Rapikan hasil DBF, hitung LCM→BCM→WMT, bandingkan dengan `Tos Balance.xlsx` |
| Filter | TOS PPP 01/02, MTM 01, SMA 01/02/03 | AutoFilter per lokasi TOS |
| Daily Record | Survey vs TC, TOS, Validasi TOS, dll | Buka file tetap di `D:\Daily Record\...` (termasuk .docx lewat Word) |
| Transformasi Koordinat | Geografis↔UTM | Proyeksi Transverse Mercator (UTM WGS84, ID74, TM3) |

Faktor konversi volume yang di-hardcode (`rapikan`, `SummaryTOS`, `compare_cols`, `matchData`):

| Material | LCM → BCM (bagi) | BCM → WMT (kali) |
|---|---|---|
| ID berisi `NG` | 1,19 | 1,743 |
| Lainnya | 1,157 | 1,705 |
| `BOULDER` | 1,3 | 2,015 |

---

## 3. SMAW-Engineering-Mining v6.3: apa saja isinya

| Grup | Isi utama |
|---|---|
| OEE | Import operator, PDB Hauling/Mining, QC check, AUDB Mining/Hauling, Rit-NoRit, Fix ADT, laporan AUDB/PDB |
| Update Data | Update HM, tabel 2nd Hauling, Replace Unit (dari daftar mapping), DPR-HM, DPR-QC, GC-QC, QC report, convert WB IWIP |
| Fuel | Daily fuel, fuel MDO/MDOC, compare DPR, fix unit |
| Unit Performance / Breakdown / MDO | Filter standby, log breakdown (Mining/Hauling/MDO), format BA 2nd hauling |
| To The Moon (TTM) | Daily, *Upload Web* (sebenarnya hanya menyusun sheet di Excel; tidak ada upload lewat jaringan) |
| Weekly | DT/ADT running, rainfall, weekly hauling |
| Update Data Breakdown / Man Power / Summary | Master BD, update manpower/HM, ringkasan breakdown per tyre, suspension, brake, engine |

Sumber data diambil dari share drive `P:\02.Share by ENGINEERING\` (`125. DAILY FILE`, `OEE`, `102. Reporting\...`). Pemilihan tanggal pakai `CalendarForm` (open-source, buatan Trevor Eyre).

---

## 4. Analisis keamanan

| Temuan olevba | Penilaian |
|---|---|
| `Shell` (BP) | Hanya `explorer.exe D:\Daily Record` untuk membuka folder. **Aman.** |
| `CreateObject` | `Scripting.FileSystemObject`, `Word.Application`, `Scripting.Dictionary`. **Aman.** |
| `Declare … user32` (`SetTimer`, `FindWindow`, `SetWindowLong`) (SMAW) | Bagian dari `CalendarForm` Trevor Eyre (menghilangkan title bar form, efek hover). **Aman.** |
| `Kill` (SMAW) | Menghapus `P:\...\OEE\NonProduksi.xlsx` sebelum ditulis ulang. Disengaja, tapi perlu hati-hati (lihat 5.1). |
| AutoExec | `Workbook_BeforeClose` (SMAW) dan event klik di form. Tidak ada `Auto_Open`/`Workbook_Open`. |
| "VBA Stomping" | **Positif palsu.** P-code dibandingkan dengan source: dari 426 identifier (BP) dan 1.222 identifier (SMAW), hanya 2 dan 6 yang tidak ada di source. Selisih itu sisa sub yang sudah di-rename atau dihapus, bukan kode tersembunyi. |
| Base64/Hex strings | Positif palsu: hanya kata biasa (`Data`, `Northing`, `DOME`, …) dan GUID referensi Office. |
| URL | Hanya komentar referensi (posc.org, stackoverflow, msdn). Tidak ada akses jaringan. |

---

## 5. Bug & risiko yang ditemukan

### 5.1 Prioritas tinggi

1. **SMAW menghapus sheet `Data` dan `Base` milik workbook lain saat add-in ditutup.**
   `ThisWorkbook.Workbook_BeforeClose` menjalankan `Sheets("Data").Delete` / `Sheets("Base").Delete` tanpa kualifikasi workbook, dengan `DisplayAlerts = False`. Yang terhapus adalah sheet di **workbook yang sedang aktif**, bukan di add-in itu sendiri, dan tanpa konfirmasi.
   Ini bentrok langsung dengan BP-Survey2, yang menyimpan koordinat di sheet bernama **`Data`** (`inputKoordinat`). Kalau SMAW di-unload atau Excel ditutup saat file survey aktif, sheet itu bisa hilang. Kalau file lalu tersimpan, datanya hilang permanen.
   *Perbaikan:* hapus event ini, atau batasi ke workbook hasil buatan macro (cek nama/flag) dan beri konfirmasi.

2. **BP: tombol `Insert Dome` tidak bisa dijalankan (compile error).**
   Modul `insertDome` berisi sisa kode `snb_DBF_uitlezen` yang tidak lengkap: `For j = 1 To 12` tanpa `Next`, `End With` tanpa `With`, dan memanggil `ThisWorkbook.A_schoon` yang tidak ada. VBA mengompilasi satu modul utuh, jadi `insertDometoDvAndST` ikut gagal.
   *Perbaikan:* hapus `snb_DBF_uitlezen` dan `knop_inlezen_Click` dari modul itu.

3. **BP: parameter TM3 berbeda antara proyeksi maju dan balik.**
   `TransverseMercatorToNorthEast` memakai k0 = **0,9999** untuk TM3, tapi `TransverseMercatorToLatLong` memakai **0,9996**. Bolak-balik konversi TM3 jadi tidak konsisten: northing di sekitar 1.500.000 bergeser puluhan meter. Ribbon hanya memakai UTM, tetapi kedua fungsi ini juga bisa dipanggil sebagai UDF di sel.
   *Perbaikan:* samakan k0 TM3 = 0,9999.

4. **BP: `UTM to Geografis` mengunci zona 52 Utara.**
   `zone = 52`, `hemisphere = "N"` di-hardcode. Untuk site di zona 52N tidak masalah, tapi koordinat dari zona lain (mis. 51, atau belahan selatan) dihitung salah **tanpa peringatan**. Pesan validasinya juga keliru: saat input bukan UTM, pesannya "Harus Lat/Long".
   Fungsi ini juga memakai rumus terpisah (Coticchia-Surace), bukan class `clsTranverseMercator` yang sudah ada.
   *Perbaikan:* jadikan zona/hemisphere input dan pakai `TransverseMercatorToLatLong`.

### 5.2 Prioritas menengah

5. **BP `Geografis to UTM`:** kolom Zone/Hemisphere hanya diisi di baris 2. Kolom "Hemisphere" sebenarnya berisi huruf *latitude band* (L/M/N/…), dengan fallback aneh ke sel `J5`.
6. **BP `ID TOS`: rawan error di regional setting Indonesia.** Koordinat disisipkan ke `.Formula` sebagai teks (`"=PtInPoly(...," & Cells(z,1) & "," & ...)`). Kalau Windows memakai koma desimal, `412345,678` terbaca sebagai dua argumen dan hasil point-in-polygon jadi salah.
7. **Path di-hardcode.** BP: `D:\Daily Record\...` (±15 tempat). SMAW: `P:\02.Share by ENGINEERING\...`. Komputer dengan drive atau struktur folder lain akan error. SMAW juga menghapus file di share drive (`Kill NonProduksi.xlsx`). Kalau dua orang menjalankannya bersamaan, filenya bisa saling timpa atau hilang.
8. **Overflow baris.** 98 variabel baris di SMAW (dan beberapa di BP) dideklarasikan `As Integer` (maks 32.767). Data per-rit atau per-jam yang besar akan memicu *Overflow*.
9. **`On Error Resume Next` dipakai 262 kali di SMAW**, sering tanpa `On Error GoTo 0` setelahnya. Error asli tertutup, jadi hasil yang salah bisa lolos tanpa disadari.
10. **BP `Monitoring`:** macro mengecek nama file `LIMONITE MONITORING NEW.XLSX`, padahal `open_mon_lim` membuka `Limonite Dump monitoring.xlsx`. Kalau nama file berbeda, chart tidak ter-update dan tidak ada pesan apa pun.

### 5.3 Kebersihan & lain-lain

- **BP menyimpan data operasional di dalam add-in** (sheet `15072022 MALAM- TOS`, `stock_TOS_160722FIX`, …, data dome & TOS tahun 2022). Data ini ikut terbawa setiap kali add-in dibagikan.
- **SMAW memuat 358 named range (203 di antaranya `#REF!`)** dan 3 external link ke `E:\…\CT.xlsx`, `E:\ADM\TS\07.11072023_DS.xlsx`, `/cicil/MASTER DATABASE CCR.xlsx`. Ini memicu prompt *update links* dan memperlambat proses.
- Banyak kode duplikat: blok "rapikan" di-copy 3×; `bdEvent_*` dan `*_byDT` hampir identik (±330 baris tiap modul); 10 macro filter TOS hampir sama persis.
- `FixCodeDome` menghapus baris di dalam `For Each`, sehingga baris duplikat berurutan bisa terlewat.
- `cariString` memakai `ThisWorkbook.ActiveSheet` (milik add-in, bukan file user) dan tidak menangani `Find` yang tidak menemukan apa-apa.
- `inputKoordinat` membuat header A1 berisi spasi, padahal `surpac_point` mewajibkan A1 = `"String"`. Akibatnya alur `Input` → `Save to Surpac` selalu menampilkan "Klik Input Koordinat Terlebih dahulu", kecuali user mengetik `String` sendiri.
- Hanya 2 dari 86 modul SMAW yang memakai `Option Explicit`.

---

## 6. Rekomendasi

1. Segera perbaiki 5.1 no. 1 (event BeforeClose SMAW): ini satu-satunya bug yang bisa menghapus data user tanpa konfirmasi.
2. Perbaiki modul `insertDome` dan konstanta TM3 di BP. Perbaikannya kecil, dampaknya langsung terasa.
3. Pindahkan path dan konstanta (faktor swell/densitas, zona UTM) ke satu sheet konfigurasi atau modul `Config`.
4. Simpan source VBA di git (repo ini) agar perubahan antarversi bisa dilacak. Versi 6.3 tidak punya riwayat perubahan.
5. Hapus data 2022 dari BP-Survey2, bersihkan named range `#REF!` dan external link di SMAW.
