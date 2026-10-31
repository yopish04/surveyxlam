"""Operasi edit acuan dengan progres.baca/tulis (= Python/Excel). pakai: ref_edit.py <repo> <in.str> <ops.json> <out.str>
ops: [["ptDel",k,j], ["ptEdit",k,j,n,e,z,desc], ["segRev",k], ["segRenum",k,n], ["segBreak",k,j], ["segJoin",ka,endA,kb,endB], ["ptMove",k,j,n,e,z], ["segDel",k]]"""
import sys, json
sys.path.insert(0, sys.argv[1] + '/riset/volume'); import progres
g = progres.baca(sys.argv[2]); segs = [list(s) for s in g['segs']]
for op in json.load(open(sys.argv[3])):
    t = op[0]
    if t == 'ptDel': del segs[op[1]][op[2]]
    elif t == 'segRev': segs[op[1]].reverse()
    elif t == 'segRenum': segs[op[1]] = [(op[2],) + r[1:] for r in segs[op[1]]]
    elif t == 'segBreak':
        s = segs[op[1]]; j = op[2]
        if len(s) > 2 and s[0][1:3] == s[-1][1:3]:          # tertutup: dibuka di titik ini
            ring = s[:-1]; j %= len(ring); segs[op[1]] = ring[j:] + ring[:j + 1]
        else: segs[op[1]:op[1] + 1] = [s[:j + 1], s[j:]]
    elif t == 'ptEdit':
        r = segs[op[1]][op[2]]; segs[op[1]][op[2]] = (r[0], op[3], op[4], op[5], op[6])
    elif t == 'segJoin':
        a, b = segs[op[1]][:], segs[op[3]][:]
        if op[2] == 0: a.reverse()
        if op[4] == 1: b.reverse()
        if a[-1][1:4] == b[0][1:4]: b = b[1:]
        num = a[0][0]; segs[op[1]] = a + [(num,) + r[1:] for r in b]; del segs[op[3]]
    elif t == 'ptMove':
        r = segs[op[1]][op[2]]; segs[op[1]][op[2]] = (r[0], op[3], op[4], op[5], r[4])
    elif t == 'segDel': del segs[op[1]]
progres.tulis(sys.argv[4], g['head'], segs, g['binary'], g['axis'])
