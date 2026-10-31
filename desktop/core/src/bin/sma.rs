//! Alat uji: sma info <file>, sma dtm <file.str> [spot] [skip] [keluar.bin]
use sma_core::{in_ranges, progres, ranges, strio, tin, vol};
use std::time::Instant;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 3 { eprintln!("pakai: sma info <file> | sma dtm <file.str> [spot=500-999] [skip=1] [keluar.bin]"); std::process::exit(2); }
    let buf = if a[1] == "vol" || a[1] == "update" || a[1] == "bdy" || a[1] == "potong" { Vec::new() } else { std::fs::read(&a[2]).expect("baca file") };
    let t0 = Instant::now();
    match a[1].as_str() {
        "info" => {
            if a[2].to_lowercase().ends_with(".dtm") {
                let d = strio::parse_dtm(&buf);
                println!("dtm biner={} str={} segitiga={} ({} ms)", d.binary, d.str_name, d.tris.len() / 3, t0.elapsed().as_millis());
            } else {
                let f = if a[2].to_lowercase().ends_with(".shp") { strio::parse_shp(&buf) } else { strio::parse_str(&buf) };
                let pts = f.sn.iter().filter(|&&s| s != 0).count();
                println!("str biner={} baris={} titik={} segmen={} pertama=({}, {}, {}) desc={:?} ({} ms)", f.binary, f.rows(), pts, f.rows() - pts, f.y[0], f.x[0], f.z[0], f.desc[0], t0.elapsed().as_millis());
            }
        }
        "dtm" => {
            let f = strio::parse_str(&buf);
            let spot = ranges(a.get(3).map(|s| s.as_str()).unwrap_or("500-999"));
            let skip = ranges(a.get(4).map(|s| s.as_str()).unwrap_or("1"));
            let t1 = Instant::now();
            let d = tin::create_dtm(&f, &|s| in_ranges(&skip, s), &|s| in_ranges(&spot, s));
            println!("segitiga={} titik={} breakline_dilewati={} flips={} baca={} ms dtm={} ms", d.tris.len() / 3, d.npts, d.skipped, d.flips, (t1 - t0).as_millis(), t1.elapsed().as_millis());
            if let Some(o) = a.get(5) { let b: Vec<u8> = d.tris.iter().flat_map(|v| v.to_le_bytes()).collect(); std::fs::write(o, b).unwrap(); }
        }
        "vol" => {
            // sma vol <base> <update> <bdy.str> [string] ; base/update tanpa ekstensi (.str + .dtm)
            let ld = |b: &str| { let s = strio::parse_str(&std::fs::read(format!("{b}.str")).unwrap()); let d = strio::parse_dtm(&std::fs::read(format!("{b}.dtm")).unwrap()); (s, d) };
            let (s1, d1) = ld(&a[2]); let (s2, d2) = ld(&a[3]);
            let bdy = strio::parse_str(&std::fs::read(&a[4]).unwrap());
            let no: i32 = a.get(5).and_then(|v| v.parse().ok()).unwrap_or(1);
            let th: usize = std::env::var("SMA_THREADS").ok().and_then(|v| v.parse().ok()).unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1));
            let rings = vol::rings_of(&bdy, no);
            let t1 = Instant::now();
            let res = vol::cut_fill(&vol::Tin { x: &s1.x, y: &s1.y, z: &s1.z, tris: &d1.tris }, &vol::Tin { x: &s2.x, y: &s2.y, z: &s2.z, tris: &d2.tris }, &rings, th);
            let mut tot = vol::Vol::default();
            for (i, v) in res.iter().enumerate() {
                println!("{} {:.3} {:.3} {:.3} {:.3} {:.3} common {:.3}", i + 1, v.cut, v.cut_area, v.fill, v.fill_area, v.nett, v.common);
                tot.cut += v.cut; tot.cut_area += v.cut_area; tot.fill += v.fill; tot.fill_area += v.fill_area; tot.nett += v.nett; tot.common += v.common;
            }
            println!("TOTAL {:.3} {:.3} {:.3} {:.3} {:.3} common {:.3} | baca {} ms, volume {} ms, {} thread", tot.cut, tot.cut_area, tot.fill, tot.fill_area, tot.nett, tot.common, (t1 - t0).as_millis(), t1.elapsed().as_millis(), th);
        }
        "update" => {
            // sma update <global.str> <bdy.str|-> <harian.str> <folder keluar> [tanggal]
            let rd = |p: &str| progres::baca(&std::fs::read(p).unwrap());
            let g = rd(&a[2]); let b = if a[3] == "-" { None } else { Some(rd(&a[3])) };
            let h = rd(&a[4]);
            let r = progres::update_harian(&g, &a[2], b.as_ref().map(|d| (d, a[3].as_str())), 1, &[&h], &[a[4].clone()], 1, a.get(6).map(|s| s.as_str()).unwrap_or("auto")).unwrap();
            for f in &r.1 { std::fs::write(format!("{}/{}", a[5], f.name), &f.data).unwrap(); }
            println!("{:?} cek={} file={:?} {} ms", r.2, r.3, r.1.iter().map(|f| f.name.clone()).collect::<Vec<_>>(), t0.elapsed().as_millis());
        }
        "potong" | "bdy" => {
            // sma potong <progress> <bdy> <dalam|luar> <keluar.str> ; sma bdy <A> <B> <tambah|kurangi|irisan> <keluar.str>
            let rd = |p: &str| progres::baca(&std::fs::read(p).unwrap());
            let (g, b) = (rd(&a[2]), rd(&a[3])); let tgl = (2026, 10, 27);
            let files = if a[1] == "potong" { progres::jalankan_potong(&g, &[&b], 1, a[4] == "dalam", &[], &a[5], tgl, true, 2.0).0 }
                else { let op = match a[4].as_str() { "kurangi" => progres::Op::Kurangi, "irisan" => progres::Op::Irisan, _ => progres::Op::Tambah }; progres::jalankan_bdy(&g, 1, &[&b], 1, op, &a[5], tgl, 1).0 };
            let dir = std::path::Path::new(&a[5]).parent().unwrap();
            for f in &files { std::fs::write(dir.join(&f.name), &f.data).unwrap(); }
        }
        _ => { eprintln!("perintah tidak dikenal"); std::process::exit(2); }
    }
}
