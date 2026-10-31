//! DTM CUT AND FILL VOLUMES eksak. Port dari viewer/src/vol.js, dijalankan paralel di semua core CPU.
//! d = DTM kedua - DTM pertama linear di tiap irisan segitiga; irisan dipotong garis d = 0 lalu diintegralkan
//! di dalam boundary (teorema Green + penelusuran masuk/keluar ring). Tiap segmen boundary dihitung sendiri.
use std::collections::HashMap;

pub struct Tin<'a> { pub x: &'a [f64], pub y: &'a [f64], pub z: &'a [f64], pub tris: &'a [i32] }

#[derive(Debug, Default, Clone, Copy)]
pub struct Vol { pub cut: f64, pub cut_area: f64, pub fill: f64, pub fill_area: f64, pub common: f64, pub nett: f64 }

struct TriGrid { a0: f64, b0: f64, cs: f64, nx: usize, ny: usize, cnt: Vec<u32>, list: Vec<u32> }

fn tri_grid(d: &Tin) -> TriGrid {
    let t = d.tris; let n = t.len() / 3;
    let (mut a0, mut b0, mut a1, mut b1) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for &v in t { let (x, y) = (d.x[v as usize], d.y[v as usize]); a0 = a0.min(x); a1 = a1.max(x); b0 = b0.min(y); b1 = b1.max(y); }
    let cs = (((a1 - a0) * (b1 - b0) / n.max(1) as f64).sqrt() * 1.5).max(0.2);
    let nx = ((a1 - a0) / cs).ceil() as usize + 1; let ny = ((b1 - b0) / cs).ceil() as usize + 1;
    let bb: Vec<[usize; 4]> = (0..n).map(|j| {
        let (p, q, r) = (t[3 * j] as usize, t[3 * j + 1] as usize, t[3 * j + 2] as usize);
        [((d.x[p].min(d.x[q]).min(d.x[r]) - a0) / cs).floor() as usize, ((d.x[p].max(d.x[q]).max(d.x[r]) - a0) / cs).floor() as usize,
         ((d.y[p].min(d.y[q]).min(d.y[r]) - b0) / cs).floor() as usize, ((d.y[p].max(d.y[q]).max(d.y[r]) - b0) / cs).floor() as usize]
    }).collect();
    let mut cnt = vec![0u32; nx * ny + 1];
    for b in &bb { for yy in b[2]..=b[3] { for xx in b[0]..=b[1] { cnt[yy * nx + xx + 1] += 1; } } }
    for c in 0..nx * ny { cnt[c + 1] += cnt[c]; }
    let mut fill: Vec<u32> = cnt[..nx * ny].to_vec(); let mut list = vec![0u32; cnt[nx * ny] as usize];
    for (j, b) in bb.iter().enumerate() { for yy in b[2]..=b[3] { for xx in b[0]..=b[1] { let c = yy * nx + xx; list[fill[c] as usize] = j as u32; fill[c] += 1; } } }
    TriGrid { a0, b0, cs, nx, ny, cnt, list }
}

struct Ring { r: Vec<f64>, m: usize, a0: f64, b0: f64, a1: f64, b1: f64, cs: f64, nx: usize, ny: usize, cells: HashMap<usize, Vec<usize>>, rows: Vec<Vec<usize>> }

