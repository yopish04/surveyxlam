import sys,os,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import raw2str as auto
from shapely.geometry import Polygon
from shapely.ops import unary_union
D=sys.argv[1]; OUT=sys.argv[2]; os.makedirs(OUT,exist_ok=True)
args=dict(a.split('=') for a in sys.argv[3:])
lg=float(args.get('gap',8)); al=float(args.get('link',20)); k=int(args.get('k',8))
jobs={'261026_pit_tofu3':['26-10-2026DS-PIT-TF03_26-10-2026DS-PIT-TF03_20261026084333.txt','26-10-2026-PIT-TOFU-03.txt','26102026-PIT-TF03-DS1.txt','20261026-pit-tofu-3.txt'],
'261026_pit_tofu9':['26102026_PitTf9.txt','26102026_TOPO_PIT_TF9.txt'],
'261026_quarry_tofu1':['26102026_TOPO_QUARI_TF1.txt'],
'261026_rehandling_ld03':['26-10-2026REHENDLING-TF03_26-10-2026REHENDLING-TF03_20261026084500.txt','26-10-2026-REHENDLING-LD-03.txt']}
def readstr(f):
    segs=[];cur=[]
    for l in open(f,encoding='latin1').read().splitlines()[2:]:
        p=[x.strip() for x in l.split(',')]
        if p[0]=='0':
            if cur: segs.append(cur); cur=[]
            continue
        cur.append((int(p[0]),round(float(p[1]),3),round(float(p[2]),3)))
    return segs
def edges(segs,num):
    E=set()
    for s in segs:
        if s[0][0]!=num: continue
        for a,b in zip(s,s[1:]):
            if a[1:]!=b[1:]: E.add(frozenset([a[1:],b[1:]]))
    return E
def bpoly(segs):
    ps=[Polygon([(x[2],x[1]) for x in s]) for s in segs if s[0][0]==1 and len(s)>3]
    return unary_union([p.buffer(0) for p in ps])
tot=collections.Counter()
for name,files in jobs.items():
    out=os.path.join(OUT,name+'_AUTO.str')
    s,rep,areas=auto.convert([os.path.join(D,f) for f in files],out,name+'_auto','26-Oct-26',lg,al,k)
    M=readstr(os.path.join(D,name+'.str')); A=readstr(out)
    line=[]
    for num,lab in ((5,'crest'),(6,'toe')):
        em,ea=edges(M,num),edges(A,num); tp=len(em&ea)
        tot[lab+'tp']+=tp; tot[lab+'m']+=len(em); tot[lab+'a']+=len(ea)
        line.append(f"{lab}: cocok {tp}/{len(em)} sambungan manual ({100*tp/max(1,len(em)):.0f}%), auto ekstra {len(ea)-tp}")
    pm,pa=bpoly(M),bpoly(A)
    iou=pm.intersection(pa).area/pm.union(pa).area
    nb_m=sum(1 for x in M if x[0][0]==1); nb_a=sum(1 for x in A if x[0][0]==1)
    print(f"== {name}: area={len(areas)} | boundary manual {nb_m} vs auto {nb_a}, luas {pm.area:.0f} vs {pa.area:.0f} m2, IoU {iou:.3f}")
    print('   '+' | '.join(line), '|', dict(rep))
for lab in ('crest','toe'):
    print(f"TOTAL {lab}: {tot[lab+'tp']}/{tot[lab+'m']} = {100*tot[lab+'tp']/tot[lab+'m']:.1f}% recall, precision {100*tot[lab+'tp']/tot[lab+'a']:.1f}%")
