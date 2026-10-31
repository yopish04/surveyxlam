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
