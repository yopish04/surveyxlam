//! Update progress: port dari riset/volume/progres.py (= add-in Excel = viewer/src/progres.js).
//! Hasilnya harus sama byte per byte dengan versi Python dan Excel.
use std::collections::{BTreeMap, HashMap, HashSet};

const EDGE_TOL: f64 = 0.01;
const BULAN: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
pub const AXIS: &str = "0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000";
fn is_spot(n: i32) -> bool { n == 500 || n == 600 || n == 602 }

/// titik: nomor string, n (y), e (x), z, deskripsi
#[derive(Debug, Clone, PartialEq)]
pub struct Pt { pub num: i32, pub n: f64, pub e: f64, pub z: f64, pub d: String }
pub type Seg = Vec<Pt>;
#[derive(Debug, Clone)]
pub struct Doc { pub head: Vec<String>, pub axis: String, pub binary: bool, pub segs: Vec<Seg> }

fn lat(b: &[u8]) -> String { b.iter().map(|&c| c as char).collect() }
fn trim_nl(s: &str) -> &str { s.trim_end_matches(|c| c == '\r' || c == '\n') }

pub fn baca(u: &[u8]) -> Doc {
    let i1 = u.iter().position(|&c| c == b'\n').map(|p| p + 1).unwrap_or(u.len());
    let i2 = u[i1..].iter().position(|&c| c == b'\n').map(|p| i1 + p + 1).unwrap_or(u.len());
    let head: Vec<String> = trim_nl(&lat(&u[..i1])).split(',').map(String::from).collect();
    let axis = trim_nl(&lat(&u[i1..i2])).to_string();
    let rest = &u[i2..];
    let binary = rest.len() >= 5 && rest[..5].iter().all(|&c| c == 0);
    let mut segs: Vec<Seg> = Vec::new(); let mut cur: Seg = Vec::new();
    if binary {
        let mut pos = 5;
        while pos + 28 <= rest.len() {
            let num = i32::from_be_bytes(rest[pos..pos + 4].try_into().unwrap());
            let f = |o: usize| f64::from_be_bytes(rest[pos + o..pos + o + 8].try_into().unwrap());
            let (y, x, z) = (f(4), f(12), f(20));
            let e = rest[pos + 28..].iter().position(|&c| c == 0).map(|p| pos + 28 + p).unwrap_or(rest.len());
            let d = lat(&rest[pos + 28..e]); pos = e + 1;
            if num == 0 { if !cur.is_empty() { segs.push(std::mem::take(&mut cur)); } if d.trim() == "END" { break; } }
            else { cur.push(Pt { num, n: y, e: x, z, d }); }
        }
    } else {
        let txt = lat(rest);
        for l in txt.split(|c| c == '\n' || c == '\r') {
            let p: Vec<&str> = l.split(',').collect();
            if p.len() < 4 { continue; }
            let Ok(nf) = p[0].trim().parse::<f64>() else { continue };
            let num = nf.trunc() as i32;
            if num == 0 { if !cur.is_empty() { segs.push(std::mem::take(&mut cur)); } if p.len() > 4 && p[4].trim() == "END" { break; } continue; }
            let g = |s: &str| s.trim().parse::<f64>().unwrap_or(f64::NAN);
            cur.push(Pt { num, n: g(p[1]), e: g(p[2]), z: g(p[3]), d: p[4..].join(",").trim_start_matches(' ').to_string() });
        }
    }
    if !cur.is_empty() { segs.push(cur); }
    Doc { head, axis, binary, segs }
}

fn f3(v: f64) -> String { format!("{:.3}", v) }
pub fn tulis(head: &[String], segs: &[Seg], binary: bool, axis: &str) -> Vec<u8> {
    let h = head.join(",");
    let enc = |s: &str| -> Vec<u8> { s.chars().map(|c| c as u32 as u8).collect() };
    if binary {
        let mut o = enc(&format!("{h}\r\n{axis}\r\n")); o.extend([0u8; 5]);
        let rec = |o: &mut Vec<u8>, num: i32, y: f64, x: f64, z: f64| { o.extend(num.to_be_bytes()); o.extend(y.to_be_bytes()); o.extend(x.to_be_bytes()); o.extend(z.to_be_bytes()); };
        for s in segs { for r in s { rec(&mut o, r.num, r.n, r.e, r.z); o.extend(enc(&r.d)); o.push(0); } rec(&mut o, 0, 0.0, 0.0, 0.0); o.push(0); }
        rec(&mut o, 0, 0.0, 0.0, 0.0); o.extend(b"END"); o.push(0);
        return o;
    }
    let mut l = vec![h, axis.to_string()];
    for s in segs { for r in s { l.push(format!("{}, {}, {}, {}, {}", r.num, f3(r.n), f3(r.e), f3(r.z), r.d)); } l.push("0, 0.000, 0.000, 0.000,".into()); }
    l.push("0, 0.000, 0.000, 0.000, END".into());
    enc(&(l.join("\r\n") + "\r\n"))
}

