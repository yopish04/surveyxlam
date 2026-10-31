#!/bin/bash
# Uji kursor & mouse ala Surpac (2D: pilih garis, menu kanan, fungsi, snap; 3D: snap Bidang/Titik/Garis/DTM,
# camera target) dengan event mouse sungguhan di Chromium (Playwright). Data topo/boundary sintetis.
# pakai: viewer/uji/run_kursor.sh   (butuh node + playwright)
set -e
R=$(cd "$(dirname "$0")/../.." && pwd); W=$(mktemp -d)
mkdir -p "$W/D/yopi" "$W/Z/SMA"
python3 -I "$R/viewer/uji/gen_topo.py" "$W" >/dev/null
python3 "$R/viewer/build.py" >/dev/null
node "$R/viewer/uji/uji_kursor.js" "$R/viewer/SMA_Viewer.html" "$W/D/yopi" "$W"
node "$R/viewer/uji/uji_kursor3d.js" "$R/viewer/SMA_Viewer.html" "$W/D/yopi" "$W"
rm -rf "$W"