fn ring_index(r: Vec<f64>) -> Ring {
    let m = r.len() / 2;
    let (mut a0, mut b0, mut a1, mut b1) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
    for i in 0..m { a0 = a0.min(r[2 * i]); a1 = a1.max(r[2 * i]); b0 = b0.min(r[2 * i + 1]); b1 = b1.max(r[2 * i + 1]); }
    let cs = (((a1 - a0) * (b1 - b0) / m.max(1) as f64).sqrt() * 2.0).max(0.5);
    let nx = ((a1 - a0) / cs).ceil() as usize + 1; let ny = ((b1 - b0) / cs).ceil() as usize + 1;
    let mut cells: HashMap<usize, Vec<usize>> = HashMap::new(); let mut rows = vec![Vec::new(); ny];
    for i in 0..m {
        let j = (i + 1) % m; let (x1, y1, x2, y2) = (r[2 * i], r[2 * i + 1], r[2 * j], r[2 * j + 1]);
        let ia = ((x1.min(x2) - a0) / cs).floor() as usize; let ib = ((x1.max(x2) - a0) / cs).floor() as usize;
        let ja = ((y1.min(y2) - b0) / cs).floor() as usize; let jb = ((y1.max(y2) - b0) / cs).floor() as usize;
        for yy in ja..=jb { rows[yy].push(i); for xx in ia..=ib { cells.entry(yy * nx + xx).or_default().push(i); } }
    }
    Ring { r, m, a0, b0, a1, b1, cs, nx, ny, cells, rows }
}
fn in_ring(g: &Ring, x: f64, y: f64) -> bool {
    if x < g.a0 || x > g.a1 || y < g.b0 || y > g.b1 { return false; }
    let row = &g.rows[(g.ny - 1).min(((y - g.b0) / g.cs).floor() as usize)];
    let mut c = false;
    for &i in row {
        let j = (i + 1) % g.m; let (x1, y1, x2, y2) = (g.r[2 * i], g.r[2 * i + 1], g.r[2 * j], g.r[2 * j + 1]);
        if (y1 > y) != (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1) { c = !c; }
    }
    c
}
fn edges_near(g: &Ring, x0: f64, y0: f64, x1: f64, y1: f64, stamp: &mut [u32], tag: u32, out: &mut Vec<usize>) {
    out.clear();
    let fl = |v: f64| if v < 0.0 { 0usize } else { v.floor() as usize };
    let ia = fl((x0 - g.a0) / g.cs); let ib = (g.nx - 1).min(fl((x1 - g.a0) / g.cs));
    let ja = fl((y0 - g.b0) / g.cs); let jb = (g.ny - 1).min(fl((y1 - g.b0) / g.cs));
    if ia > ib || ja > jb { return; }
    for yy in ja..=jb { for xx in ia..=ib {
        if let Some(c) = g.cells.get(&(yy * g.nx + xx)) { for &e in c { if stamp[e] != tag { stamp[e] = tag; out.push(e); } } }
    } }
}