/* ---------- tanggal & nama ---------- */
pub type Tgl = (i32, u32, u32);
fn digits(s: &str, n: usize) -> Option<u32> { if s.len() >= n && s[..n].bytes().all(|c| c.is_ascii_digit()) { s[..n].parse().ok() } else { None } }
pub fn tgl_dari_nama(b: &str, head: Option<&[String]>) -> Option<Tgl> {
    let bb = b.as_bytes();
    if b.len() >= 10 && bb[4] == b'_' && bb[7] == b'_' { if let (Some(y), Some(m), Some(d)) = (digits(b, 4), digits(&b[5..], 2), digits(&b[8..], 2)) { return Some((y as i32, m, d)); } }
    let not_digit_at = |i: usize| bb.get(i).map_or(true, |c| !c.is_ascii_digit());
    if digits(b, 8).is_some() && not_digit_at(8) { return Some((b[4..8].parse().ok()?, b[2..4].parse().ok()?, b[..2].parse().ok()?)); }
    if digits(b, 6).is_some() && not_digit_at(6) { return Some((2000 + b[4..6].parse::<i32>().ok()?, b[2..4].parse().ok()?, b[..2].parse().ok()?)); }
    if let Some(h) = head { if h.len() > 1 { if let Some(t) = tgl_surpac_parse(h[1].trim()) { return Some(t); } } }
    None
}
fn tgl_surpac_parse(s: &str) -> Option<Tgl> {
    let p: Vec<&str> = s.split('-').collect();
    if p.len() != 3 { return None; }
    let m = BULAN.iter().position(|x| x.eq_ignore_ascii_case(&p[1][..p[1].len().min(3)]))? as u32 + 1;
    let y: i32 = p[2].get(..2)?.parse().ok()?;
    Some((2000 + y, m, p[0].parse().ok()?))
}
/// "auto" / 2026-10-27 / 27/10/2026 / 20261027 / 27-Oct-26
pub fn tgl_teks(v: &str, b: &str, head: Option<&[String]>) -> Option<Tgl> {
    let v = v.trim();
    if v.len() == 8 && v.starts_with("20") && v.bytes().all(|c| c.is_ascii_digit()) { return Some((v[..4].parse().ok()?, v[4..6].parse().ok()?, v[6..].parse().ok()?)); }
    let p: Vec<&str> = v.split('-').collect();
    if p.len() == 3 && p[0].len() == 4 { if let (Ok(y), Ok(m), Ok(d)) = (p[0].parse(), p[1].parse(), p[2].parse()) { return Some((y, m, d)); } }
    if p.len() == 3 { if let Some(t) = tgl_surpac_parse(v) { return Some(t); } }
    let p: Vec<&str> = v.split('/').collect();
    if p.len() == 3 && p[2].len() == 4 { if let (Ok(d), Ok(m), Ok(y)) = (p[0].parse(), p[1].parse(), p[2].parse()) { return Some((y, m, d)); } }
    if !v.is_empty() && !v.eq_ignore_ascii_case("auto") { return None; }
    tgl_dari_nama(b, head)
}
pub fn tgl_surpac(d: Tgl) -> String { format!("{:02}-{}-{:02}", d.2, BULAN[(d.1 - 1) as usize], d.0 % 100) }
pub fn nama_tanggal(nama: &str, d: Tgl) -> String {
    let (base, ext) = match nama.rfind('.') { Some(i) if i > 0 => (&nama[..i], &nama[i..]), _ => (nama, "") };
    let t = format!("{}_{:02}_{:02}", d.0, d.1, d.2);
    let bb = base.as_bytes();
    if base.len() >= 10 && bb[4] == b'_' && bb[7] == b'_' && digits(base, 4).is_some() && digits(&base[5..], 2).is_some() && digits(&base[8..], 2).is_some() { return format!("{t}{}{ext}", &base[10..]); }
    let nd = |i: usize| bb.get(i).map_or(true, |c| !c.is_ascii_digit());
    if digits(base, 8).is_some() && nd(8) { return format!("{:02}{:02}{}{}{ext}", d.2, d.1, d.0, &base[8..]); }
    if digits(base, 6).is_some() && nd(6) { return format!("{:02}{:02}{:02}{}{ext}", d.2, d.1, d.0 % 100, &base[6..]); }
    format!("{t}_{base}{ext}")
}
pub fn kepala(head: &[String], nama: &str, tgl: &str) -> Vec<String> {
    let mut h = head.to_vec(); h.push("0".into()); h.push("0".into());
    let mut o = vec![nama.to_string(), tgl.to_string()];
    o.extend(h[2..head.len().max(4)].iter().cloned()); o
}

