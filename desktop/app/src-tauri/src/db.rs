//! Riwayat volume harian (SQLite di folder data aplikasi).
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct VolRec {
    #[serde(default)] pub id: i64,
    pub tanggal: String,
    pub pit: String,
    #[serde(default)] pub first_dtm: String,
    #[serde(default)] pub second_dtm: String,
    #[serde(default)] pub bdy: String,
    #[serde(default)] pub string_no: i64,
    pub cut: f64,
    pub fill: f64,
    pub nett: f64,
    #[serde(default)] pub cut_area: f64,
    #[serde(default)] pub fill_area: f64,
    #[serde(default)] pub segments: String,
    #[serde(default)] pub created_at: String,
}

pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let c = Connection::open(path)?;
    c.execute_batch(
        "CREATE TABLE IF NOT EXISTS volumes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tanggal TEXT NOT NULL, pit TEXT NOT NULL,
            first_dtm TEXT, second_dtm TEXT, bdy TEXT, string_no INTEGER,
            cut REAL, fill REAL, nett REAL, cut_area REAL, fill_area REAL,
            segments TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
         CREATE INDEX IF NOT EXISTS vol_pit_tgl ON volumes(pit, tanggal);",
    )?;
    Ok(c)
}

fn row(r: &Row) -> rusqlite::Result<VolRec> {
    Ok(VolRec {
        id: r.get(0)?, tanggal: r.get(1)?, pit: r.get(2)?, first_dtm: r.get(3)?, second_dtm: r.get(4)?, bdy: r.get(5)?, string_no: r.get(6)?,
        cut: r.get(7)?, fill: r.get(8)?, nett: r.get(9)?, cut_area: r.get(10)?, fill_area: r.get(11)?, segments: r.get(12)?, created_at: r.get(13)?,
    })
}
const COLS: &str = "id, tanggal, pit, first_dtm, second_dtm, bdy, string_no, cut, fill, nett, cut_area, fill_area, segments, created_at";

/// simpan; hitungan ulang untuk pit + tanggal + DTM kedua yang sama menggantikan yang lama
pub fn save(c: &Connection, v: &VolRec) -> rusqlite::Result<i64> {
    c.execute("DELETE FROM volumes WHERE pit = ?1 AND tanggal = ?2 AND second_dtm = ?3", params![v.pit, v.tanggal, v.second_dtm])?;
    c.execute(
        "INSERT INTO volumes (tanggal, pit, first_dtm, second_dtm, bdy, string_no, cut, fill, nett, cut_area, fill_area, segments) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![v.tanggal, v.pit, v.first_dtm, v.second_dtm, v.bdy, v.string_no, v.cut, v.fill, v.nett, v.cut_area, v.fill_area, v.segments],
    )?;
    Ok(c.last_insert_rowid())
}
/// volume terakhir pit ini sebelum tanggal tertentu (untuk "nett kemarin")
pub fn last(c: &Connection, pit: &str, before: &str) -> rusqlite::Result<Option<VolRec>> {
    c.query_row(&format!("SELECT {COLS} FROM volumes WHERE pit = ?1 AND tanggal < ?2 ORDER BY tanggal DESC, id DESC LIMIT 1"), params![pit, before], row).optional()
}
pub fn history(c: &Connection, pit: &str, limit: i64) -> rusqlite::Result<Vec<VolRec>> {
    let mut st = c.prepare(&format!("SELECT {COLS} FROM volumes WHERE (?1 = '' OR pit = ?1) ORDER BY tanggal DESC, id DESC LIMIT ?2"))?;
    let rows = st.query_map(params![pit, limit], row)?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn simpan_dan_ambil_kemarin() {
        let c = open(std::path::Path::new(":memory:")).unwrap();
        let mut v = VolRec { tanggal: "2026-10-26".into(), pit: "tofu".into(), second_dtm: "26.dtm".into(), nett: -100.0, ..Default::default() };
        save(&c, &v).unwrap();
        v.tanggal = "2026-10-27".into(); v.second_dtm = "27.dtm".into(); v.nett = -150.0; save(&c, &v).unwrap();
        save(&c, &v).unwrap();                       // hitung ulang tidak menggandakan
        assert_eq!(history(&c, "tofu", 10).unwrap().len(), 2);
        assert_eq!(last(&c, "tofu", "2026-10-27").unwrap().unwrap().nett, -100.0);
    }
}