fn clip_half(p: &[f64], a: f64, b: f64, c: f64) -> Vec<f64> {
    let n = p.len() / 2; let mut out = Vec::with_capacity(p.len() + 4);
    for i in 0..n {
        let j = (i + 1) % n; let (x1, y1, x2, y2) = (p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
        let (f1, f2) = (a + b * x1 + c * y1, a + b * x2 + c * y2);
        if f1 >= 0.0 { out.push(x1); out.push(y1); }
        if (f1 >= 0.0) != (f2 >= 0.0) { let t = f1 / (f1 - f2); out.push(x1 + t * (x2 - x1)); out.push(y1 + t * (y2 - y1)); }
    }
    let mut o2: Vec<f64> = Vec::with_capacity(out.len());
    let mut i = 0;
    while i < out.len() {
        let l = o2.len();
        if l == 0 || (out[i] - o2[l - 2]).abs() > 1e-9 || (out[i + 1] - o2[l - 1]).abs() > 1e-9 { o2.push(out[i]); o2.push(out[i + 1]); }
        i += 2;
    }
    while o2.len() >= 4 && (o2[0] - o2[o2.len() - 2]).abs() <= 1e-9 && (o2[1] - o2[o2.len() - 1]).abs() <= 1e-9 { o2.truncate(o2.len() - 2); }
    o2
}
fn clip_tri(mut p: Vec<f64>, t: &[f64; 6]) -> Vec<f64> {
    for k in 0..3 {
        let (ax, ay, bx, by) = (t[2 * k], t[2 * k + 1], t[(2 * k + 2) % 6], t[(2 * k + 3) % 6]);
        p = clip_half(&p, -(bx - ax) * ay + (by - ay) * ax, -(by - ay), bx - ax);
        if p.len() < 6 { return p; }
    }
    p
}
#[inline]
fn seg(x0: f64, y0: f64, x1: f64, y1: f64, f: &[f64; 3]) -> f64 {
    let (dy, dx) = (y1 - y0, x1 - x0);
    dy * (f[0] * (x0 + x1) / 2.0 + f[1] * (x0 * x0 + x0 * x1 + x1 * x1) / 6.0) - f[2] * dx * (y0 * y0 + y0 * y1 + y1 * y1) / 6.0
}
fn poly_int(p: &[f64], f: &[f64; 3]) -> f64 {
    let n = p.len() / 2; let mut s = 0.0;
    for i in 0..n { let j = (i + 1) % n; s += seg(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1], f); }
    s
}
fn perim(p: &[f64], x: f64, y: f64) -> f64 {
    let n = p.len() / 2; let (mut best, mut s) = (f64::INFINITY, 0.0);
    for i in 0..n {
        let k = (i + 1) % n; let (ax, ay) = (p[2 * i], p[2 * i + 1]); let (dx, dy) = (p[2 * k] - ax, p[2 * k + 1] - ay); let l = dx * dx + dy * dy;
        if l == 0.0 { continue; }
        let t = (((x - ax) * dx + (y - ay) * dy) / l).clamp(0.0, 1.0); let (ex, ey) = (ax + t * dx - x, ay + t * dy - y); let d = ex * ex + ey * ey;
        if d < best { best = d; s = i as f64 + t; }
    }
    s
}
fn arc_int(p: &[f64], s0: f64, mut s1: f64, fs: &[[f64; 3]], res: &mut [f64]) {
    let n = p.len() / 2; let nf = n as f64;
    if s1 < s0 { s1 += nf; }
    let pt = |s: f64| { let s = s % nf; let i = (n - 1).min(s.floor() as usize); let t = s - i as f64; let k = (i + 1) % n;
        (p[2 * i] + t * (p[2 * k] - p[2 * i]), p[2 * i + 1] + t * (p[2 * k + 1] - p[2 * i + 1])) };
    let mut a = s0; let (mut ax, mut ay) = pt(a);
    while a < s1 - 1e-15 {
        let b = s1.min(a.floor() + 1.0); let (bx, by) = pt(b);
        for (q, f) in fs.iter().enumerate() { res[q] += seg(ax, ay, bx, by, f); }
        a = b; ax = bx; ay = by;
    }
}
struct Piece { e: usize, t0: f64, t1: f64, ax: f64, ay: f64, bx: f64, by: f64, e0: isize, e1: isize }