/* ---------- geometri ---------- */
/// ring: titik [e, n, z] + deskripsi; untuk titik potong baru: Some((asal ring))
#[derive(Debug, Clone)]
pub struct RP { pub x: f64, pub y: f64, pub z: f64, pub d: String, pub baru: Option<usize> }
pub type RingV = Vec<RP>;

struct Bdy { e: Vec<[f64; 4]>, x0: f64, x1: f64, y0: f64, y1: f64, band: f64, idx: HashMap<i64, Vec<usize>>, nring: usize }
impl Bdy {
    fn new(rings: &[RingV]) -> Bdy {
        let rings: Vec<&RingV> = rings.iter().filter(|r| r.len() >= 3).collect();
        let mut e = Vec::new();
        for r in &rings { let n = r.len(); for i in 0..n { let (p, q) = (&r[i], &r[(i + 1) % n]); if p.x != q.x || p.y != q.y { e.push([p.x, p.y, q.x, q.y]); } } }
        let (mut x0, mut x1, mut y0, mut y1) = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
        for v in &e { x0 = x0.min(v[0]).min(v[2]); x1 = x1.max(v[0]).max(v[2]); y0 = y0.min(v[1]).min(v[3]); y1 = y1.max(v[1]).max(v[3]); }
        let band = 5.0; let mut idx: HashMap<i64, Vec<usize>> = HashMap::new();
        for (k, v) in e.iter().enumerate() {
            let a = ((v[1].min(v[3]) - EDGE_TOL - y0) / band).floor() as i64; let b = ((v[1].max(v[3]) + EDGE_TOL - y0) / band).floor() as i64;
            for bb in a..=b { idx.entry(bb).or_default().push(k); }
        }
        Bdy { e, x0, x1, y0, y1, band, idx, nring: rings.len() }
    }
    fn status(&self, x: f64, y: f64) -> bool {
        if x < self.x0 - EDGE_TOL || x > self.x1 + EDGE_TOL || y < self.y0 - EDGE_TOL || y > self.y1 + EDGE_TOL { return false; }
        let mut c = false;
        if let Some(l) = self.idx.get(&(((y - self.y0) / self.band).floor() as i64)) {
            for &k in l {
                let [x1, y1, x2, y2] = self.e[k]; let (dx, dy) = (x2 - x1, y2 - y1); let ll = dx * dx + dy * dy;
                let t = (((x - x1) * dx + (y - y1) * dy) / ll).clamp(0.0, 1.0);
                if (x1 + t * dx - x).powi(2) + (y1 + t * dy - y).powi(2) <= EDGE_TOL * EDGE_TOL { return true; }
                if (y1 > y) != (y2 > y) && x < x1 + (y - y1) * dx / dy { c = !c; }
            }
        }
        c
    }
    fn jarak(&self, x: f64, y: f64, maks: f64) -> f64 {
        let mut best = maks * maks + 1.0;
        let a = ((y - maks - self.y0) / self.band).floor() as i64; let b = ((y + maks - self.y0) / self.band).floor() as i64;
        for bb in a..=b { if let Some(l) = self.idx.get(&bb) { for &k in l {
            let [x1, y1, x2, y2] = self.e[k]; let (dx, dy) = (x2 - x1, y2 - y1); let ll = dx * dx + dy * dy;
            let t = (((x - x1) * dx + (y - y1) * dy) / ll).clamp(0.0, 1.0);
            best = best.min((x1 + t * dx - x).powi(2) + (y1 + t * dy - y).powi(2));
        } } }
        best.sqrt()
    }
    fn potong_ruas(&self, p: (f64, f64), q: (f64, f64)) -> Option<f64> {
        let mut best: Option<f64> = None;
        for &[x1, y1, x2, y2] in &self.e {
            let d = (q.0 - p.0) * (y2 - y1) - (q.1 - p.1) * (x2 - x1);
            if d.abs() < 1e-12 { continue; }
            let t = ((x1 - p.0) * (y2 - y1) - (y1 - p.1) * (x2 - x1)) / d; let u = ((x1 - p.0) * (q.1 - p.1) - (y1 - p.1) * (q.0 - p.0)) / d;
            if (0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u) && best.map_or(true, |b| t < b) { best = Some(t); }
        }
        best
    }
}
pub fn rings_dari(segs: &[Seg], no: i32) -> Vec<RingV> {
    segs.iter().filter(|s| s[0].num == no && s.len() >= 3).map(|s| s.iter().map(|r| RP { x: r.e, y: r.n, z: r.z, d: r.d.clone(), baru: None }).collect()).collect()
}
fn buka_ring(mut r: RingV) -> RingV {
    if r.len() > 1 && (r[0].x - r[r.len() - 1].x).abs() < 1e-9 && (r[0].y - r[r.len() - 1].y).abs() < 1e-9 { r.pop(); }
    r
}

