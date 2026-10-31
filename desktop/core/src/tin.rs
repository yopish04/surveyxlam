//! CREATE DTM: Delaunay sweep-hull + breakline dipaksa (Sloan). Port langsung dari viewer/src/tin.js
//! (yang identik dengan TIN Surpac di LD03 dan 99,76% sama di Tofu 9). Urutan operasi sengaja dibuat sama
//! supaya hasilnya identik dengan versi JavaScript.
use crate::strio::StrFile;
use std::collections::{HashMap, HashSet};

#[inline]
fn orient(x: &[f64], a: usize, b: usize, c: usize) -> f64 {
    (x[2 * b] - x[2 * a]) * (x[2 * c + 1] - x[2 * a + 1]) - (x[2 * b + 1] - x[2 * a + 1]) * (x[2 * c] - x[2 * a])
}
#[inline]
fn in_circle(x: &[f64], a: usize, b: usize, c: usize, d: usize) -> f64 {
    let (ax, ay) = (x[2 * a] - x[2 * d], x[2 * a + 1] - x[2 * d + 1]);
    let (bx, by) = (x[2 * b] - x[2 * d], x[2 * b + 1] - x[2 * d + 1]);
    let (cx, cy) = (x[2 * c] - x[2 * d], x[2 * c + 1] - x[2 * d + 1]);
    (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay)
}

pub struct Tri { pub t: Vec<i32>, pub h: Vec<i32> }

