#!/bin/bash
# Uji Proses Harian (satu klik): data mentah sintetis + folder kerja (global lama, boundary lama, base),
# jalankan di aplikasi (Chromium + Tauri tiruan), lalu bandingkan dengan rantai acuan Python:
# proses_job (TXT->STR) -> progres (update harian = Excel) -> cdt2 (DTM = Surpac) -> volume.cut_fill.
# pakai: viewer/uji/run_harian.sh   (butuh node + playwright, python3 + numpy scipy matplotlib)
set -e
R=$(cd "$(dirname "$0")/../.." && pwd); W=$(mktemp -d)
mkdir -p "$W/W/D/kerja"
python3 -I "$R/viewer/uji/gen_raw.py" "$W/W/D/kerja/mentah" 1
python3 -I "$R/viewer/uji/gen_kerja.py" "$W/W/D/kerja"
python3 "$R/viewer/build.py" >/dev/null && python3 "$R/desktop/app/scripts/prepare.py" >/dev/null
node "$R/viewer/uji/uji_harian.js" "$W/W" "$R/desktop/app/dist/index.html" "$W"
python3 "$R/viewer/uji/harian_ref.py" "$R" "$W/W/D/kerja" "$W/ref"
python3 "$R/viewer/uji/cek_dtm.py" "$R" "$W/W/D/kerja/2026_10_26_update_topo_pit_tofu3.dtm" "$W/W/D/kerja/2026_10_26_update_topo_pit_tofu3.str"
rm -rf "$W"