/* ---------- 1. potong ---------- */
#[derive(Debug, Default, Clone)]
pub struct Stat { pub titik_awal: usize, pub titik_dibuang: usize, pub titik_potong: usize, pub titik_harian: usize, pub titik_akhir: usize }

pub fn potong(progres: &Doc, boundaries: &[(&Doc, i32)], mode_dalam: bool, harian: &[&Doc], str_bdy_harian: Option<i32>, titik_potong: bool, cek: f64)
    -> (Vec<Seg>, Stat, Vec<Pt>) {
    let b: Vec<Bdy> = boundaries.iter().map(|(d, no)| Bdy::new(&rings_dari(&d.segs, *no).into_iter().map(buka_ring).collect::<Vec<_>>())).filter(|b| b.nring > 0).collect();
    let dalam = |x: f64, y: f64| b.iter().any(|bb| bb.status(x, y));
    let buang = |x: f64, y: f64| if mode_dalam { dalam(x, y) } else { !dalam(x, y) };
    let mut st = Stat::default();
    let mut out: Vec<Seg> = Vec::new(); let mut cekl: Vec<Pt> = Vec::new();
    for s in &progres.segs {
        st.titik_awal += s.len();
        let flags: Vec<bool> = s.iter().map(|r| buang(r.e, r.n)).collect();
        if !flags.iter().any(|&f| f) { out.push(s.clone()); continue; }
        let nb = flags.iter().filter(|&&f| f).count(); st.titik_dibuang += nb;
        let garis = s.len() > 1 && !is_spot(s[0].num);
        // potongan disimpan sebagai rentang indeks supaya "ujung asli" bisa dikenali
        let mut pieces: Vec<(Seg, bool, bool)> = Vec::new(); // (titik, awal asli?, akhir asli?)
        let mut cur: Seg = Vec::new(); let mut cur_first = 0usize;
        for (i, r) in s.iter().enumerate() {
            if flags[i] {
                if !cur.is_empty() {
                    if titik_potong && garis { let tp = titik_pada(&b, cur.last().unwrap(), r); cur.push(tp); }
                    let last_orig = false;
                    pieces.push((std::mem::take(&mut cur), cur_first == 0, last_orig));
                }
            } else {
                if cur.is_empty() {
                    cur_first = i;
                    if i > 0 && titik_potong && garis && flags[i - 1] { cur.push(titik_pada(&b, r, &s[i - 1])); }
                }
                cur.push(r.clone());
            }
        }
        if !cur.is_empty() { let first_orig = cur_first == 0; pieces.push((cur, first_orig, true)); }
        if titik_potong && garis { st.titik_potong += pieces.iter().map(|p| p.0.len()).sum::<usize>() - (s.len() - nb); }
        if garis && cek > 0.0 && mode_dalam {
            for (p, _, _) in &pieces {
                let ends: Vec<&Pt> = if p.len() == 1 { vec![&p[0]] } else { vec![&p[0], &p[p.len() - 1]] };
                for r in ends {
                    if r.d.starts_with("POTONG") { continue; }
                    let m = b.iter().map(|bb| bb.jarak(r.e, r.n, cek)).fold(f64::INFINITY, f64::min);
                    if m <= cek { cekl.push(r.clone()); }
                }
            }
        }
        out.extend(pieces.into_iter().map(|p| p.0));
    }
    let mut add: Vec<Seg> = Vec::new();
    for h in harian { for s in &h.segs { if Some(s[0].num) != str_bdy_harian { add.push(s.clone()); } } }
    st.titik_harian = add.iter().map(|s| s.len()).sum();
    if !add.is_empty() {
        let urut = out.windows(2).all(|w| w[0][0].num <= w[1][0].num);
        if urut {
            let mut by: BTreeMap<i32, (Vec<Seg>, Vec<Seg>)> = BTreeMap::new();
            for s in add { by.entry(s[0].num).or_default().0.push(s); }
            for s in out { by.entry(s[0].num).or_default().1.push(s); }
            out = by.into_values().flat_map(|(a, o)| a.into_iter().chain(o)).collect();
        } else { out.extend(add); }
    }
    st.titik_akhir = out.iter().map(|s| s.len()).sum();
    (out, st, cekl)
}
fn titik_pada(b: &[Bdy], keep: &Pt, gone: &Pt) -> Pt {
    let mut best: Option<f64> = None;
    for bb in b { if let Some(t) = bb.potong_ruas((keep.e, keep.n), (gone.e, gone.n)) { if best.map_or(true, |v| t < v) { best = Some(t); } } }
    let t = best.unwrap_or(0.0);
    Pt { num: keep.num, n: keep.n + t * (gone.n - keep.n), e: keep.e + t * (gone.e - keep.e), z: keep.z + t * (gone.z - keep.z), d: format!("POTONG,{}", keep.d) }
}

