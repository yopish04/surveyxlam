//! Uji dasar dengan data buatan (data tambang asli tidak disimpan di repo).
use sma_core::{progres, strio, tin, vol};

fn teks(rows: &[(i32, f64, f64, f64, &str)]) -> Vec<u8> {
    let mut s = String::from("uji,27-Oct-26,0,0\r\n0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000\r\n");
    let mut prev = 0;
    for &(n, y, x, z, d) in rows {
        if prev != 0 && n != prev { s.push_str("0, 0.000, 0.000, 0.000,\r\n"); }
        s.push_str(&format!("{n}, {y:.3}, {x:.3}, {z:.3}, {d}\r\n")); prev = n;
    }
    s.push_str("0, 0.000, 0.000, 0.000,\r\n0, 0.000, 0.000, 0.000, END\r\n");
    s.into_bytes()
}

#[test]
fn baca_teks_dan_biner_sama() {
    let t = teks(&[(1, 100.0, 200.0, 10.0, "a"), (1, 101.0, 201.0, 11.0, "b"), (5, 102.0, 202.0, 12.0, "c,d")]);
    let f = strio::parse_str(&t);
    assert_eq!(f.rows(), 5);                       // 3 titik + 2 pemisah
    assert_eq!(f.desc[3], "c,d");
    let doc = progres::baca(&t);
    let bin = progres::tulis(&doc.head, &doc.segs, true, progres::AXIS);
    let g = strio::parse_str(&bin);
    assert!(g.binary);
    assert_eq!(g.sn, f.sn);
    for i in 0..f.rows() { if f.sn[i] != 0 { assert_eq!((g.x[i], g.y[i], g.z[i]), (f.x[i], f.y[i], f.z[i])); } }
    assert_eq!(progres::baca(&bin).segs, doc.segs);
}

#[test]
fn dtm_grid() {
    let mut rows = Vec::new();
    for i in 0..4 { for j in 0..4 { rows.push((500, j as f64 * 10.0, i as f64 * 10.0, (i + j) as f64, "")); } }
    let f = strio::parse_str(&teks(&rows));
    let d = tin::create_dtm(&f, &|s| s == 1, &|s| s == 500);
    assert_eq!(d.npts, 16);
    assert_eq!(d.tris.len() / 3, 18);              // 2*16 - 2 - 12 titik hull
}

#[test]
fn volume_kotak() {
    let x = [0.0, 10.0, 10.0, 0.0]; let y = [0.0, 0.0, 10.0, 10.0];
    let z0 = [0.0; 4]; let z1 = [1.0; 4]; let t = [0, 1, 2, 0, 2, 3];
    let a = vol::Tin { x: &x, y: &y, z: &z0, tris: &t }; let b = vol::Tin { x: &x, y: &y, z: &z1, tris: &t };
    let r = vol::cut_fill(&a, &b, &[vec![2.0, 2.0, 8.0, 2.0, 8.0, 8.0, 2.0, 8.0], vec![2.0, 2.0, 12.0, 2.0, 12.0, 8.0, 2.0, 8.0]], 2);
    assert!((r[0].fill - 36.0).abs() < 1e-9 && r[0].cut.abs() < 1e-12);
    assert!((r[1].fill - 48.0).abs() < 1e-9);
}

#[test]
fn boundary_tambah() {
    let sq = |x0: f64, y0: f64, s: f64| -> progres::RingV { [(0.0, 0.0), (s, 0.0), (s, s), (0.0, s)].iter().map(|&(dx, dy)| progres::RP { x: x0 + dx, y: y0 + dy, z: 0.0, d: String::new(), baru: None }).collect() };
    let r = progres::boundary_op(&[sq(0.0, 0.0, 10.0)], &[sq(5.0, 5.0, 10.0)], progres::Op::Tambah);
    assert_eq!(r.len(), 1);
    let n = r[0].len(); let a: f64 = (0..n).map(|i| { let (p, q) = (&r[0][i], &r[0][(i + 1) % n]); p.x * q.y - q.x * p.y }).sum::<f64>().abs() / 2.0;
    assert!((a - 175.0).abs() < 1e-9);
    let k = progres::boundary_op(&[sq(0.0, 0.0, 10.0)], &[sq(5.0, 5.0, 10.0)], progres::Op::Kurangi);
    let n = k[0].len(); let a: f64 = (0..n).map(|i| { let (p, q) = (&k[0][i], &k[0][(i + 1) % n]); p.x * q.y - q.x * p.y }).sum::<f64>().abs() / 2.0;
    assert!((a - 75.0).abs() < 1e-9);
}

#[test]
fn nama_dan_tanggal() {
    let d = progres::tgl_teks("auto", "271026_pit_tofu9", None).unwrap();
    assert_eq!(d, (2026, 10, 27));
    assert_eq!(progres::nama_tanggal("2026_10_26_update_topo.str", d), "2026_10_27_update_topo.str");
    assert_eq!(progres::tgl_surpac(d), "27-Oct-26");
    assert_eq!(progres::tgl_teks("27/10/2026", "", None), Some((2026, 10, 27)));
}
