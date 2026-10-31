//! Paket biner frontend <-> Rust: [u32 LE panjang JSON][JSON][bagian-bagian, tiap bagian dibulatkan ke kelipatan 8 byte].
//! JSON berisi "lens": panjang tiap bagian (byte).
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};

pub fn header(r: &Request<'_>, k: &str) -> Result<String, String> {
    let v = r.headers().get(k).ok_or_else(|| format!("header {k} tidak ada"))?.to_str().map_err(|e| e.to_string())?;
    Ok(pct_decode(v))
}
pub fn body(r: &Request<'_>) -> Result<Vec<u8>, String> {
    match r.body() { InvokeBody::Raw(d) => Ok(d.clone()), _ => Err("data harus dikirim sebagai biner".into()) }
}
/// kebalikan encodeURIComponent
pub fn pct_decode(s: &str) -> String {
    let b = s.as_bytes(); let mut out = Vec::with_capacity(b.len()); let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]); i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
const fn pad8(n: usize) -> usize { (n + 7) / 8 * 8 }
pub fn unpack(b: &[u8]) -> Result<(Value, Vec<&[u8]>), String> {
    if b.len() < 4 { return Err("paket kosong".into()); }
    let l = u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize;
    if 4 + l > b.len() { return Err("paket rusak".into()); }
    let head: Value = serde_json::from_slice(&b[4..4 + l]).map_err(|e| e.to_string())?;
    let mut o = pad8(4 + l); let mut parts = Vec::new();
    for n in head["lens"].as_array().cloned().unwrap_or_default() {
        let n = n.as_u64().unwrap_or(0) as usize;
        if o + n > b.len() { return Err("paket terpotong".into()); }
        parts.push(&b[o..o + n]); o += pad8(n);
    }
    Ok((head, parts))
}
pub fn pack(mut head: Value, parts: &[&[u8]]) -> Vec<u8> {
    head["lens"] = Value::from(parts.iter().map(|p| p.len()).collect::<Vec<_>>());
    let hj = serde_json::to_vec(&head).unwrap_or_default();
    let mut out = Vec::with_capacity(pad8(4 + hj.len()) + parts.iter().map(|p| pad8(p.len())).sum::<usize>());
    out.extend((hj.len() as u32).to_le_bytes()); out.extend(&hj); out.resize(pad8(4 + hj.len()), 0);
    for p in parts { out.extend_from_slice(p); out.resize(pad8(out.len()), 0); }
    out
}
pub fn f64s(b: &[u8]) -> Vec<f64> { b.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect() }
pub fn i32s(b: &[u8]) -> Vec<i32> { b.chunks_exact(4).map(|c| i32::from_le_bytes(c.try_into().unwrap())).collect() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bolak_balik() {
        let a: Vec<u8> = vec![1, 2, 3]; let b: Vec<u8> = (0..16).collect();
        let p = pack(serde_json::json!({"x": 5}), &[&a, &b]);
        let (h, parts) = unpack(&p).unwrap();
        assert_eq!(h["x"], 5); assert_eq!(parts[0], &a[..]); assert_eq!(parts[1], &b[..]);
        assert_eq!(pct_decode("D%3A%5Cyopi%5Ca%20b.str"), "D:\\yopi\\a b.str");
    }
}
