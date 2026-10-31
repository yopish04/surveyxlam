#!/bin/bash
# Uji report Excel (viewer/src/xlsx.js): template bawaan + template kustom (buatan openpyxl: shared strings,
# format angka, rumus SUM, sheet kedua) diisi, lalu diperiksa dengan openpyxl dan dihitung ulang LibreOffice.
# pakai: viewer/uji/run_report.sh   (butuh node, python3 + openpyxl; LibreOffice opsional)
set -e
R=$(cd "$(dirname "$0")/../.." && pwd); W=$(mktemp -d); cd "$W"
python3 - <<'PY'
from openpyxl import Workbook
wb = Workbook(); ws = wb.active; ws.title = 'Harian'
ws['A1'] = 'LAPORAN PRODUKSI'; ws['A2'] = 'Tanggal: {{tanggal}}'
for i in (1, 2, 3):
    for c, k in zip('ABCD', ('area', 'nett', 'nett_kemarin', 'hari_ini')): ws[f'{c}{4+i}'] = f'{{{{{i}.{k}}}}}'
ws['D9'] = '=SUM(D5:D7)'; ws['A11'] = 'Pit tofu3 hari ini: {{pit_tofu3.hari_ini}} m3'
wb.create_sheet('Catatan')['A1'] = 'tidak diubah'
wb.save('template_kustom.xlsx')
PY
node "$R/viewer/uji/uji_xlsx.js" "$R/viewer/src/xlsx.js"
python3 -W error::UserWarning - <<'PY'
from openpyxl import load_workbook
a = load_workbook('hasil_bawaan.xlsx').active; b = load_workbook('hasil_kustom.xlsx')
ok = [a['B5'].value == 'pit_tofu3', a['J5'].value == -119065.63, a['H15'].value == -150072.73, a['B2'].value == '2026-10-26',
      b['Harian']['D5'].value == -119065.63, b['Harian']['D9'].value == '=SUM(D5:D7)', b['Catatan']['A1'].value == 'tidak diubah',
      b['Harian']['A11'].value == 'Pit tofu3 hari ini: -119065.630 m3', b.calculation.fullCalcOnLoad]
left = [c.coordinate for ws in (a, b['Harian']) for r in ws.iter_rows() for c in r if isinstance(c.value, str) and '{{' in c.value]
print('report Excel:', 'OK' if all(ok) and not left else f'GAGAL {ok} sisa {left}')
PY
if command -v soffice >/dev/null; then soffice --headless --convert-to csv hasil_kustom.xlsx >/dev/null 2>&1 && echo "LibreOffice: SUM = $(sed -n 9p hasil_kustom.csv | cut -d, -f4)"; fi
rm -rf "$W"