/* ---------- 2. boundary ---------- */
fn area(r: &RingV) -> f64 { let n = r.len(); let mut a = 0.0; for i in 0..n { let (p, q) = (&r[i], &r[(i + 1) % n]); a += p.x * q.y - q.x * p.y; } a / 2.0 }
fn inside_set(rings: &[RingV], x: f64, y: f64) -> bool {
    let mut c = false;
    for r in rings { let n = r.len(); for i in 0..n { let (p, q) = (&r[i], &r[(i + 1) % n]); if (p.y > y) != (q.y > y) && x < p.x + (y - p.y) * (q.x - p.x) / (q.y - p.y) { c = !c; } } }
    c
}
fn on_set(rings: &[RingV], x: f64, y: f64) -> Option<(f64, f64)> {
    let tol = 1e-4;
    for r in rings { let n = r.len(); for i in 0..n {
        let (p, q) = (&r[i], &r[(i + 1) % n]); let (dx, dy) = (q.x - p.x, q.y - p.y); let l = dx * dx + dy * dy;
        let t = if l == 0.0 { 0.0 } else { (((x - p.x) * dx + (y - p.y) * dy) / l).clamp(0.0, 1.0) };
        if (p.x + t * dx - x).powi(2) + (p.y + t * dy - y).powi(2) < tol * tol { return Some((dx, dy)); }
    } }
    None
}
fn orient_rings(rings: &[RingV]) -> (Vec<RingV>, Vec<bool>) {
    let mut out = Vec::new(); let mut flip = Vec::new();
    for (i, r) in rings.iter().enumerate() {
        let (x, y) = (r[0].x, r[0].y);
        let depth = rings.iter().enumerate().filter(|(j, o)| *j != i && inside_set(std::slice::from_ref(*o), x, y)).count();
        let f = (area(r) > 0.0) != (depth % 2 == 0);
        let mut rr = r.clone(); if f { rr.reverse(); }
        out.push(rr); flip.push(f);
    }
    (out, flip)
}
fn split(ring: &RingV, others: &[RingV], is_a: bool, own: usize) -> Vec<(RP, RP, usize)> {
    let tol = 1e-9;
    let mut oe: Vec<(&RP, &RP, usize)> = Vec::new();
    for (k, r) in others.iter().enumerate() { for j in 0..r.len() { oe.push((&r[j], &r[(j + 1) % r.len()], k)); } }
    let mut out = Vec::new(); let n = ring.len();
    for i in 0..n {
        let (p, q) = (&ring[i], &ring[(i + 1) % n]);
        let mut ts: Vec<(f64, Option<(f64, usize)>)> = vec![(0.0, None), (1.0, None)];
        let set = |ts: &mut Vec<(f64, Option<(f64, usize)>)>, t: f64, v: (f64, usize)| { if let Some(e) = ts.iter_mut().find(|e| e.0 == t) { e.1 = Some(v); } else { ts.push((t, Some(v))); } };
        let (ex, ey) = (q.x - p.x, q.y - p.y); let l2 = ex * ex + ey * ey;
        if l2 == 0.0 { continue; }
        let (bx0, bx1, by0, by1) = (p.x.min(q.x) - 1e-6, p.x.max(q.x) + 1e-6, p.y.min(q.y) - 1e-6, p.y.max(q.y) + 1e-6);
        for &(a, b, ko) in &oe {
            if a.x.max(b.x) < bx0 || a.x.min(b.x) > bx1 || a.y.max(b.y) < by0 || a.y.min(b.y) > by1 { continue; }
            let d = ex * (b.y - a.y) - ey * (b.x - a.x);
            if d.abs() > 1e-12 * l2.max(1.0) {
                let t = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / d; let u = ((a.x - p.x) * ey - (a.y - p.y) * ex) / d;
                if tol < t && t < 1.0 - tol && u >= -1e-9 && u <= 1.0 + 1e-9 {
                    let uu = u.clamp(0.0, 1.0); let zo = a.z + uu * (b.z - a.z); let zs = p.z + t * (q.z - p.z);
                    set(&mut ts, t, (if is_a { (2.0 * zs + zo) / 3.0 } else { (2.0 * zo + zs) / 3.0 }, if is_a { ko } else { own }));
                }
            } else {
                for w in [a, b] {
                    let t = ((w.x - p.x) * ex + (w.y - p.y) * ey) / l2;
                    if tol < t && t < 1.0 - tol && ((w.x - p.x) * ey - (w.y - p.y) * ex).abs() / l2.sqrt() < 1e-6 { set(&mut ts, t, (w.z, if is_a { ko } else { own })); }
                }
            }
        }
        ts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let pts: Vec<RP> = ts.iter().map(|&(t, v)| if t == 0.0 { p.clone() } else if t == 1.0 { q.clone() } else {
            let (z, k) = v.unwrap(); RP { x: p.x + t * ex, y: p.y + t * ey, z, d: p.d.clone(), baru: Some(k) } }).collect();
        for k in 0..pts.len() - 1 { out.push((pts[k].clone(), pts[k + 1].clone(), i)); }
    }
    out
}
fn key(p: &RP) -> (i64, i64) { ((p.x * 1e4).round() as i64, (p.y * 1e4).round() as i64) }

