//! SMA Survey Desktop — backend Rust.
//! - File: daftar folder, baca, tulis, buat folder, ganti nama, hapus. Folder server (Y:\, Z:\, \\server) TIDAK PERNAH ditulisi.
//! - Mesin: CREATE DTM, volume cut/fill (multi-core), update harian/potong/boundary lewat crate `sma-core`
//!   (hasilnya identik dengan versi JavaScript/Python/Excel).
//! - Riwayat volume harian di SQLite (folder data aplikasi).
use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager};

mod db;
mod pack;

/* ---------------- file ---------------- */
const PROTECTED: [&str; 4] = ["y:\\", "z:\\", "\\\\", "//"];

fn guard_write(path: &str) -> Result<(), String> {
    let p = path.trim().to_lowercase().replace('/', "\\");
    if PROTECTED.iter().any(|x| p.starts_with(&x.replace('/', "\\"))) || p.starts_with("\\\\") {
        return Err(format!("Folder server dilindungi, tidak boleh ditulisi: {path}"));
    }
    Ok(())
}

#[derive(Serialize)]
struct Entry { name: String, dir: bool, size: u64, modified: f64 }

fn mtime(m: &std::fs::Metadata) -> f64 {
    m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as f64).unwrap_or(0.0)
}

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for e in std::fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))? {
            let Ok(e) = e else { continue };
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('$') || name == "System Volume Information" { continue; }
            let Ok(m) = e.metadata() else { continue };
            out.push(Entry { name, dir: m.is_dir(), size: if m.is_dir() { 0 } else { m.len() }, modified: mtime(&m) });
        }
        Ok(out)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn stat_path(path: String) -> Option<Entry> {
    let m = std::fs::metadata(&path).ok()?;
    Some(Entry { name: Path::new(&path).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(), dir: m.is_dir(), size: m.len(), modified: mtime(&m) })
}

#[tauri::command]
async fn read_file(path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&path).map(Response::new).map_err(|e| format!("{path}: {e}")))
        .await.map_err(|e| e.to_string())?
}

/// isi file dikirim sebagai badan biner; path di header x-path (encodeURIComponent)
#[tauri::command]
async fn write_file(request: Request<'_>) -> Result<(), String> {
    let path = pack::header(&request, "x-path")?;
    guard_write(&path)?;
    let InvokeBody::Raw(data) = request.body() else { return Err("isi file harus biner".into()) };
    let data = data.clone();
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&path, data).map_err(|e| format!("{path}: {e}")))
        .await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn make_dir(path: String) -> Result<(), String> { guard_write(&path)?; std::fs::create_dir_all(&path).map_err(|e| e.to_string()) }

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    guard_write(&from)?; guard_write(&to)?;
    if Path::new(&to).exists() { return Err(format!("{to} sudah ada")); }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_path(path: String, recursive: bool) -> Result<(), String> {
    guard_write(&path)?;
    let p = Path::new(&path);
    if p.is_dir() { if recursive { std::fs::remove_dir_all(p) } else { std::fs::remove_dir(p) } } else { std::fs::remove_file(p) }.map_err(|e| e.to_string())
}

/// drive yang ada (C:\, D:\, Z:\ ...)
#[tauri::command]
fn drives() -> Vec<String> { (b'A'..=b'Z').map(|c| format!("{}:\\", c as char)).filter(|d| Path::new(d).exists()).collect() }

struct Startup(Vec<String>);
/// file .str/.dtm yang dibuka dari Windows Explorer (klik dua kali)
#[tauri::command]
fn startup_files(st: tauri::State<'_, Startup>) -> Vec<String> { st.0.clone() }

/* ---------------- mesin (sma-core) ---------------- */
fn threads() -> usize { std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4) }

/// head: {rows, skip, spot}; bagian: x f64, y f64, sn i32 -> head {npts, skipped, flips}; bagian: tris i32
#[tauri::command]
async fn engine_dtm(request: Request<'_>) -> Result<Response, String> {
    let body = pack::body(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (h, parts) = pack::unpack(&body)?;
        let rows = h["rows"].as_u64().unwrap_or(0) as usize;
        let x = pack::f64s(parts.first().ok_or("x")?); let y = pack::f64s(parts.get(1).ok_or("y")?); let sn = pack::i32s(parts.get(2).ok_or("sn")?);
        if x.len() != rows || y.len() != rows || sn.len() != rows { return Err("ukuran data tidak cocok".to_string()); }
        let f = sma_core::strio::StrFile { head: String::new(), binary: false, z: vec![0.0; rows], desc: vec![String::new(); rows], x, y, sn };
        let skip = sma_core::ranges(h["skip"].as_str().unwrap_or("1"));
        let spot = sma_core::ranges(h["spot"].as_str().unwrap_or("500-999"));
        let d = sma_core::tin::create_dtm(&f, &|s| sma_core::in_ranges(&skip, s), &|s| sma_core::in_ranges(&spot, s));
        let tris: Vec<u8> = d.tris.iter().flat_map(|v| v.to_le_bytes()).collect();
        Ok(Response::new(pack::pack(json!({ "npts": d.npts, "skipped": d.skipped, "flips": d.flips }), &[&tris])))
    }).await.map_err(|e| e.to_string())?
}