/// Delaunay sweep-hull. x = [x0,y0,x1,y1,...]. tie = seri ko-sirkular pakai diagonal NW-SE (seperti Surpac).
pub fn delaunay(x: &[f64], tie: bool) -> Tri {
    let n = x.len() / 2;
    let max_t = (2 * n).saturating_sub(5).max(1);
    let mut t = vec![0i32; max_t * 3];
    let mut h = vec![-1i32; max_t * 3];
    let mut tl = 0usize;
    let mut hull_prev = vec![0usize; n];
    let mut hull_next = vec![0usize; n];
    let mut hull_tri = vec![0usize; n];
    let hash_size = ((n as f64).sqrt().ceil() as usize).max(1);
    let mut hull_hash = vec![usize::MAX; hash_size];
    let (mut minx, mut miny, mut maxx, mut maxy) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for i in 0..n { minx = minx.min(x[2 * i]); miny = miny.min(x[2 * i + 1]); maxx = maxx.max(x[2 * i]); maxy = maxy.max(x[2 * i + 1]); }
    let (cx0, cy0) = ((minx + maxx) / 2.0, (miny + maxy) / 2.0);
    let d2 = |i: usize, px: f64, py: f64| { let dx = x[2 * i] - px; let dy = x[2 * i + 1] - py; dx * dx + dy * dy };
    let (mut i0, mut i1, mut i2) = (0usize, 0usize, 0usize);
    let mut md = f64::INFINITY;
    for i in 0..n { let d = d2(i, cx0, cy0); if d < md { i0 = i; md = d; } }
    let (i0x, i0y) = (x[2 * i0], x[2 * i0 + 1]);
    md = f64::INFINITY;
    for i in 0..n { if i == i0 { continue; } let d = d2(i, i0x, i0y); if d < md && d > 0.0 { i1 = i; md = d; } }
    let circ_r = |ax: f64, ay: f64, bx: f64, by: f64, cx: f64, cy: f64| {
        let (dx, dy, ex, ey) = (bx - ax, by - ay, cx - ax, cy - ay);
        let (bl, cl) = (dx * dx + dy * dy, ex * ex + ey * ey);
        let d = 0.5 / (dx * ey - dy * ex);
        let (px, py) = ((ey * bl - dy * cl) * d, (dx * cl - ex * bl) * d);
        px * px + py * py
    };
    let mut mr = f64::INFINITY;
    for i in 0..n {
        if i == i0 || i == i1 { continue; }
        let r = circ_r(i0x, i0y, x[2 * i1], x[2 * i1 + 1], x[2 * i], x[2 * i + 1]);
        if r < mr { i2 = i; mr = r; }
    }
    if mr == f64::INFINITY { return Tri { t: vec![], h: vec![] }; }
    if orient(x, i0, i1, i2) < 0.0 { std::mem::swap(&mut i1, &mut i2); }
    let (ax, ay, bx, by, qx, qy) = (x[2 * i0], x[2 * i0 + 1], x[2 * i1], x[2 * i1 + 1], x[2 * i2], x[2 * i2 + 1]);
    let (dx, dy, ex, ey) = (bx - ax, by - ay, qx - ax, qy - ay);
    let (bl, cl) = (dx * dx + dy * dy, ex * ex + ey * ey);
    let dd = 0.5 / (dx * ey - dy * ex);
    let (cx, cy) = (ax + (ey * bl - dy * cl) * dd, ay + (dx * cl - ex * bl) * dd);
    let dist: Vec<f64> = (0..n).map(|i| d2(i, cx, cy)).collect();
    let mut ids: Vec<usize> = (0..n).collect();
    ids.sort_by(|&a, &b| dist[a].partial_cmp(&dist[b]).unwrap_or(std::cmp::Ordering::Equal).then(a.cmp(&b)));
    let hash_key = |px: f64, py: f64| -> usize {
        let (ddx, ddy) = (px - cx, py - cy);
        let p = ddx / (ddx.abs() + ddy.abs());
        let v = ((if ddy > 0.0 { 3.0 - p } else { 1.0 + p }) / 4.0 * hash_size as f64).floor();
        if v.is_nan() { 0 } else { (v as usize) % hash_size }
    };
    macro_rules! link { ($a:expr, $b:expr) => {{ let (a, b) = ($a, $b); h[a] = b; if b != -1 { h[b as usize] = a as i32; } }}; }
    macro_rules! add_t { ($a:expr, $b:expr, $c:expr, $ha:expr, $hb:expr, $hc:expr) => {{
        let tt = tl; t[tt] = $a as i32; t[tt + 1] = $b as i32; t[tt + 2] = $c as i32;
        link!(tt, $ha); link!(tt + 1, $hb); link!(tt + 2, $hc); tl += 3; tt }}; }
    let mut hull_start = i0;
    hull_next[i0] = i1; hull_prev[i2] = i1;
    hull_next[i1] = i2; hull_prev[i0] = i2;
    hull_next[i2] = i0; hull_prev[i1] = i0;
    hull_tri[i0] = 0; hull_tri[i1] = 1; hull_tri[i2] = 2;
    hull_hash[hash_key(ax, ay)] = i0; hull_hash[hash_key(bx, by)] = i1; hull_hash[hash_key(qx, qy)] = i2;
    add_t!(i0, i1, i2, -1i32, -1i32, -1i32);
    let mut stack: Vec<usize> = Vec::with_capacity(1024);

    // legalize: sama persis dengan tin.js
    let legalize = |t: &mut Vec<i32>, h: &mut Vec<i32>, hull_tri: &mut Vec<usize>, hull_prev: &Vec<usize>, hull_start: usize, stack: &mut Vec<usize>, a0in: usize| -> usize {
        let mut a = a0in; let mut ar;
        stack.clear();
        loop {
            let b = h[a]; let a0 = a - a % 3;
            ar = a0 + (a + 2) % 3;
            if b == -1 { match stack.pop() { Some(v) => { a = v; continue; } None => break } }
            let b = b as usize;
            let b0 = b - b % 3; let al = a0 + (a + 1) % 3; let bl2 = b0 + (b + 2) % 3;
            let (p0, pr, pl, p1) = (t[ar] as usize, t[a] as usize, t[al] as usize, t[bl2] as usize);
            let det = in_circle(x, p0, pr, pl, p1);
            let mut flip_it = det > 0.0;
            if tie {
                let l2 = (x[2 * pr] - x[2 * pl]).powi(2) + (x[2 * pr + 1] - x[2 * pl + 1]).powi(2);
                if det.abs() <= 1e-9 * l2 * l2 { flip_it = (x[2 * p1] - x[2 * p0]) * (x[2 * p1 + 1] - x[2 * p0 + 1]) < 0.0; }
            }
            if flip_it {
                t[a] = p1 as i32; t[b] = p0 as i32;
                let hbl = h[bl2];
                if hbl == -1 {
                    let mut e = hull_start;
                    loop { if hull_tri[e] == bl2 { hull_tri[e] = a; break; } e = hull_prev[e]; if e == hull_start { break; } }
                }
                h[a] = hbl; if hbl != -1 { h[hbl as usize] = a as i32; }
                let har = h[ar]; h[b] = har; if har != -1 { h[har as usize] = b as i32; }
                h[ar] = bl2 as i32; h[bl2] = ar as i32;
                stack.push(b0 + (b + 1) % 3);
            } else {
                match stack.pop() { Some(v) => a = v, None => break }
            }
        }
        ar
    };

    let (mut xp, mut yp) = (f64::NAN, f64::NAN);
    for k in 0..n {
        let i = ids[k]; let (px, py) = (x[2 * i], x[2 * i + 1]);
        if px == xp && py == yp { continue; }
        xp = px; yp = py;
        if i == i0 || i == i1 || i == i2 { continue; }
        let mut start = 0usize;
        let key = hash_key(px, py);
        for j in 0..hash_size { start = hull_hash[(key + j) % hash_size]; if start != usize::MAX && start != hull_next[start] { break; } }
        if start == usize::MAX { continue; }
        start = hull_prev[start];
        let mut e = start; let mut found = true;
        loop { let q = hull_next[e]; if orient(x, e, q, i) < 0.0 { break; } e = q; if e == start { found = false; break; } }
        if !found { continue; }
        let mut tt = add_t!(e, i, hull_next[e], -1i32, -1i32, hull_tri[e] as i32);
        hull_tri[i] = legalize(&mut t, &mut h, &mut hull_tri, &hull_prev, hull_start, &mut stack, tt + 2);
        hull_tri[e] = tt;
        let mut nn = hull_next[e];
        loop {
            let q = hull_next[nn];
            if !(orient(x, nn, q, i) < 0.0) { break; }
            tt = add_t!(nn, i, q, hull_tri[i] as i32, -1i32, hull_tri[nn] as i32);
            hull_tri[i] = legalize(&mut t, &mut h, &mut hull_tri, &hull_prev, hull_start, &mut stack, tt + 2);
            hull_next[nn] = nn; nn = q;
        }
        if e == start {
            loop {
                let q = hull_prev[e];
                if !(orient(x, q, e, i) < 0.0) { break; }
                tt = add_t!(q, i, e, -1i32, hull_tri[e] as i32, hull_tri[q] as i32);
                legalize(&mut t, &mut h, &mut hull_tri, &hull_prev, hull_start, &mut stack, tt + 2);
                hull_tri[q] = tt; hull_next[e] = e; e = q;
            }
        }
        hull_start = e; hull_prev[i] = e;
        hull_next[e] = i; hull_prev[nn] = i; hull_next[i] = nn;
        hull_hash[hash_key(px, py)] = i; hull_hash[hash_key(x[2 * e], x[2 * e + 1])] = e;
    }
    t.truncate(tl); h.truncate(tl);
    Tri { t, h }
}

