#!/bin/bash
# Uji TXT ke STR: port JavaScript (viewer/src/raw.js) harus sama byte per byte dengan
# riset/prototipe/proses_job.py. Data mentah sintetis dibuat oleh gen_raw.py (data asli tidak di repo).
# pakai: viewer/uji/run_raw_parity.sh [jumlah set data, default 5]
set -e
R=$(cd "$(dirname "$0")/../.." && pwd); W=$(mktemp -d); N=${1:-5}
dirs=()
for s in $(seq 1 "$N"); do python3 -I "$R/viewer/uji/gen_raw.py" "$W/in$s" "$s"; dirs+=("$W/in$s"); done
node "$R/viewer/uji/raw_parity.js" "$R/viewer/src/raw.js" "$R/riset/prototipe" "${dirs[@]}" | grep -E "^==|BEDA|TIDAK|GAGAL|SEMUA"
rm -rf "$W"
