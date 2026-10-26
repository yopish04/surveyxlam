import sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
def readstr(f):
    segs=[];cur=[]
    for l in open(f,encoding='latin1').read().splitlines()[2:]:
        p=[x.strip() for x in l.split(',')]
        if p[0]=='0':
            if cur: segs.append(cur); cur=[]
            continue
        cur.append((int(p[0]),float(p[1]),float(p[2])))
    return segs
man,aut,out,title=sys.argv[1:5]
C={1:('#d62728','Boundary (1)',1.6),5:('#1f77b4','Crest (5)',1.1),6:('#2ca02c','Toe (6)',1.1),602:('#bbbbbb','Spot (602)',0.5),23:('#9467bd','Junction (23)',0)}
fig,axs=plt.subplots(1,2,figsize=(16,8),sharex=True,sharey=True)
for ax,f,t in ((axs[0],man,'Manual (kerja Anda)'),(axs[1],aut,'Otomatis (prototipe)')):
    seen=set()
    for s in readstr(f):
        n=s[0][0]; c,lab,w=C.get(n,('k',str(n),1))
        xs=[p[2] for p in s]; ys=[p[1] for p in s]
        kw=dict(label=lab) if n not in seen else {}
        seen.add(n)
        if len(s)==1 or n==23: ax.plot(xs,ys,'o',ms=3,color=c,**kw)
        elif n==602: ax.plot(xs,ys,'.',ms=2,color=c,**kw)
        else: ax.plot(xs,ys,'-',lw=w,color=c,**kw)
    ax.set_title(t,fontsize=13); ax.set_aspect('equal'); ax.grid(alpha=.2); ax.legend(loc='best',fontsize=8)
    ax.set_xlabel('Easting'); 
axs[0].set_ylabel('Northing'); fig.suptitle(title,fontsize=14); fig.tight_layout(); fig.savefig(out,dpi=110)