/* ---------- jaring halfedge yang bisa di-flip ---------- */
struct Mesh<'a> { x: &'a [f64], t: Vec<i32>, h: Vec<i32>, vt: Vec<i32> }
#[inline] fn nx(e: usize) -> usize { e - e % 3 + (e + 1) % 3 }
#[inline] fn pv(e: usize) -> usize { e - e % 3 + (e + 2) % 3 }
impl<'a> Mesh<'a> {
    fn new(x: &'a [f64], d: Tri, n: usize) -> Self {
        let mut vt = vec![-1i32; n];
        for (e, &v) in d.t.iter().enumerate() { vt[v as usize] = e as i32; }
        Mesh { x, t: d.t, h: d.h, vt }
    }
    fn out(&self, a: usize, r: &mut Vec<usize>) {
        r.clear();
        let s = self.vt[a]; if s < 0 { return; }
        let s = s as usize; r.push(s);
        let mut e = s;
        for _ in 0..10000 { let t = self.h[pv(e)]; if t == -1 { break; } e = t as usize; if e == s { return; } r.push(e); }
        e = s;
        for _ in 0..10000 { let t = self.h[e]; if t == -1 { break; } e = nx(t as usize); if e == s { break; } r.push(e); }
    }
    fn find(&self, u: usize, v: usize) -> Option<usize> {
        let mut r = Vec::with_capacity(16); self.out(u, &mut r);
        r.into_iter().find(|&e| self.t[nx(e)] as usize == v)
    }
    fn has(&self, u: usize, v: usize) -> bool { self.find(u, v).is_some() || self.find(v, u).is_some() }
    fn opp(&self, e: usize) -> usize { self.t[pv(e)] as usize }
    fn flip(&mut self, u: usize, v: usize) -> Option<(usize, usize)> {
        let a = self.find(u, v)?;
        let b = self.h[a]; if b == -1 { return None; }
        let b = b as usize;
        let (p, q) = (self.t[pv(a)] as usize, self.t[pv(b)] as usize);
        if !(orient(self.x, p, q, u) * orient(self.x, p, q, v) < 0.0) { return None; }
        let (a0, b0) = (a - a % 3, b - b % 3);
        let (ar, al, bl, br) = (a0 + (a + 2) % 3, a0 + (a + 1) % 3, b0 + (b + 2) % 3, b0 + (b + 1) % 3);
        let (p0, pr, pl, p1) = (self.t[ar], self.t[a], self.t[al], self.t[bl]);
        self.t[a] = p1; self.t[b] = p0;
        let (hbl, har) = (self.h[bl], self.h[ar]);
        self.h[a] = hbl; if hbl != -1 { self.h[hbl as usize] = a as i32; }
        self.h[b] = har; if har != -1 { self.h[har as usize] = b as i32; }
        self.h[ar] = bl as i32; self.h[bl] = ar as i32;
        self.vt[p0 as usize] = ar as i32; self.vt[p1 as usize] = a as i32; self.vt[pl as usize] = al as i32; self.vt[pr as usize] = br as i32;
        Some((p, q))
    }
}

