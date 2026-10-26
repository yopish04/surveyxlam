"""One day in, all Surpac strings out:
  folder of raw .txt  ->  <yymmdd>_<area>.str per area (+ _jalan.str, _LAPORAN.txt)
                      ->  <yymmdd>_exa_ds.str / <yymmdd-1>_exa_ns.str
                      ->  gabung/<yymmdd>.str (all areas together)

python3 proses_harian.py <folder with .txt> <output folder>
"""
import sys, os, glob, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raw2str
from kelompok_area import group


def main(folder, out):
    files = sorted(glob.glob(os.path.join(folder, '*.txt')))
    dates = [raw2str.file_date(f) for f in files if raw2str.file_date(f)]
    day = datetime.date(*max(dates)) if dates else datetime.date.today()
    tag, sdate = day.strftime('%d%m%y'), day.strftime('%d-%b-%y')
    os.makedirs(os.path.join(out, 'gabung'), exist_ok=True)

    groups, skipped = group(files)
    all_strings = []
    for area, fs in groups.items():
        title = f'{tag}_{area}'
        strings, rep, areas = raw2str.convert(fs, os.path.join(out, title + '.str'), title, sdate)
        all_strings += strings
        print(f'{title}.str  <- {len(fs)} file, {len(areas)} area | ' +
              ', '.join(f'{k}: {v}' for k, v in rep.items() if v))

    warn = []
    for shift, pts in raw2str.excavator_points(files, warn).items():
        if not pts: continue
        d = day if shift == 'ds' else day - datetime.timedelta(days=1)
        title = f"{d.strftime('%d%m%y')}_exa_{shift}"
        raw2str.write_exca(os.path.join(out, title + '.str'), title, sdate, pts)
        print(f'{title}.str  <- {len(pts)} unit')

    for w in warn: print('  PERLU DIPILIH:', w)
    raw2str.write_str(os.path.join(out, 'gabung', tag + '.str'), tag, sdate, all_strings)
    print(f'gabung/{tag}.str  <- semua area')
    if skipped:
        print('tidak dikelompokkan (exca/GCP/kosong):', [os.path.basename(f) for f in skipped])


if __name__ == '__main__':
    main(*sys.argv[1:3])
