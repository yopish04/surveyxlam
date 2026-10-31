# SMA Survey Desktop (Tauri + Rust) — sedang dibangun

## `core/` — mesin `sma-core` (Rust, tanpa dependensi luar)
Port dari mesin JavaScript/Python yang sudah diuji. Hasilnya sudah dicek sama:

| Modul | Isi | Uji kesamaan | Waktu Tofu 9 |
|---|---|---|---|
| `strio.rs` | baca .str/.dtm teks & biner, .shp | jumlah baris/titik/segitiga dan nilai = JS/Python | baca 45 MB: 0,12 s |
| `tin.rs` | CREATE DTM | segitiga identik indeks per indeks dengan JS (LD03, Tofu 9 base & 27) | 0,8–1,0 s (JS 2,2 s) |
| `vol.rs` | DTM CUT AND FILL eksak, paralel | sama dengan JS sampai 0,001 m³; LD03 = PDF ±0,003 m³ | 4,8 s di 2 core (JS 15 s); lebih cepat di PC 8 core |
| `progres.rs` | update harian, potong, boundary | byte-identik dengan Python/Excel (LD03 25→26, 26→27, Tofu 9, luar/kurangi/irisan) | 0,3 s (Excel 5,9 s) |

Alat uji: `cargo build --release`, lalu `target/release/sma info|dtm|vol|update|potong|bdy ...`.

## Berikutnya
`app/` berisi kerangka Tauri 2: frontend = `viewer/src`, backend = perintah Rust yang memanggil `sma-core`, SQLite, dan Excel.
Kerangka ini dibangun lewat GitHub Actions (Windows) setelah repo bisa di-push.

## `app/` — aplikasi desktop Tauri 2 (kerangka, belum dikompilasi)
- `src-tauri/src/lib.rs` — perintah Rust:
  - **file**: `list_dir`, `stat_path`, `read_file`, `write_file`, `make_dir`, `rename_path`, `remove_path`, `drives`, `startup_files`. Folder server (Y:\, Z:\, \\server) ditolak untuk ditulis.
  - **mesin**: `engine_dtm`, `engine_vol` (multi-core), `engine_update`.
  - **riwayat volume**: `vol_save`, `vol_last`, `vol_history` (SQLite).
- `src-tauri/src/pack.rs` — paket biner frontend ↔ Rust: `[u32 panjang JSON][JSON][bagian kelipatan 8 byte]`.
- `src-tauri/src/db.rs` — tabel `volumes` (riwayat volume harian per pit).
- Frontend: `viewer/src` (dibangun oleh `scripts/prepare.py` ke `dist/index.html`). `viewer/src/tauri.js` aktif hanya di dalam aplikasi desktop:
  - Navigator memakai path Windows asli lewat Rust;
  - DTM, volume, dan update memakai mesin Rust; kalau gagal, otomatis kembali ke mesin JavaScript;
  - "Nett kemarin" terisi otomatis dari riwayat.
- Asosiasi file: klik dua kali `.str` / `.dtm` di Explorer membuka SMA Survey (juga saat aplikasi sudah terbuka: satu instance).
- TXT ke STR: data mentah .txt langsung jadi .str di aplikasi (mesin JavaScript `viewer/src/raw.js`, sama byte per byte dengan Python/Excel).
- Versi portable: `SMA Survey.exe` + `portable.txt` di satu folder; data (riwayat volume, Navigator, pengaturan) di `data\` di sampingnya.
- Build: `.github/workflows/desktop.yml` (uji `sma-core` di Ubuntu → installer `.msi` + setup `.exe` di Windows).

Sudah diuji di cloud dengan backend tiruan:
- Navigator, simpan ke folder, riwayat volume, dan jalur cadangan JS berjalan.
- Format paket DTM dan volume cocok dengan spesifikasi (volume LD03 sama).

Kompilasi Rust/Tauri yang sebenarnya baru terjadi di GitHub Actions.