enum Walk { Cross(Vec<(usize, usize)>), Titik(usize), Gagal }

fn walk(m: &Mesh, a: usize, b: usize, tol: f64) -> Walk {
    let x = m.x;
    let l = (x[2 * b] - x[2 * a]).hypot(x[2 * b + 1] - x[2 * a + 1]);
    let eps = (1e-7 * l.max(1.0) * l.max(1.0)).max(tol * l);
    let dot = |p: usize| (x[2 * p] - x[2 * a]) * (x[2 * b] - x[2 * a]) + (x[2 * p + 1] - x[2 * a + 1]) * (x[2 * b + 1] - x[2 * a + 1]);
    let mut first = None;
    let mut outs = Vec::with_capacity(16); m.out(a, &mut outs);
    for &e in &outs {
        let (p, q) = (m.t[nx(e)] as usize, m.t[pv(e)] as usize);
        let (op, oq) = (orient(x, a, b, p), orient(x, a, b, q));
        if op.abs() <= eps && dot(p) > 0.0 { return Walk::Titik(p); }
        if oq.abs() <= eps && dot(q) > 0.0 { return Walk::Titik(q); }
        if op < 0.0 && 0.0 < oq { first = Some((p, q)); break; }
    }
    let Some((mut p, mut q)) = first else { return Walk::Gagal };
    let mut cross = Vec::new();
    for _ in 0..1_000_000 {
        cross.push((p, q));
        let Some(e) = m.find(q, p) else { return Walk::Gagal };
        let r = m.opp(e);
        if r == b { return Walk::Cross(cross); }
        let o = orient(x, a, b, r);
        if o.abs() <= eps { return Walk::Titik(r); }
        if o < 0.0 { p = r; } else { q = r; }
    }
    Walk::Gagal
}

pub struct CdtResult { pub tris: Vec<i32>, pub skipped: usize, pub flips: usize }

