//! sma-core: mesin SMA Survey (Rust, tanpa dependensi luar).
//! Dipakai oleh aplikasi desktop (Tauri) dan oleh alat baris perintah `sma` untuk uji kesamaan.
pub mod strio;
pub mod tin;
pub mod vol;
pub mod progres;

/// "500-999,1" -> fungsi cek nomor string
pub fn ranges(s: &str) -> Vec<(i32, i32)> {
    s.split(|c: char| c == ',' || c == ';' || c.is_whitespace()).filter(|p| !p.is_empty()).filter_map(|p| {
        if let Some((a, b)) = p.split_once('-') { Some((a.trim().parse().ok()?, b.trim().parse().ok()?)) }
        else { let v = p.trim().parse().ok()?; Some((v, v)) }
    }).collect()
}
pub fn in_ranges(r: &[(i32, i32)], n: i32) -> bool { r.iter().any(|&(a, b)| n >= a && n <= b) }
