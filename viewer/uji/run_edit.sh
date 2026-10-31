#!/bin/bash
# Uji edit Tahap 1 (Point move/insert/delete/properties, Segment delete/reverse/renumber/break/join, undo/redo)
# dengan klik mouse sungguhan. Tiap hasil Save layer dibandingkan byte per byte dengan operasi yang sama di
# Python (riset/volume/progres.py baca/tulis = Excel), untuk file .str teks dan biner.
# pakai: viewer/uji/run_edit.sh   (butuh node + playwright, python3)
set -e
R=$(cd "$(dirname "$0")/../.." && pwd); W=$(mktemp -d)
python3 -I "$R/viewer/uji/gen_raw.py" "$W/in" 1
printf "FOLDER_IN=$W/in\nFOLDER_OUT=$W/str\nDATE=auto\nLABEL=RTK_SMA\nAREA|pit_tofu3|harian|26-10-2026-PIT-TOFU-03_DS.txt;26102026_PIT_TF3.txt\n" > "$W/job.txt"
python3 "$R/riset/prototipe/proses_job.py" "$W/job.txt" >/dev/null
cp "$W/str/261026_pit_tofu3.str" "$W/uji_edit.str"
python3 -c "import sys; sys.path.insert(0, '$R/riset/volume'); import progres; g = progres.baca('$W/uji_edit.str'); progres.tulis('$W/uji_edit_bin.str', g['head'], g['segs'], True, g['axis'])"
python3 "$R/viewer/build.py" >/dev/null
for f in uji_edit.str uji_edit_bin.str; do echo "== $f"; node "$R/viewer/uji/uji_edit.js" "$R/viewer/SMA_Viewer.html" "$R" "$W/$f" "$W"; done
rm -rf "$W"
