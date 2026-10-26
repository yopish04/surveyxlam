"""Read / write Surpac BINARY string files (.str), as found in the global progress files.

Layout (learned from 2026_10_26_update_topo_*.str):
  line 1  text header  "<name>,<date>,<...>\\r\\n"
  line 2  text axis line "0,   0.000, ... \\r\\n"
  then 5 zero bytes, then records:
      int32 big-endian   string number (0 = end of a string)
      float64 big-endian Y (northing), X (easting), Z
      description bytes, NUL-terminated (e.g. b"202,27-May-26,RTK_SMA")
  the last record is string 0 with description "END"
"""
import struct

REC = struct.Struct('>iddd')


def read_header(path):
    with open(path, 'rb') as f:
        return f.readline(), f.readline()


def iter_records(path, chunk=1 << 24):
    """Yields (string, y, x, z, desc_bytes). Streams the file in chunks."""
    with open(path, 'rb') as f:
        f.readline(); f.readline()
        buf = f.read(chunk)
        pos = 5 if buf[:5] == b'\x00' * 5 else 0
        while True:
            if len(buf) - pos < REC.size + 256:
                more = f.read(chunk)
                if more:
                    buf = buf[pos:] + more; pos = 0
            if len(buf) - pos < REC.size:
                return
            num, y, x, z = REC.unpack_from(buf, pos)
            e = buf.find(b'\x00', pos + REC.size)
            if e < 0:
                e = len(buf)
            desc = buf[pos + REC.size:e]
            yield num, y, x, z, desc
            if num == 0 and desc.rstrip().endswith(b'END'):
                return
            pos = e + 1


def iter_strings(path):
    """Yields lists of records, one list per string segment (the 0 separators removed)."""
    seg = []
    for r in iter_records(path):
        if r[0] == 0:
            if seg: yield seg
            seg = []
        else:
            seg.append(r)
    if seg: yield seg


class Writer:
    def __init__(self, path, header, axis):
        self.f = open(path, 'wb')
        self.f.write(header); self.f.write(axis); self.f.write(b'\x00' * 5)

    def point(self, num, y, x, z, desc):
        self.f.write(REC.pack(num, y, x, z)); self.f.write(desc); self.f.write(b'\x00')

    def end_string(self):
        self.point(0, 0.0, 0.0, 0.0, b'')

    def close(self):
        self.point(0, 0.0, 0.0, 0.0, b'END')
        self.f.close()