/// head: {n1, t1, n2, t2, rings:[panjang]}; bagian: x1 y1 z1 x2 y2 z2 ring... tris1 tris2 -> [{cut, cutArea, ...}]
#[tauri::command]
async fn engine_vol(request: Request<'_>) -> Result<Value, String> {
    let body = pack::body(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (h, p) = pack::unpack(&body)?;
        let nr = h["rings"].as_array().map(|a| a.len()).unwrap_or(0);
        if p.len() != 8 + nr { return Err("jumlah bagian data tidak cocok".into()); }
        let (x1, y1, z1, x2, y2, z2) = (pack::f64s(p[0]), pack::f64s(p[1]), pack::f64s(p[2]), pack::f64s(p[3]), pack::f64s(p[4]), pack::f64s(p[5]));
        let rings: Vec<Vec<f64>> = (0..nr).map(|i| pack::f64s(p[6 + i])).collect();
        let (t1, t2) = (pack::i32s(p[6 + nr]), pack::i32s(p[7 + nr]));
        for &v in t1.iter() { if v < 0 || v as usize >= x1.len() { return Err("indeks segitiga DTM pertama di luar data".into()); } }
        for &v in t2.iter() { if v < 0 || v as usize >= x2.len() { return Err("indeks segitiga DTM kedua di luar data".into()); } }
        let a = sma_core::vol::Tin { x: &x1, y: &y1, z: &z1, tris: &t1 };
        let b = sma_core::vol::Tin { x: &x2, y: &y2, z: &z2, tris: &t2 };
        let res = sma_core::vol::cut_fill(&a, &b, &rings, threads());
        Ok(Value::Array(res.iter().map(|v| json!({ "cut": v.cut, "cutArea": v.cut_area, "fill": v.fill, "fillArea": v.fill_area, "nett": v.nett, "common": v.common })).collect()))
    }).await.map_err(|e| e.to_string())?
}

/// update harian / potong / boundary. head: parameter dari form; bagian: g, [bdy], harian..., bdys...
#[tauri::command]
async fn engine_update(request: Request<'_>) -> Result<Response, String> {
    use sma_core::progres as pg;
    let body = pack::body(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (h, p) = pack::unpack(&body)?;
        let s = |k: &str| h[k].as_str().unwrap_or("").to_string();
        let n = |k: &str, d: i64| h[k].as_i64().unwrap_or(d) as i32;
        let names = |k: &str| -> Vec<String> { h[k].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default() };
        let docs: Vec<pg::Doc> = p.iter().map(|b| pg::baca(b)).collect();
        let g = docs.first().ok_or("file utama kosong")?;
        let mut i = 1;
        let bdy = if h["hasBdy"].as_bool().unwrap_or(false) { i += 1; Some(&docs[1]) } else { None };
        let nh = h["nHarian"].as_u64().unwrap_or(0) as usize; let harian: Vec<&pg::Doc> = docs[i..i + nh].iter().collect(); i += nh;
        let nb = h["nBdys"].as_u64().unwrap_or(0) as usize; let bdys: Vec<&pg::Doc> = docs[i..i + nb].iter().collect();
        let g_name = s("gName");
        let base = |x: &str| x.rsplit(['\\', '/']).next().unwrap_or(x).rsplit_once('.').map(|(b, _)| b.to_string()).unwrap_or_else(|| x.to_string());
        let (tgl, files, st, cek) = match s("jenis").as_str() {
            "harian" => {
                let bn = s("bdyName");
                pg::update_harian(g, &g_name, bdy.map(|b| (b, bn.as_str())), n("bdyNo", 1), &harian, &names("harianNames"), n("harianNo", 1), &s("tgl"))?
            }
            "potong" => {
                let hn = names("harianNames"); let bnm = names("bdyNames");
                let src = hn.first().or(bnm.first()).cloned().unwrap_or_default();
                let tgl = pg::tgl_teks(&s("tgl"), &base(&src), None).ok_or("Tanggal tidak ditemukan; isi tanggal")?;
                let out = if s("outName").is_empty() { pg::nama_tanggal(&format!("{}.str", base(&g_name)), tgl) } else { s("outName") };
                let (f, st, c) = pg::jalankan_potong(g, &bdys, n("bdyNo", 1), s("mode") != "luar", &harian, &out, tgl, h["titikPotong"].as_bool().unwrap_or(false), 2.0);
                (tgl, f, st, c)
            }
            _ => {
                let bnm = names("bdyNames");
                let tgl = pg::tgl_teks(&s("tgl"), &base(bnm.first().map(|x| x.as_str()).unwrap_or("")), None).ok_or("Tanggal tidak ditemukan; isi tanggal")?;
                let out = if s("outName").is_empty() { pg::nama_tanggal(&format!("{}.str", base(&g_name)), tgl) } else { s("outName") };
                let op = match s("op").as_str() { "kurangi" => pg::Op::Kurangi, "irisan" => pg::Op::Irisan, _ => pg::Op::Tambah };
                let (f, _) = pg::jalankan_bdy(g, n("gNo", 1), &bdys, n("bdyNo", 1), op, &out, tgl, n("gNo", 1));
                (tgl, f, pg::Stat::default(), 0)
            }
        };
        let head = json!({
            "tgl": [tgl.0, tgl.1, tgl.2], "cek": cek,
            "st": { "titik_awal": st.titik_awal, "titik_dibuang": st.titik_dibuang, "titik_potong": st.titik_potong, "titik_harian": st.titik_harian, "titik_akhir": st.titik_akhir },
            "files": files.iter().map(|f| json!({ "name": f.name })).collect::<Vec<_>>(),
        });
        let parts: Vec<&[u8]> = files.iter().map(|f| f.data.as_slice()).collect();
        Ok(Response::new(pack::pack(head, &parts)))
    }).await.map_err(|e| e.to_string())?
}