fn clip_int(p0: &[f64], g: &Ring, near: &[usize], fs0: &[[f64; 3]]) -> Vec<f64> {
    let (r, m, n) = (&g.r, g.m, p0.len() / 2);
    let mut res = vec![0.0; fs0.len()];
    let (mut cx, mut cy) = (0.0, 0.0); for i in 0..n { cx += p0[2 * i]; cy += p0[2 * i + 1]; } cx /= n as f64; cy /= n as f64;
    let p: Vec<f64> = (0..2 * n).map(|k| p0[k] - if k % 2 == 0 { cx } else { cy }).collect();
    let fs: Vec<[f64; 3]> = fs0.iter().map(|f| [f[0] + f[1] * cx + f[2] * cy, f[1], f[2]]).collect();
    let mut ord = near.to_vec(); ord.sort_unstable();
    let mut segs: Vec<Piece> = Vec::new();
    for &e in &ord {
        let j = (e + 1) % m; let (x0, y0, x1, y1) = (r[2 * e] - cx, r[2 * e + 1] - cy, r[2 * j] - cx, r[2 * j + 1] - cy);
        if x0 == x1 && y0 == y1 { continue; }
        let (mut t0, mut t1, mut e0, mut e1) = (0.0f64, 1.0f64, -1isize, -1isize);
        let mut i = 0;
        while i < n && t0 < t1 {
            let k = (i + 1) % n; let (ax, ay, bx, by) = (p[2 * i], p[2 * i + 1], p[2 * k], p[2 * k + 1]);
            let f0 = (bx - ax) * (y0 - ay) - (by - ay) * (x0 - ax); let f1 = (bx - ax) * (y1 - ay) - (by - ay) * (x1 - ax);
            let tl = 1e-6 * (bx - ax).hypot(by - ay);
            if f0.abs() <= tl && f1.abs() <= tl { t1 = -1.0; break; }
            if f0 < 0.0 && f1 < 0.0 { t1 = -1.0; break; }
            if f0 < 0.0 { let t = f0 / (f0 - f1); if t > t0 { t0 = t; e0 = i as isize; } }
            else if f1 < 0.0 { let t = f0 / (f0 - f1); if t < t1 { t1 = t; e1 = i as isize; } }
            i += 1;
        }
        if !(t1 - t0 > 1e-12) { continue; }
        let (ax, ay, bx, by) = (x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
        for (q, f) in fs.iter().enumerate() { res[q] += seg(ax, ay, bx, by, f); }
        segs.push(Piece { e, t0, t1, ax, ay, bx, by, e0, e1 });
    }
    let on_edge = |i: usize, x: f64, y: f64| {
        let q = (i + 1) % n; let (dx, dy) = (p[2 * q] - p[2 * i], p[2 * q + 1] - p[2 * i + 1]); let l = dx * dx + dy * dy;
        let t = if l != 0.0 { ((x - p[2 * i]) * dx + (y - p[2 * i + 1]) * dy) / l } else { -1.0 };
        if t >= -1e-9 && t <= 1.0 + 1e-9 { i as f64 + t.clamp(0.0, 1.0) } else { perim(&p, x, y) }
    };
    let (mut ent, mut ext) = (Vec::new(), Vec::new()); let k = segs.len();
    for i in 0..k {
        let s = &segs[i]; let pr = &segs[(i + k - 1) % k]; let nx = &segs[(i + 1) % k];
        let linked_prev = s.t0 == 0.0 && pr.t1 == 1.0 && (pr.e + 1) % m == s.e;
        let linked_next = s.t1 == 1.0 && nx.t0 == 0.0 && (s.e + 1) % m == nx.e;
        if !linked_prev { ent.push(if s.e0 >= 0 { on_edge(s.e0 as usize, s.ax, s.ay) } else { perim(&p, s.ax, s.ay) }); }
        if !linked_next { ext.push(if s.e1 >= 0 { on_edge(s.e1 as usize, s.bx, s.by) } else { perim(&p, s.bx, s.by) }); }
    }
    if ent.is_empty() || ext.is_empty() {
        if k == 0 && in_ring(g, cx, cy) { for (q, f) in fs.iter().enumerate() { res[q] += poly_int(&p, f); } }
        return res;
    }
    ent.sort_by(|a, b| a.partial_cmp(b).unwrap());
    for &sx in &ext {
        let se = *ent.iter().find(|&&v| v >= sx).unwrap_or(&ent[0]);
        arc_int(&p, sx, se, &fs, &mut res);
    }
    res
}

fn clean_ring(r: &[f64]) -> Vec<f64> {
    let mut o: Vec<f64> = Vec::new();
    let mut i = 0;
    while i + 1 < r.len() { let l = o.len(); if l == 0 || r[i] != o[l - 2] || r[i + 1] != o[l - 1] { o.push(r[i]); o.push(r[i + 1]); } i += 2; }
    while o.len() >= 4 && o[0] == o[o.len() - 2] && o[1] == o[o.len() - 1] { o.truncate(o.len() - 2); }
    o
}
/// [a, b, c, x1,y1, x2,y2, x3,y3, det] — z = a + b x + c y, segitiga CCW
fn plane(d: &Tin, t: usize, ox: f64, oy: f64) -> [f64; 10] {
    let (p, q, r) = (d.tris[3 * t] as usize, d.tris[3 * t + 1] as usize, d.tris[3 * t + 2] as usize);
    let (x1, y1, x2, y2, x3, y3) = (d.x[p] - ox, d.y[p] - oy, d.x[q] - ox, d.y[q] - oy, d.x[r] - ox, d.y[r] - oy);
    let det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
    let b = ((d.z[q] - d.z[p]) * (y3 - y1) - (d.z[r] - d.z[p]) * (y2 - y1)) / det;
    let c = ((x2 - x1) * (d.z[r] - d.z[p]) - (x3 - x1) * (d.z[q] - d.z[p])) / det;
    let a = d.z[p] - b * x1 - c * y1;
    if det < 0.0 { [a, b, c, x1, y1, x3, y3, x2, y2, -det] } else { [a, b, c, x1, y1, x2, y2, x3, y3, det] }
}

/// first = DTM pertama (base), second = DTM kedua (update); rings: [x0,y0,x1,y1,...] koordinat asli.
pub fn cut_fill(first: &Tin, second: &Tin, rings: &[Vec<f64>], threads: usize) -> Vec<Vol> {
    let g1 = tri_grid(first);
    let n1 = first.tris.len() / 3; let n2 = second.tris.len() / 3;
    let mut out = Vec::new();
    for raw0 in rings {
        let raw = clean_ring(raw0); let m = raw.len() / 2;
        if m < 3 { out.push(Vol::default()); continue; }
        let (mut ox, mut oy) = (0.0, 0.0); for i in 0..m { ox += raw[2 * i]; oy += raw[2 * i + 1]; } ox /= m as f64; oy /= m as f64;
        let mut r: Vec<f64> = (0..2 * m).map(|k| raw[k] - if k % 2 == 0 { ox } else { oy }).collect();
        let mut area = 0.0; for i in 0..m { let j = (i + 1) % m; area += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1]; }
        if area < 0.0 { let mut v: Vec<[f64; 2]> = (0..m).map(|i| [r[2 * i], r[2 * i + 1]]).collect(); v.reverse(); r = v.concat(); }
        let g = ring_index(r);
        let th = threads.max(1); let chunk = (n2 + th - 1) / th;
        let parts: Vec<Vol> = std::thread::scope(|sc| {
            let hs: Vec<_> = (0..th).map(|w| { let (g, g1) = (&g, &g1); sc.spawn(move || {
                let mut acc = Vol::default();
                let mut estamp = vec![0u32; m]; let mut stamp1 = vec![0u32; n1]; let mut tag = 0u32;
                let mut near = Vec::new();
                let (x2, y2, t2) = (second.x, second.y, second.tris);
                for t in w * chunk..((w + 1) * chunk).min(n2) {
                    let (p, q, rr) = (t2[3 * t] as usize, t2[3 * t + 1] as usize, t2[3 * t + 2] as usize);
                    let bx0 = x2[p].min(x2[q]).min(x2[rr]) - ox; let bx1 = x2[p].max(x2[q]).max(x2[rr]) - ox;
                    let by0 = y2[p].min(y2[q]).min(y2[rr]) - oy; let by1 = y2[p].max(y2[q]).max(y2[rr]) - oy;
                    if bx1 < g.a0 || bx0 > g.a1 || by1 < g.b0 || by0 > g.b1 { continue; }
                    tag += 1; edges_near(g, bx0, by0, bx1, by1, &mut estamp, tag, &mut near);
                    if near.is_empty() && !in_ring(g, (bx0 + bx1) / 2.0, (by0 + by1) / 2.0) {
                        let cx = (x2[p] + x2[q] + x2[rr]) / 3.0 - ox; let cy = (y2[p] + y2[q] + y2[rr]) / 3.0 - oy;
                        if !in_ring(g, cx, cy) { continue; }
                    }
                    let pl2 = plane(second, t, ox, oy);
                    if pl2[9] <= 0.0 { continue; }
                    let tri2 = [pl2[3], pl2[4], pl2[5], pl2[6], pl2[7], pl2[8]];
                    let fl = |v: f64| if v < 0.0 { 0usize } else { v.floor() as usize };
                    let ia = fl((bx0 + ox - g1.a0) / g1.cs); let ib = (g1.nx - 1).min(fl((bx1 + ox - g1.a0) / g1.cs));
                    let ja = fl((by0 + oy - g1.b0) / g1.cs); let jb = (g1.ny - 1).min(fl((by1 + oy - g1.b0) / g1.cs));
                    if ia > ib || ja > jb { continue; }
                    tag += 1; let tg = tag;
                    for yy in ja..=jb { for xx in ia..=ib {
                        let c = yy * g1.nx + xx;
                        for k in g1.cnt[c]..g1.cnt[c + 1] {
                            let u = g1.list[k as usize] as usize; if stamp1[u] == tg { continue; } stamp1[u] = tg;
                            let pl1 = plane(first, u, ox, oy);
                            if pl1[9] <= 0.0 { continue; }
                            let poly = clip_tri(tri2.to_vec(), &[pl1[3], pl1[4], pl1[5], pl1[6], pl1[7], pl1[8]]);
                            if poly.len() < 6 || poly_int(&poly, &[1.0, 0.0, 0.0]) < 1e-7 { continue; }
                            let (da, db, dc) = (pl2[0] - pl1[0], pl2[1] - pl1[1], pl2[2] - pl1[2]);
                            let same = da.abs() < 1e-9 && db.abs() < 1e-12 && dc.abs() < 1e-12;
                            let ints = |pp: &[f64], fs: &[[f64; 3]]| -> Vec<f64> { if !near.is_empty() { clip_int(pp, g, &near, fs) } else { fs.iter().map(|f| poly_int(pp, f)).collect() } };
                            if same { acc.common += ints(&poly, &[[1.0, 0.0, 0.0]])[0]; continue; }
                            let pf = clip_half(&poly, da, db, dc); let pc = clip_half(&poly, -da, -db, -dc);
                            if pf.len() >= 6 && poly_int(&pf, &[1.0, 0.0, 0.0]) > 1e-9 { let v = ints(&pf, &[[da, db, dc], [1.0, 0.0, 0.0]]); acc.fill += v[0]; acc.fill_area += v[1]; }
                            if pc.len() >= 6 && poly_int(&pc, &[1.0, 0.0, 0.0]) > 1e-9 { let v = ints(&pc, &[[-da, -db, -dc], [1.0, 0.0, 0.0]]); acc.cut += v[0]; acc.cut_area += v[1]; }
                        }
                    } }
                }
                acc
            }) }).collect();
            hs.into_iter().map(|h| h.join().unwrap()).collect()
        });
        let mut acc = Vol::default();
        for v in parts { acc.cut += v.cut; acc.cut_area += v.cut_area; acc.fill += v.fill; acc.fill_area += v.fill_area; acc.common += v.common; }
        acc.nett = acc.fill - acc.cut;
        out.push(acc);
    }
    out
}

/// ring dari string file: tiap segmen nomor `no` = satu ring
pub fn rings_of(f: &crate::strio::StrFile, no: i32) -> Vec<Vec<f64>> {
    let mut out = Vec::new(); let mut cur = Vec::new();
    for i in 0..f.rows() {
        if f.sn[i] == no { cur.push(f.x[i]); cur.push(f.y[i]); }
        else { if cur.len() >= 6 { out.push(std::mem::take(&mut cur)); } cur.clear(); }
    }
    if cur.len() >= 6 { out.push(cur); }
    out
}
