//! Baca file Surpac: string file (.str teks/biner) dan DTM (.dtm teks/biner).
//! Struktur baris sama dengan parser.js: tiap segmen diikuti satu baris pemisah (nomor 0, koordinat NaN),
//! karena nomor titik di .dtm menghitung baris pemisah juga.

#[derive(Debug, Default, Clone)]
pub struct StrFile {
    pub head: String,
    pub binary: bool,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub z: Vec<f64>,
    /// nomor string per baris, 0 = pemisah segmen
    pub sn: Vec<i32>,
    pub desc: Vec<String>,
}

impl StrFile {
    pub fn rows(&self) -> usize { self.sn.len() }
    fn push(&mut self, num: i32, y: f64, x: f64, z: f64, d: String) {
        self.sn.push(num); self.x.push(x); self.y.push(y); self.z.push(z); self.desc.push(d);
    }
    /// pemisah segmen; pemisah ganda / di awal diabaikan
    fn sep(&mut self) {
        if self.sn.last().map_or(true, |&s| s == 0) { return; }
        self.push(0, f64::NAN, f64::NAN, f64::NAN, String::new());
    }
    fn done(&mut self) { if self.sn.last().map_or(false, |&s| s != 0) { self.sep(); } }
}

#[derive(Debug, Default, Clone)]
pub struct DtmFile {
    pub head: String,
    pub str_name: String,
    pub binary: bool,
    pub objects: usize,
    /// indeks baris .str (0-based), 3 per segitiga
    pub tris: Vec<i32>,
}

fn latin1(b: &[u8]) -> String { b.iter().map(|&c| c as char).collect() }
fn line_end(u: &[u8], mut p: usize) -> usize { while p < u.len() && u[p] != b'\n' { p += 1; } p }
fn be_i32(u: &[u8], p: usize) -> i32 { i32::from_be_bytes([u[p], u[p + 1], u[p + 2], u[p + 3]]) }
fn be_f64(u: &[u8], p: usize) -> f64 { let mut a = [0u8; 8]; a.copy_from_slice(&u[p..p + 8]); f64::from_be_bytes(a) }
fn le_i32(u: &[u8], p: usize) -> i32 { i32::from_le_bytes([u[p], u[p + 1], u[p + 2], u[p + 3]]) }
fn le_f64(u: &[u8], p: usize) -> f64 { let mut a = [0u8; 8]; a.copy_from_slice(&u[p..p + 8]); f64::from_le_bytes(a) }
fn zeros5(u: &[u8], p: usize) -> bool { p + 5 <= u.len() && u[p..p + 5].iter().all(|&c| c == 0) }

/// rekaman biner: int32 BE nomor, f64 BE y, x, z, deskripsi diakhiri NUL; nomor 0 = pemisah, deskripsi END = selesai
fn parse_bin(u: &[u8], mut p: usize, f: &mut StrFile) -> usize {
    let n = u.len();
    while p + 28 <= n {
        let num = be_i32(u, p);
        let (y, x, z) = (be_f64(u, p + 4), be_f64(u, p + 12), be_f64(u, p + 20));
        let mut e = p + 28;
        while e < n && u[e] != 0 { e += 1; }
        if num == 0 {
            f.sep();
            if e >= p + 31 && &u[e - 3..e] == b"END" { return e + 1; }
        } else {
            f.push(num, y, x, z, latin1(&u[p + 28..e]));
        }
        p = e + 1;
    }
    p
}

fn parse_text(u: &[u8], mut p: usize, f: &mut StrFile, stop_at_tri: bool) -> usize {
    let n = u.len();
    while p < n {
        let e = line_end(u, p);
        let mut b = e;
        if b > p && u[b - 1] == b'\r' { b -= 1; }
        if b > p {
            if stop_at_tri && (u[p] == b'O' || u[p] == b'T') { return p; }
            let line = latin1(&u[p..b]);
            let mut it = line.splitn(5, ',');
            let f0 = it.next().unwrap_or("").trim();
            if !f0.is_empty() {
                let num = f0.parse::<f64>().map(|v| v.trunc() as i32).unwrap_or(-1);
                let rest: Vec<&str> = it.collect();
                if num == 0 {
                    f.sep();
                    if rest.len() >= 4 && rest[3].trim().ends_with("END") { return e + 1; }
                } else if num > 0 && rest.len() >= 3 {
                    let g = |s: &str| s.trim().parse::<f64>().unwrap_or(f64::NAN);
                    let d = if rest.len() >= 4 { rest[3].trim().to_string() } else { String::new() };
                    f.push(num, g(rest[0]), g(rest[1]), g(rest[2]), d);
                }
            }
        }
        p = e + 1;
    }
    p
}

