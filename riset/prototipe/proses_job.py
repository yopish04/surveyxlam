"""Run a job list exactly like the Excel panel will (Area / Jalan / Exca rows).
Reference implementation used to check the VBA port line by line.

Job file (one item per line, '|' separated, files ';' separated):
  FOLDER_IN=<folder with .txt>      FOLDER_OUT=<folder for .str>
  DATE=25-Oct-26                    TAG=251026
  AREA|pit_tofu3|harian|a.txt;b.txt
  JALAN|jalan|7
  EXCA|exa_ds|AREA                  (unit codes taken from all area files)
  EXCA|exa_ns|x.txt;y.txt           (unit codes taken from these files)
Names without a 6-digit date prefix get TAG_ in front.
"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import raw2str


def full(tag, name):
    return name if re.match(r'^\d{6}_', name) else f'{tag}_{name}'


def run(job_path):
    cfg, rows = {}, []
    for l in open(job_path, encoding='utf-8').read().splitlines():
        l = l.strip()
        if not l or l.startswith('#'): continue
        if '=' in l and '|' not in l:
            k, v = l.split('=', 1); cfg[k.strip()] = v.strip()
        else:
            rows.append([x.strip() for x in l.split('|')])
    fin, fout, date, tag = cfg['FOLDER_IN'], cfg['FOLDER_OUT'], cfg['DATE'], cfg['TAG']
    os.makedirs(fout, exist_ok=True)
    area_files, road, gabung = [], [], []
    for r in rows:
        if r[0] != 'AREA': continue
        files = [os.path.join(fin, f) for f in r[3].split(';') if f]
        area_files += files
        title = full(tag, r[1])
        s, rep, areas = raw2str.convert(files, os.path.join(fout, title + '.str'), title, date,
                                        profile=r[2], road_sink=road)
        gabung += s
        print(f'{title}.str: {len(areas)} area | ' + ', '.join(f'{k}: {v}' for k, v in rep.items() if v))
    for r in rows:
        if r[0] == 'JALAN':
            title = full(tag, r[1])
            if road:
                raw2str.write_str(os.path.join(fout, title + '.str'), title, date, road)
                print(f'{title}.str: {len(road)} string jalan')
            else:
                print(f'{title}: 0 titik kode 7, file tidak dibuat')
        if r[0] == 'EXCA':
            title = full(tag, r[1])
            files = area_files if r[2] == 'AREA' else [os.path.join(fin, f) for f in r[2].split(';') if f]
            units, warn, spread = first_shots(files)
            raw2str.write_exca(os.path.join(fout, title + '.str'), title, date, units)
            raw2str.write_check_str(os.path.join(fout, title + '_CEK.str'), title + '_CEK', date,
                [(raw2str.CEK_EXCA, [p], f"CEK_EXCA,{p['code']},tembakan {i + 1} dari {len(ps)}")
                 for ps in spread for i, p in enumerate(ps)])
            print(f'{title}.str: {len(units)} unit')
            for w in warn: print('   PERLU DIPILIH:', w)
    os.makedirs(os.path.join(fout, 'gabung'), exist_ok=True)
    raw2str.write_str(os.path.join(fout, 'gabung', tag + '.str'), tag, date, gabung)


def first_shots(files, spread_max=1.0):
    """One point per unit code: the first shot; warn when shots lie > spread_max apart."""
    shots = {}
    for f in files:
        for p in raw2str.read_raw(f):
            if 'EXCA' in raw2str.classify(p['code']):
                shots.setdefault(p['code'], []).append(dict(p, name=p['code']))
    units, warn, far = [], [], []
    for code, ps in shots.items():
        units.append(ps[0])
        spread = max(raw2str.d(a, b) for a in ps for b in ps)
        if spread > spread_max:
            warn.append(f'{code}: {len(ps)} tembakan berjarak sampai {spread:.1f} m (dipakai yang pertama)')
            far.append(ps)
    return units, warn, far


if __name__ == '__main__':
    run(sys.argv[1])