pub fn cdt(x: &[f64], n: usize, cons: &[usize], tie: bool) -> CdtResult {
    let (tol, sisa, max_flips) = (0.0f64, true, 20_000_000usize);
    let mut m = Mesh::new(x, delaunay(x, tie), n);
    let key = |a: usize, b: usize| -> u64 { if a < b { a as u64 * n as u64 + b as u64 } else { b as u64 * n as u64 + a as u64 } };
    let mut fixed: HashSet<u64> = HashSet::new();
    let mut skipped = 0usize;
    let mut work: Vec<usize> = Vec::with_capacity(cons.len());
    let mut i = cons.len();
    while i >= 2 { i -= 2; work.push(cons[i]); work.push(cons[i + 1]); }
    let mut flips = 0usize;
    while work.len() >= 2 {
        let b = work.pop().unwrap(); let a = work.pop().unwrap();
        if a == b { continue; }
        let k = key(a, b);
        if m.has(a, b) { fixed.insert(k); continue; }
        let w = match walk(&m, a, b, tol) {
            Walk::Gagal => { skipped += 1; continue; }
            Walk::Titik(mid) => { if sisa || tol == 0.0 { work.push(mid); work.push(b); } work.push(a); work.push(mid); continue; }
            Walk::Cross(c) => c,
        };
        if w.iter().any(|&(u, v)| fixed.contains(&key(u, v))) { skipped += 1; continue; }
        let mut queue = w.clone(); let mut qh = 0usize; let mut nw: Vec<(usize, usize)> = Vec::new(); let mut guard = 0usize;
        while qh < queue.len() {
            let (mut u, mut v) = queue[qh]; qh += 1; guard += 1;
            if guard > 50 * (w.len() + 5) { break; }
            if !m.has(u, v) { continue; }
            if m.find(u, v).is_none() { std::mem::swap(&mut u, &mut v); }
            match m.flip(u, v) {
                None => { queue.push((u, v)); continue; }
                Some((p, q)) => {
                    flips += 1;
                    if (p == a && q == b) || (p == b && q == a) { continue; }
                    let crosses = p != a && p != b && q != a && q != b
                        && orient(x, a, b, p) * orient(x, a, b, q) < 0.0 && orient(x, p, q, a) * orient(x, p, q, b) < 0.0;
                    if crosses { queue.push((p, q)); } else { nw.push((p, q)); }
                }
            }
        }
        if !m.has(a, b) { skipped += 1; continue; }
        fixed.insert(k);
        let (mut changed, mut it) = (true, 0);
        while changed && it < 20 {
            changed = false; it += 1;
            for pq in nw.clone() {
                let (mut p, mut q) = pq;
                if fixed.contains(&key(p, q)) || !m.has(p, q) { continue; }
                if m.find(p, q).is_none() { std::mem::swap(&mut p, &mut q); }
                let (Some(e1), Some(e2)) = (m.find(p, q), m.find(q, p)) else { continue };
                if in_circle(x, p, q, m.opp(e1), m.opp(e2)) > 1e-9 {
                    if let Some(r) = m.flip(p, q) {
                        if let Some(ix) = nw.iter().position(|&s| s == pq) { nw.remove(ix); }
                        nw.push(r); changed = true;
                    }
                }
            }
        }
        if flips > max_flips { break; }
    }
    CdtResult { tris: m.t, skipped, flips }
}

pub struct Dtm { pub tris: Vec<i32>, pub npts: usize, pub skipped: usize, pub flips: usize }

/// DTM dari string file; skip = string tidak dipakai (boundary), spot = string titik saja.
pub fn create_dtm(r: &StrFile, skip: &dyn Fn(i32) -> bool, spot: &dyn Fn(i32) -> bool) -> Dtm {
    let n = r.rows();
    let mut row_of: Vec<usize> = Vec::new();
    let mut idx = vec![usize::MAX; n];
    let mut map: HashMap<(i64, i64), usize> = HashMap::new();
    let (mut x0, mut y0) = (f64::INFINITY, f64::INFINITY);
    for i in 0..n { let s = r.sn[i]; if s != 0 && !skip(s) { x0 = x0.min(r.x[i]); y0 = y0.min(r.y[i]); } }
    let jsround = |v: f64| (v * 1000.0 + 0.5).floor() as i64;      // = Math.round di JavaScript
    let mut xy: Vec<f64> = Vec::new();
    for i in 0..n {
        let s = r.sn[i]; if s == 0 || skip(s) { continue; }
        let k = (jsround(r.x[i]), jsround(r.y[i]));
        let j = *map.entry(k).or_insert_with(|| { row_of.push(i); xy.push(r.x[i] - x0); xy.push(r.y[i] - y0); row_of.len() - 1 });
        idx[i] = j;
    }
    let mut cons = Vec::new();
    for i in 0..n.saturating_sub(1) {
        let s = r.sn[i];
        if s == 0 || skip(s) || spot(s) || r.sn[i + 1] == 0 { continue; }
        let (a, b) = (idx[i], idx[i + 1]);
        if a != b { cons.push(a); cons.push(b); }
    }
    let res = cdt(&xy, row_of.len(), &cons, true);
    let tris = res.tris.iter().map(|&v| row_of[v as usize] as i32).collect();
    Dtm { tris, npts: row_of.len(), skipped: res.skipped, flips: res.flips }
}