pub fn parse_str(u: &[u8]) -> StrFile {
    let mut f = StrFile::default();
    let e1 = line_end(u, 0);
    f.head = latin1(&u[..e1]).trim_end_matches('\r').to_string();
    let e2 = line_end(u, (e1 + 1).min(u.len()));
    let mut p = (e2 + 1).min(u.len());
    let probe = &u[p..(p + 64).min(u.len())];
    f.binary = probe.contains(&0);
    if f.binary {
        if zeros5(u, p) { p += 5; }
        parse_bin(u, p, &mut f);
    } else {
        parse_text(u, p, &mut f, false);
    }
    f.done();
    f
}

pub fn parse_dtm(u: &[u8]) -> DtmFile {
    let mut d = DtmFile::default();
    let e1 = line_end(u, 0);
    d.head = latin1(&u[..e1]).trim_end_matches('\r').to_string();
    d.str_name = d.head.split(',').next().unwrap_or("").trim().to_string();
    let mut p = (e1 + 1).min(u.len());
    d.binary = zeros5(u, p);
    let mut hull = StrFile::default();
    if d.binary {
        p = parse_bin(u, p + 5, &mut hull);
        let n = u.len();
        while p + 8 <= n {
            let typ = be_i32(u, p); p += 8;
            if !(1..=3).contains(&typ) { break; }
            if typ == 1 { d.objects += 1; }
            if typ == 3 {
                for k in 0..3 { d.tris.push(be_i32(u, p + 4 * k) - 1); }
                p += 24;
            }
            while p < n && u[p] != 0 { p += 1; }
            p += 1;
        }
    } else {
        p = parse_text(u, p, &mut hull, true);
        let n = u.len();
        let mut in_tri = false;
        while p < n {
            let e = line_end(u, p);
            let c0 = u[p];
            if c0 == b'O' { d.objects += 1; in_tri = false; }
            else if c0 == b'T' { in_tri = true; }
            else if c0 == b'E' { break; }
            else if in_tri && c0.is_ascii_digit() {
                let line = latin1(&u[p..e.min(p + 200)]);
                let v: Vec<&str> = line.split(',').collect();
                if v.len() >= 4 {
                    for k in 1..4 { d.tris.push(v[k].trim().parse::<i32>().unwrap_or(0) - 1); }
                }
            }
            p = e + 1;
        }
    }
    d
}

/// ESRI .shp: tiap part = satu segmen, nomor string = nomor rekaman
pub fn parse_shp(u: &[u8]) -> StrFile {
    let mut f = StrFile { head: "shp".into(), ..Default::default() };
    let n = u.len();
    let (mut p, mut rec) = (100usize, 0i32);
    while p + 12 <= n {
        let len = be_i32(u, p + 4) as usize * 2;
        let b = p + 8; p = b + len;
        if p > n { break; }
        let t = le_i32(u, b); rec += 1;
        let has_z = matches!(t, 11 | 13 | 15 | 18);
        match t {
            1 | 11 | 21 => { f.push(rec, le_f64(u, b + 12), le_f64(u, b + 4), if t == 11 { le_f64(u, b + 20) } else { 0.0 }, String::new()); f.sep(); }
            3 | 5 | 13 | 15 | 23 | 25 => {
                let np = le_i32(u, b + 36) as usize; let npt = le_i32(u, b + 40) as usize;
                let parts: Vec<usize> = (0..np).map(|i| le_i32(u, b + 44 + 4 * i) as usize).collect();
                let xy = b + 44 + 4 * np; let zb = xy + 16 * npt + 16;
                for k in 0..np {
                    let e = if k + 1 < np { parts[k + 1] } else { npt };
                    for i in parts[k]..e { f.push(rec, le_f64(u, xy + 16 * i + 8), le_f64(u, xy + 16 * i), if has_z { le_f64(u, zb + 8 * i) } else { 0.0 }, String::new()); }
                    f.sep();
                }
            }
            8 | 18 | 28 => {
                let npt = le_i32(u, b + 36) as usize; let xy = b + 40; let zb = xy + 16 * npt + 16;
                for i in 0..npt { f.push(rec, le_f64(u, xy + 16 * i + 8), le_f64(u, xy + 16 * i), if has_z { le_f64(u, zb + 8 * i) } else { 0.0 }, String::new()); f.sep(); }
            }
            _ => {}
        }
    }
    f.done();
    f
}