/* ---------------- riwayat volume ---------------- */
struct Db(Mutex<rusqlite::Connection>);

#[tauri::command]
fn vol_save(db: tauri::State<'_, Db>, rec: db::VolRec) -> Result<i64, String> { db::save(&db.0.lock().unwrap(), &rec).map_err(|e| e.to_string()) }
#[tauri::command]
fn vol_last(db: tauri::State<'_, Db>, pit: String, before: String) -> Result<Option<db::VolRec>, String> { db::last(&db.0.lock().unwrap(), &pit, &before).map_err(|e| e.to_string()) }
#[tauri::command]
fn vol_delete(db: tauri::State<'_, Db>, id: i64) -> Result<usize, String> { db::delete(&db.0.lock().unwrap(), id).map_err(|e| e.to_string()) }
#[tauri::command]
fn vol_history(db: tauri::State<'_, Db>, pit: String, limit: i64) -> Result<Vec<db::VolRec>, String> { db::history(&db.0.lock().unwrap(), &pit, limit).map_err(|e| e.to_string()) }

/// mode portable: ada file portable.txt di samping exe -> folder data\ di samping exe (kalau bisa ditulisi)
fn portable_dir() -> Option<std::path::PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    if !exe_dir.join("portable.txt").exists() { return None; }
    let d = exe_dir.join("data");
    std::fs::create_dir_all(&d).ok().map(|_| d)
}

/// argumen baris perintah yang berupa file (tanpa nama program dan tanpa opsi -x)
fn file_args(it: impl Iterator<Item = String>) -> Vec<String> { it.skip(1).filter(|a| !a.starts_with('-')).collect() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = file_args(std::env::args());
    tauri::Builder::default()
        // satu aplikasi saja: klik dua kali .str/.dtm saat SMA Survey sudah terbuka -> file dibuka di jendela yang ada
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.set_focus(); }
            let files = file_args(argv.into_iter());
            if !files.is_empty() { let _ = app.emit("open-files", files); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(Startup(args))
        .setup(|app| {
            // versi portable: riwayat volume, folder Navigator, dan pengaturan disimpan di folder data\ di samping exe
            let portable = portable_dir();
            let dir = match &portable { Some(d) => d.clone(), None => app.path().app_data_dir()? };
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("sma_survey.db")).map_err(|e| e.to_string())?;
            app.manage(Db(Mutex::new(conn)));
            let cfg = app.config().app.windows.first().cloned().ok_or("jendela main tidak ada di tauri.conf.json")?;
            let mut win = tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            if let Some(d) = &portable { win = win.data_directory(d.join("webview")); }
            win.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_dir, stat_path, read_file, write_file, make_dir, rename_path, remove_path, drives, startup_files,
            engine_dtm, engine_vol, engine_update, vol_save, vol_last, vol_history, vol_delete
        ])
        .run(tauri::generate_context!())
        .expect("SMA Survey gagal dijalankan");
}

#[cfg(test)]
mod tests {
    use super::guard_write;
    #[test]
    fn folder_server_dilindungi() {
        assert!(guard_write("Z:\\SMA\\a.str").is_err());
        assert!(guard_write("y:/data/a.str").is_err());
        assert!(guard_write("\\\\server\\survey\\a.str").is_err());
        assert!(guard_write("D:\\yopi\\a.str").is_ok());
    }
}
