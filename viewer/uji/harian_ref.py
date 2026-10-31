"""Rantai acuan Python untuk Proses Harian: proses_job (TXT->STR) -> progres (update harian, = Excel)
-> cdt2 (CREATE DTM, = TIN Surpac) -> volume.cut_fill (grid halus). Bandingkan dengan hasil aplikasi."""
import sys, os, datetime, filecmp, subprocess, shutil
R = sys.argv[1]; K = sys.argv[2]; OUT = sys.argv[3]
sys.path.insert(0, R + '/riset/volume'); sys.path.insert(0, R + '/riset/prototipe')
import numpy as np, progres, strio, tin, volume
os.makedirs(OUT, exist_ok=True)
# 1. TXT -> STR (job sama dengan yang dibuat aplikasi)
job = f'{OUT}/job.txt'
open(job, 'w').write(f"FOLDER_IN={K}/mentah\nFOLDER_OUT={OUT}/STR\nDATE=auto\nLABEL=RTK_SMA\n"
    "AREA|pit_tofu3|harian|26-10-2026-PIT-TOFU-03_DS.txt;26102026_PIT_TF3.txt\n")
subprocess.run(['python3', R + '/riset/prototipe/proses_job.py', job], check=True, capture_output=True)
h = f'{OUT}/STR/261026_pit_tofu3.str'
print('STR harian sama dengan aplikasi:', filecmp.cmp(h, f'{K}/STR/261026_pit_tofu3.str', shallow=False))
# 2. update harian (= Excel "Jalankan Update")
tgl = datetime.date(2026, 10, 26)
g, b = f'{K}/2026_10_25_update_topo_pit_tofu3.str', f'{K}/2026_10_25_update_topo_pit_tofu3_bdy.str'
og, ob = f'{OUT}/2026_10_26_update_topo_pit_tofu3.str', f'{OUT}/2026_10_26_update_topo_pit_tofu3_bdy.str'
progres.jalankan_potong(g, [h], 1, 'dalam', [h], og, tgl, False, 2.0)
progres.jalankan_bdy(b, 1, [h], 1, 'tambah', ob, tgl)
for f in ['2026_10_26_update_topo_pit_tofu3.str', '2026_10_26_update_topo_pit_tofu3_CEK.str', '2026_10_26_update_topo_pit_tofu3_bdy.str']:
    print(f'{f}: sama byte per byte =', os.path.exists(f'{OUT}/{f}') and filecmp.cmp(f'{OUT}/{f}', f'{K}/{f}', shallow=False))
# 3. DTM
def tinf(p):
    segs = strio.read_str(p)[1]; P, T, sk, _ = tin.build_tin_cdt2(segs, spot=tuple(range(500, 1000))); return P, T, sk
Pn, Tn, skn = tinf(og); Pb, Tb, _ = tinf(f'{K}/base_pit_tofu3.str'); Po, To, _ = tinf(g)
print('DTM global baru (Python cdt2):', len(Tn), 'segitiga, breakline dilewati', skn)
# 4. volume (grid 0,05 m)
rings = lambda p: volume.boundary_rings(strio.read_str(p)[1], 1)
v = volume.cut_fill((Pb, Tb), (Pn, Tn), rings(ob), h=0.05)
vo = volume.cut_fill((Pb, Tb), (Po, To), rings(b), h=0.05)
print(f"volume Python: nett {v['nett']:,.3f} (cut {v['cut']:,.3f}, fill {v['fill']:,.3f}); kemarin {vo['nett']:,.3f}; hari ini {v['nett'] - vo['nett']:,.3f}")
