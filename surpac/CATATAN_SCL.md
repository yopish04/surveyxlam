# Catatan SCL (macro .tcl Surpac 6.6.2)

Sumber: manual bawaan Surpac di `C:\Program Files\GEOVIA\Surpac\662_x64\share\refman\english\Content\scl\`
dan `...\Content\guido\` (dibaca 27 Okt 2026). Surpac 6.6.2 memakai **Tcl 8.5** (`x64\bin\tcl.dll`).
Tidak ada Tk; form dibuat dengan **GUIDO**.

## 1. Dasar

- Macro = file `.tcl`, dijalankan lewat **MACRO PLAYBACK** (bisa *fast motion* atau *slow motion*).
- Cara paling cepat menulis macro: **MACRO RECORD START** → kerjakan fungsi lewat menu →
  **MACRO RECORD END**. Hasilnya berisi `SclFunction`, lalu diedit.
- Semua perintah Surpac berawalan `Scl` (`SclSwaOpenFile`, `SclCreateString`, ...).
  Konstanta: `$SCL_OK`, `$SCL_ERROR`, `$SCL_TRUE`, `$SCL_FALSE`, `$SCL_PI`.
- **By value** → pakai `$nama`; **by reference** (perintah mengisi variabel) → tanpa `$`.
  Contoh: `SclGetActiveViewport vp` mengisi `vp`, lalu dipakai sebagai `$vp`.
- Error → `catch { ... }`; kalau tidak ditangkap, macro berhenti.
- Cetak ke jendela pesan: `puts "..."`.

## 2. Menjalankan fungsi menu (`SclFunction`)

```tcl
set status [SclFunction "RECALL FILE" {
  frm00236={
    {
      location="D:\\BIRI-BIRI\\26102026\\261026_pit_tofu9"
      rid=""
      ftype="S"
      append="R"
      _action="Apply"
    }
  }
}]
```

- Nama fungsi = nama di menu ("RECALL FILE", "CREATE DTM", "CONTOUR EXTRACT", "ZOOM ALL", ...).
- `frmXXXXX` = id form; isi = nama field = nilai. Id form dan nama field **didapat dari hasil
  rekaman**, jangan ditebak.
- Field yang nilainya tergantung data (mis. `styles_file`, `conmin`) sebaiknya **dihapus**
  supaya Surpac memakai nilai otomatisnya.
- Variabel Tcl bisa langsung dipakai: `location=$lokasi`.
- Parameter khusus per form: `_action=apply|display` (display = form ditampilkan untuk diubah),
  `_error=abort|display`, `_missing=cancel|display`, `_pause=detik`.
- Tabel: `nama=table { kol1 kol2 } { {a b} {c d} }`.
- Karakter khusus di nilai rekaman diganti kode: `"`→`\042`, `$`→`\044`, `[`→`\133`,
  `]`→`\135`, `{`→`\173`, `}`→`\175`.

## 3. Data string langsung (SWA = Surpac Work Area)

Hirarki: **SWA → string (nomor) → segment → point** (x, y, z, `desc`, `d1`, `d2`, ...).

| Perintah | Guna |
|---|---|
| `SclCreateSwa swa "nama"` | SWA baru (layer sementara) |
| `SclGetActiveViewport vp` lalu `$vp SclGetActiveLayer swa` | layer aktif |
| `$swa SclSwaOpenFile file.str "append"` | muat .str (teks/biner otomatis); opsi `range=1`, `append`/`replace` |
| `$swa SclSwaSaveStringFile file.str "header=...\|binary=on\|range=1,10"` | simpan |
| `$swa SclGetStrings strs` | himpunan string |
| `$strs SclIterateFirst it` + `while {[$it SclIterateNext s] == $SCL_TRUE} {...}` | iterasi (sama untuk string→segment→point) |
| `$x SclGetId` | nomor string / nomor segment / nama layer |
| `$pt SclGetValueByName x` (`y`, `z`, `desc`, `d1`...) | baca nilai |
| `$pt SclSetValueByName z 100.0` | ubah nilai |
| `$seg SclGetValueByName 2dlength` / `area` / `closure` / `direction` | atribut segmen (baca saja) |
| `$swa SclCreateString s 1`, `$s SclCreateSegment g [$s SclCountItems]`, `$g SclCreatePoint p [$g SclCountItems]` | buat string/segment/point baru di akhir |
| `$obj SclCountItems` | jumlah anak |
| `SclDestroy swa` | hapus SWA sementara |
| `$strs SclDraw`, `SclFunction "ZOOM ALL" {}` | gambar |

Catatan penting: `desc` **segment/string** tidak ikut tersimpan ke file; `desc` **point** tersimpan.
Segment dianggap tertutup kalau titik pertama = titik terakhir (x, y, z sama).

## 4. Form sendiri (GUIDO)

```tcl
set form {
  GuidoForm frmBoundary {
    -label "SMA Survey - Muat Ulang Boundary"
    -default_buttons
    GuidoFileBrowserField berkas {
      -label "File .str" -width 40 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoField sisi_maks {
      -label "Sisi boundary maks (m)" -format real_8 -display_length 6
      -low_bound 1 -high_bound 50
    }
  }
}
SclCreateGuidoForm h $form { set sisi_maks 5.0 }
$h SclRun {
  if {"$_status" != "apply"} { return }
  puts "File: $berkas, sisi: $sisi_maks"
}
```

- Nilai field otomatis menjadi variabel Tcl dengan nama yang sama.
- `_status` = `apply` / `cancel`.
- Komponen lain: `GuidoComboBox` (`-exclusive false` = boleh diketik), `GuidoCheckBox`
  (`-selected_value`, `-unselected_value`), `GuidoPanel -layout BoxLayout X_AXIS`,
  `GuidoFileBrowserField -browser_type directory` (pilih folder), `GuidoTable`.

## 5. Lain-lain

- `SclSystemOption get|set nama` — opsi sistem; `set user_abort false` lalu cek `$sclUserAbort`
  supaya macro bisa membersihkan diri saat dibatalkan.
- `SclProgressFeedback` — status/progress bar; `SclMessage`, `SclPause`.
- `SclInside`, `SclIntersectSegments`, `SclTriangulateSegments` — geometri bawaan.
- Package sendiri: atur *SCL Library Path* di Default Preferences, lalu `package require`.

## 6. Rencana pakai di proyek ini

Logika (crest/toe, garis tidak bersilangan, boundary) tetap di **Python/VBA** yang sudah diuji.
Macro .tcl dipakai untuk bagian yang memang di dalam Surpac:

1. **Setelah edit** → macro simpan layer aktif, panggil muat ulang boundary, lalu RECALL lagi.
   Alternatif penuh-Tcl: port `boundary_ulang.py` ke Tcl (baca via iterator, tulis string 1 baru).
2. **Update global** → rekam STRING CLIP OUTSIDE + gabung di Surpac, ganti nama file dengan variabel.
3. **DTM/volume harian** → rekam CREATE DTM, parameter dari form GUIDO.

Yang perlu dari pengguna: **rekaman** (MACRO RECORD) alur kerja harian, supaya id form
(`frmXXXXX`) dan nama field-nya pasti benar.