#[derive(Clone, Copy, PartialEq)]
pub enum Op { Tambah, Kurangi, Irisan }

pub fn boundary_op(a: &[RingV], b: &[RingV], op: Op) -> Vec<RingV> {
    let a0: Vec<RingV> = a.iter().filter(|r| r.len() >= 3).cloned().map(buka_ring).collect();
    let b0: Vec<RingV> = b.iter().filter(|r| r.len() >= 3).cloned().map(buka_ring).collect();
    let (a1, fa) = orient_rings(&a0); let (b1, fb) = orient_rings(&b0);
    #[derive(PartialEq, Clone, Copy)] enum C { Sama, Lawan, Dalam, Luar }
    let cls = |pieces: Vec<(RP, RP, usize)>, other: &[RingV]| -> Vec<(RP, RP, usize, C)> { pieces.into_iter().map(|(p, q, i)| {
        let (mx, my) = ((p.x + q.x) / 2.0, (p.y + q.y) / 2.0);
        let c = match on_set(other, mx, my) { Some((dx, dy)) => if dx * (q.x - p.x) + dy * (q.y - p.y) > 0.0 { C::Sama } else { C::Lawan },
            None => if inside_set(other, mx, my) { C::Dalam } else { C::Luar } };
        (p, q, i, c) }).collect() };
    let pa: Vec<_> = a1.iter().map(|r| cls(split(r, &b1, true, 0), &b1)).collect();
    let pb: Vec<_> = b1.iter().enumerate().map(|(k, r)| cls(split(r, &a1, false, k), &a1)).collect();
    let keep_a: &[C] = match op { Op::Tambah => &[C::Luar, C::Sama], Op::Kurangi => &[C::Luar, C::Lawan], Op::Irisan => &[C::Dalam, C::Sama] };
    let keep_b: &[C] = match op { Op::Tambah => &[C::Luar], Op::Kurangi => &[C::Dalam], Op::Irisan => &[C::Dalam] };
    let rev_b = op == Op::Kurangi;
    let mut hasil: Vec<((u8, usize), RingV)> = Vec::new();
    let mut pieces: Vec<(RP, RP, (u8, usize))> = Vec::new();
    for (k, ps) in pa.iter().enumerate() {
        let utuh = if op != Op::Irisan { ps.iter().all(|x| x.3 == C::Luar) } else { ps.iter().all(|x| x.3 == C::Dalam) };
        if utuh && ps.len() == a1[k].len() { hasil.push(((0, k), a0[k].clone())); continue; }
        for (p, q, _, c) in ps { if keep_a.contains(c) { pieces.push((p.clone(), q.clone(), (0, k))); } }
    }
    for (k, ps) in pb.iter().enumerate() {
        let utuh = ps.iter().all(|x| keep_b.contains(&x.3)) && ps.len() == b1[k].len();
        if utuh && !rev_b { hasil.push(((1, k), b0[k].clone())); continue; }
        for (p, q, _, c) in ps { if keep_b.contains(c) { pieces.push(if rev_b { (q.clone(), p.clone(), (1, k)) } else { (p.clone(), q.clone(), (1, k)) }); } }
    }
    let mut nxt: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
    for (i, pc) in pieces.iter().enumerate() { nxt.entry(key(&pc.0)).or_default().push(i); }
    let prio = |pc: &(RP, RP, (u8, usize))| { let src = pc.2; let r = if src.0 == 0 { &a1[src.1] } else { &b1[src.1] }; (src.0, src.1, if key(&pc.0) == key(&r[0]) { 0 } else { 1 }) };
    let mut starts: Vec<usize> = (0..pieces.len()).collect();
    starts.sort_by_key(|&i| prio(&pieces[i]));      // stabil, sama seperti sorted() Python
    let mut used: HashSet<usize> = HashSet::new();
    for &s0 in &starts {
        if used.contains(&s0) { continue; }
        let mut ring: RingV = Vec::new(); let mut cur = Some(s0);
        while let Some(c) = cur { if used.contains(&c) { break; } used.insert(c); ring.push(pieces[c].0.clone());
            cur = nxt.get(&key(&pieces[c].1)).and_then(|l| l.iter().copied().find(|i| !used.contains(i))); }
        if ring.len() >= 3 {
            let src = pieces[s0].2;
            let flip = if src.0 == 0 { fa[src.1] } else { fb[src.1] };
            if flip { ring.reverse(); }
            let mut dsc: Option<String> = None;
            if src.0 == 0 { let (r2, g) = awal_surpac(ring, &b0); ring = r2; if let Some(g) = g { dsc = Some(b0[g][0].d.clone()); } }
            if let Some(d) = dsc { for p in ring.iter_mut() { p.d = d.clone(); } }
            hasil.push((src, ring));
        }
    }
    let order = |s: (u8, usize)| if s.0 == 0 { s.1 } else { a1.len() + s.1 };
    hasil.sort_by_key(|h| order(h.0));
    hasil.into_iter().map(|(_, r)| r.into_iter().map(|p| RP { baru: None, ..p }).collect()).collect()
}
fn awal_surpac(ring: RingV, b0: &[RingV]) -> (RingV, Option<usize>) {
    let kb: Vec<HashMap<(i64, i64), usize>> = b0.iter().map(|b| b.iter().enumerate().map(|(j, p)| (key(p), j)).collect()).collect();
    let mut g: Option<usize> = None;
    for p in &ring {
        let c = match p.baru { Some(k) => Some(k), None => (0..b0.len()).filter(|&k| kb[k].contains_key(&key(p))).max() };
        if let Some(c) = c { if g.map_or(true, |gg| c > gg) { g = Some(c); } }
    }
    let Some(g) = g else { return (ring, None) };
    let kr: Vec<(i64, i64)> = ring.iter().map(key).collect();
    let rot = |j: usize| { let mut r = ring[j..].to_vec(); r.extend_from_slice(&ring[..j]); r };
    let b = &b0[g];
    if let Some(j) = kr.iter().position(|k| *k == key(&b[0])) { return (rot(j), Some(g)); }
    let n = b.len();
    for i in (0..n).rev() {
        let (u, v) = (&b[i], &b[(i + 1) % n]); let (dx, dy) = (v.x - u.x, v.y - u.y); let l2 = dx * dx + dy * dy;
        if l2 == 0.0 { continue; }
        let mut best: Option<(f64, usize)> = None;
        for (j, p) in ring.iter().enumerate() {
            if p.baru == Some(g) {
                let t = ((p.x - u.x) * dx + (p.y - u.y) * dy) / l2;
                if t >= -1e-9 && t <= 1.0 + 1e-9 && ((p.x - u.x) * dy - (p.y - u.y) * dx).abs() / l2.sqrt() < 1e-6 && best.map_or(true, |bb| t > bb.0) { best = Some((t, j)); }
            }
        }
        if let Some((_, j)) = best { return (rot(j), Some(g)); }
        if let Some(j) = kr.iter().position(|k| *k == key(u)) { return (rot(j), Some(g)); }
    }
    (ring, Some(g))
}

/* ---------- alur lengkap (= VBA UpdateHarian) ---------- */
pub struct OutFile { pub name: String, pub data: Vec<u8> }
fn base_name(n: &str) -> String { let b = n.rsplit(|c| c == '\\' || c == '/').next().unwrap_or(n); match b.rfind('.') { Some(i) if i > 0 => b[..i].to_string(), _ => b.to_string() } }

pub fn jalankan_potong(g: &Doc, bds: &[&Doc], bdy_no: i32, mode_dalam: bool, hr: &[&Doc], out_name: &str, tgl: Tgl, titik_potong: bool, cek: f64) -> (Vec<OutFile>, Stat, usize) {
    let b: Vec<(&Doc, i32)> = bds.iter().map(|d| (*d, bdy_no)).collect();
    let (segs, st, cekl) = potong(g, &b, mode_dalam, hr, Some(bdy_no), titik_potong, if mode_dalam { cek } else { 0.0 });
    let nama = base_name(out_name); let ts = tgl_surpac(tgl);
    let mut files = vec![OutFile { name: format!("{nama}.str"), data: tulis(&kepala(&g.head, &nama, &ts), &segs, g.binary, &g.axis) }];
    if !cekl.is_empty() {
        let cs: Vec<Seg> = cekl.iter().map(|x| vec![Pt { num: 9006, n: x.n, e: x.e, z: x.z, d: format!("CEK,{}", x.d) }]).collect();
        files.push(OutFile { name: format!("{nama}_CEK.str"), data: tulis(&[format!("{nama}_CEK"), ts.clone(), "0".into(), "0".into()], &cs, false, AXIS) });
    }
    let n = cekl.len();
    (files, st, n)
}
pub fn jalankan_bdy(a: &Doc, a_no: i32, bl: &[&Doc], b_no: i32, op: Op, out_name: &str, tgl: Tgl, out_no: i32) -> (Vec<OutFile>, usize) {
    let mut b: Vec<RingV> = Vec::new(); for d in bl { b.extend(rings_dari(&d.segs, b_no)); }
    let r = boundary_op(&rings_dari(&a.segs, a_no), &b, op);
    let nama = base_name(out_name); let ts = tgl_surpac(tgl);
    let mut head = kepala(&a.head, &nama, &ts); head[0] = nama.clone(); head[1] = ts;
    let segs: Vec<Seg> = r.iter().map(|ring| ring.iter().chain(std::iter::once(&ring[0])).map(|p| Pt { num: out_no, n: p.y, e: p.x, z: p.z, d: p.d.clone() }).collect()).collect();
    (vec![OutFile { name: format!("{nama}.str"), data: tulis(&head, &segs, a.binary, &a.axis) }], r.len())
}
/// global lama dipotong boundary harian (DALAM) + string harian; bdy lama + bdy harian (TAMBAH)
pub fn update_harian(g: &Doc, g_name: &str, bdy: Option<(&Doc, &str)>, bdy_no: i32, harian: &[&Doc], harian_names: &[String], harian_no: i32, tgl_in: &str)
    -> Result<(Tgl, Vec<OutFile>, Stat, usize), String> {
    let tgl = tgl_teks(tgl_in, &base_name(harian_names.first().map(|s| s.as_str()).unwrap_or("")), harian.first().map(|h| h.head.as_slice())).ok_or("Tanggal tidak ditemukan; isi tanggal")?;
    let out_g = nama_tanggal(&format!("{}.str", base_name(g_name)), tgl);
    let (mut files, st, cek) = jalankan_potong(g, harian, harian_no, true, harian, &out_g, tgl, false, 2.0);
    if let Some((b, bn)) = bdy { let (f2, _) = jalankan_bdy(b, bdy_no, harian, harian_no, Op::Tambah, &nama_tanggal(&format!("{}.str", base_name(bn)), tgl), tgl, bdy_no); files.extend(f2); }
    Ok((tgl, files, st, cek))
}
