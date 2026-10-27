Attribute VB_Name = "SurveyUpdate"
Option Explicit
' =============================================================================
' SurveyUpdate - potong progress & update boundary (Surpac .str teks / biner)
' Port VBA dari riset/volume/progres.py (aturan sama, hasil sama).
'
'   PotongProgres  : buang titik DI DALAM / DI LUAR boundary (satu atau banyak file,
'                    nomor string boundary dipilih), opsional langsung tambah data harian.
'   BoundaryOp     : boundary A + B (TAMBAH), A - B (KURANGI), A x B (IRISAN).
'   UpdateHarian   : global lama dipotong boundary harian + data harian ditambah,
'                    lalu bdy lama + boundary harian -> bdy baru.
' File asal hanya dibaca. Angka ditulis dengan titik desimal, apa pun setelan Windows.
' =============================================================================

Private Const EDGE_TOL As Double = 0.01     ' m: titik di garis boundary = di dalam
Private Const BAND As Double = 5#           ' m: tinggi pita indeks boundary
Private Const KEY_DEC As String = "0.0000"

' ---- boundary untuk potong: beberapa "set" (satu set = satu file, genap-ganjil) ----
Private BX1() As Double, BY1() As Double, BX2() As Double, BY2() As Double, NBE As Long
Private SetE0() As Long, SetE1() As Long                      ' sisi milik set
Private SetX0() As Double, SetX1() As Double, SetY0() As Double, SetY1() As Double
Private SetB0() As Long, SetNB() As Long                     ' pita: indeks awal di BandStart
Private BandStart() As Long, BandCnt() As Long, BandList() As Long, NBand As Long, NBList As Long
Private NSet As Long

' ---- pow2 untuk baca double biner cepat ----
Private Pow2(0 To 2047) As Double, Pow2Ready As Boolean

' ---- data harian (teks/biner) untuk ditambahkan ----
Private HNum() As Long, HY() As Double, HX() As Double, HZ() As Double, HD() As String
Private HSegS() As Long, HSegL() As Long, HSegNum() As Long, NHSeg As Long, NHP As Long

' ---- titik cek ----
Private CkY() As Double, CkX() As Double, CkZ() As Double, CkD() As String, NCk As Long

' ---- penampung teks ----
Private SB() As String, NSB As Long

' ---- statistik ----
Public LastStat As String

' =============================================================================
' 1. POTONG PROGRESS
'   progresPath : file progress (teks atau biner)
'   bdyList     : file boundary dipisah ";"   bdyNo: nomor string boundary
'   mode        : "DALAM" (buang di dalam = Surpac OUTSIDE) atau "LUAR"
'   harianList  : file harian yang ditambahkan (kosong = tidak); string bdyNo-nya tidak ikut
'   outPath     : file hasil (format sama dengan file progress)
'   tgl         : tanggal Surpac untuk header, mis. 27-Oct-26
'   titikPotong : True = tambah titik di garis boundary pada garis yang terpotong
'   cekJarak    : m, ujung garis lama terpotong sedekat ini dari boundary -> _CEK.str (0 = tidak)
' =============================================================================
Public Function PotongProgres(ByVal progresPath As String, ByVal bdyList As String, ByVal bdyNo As Long, _
                              ByVal mode As String, ByVal harianList As String, ByVal outPath As String, _
                              ByVal tgl As String, Optional ByVal titikPotong As Boolean = False, _
                              Optional ByVal cekJarak As Double = 2#) As String
    Dim t0 As Double, files() As String, i As Long, buangDalam As Boolean
    t0 = Timer
    InitPow2
    buangDalam = (UCase(Left(Trim(mode), 1)) <> "L")
    If Not buangDalam Then cekJarak = 0
    ' boundary
    files = Split(bdyList, ";")
    ResetBdy
    For i = 0 To UBound(files)
        If Len(Trim(files(i))) > 0 Then AddBdyFile Trim(files(i)), bdyNo
    Next i
    If NSet = 0 Then Err.Raise vbObjectError + 1, , "Tidak ada boundary string " & bdyNo & " di " & bdyList
    BuildBands
    ' harian
    NHSeg = 0: NHP = 0
    If Len(Trim(harianList)) > 0 Then
        files = Split(harianList, ";")
        For i = 0 To UBound(files)
            If Len(Trim(files(i))) > 0 Then AddHarian Trim(files(i)), bdyNo
        Next i
    End If
    NCk = 0
    Dim st As String, nama As String
    nama = BaseName(outPath)
    If IsBinaryFile(progresPath) Then
        st = PotongBiner(progresPath, outPath, nama, tgl, buangDalam, titikPotong, cekJarak)
    Else
        st = PotongTeks(progresPath, outPath, nama, tgl, buangDalam, titikPotong, cekJarak)
    End If
    If NCk > 0 Then TulisCek StripExt(outPath) & "_CEK.str", nama, tgl
    LastStat = st & "; titik cek " & NCk & "; " & Format(Timer - t0, "0.0") & " s"
    PotongProgres = LastStat
End Function

' ---- boundary sets -------------------------------------------------------------
Private Sub ResetBdy()
    NBE = 0: NSet = 0
    ReDim BX1(0 To 1023): ReDim BY1(0 To 1023): ReDim BX2(0 To 1023): ReDim BY2(0 To 1023)
    ReDim SetE0(0 To 15): ReDim SetE1(0 To 15)
End Sub

Private Sub AddBdyFile(ByVal path As String, ByVal no As Long)
    Dim rx() As Double, ry() As Double, rz() As Double, rd() As String, rs() As Long, rl() As Long, nr As Long
    Dim k As Long, j As Long, n As Long, a As Long, b As Long, e0 As Long
    ReadRings path, no, rx, ry, rz, rd, rs, rl, nr
    If nr = 0 Then Exit Sub
    e0 = NBE
    For k = 0 To nr - 1
        n = rl(k)
        For j = 0 To n - 1
            a = rs(k) + j: b = rs(k) + ((j + 1) Mod n)
            If rx(a) <> rx(b) Or ry(a) <> ry(b) Then
                If NBE > UBound(BX1) Then
                    ReDim Preserve BX1(0 To 2 * NBE): ReDim Preserve BY1(0 To 2 * NBE)
                    ReDim Preserve BX2(0 To 2 * NBE): ReDim Preserve BY2(0 To 2 * NBE)
                End If
                BX1(NBE) = rx(a): BY1(NBE) = ry(a): BX2(NBE) = rx(b): BY2(NBE) = ry(b)
                NBE = NBE + 1
            End If
        Next j
    Next k
    If NBE = e0 Then Exit Sub
    If NSet > UBound(SetE0) Then
        ReDim Preserve SetE0(0 To 2 * NSet)
        ReDim Preserve SetE1(0 To 2 * NSet)
    End If
    SetE0(NSet) = e0: SetE1(NSet) = NBE - 1
    NSet = NSet + 1
End Sub

Private Sub BuildBands()
    Dim s As Long, e As Long, b As Long, b0 As Long, b1 As Long, lo As Double, hi As Double
    ReDim SetX0(0 To NSet - 1): ReDim SetX1(0 To NSet - 1): ReDim SetY0(0 To NSet - 1): ReDim SetY1(0 To NSet - 1)
    ReDim SetB0(0 To NSet - 1): ReDim SetNB(0 To NSet - 1)
    NBand = 0
    For s = 0 To NSet - 1
        SetX0(s) = 1E+300: SetX1(s) = -1E+300: SetY0(s) = 1E+300: SetY1(s) = -1E+300
        For e = SetE0(s) To SetE1(s)
            If BX1(e) < SetX0(s) Then SetX0(s) = BX1(e)
            If BX2(e) < SetX0(s) Then SetX0(s) = BX2(e)
            If BX1(e) > SetX1(s) Then SetX1(s) = BX1(e)
            If BX2(e) > SetX1(s) Then SetX1(s) = BX2(e)
            If BY1(e) < SetY0(s) Then SetY0(s) = BY1(e)
            If BY2(e) < SetY0(s) Then SetY0(s) = BY2(e)
            If BY1(e) > SetY1(s) Then SetY1(s) = BY1(e)
            If BY2(e) > SetY1(s) Then SetY1(s) = BY2(e)
        Next e
        SetB0(s) = NBand
        SetNB(s) = Int((SetY1(s) + EDGE_TOL - SetY0(s)) / BAND) + 2
        NBand = NBand + SetNB(s)
    Next s
    ReDim BandStart(0 To NBand): ReDim BandCnt(0 To NBand)
    ' hitung
    For s = 0 To NSet - 1
        For e = SetE0(s) To SetE1(s)
            BandRange s, e, b0, b1
            For b = b0 To b1
                BandCnt(SetB0(s) + b) = BandCnt(SetB0(s) + b) + 1
            Next b
        Next e
    Next s
    NBList = 0
    For b = 0 To NBand - 1
        BandStart(b) = NBList: NBList = NBList + BandCnt(b): BandCnt(b) = 0
    Next b
    ReDim BandList(0 To NBList)
    For s = 0 To NSet - 1
        For e = SetE0(s) To SetE1(s)
            BandRange s, e, b0, b1
            For b = b0 To b1
                BandList(BandStart(SetB0(s) + b) + BandCnt(SetB0(s) + b)) = e
                BandCnt(SetB0(s) + b) = BandCnt(SetB0(s) + b) + 1
            Next b
        Next e
    Next s
End Sub

Private Sub BandRange(ByVal s As Long, ByVal e As Long, b0 As Long, b1 As Long)
    Dim lo As Double, hi As Double
    lo = BY1(e): hi = BY2(e)
    If hi < lo Then lo = BY2(e): hi = BY1(e)
    b0 = Int((lo - EDGE_TOL - SetY0(s)) / BAND)
    b1 = Int((hi + EDGE_TOL - SetY0(s)) / BAND)
    If b0 < 0 Then b0 = 0
    If b1 > SetNB(s) - 1 Then b1 = SetNB(s) - 1
End Sub

' 1 = di dalam salah satu set (atau di garis), 0 = di luar
Private Function InsideAny(ByVal x As Double, ByVal y As Double) As Boolean
    Dim s As Long
    For s = 0 To NSet - 1
        If InsideSet(s, x, y) Then InsideAny = True: Exit Function
    Next s
End Function

Private Function InsideSet(ByVal s As Long, ByVal x As Double, ByVal y As Double) As Boolean
    Dim b As Long, k As Long, e As Long, c As Boolean
    Dim x1 As Double, y1 As Double, dx As Double, dy As Double, L As Double, t As Double, qx As Double, qy As Double
    If x < SetX0(s) - EDGE_TOL Then Exit Function
    If x > SetX1(s) + EDGE_TOL Then Exit Function
    If y < SetY0(s) - EDGE_TOL Then Exit Function
    If y > SetY1(s) + EDGE_TOL Then Exit Function
    b = Int((y - SetY0(s)) / BAND)
    If b < 0 Then b = 0
    If b > SetNB(s) - 1 Then Exit Function
    b = SetB0(s) + b
    For k = BandStart(b) To BandStart(b) + BandCnt(b) - 1
        e = BandList(k)
        x1 = BX1(e): y1 = BY1(e): dx = BX2(e) - x1: dy = BY2(e) - y1
        L = dx * dx + dy * dy
        t = ((x - x1) * dx + (y - y1) * dy) / L
        If t < 0 Then t = 0
        If t > 1 Then t = 1
        qx = x1 + t * dx - x: qy = y1 + t * dy - y
        If qx * qx + qy * qy <= EDGE_TOL * EDGE_TOL Then InsideSet = True: Exit Function
        If (y1 > y) <> (BY2(e) > y) Then
            If x < x1 + (y - y1) * dx / dy Then c = Not c
        End If
    Next k
    InsideSet = c
End Function

' jarak terdekat ke garis boundary (dibatasi maks)
Private Function DistBdy(ByVal x As Double, ByVal y As Double, ByVal maks As Double) As Double
    Dim s As Long, b As Long, b0 As Long, b1 As Long, k As Long, e As Long, best As Double
    Dim x1 As Double, y1 As Double, dx As Double, dy As Double, L As Double, t As Double, qx As Double, qy As Double
    best = maks * maks + 1
    For s = 0 To NSet - 1
        b0 = Int((y - maks - SetY0(s)) / BAND): b1 = Int((y + maks - SetY0(s)) / BAND)
        If b0 < 0 Then b0 = 0
        If b1 > SetNB(s) - 1 Then b1 = SetNB(s) - 1
        For b = b0 To b1
            For k = BandStart(SetB0(s) + b) To BandStart(SetB0(s) + b) + BandCnt(SetB0(s) + b) - 1
                e = BandList(k)
                x1 = BX1(e): y1 = BY1(e): dx = BX2(e) - x1: dy = BY2(e) - y1
                L = dx * dx + dy * dy
                t = ((x - x1) * dx + (y - y1) * dy) / L
                If t < 0 Then t = 0
                If t > 1 Then t = 1
                qx = x1 + t * dx - x: qy = y1 + t * dy - y
                If qx * qx + qy * qy < best Then best = qx * qx + qy * qy
            Next k
        Next b
    Next s
    DistBdy = Sqr(best)
End Function

' parameter t (0..1) titik potong ruas (px,py)->(qx,qy) dengan sisi boundary terdekat ke p; -1 kalau tidak ada
Private Function CutParam(ByVal px As Double, ByVal py As Double, ByVal qx As Double, ByVal qy As Double) As Double
    Dim e As Long, d As Double, t As Double, u As Double, best As Double
    best = -1
    For e = 0 To NBE - 1
        d = (qx - px) * (BY2(e) - BY1(e)) - (qy - py) * (BX2(e) - BX1(e))
        If Abs(d) >= 1E-12 Then
            t = ((BX1(e) - px) * (BY2(e) - BY1(e)) - (BY1(e) - py) * (BX2(e) - BX1(e))) / d
            u = ((BX1(e) - px) * (qy - py) - (BY1(e) - py) * (qx - px)) / d
            If t >= 0 And t <= 1 And u >= 0 And u <= 1 Then
                If best < 0 Or t < best Then best = t
            End If
        End If
    Next e
    CutParam = best
End Function

' ---- harian ----------------------------------------------------------------------
Private Sub AddHarian(ByVal path As String, ByVal skipNo As Long)
    Dim sn() As Long, ss() As Long, sl() As Long, ns As Long, py() As Double, px() As Double, pz() As Double, pd() As String
    Dim pn As Long, h1 As String, h2 As String, k As Long, j As Long
    ReadAnyStr path, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    If NHSeg = 0 Then
        ReDim HSegS(0 To 63): ReDim HSegL(0 To 63): ReDim HSegNum(0 To 63)
        ReDim HY(0 To 1023): ReDim HX(0 To 1023): ReDim HZ(0 To 1023): ReDim HD(0 To 1023)
    End If
    For k = 0 To ns - 1
        If sn(k) <> skipNo Then
            If NHSeg > UBound(HSegS) Then
                ReDim Preserve HSegS(0 To 2 * NHSeg): ReDim Preserve HSegL(0 To 2 * NHSeg): ReDim Preserve HSegNum(0 To 2 * NHSeg)
            End If
            HSegS(NHSeg) = NHP: HSegL(NHSeg) = sl(k): HSegNum(NHSeg) = sn(k)
            NHSeg = NHSeg + 1
            For j = 0 To sl(k) - 1
                If NHP > UBound(HY) Then
                    ReDim Preserve HY(0 To 2 * NHP): ReDim Preserve HX(0 To 2 * NHP)
                    ReDim Preserve HZ(0 To 2 * NHP): ReDim Preserve HD(0 To 2 * NHP)
                End If
                HY(NHP) = py(ss(k) + j): HX(NHP) = px(ss(k) + j): HZ(NHP) = pz(ss(k) + j): HD(NHP) = pd(ss(k) + j)
                NHP = NHP + 1
            Next j
        End If
    Next k
End Sub

' =============================================================================
' Potong file BINER: rekaman yang disimpan disalin byte per byte (tidak diubah)
' =============================================================================
Private Function PotongBiner(ByVal inPath As String, ByVal outPath As String, ByVal nama As String, _
                             ByVal tgl As String, ByVal buangDalam As Boolean, ByVal titikPotong As Boolean, _
                             ByVal cekJarak As Double) As String
    Dim b() As Byte, n As Long, f As Integer, pos As Long, h1 As String, h2 As String, dataStart As Long
    f = FreeFile
    Open inPath For Binary Access Read As #f
    n = LOF(f)
    ReDim b(0 To n - 1)
    Get #f, 1, b
    Close #f
    pos = 0
    h1 = LineOf(b, pos): h2 = LineOf(b, pos)
    If pos + 5 <= n Then
        If b(pos) = 0 And b(pos + 1) = 0 And b(pos + 2) = 0 And b(pos + 3) = 0 And b(pos + 4) = 0 Then pos = pos + 5
    End If
    dataStart = pos
    ' --- indeks rekaman ---
    Dim rs() As Long, rlen() As Long, nr As Long, e As Long, num As Long, sorted_ As Boolean, lastNum As Long, inSeg As Boolean
    ReDim rs(0 To n \ 40 + 16): ReDim rlen(0 To n \ 40 + 16)
    sorted_ = True: lastNum = -2147483647
    Do While pos + 28 <= n
        e = pos + 28
        Do While e < n
            If b(e) = 0 Then Exit Do
            e = e + 1
        Loop
        If nr > UBound(rs) Then
            ReDim Preserve rs(0 To 2 * nr)
            ReDim Preserve rlen(0 To 2 * nr)
        End If
        rs(nr) = pos: rlen(nr) = e + 1 - pos: nr = nr + 1
        num = BeLongU(b, pos)
        If num = 0 Then
            inSeg = False
            If e - pos - 28 = 3 Then
                If b(pos + 28) = 69 And b(pos + 29) = 78 And b(pos + 30) = 68 Then nr = nr - 1: Exit Do
            End If
        Else
            If Not inSeg Then
                If num < lastNum Then sorted_ = False
                lastNum = num
            End If
            inSeg = True
        End If
        pos = e + 1
    Loop
    ' --- keluaran ---
    Dim o() As Byte, op As Long, cap As Long, hdr As String
    cap = n + 64 + NHP * 80 + 4096
    If titikPotong Then cap = cap + n \ 4
    ReDim o(0 To cap)
    hdr = NewHeader(h1, nama, tgl)
    PutTxt o, op, hdr & vbCrLf & h2 & vbCrLf
    op = op + 5
    Dim i As Long, j As Long, s0 As Long, segN As Long, flg() As Boolean, x As Double, y As Double, anyCut As Boolean
    Dim hNext As Long, nKeep As Long, nBuang As Long, nAwal As Long, nPot As Long, garis As Boolean
    ReDim flg(0 To 1023)
    hNext = 0
    i = 0
    Do While i < nr
        num = BeLongU(b, rs(i))
        If num = 0 Then
            i = i + 1                                    ' pemisah tanpa titik (tidak biasa): lewati
        Else
            s0 = i
            Do While i < nr
                If BeLongU(b, rs(i)) = 0 Then Exit Do
                i = i + 1
            Loop
            segN = i - s0                                ' rekaman rs(s0..i-1), pemisah di rs(i)
            If sorted_ Then FlushHarian o, op, hNext, num, False
            If segN > UBound(flg) + 1 Then
                ReDim flg(0 To 2 * segN)
            End If
            anyCut = False
            For j = 0 To segN - 1
                y = BeDbl(b, rs(s0 + j) + 4): x = BeDbl(b, rs(s0 + j) + 12)
                If buangDalam Then flg(j) = InsideAny(x, y) Else flg(j) = Not InsideAny(x, y)
                If flg(j) Then anyCut = True: nBuang = nBuang + 1
            Next j
            nAwal = nAwal + segN
            If Not anyCut Then
                ' segmen utuh + pemisahnya: salin langsung
                CopyBytes b, rs(s0), (rs(i) + rlen(i)) - rs(s0), o, op
            Else
                garis = (segN > 1) And Not IsSpot(num)
                EmitPiecesBin b, rs, rlen, s0, segN, flg, o, op, garis, titikPotong, cekJarak, nPot
            End If
            i = i + 1                                    ' lewati pemisah
        End If
    Loop
    FlushHarian o, op, hNext, 2147483647, Not sorted_
    PutBeLongU o, op, 0: op = op + 28
    PutTxt o, op, "END": op = op + 1
    ReDim Preserve o(0 To op - 1)
    WriteBytes outPath, o
    PotongBiner = "titik awal " & nAwal & ", dibuang " & nBuang & ", titik potong " & nPot & ", harian " & NHP & _
                  IIf(sorted_, "", " (file tidak urut nomor string: harian ditaruh di akhir)")
End Function

Private Sub EmitPiecesBin(b() As Byte, rs() As Long, rlen() As Long, ByVal s0 As Long, ByVal segN As Long, _
                          flg() As Boolean, o() As Byte, op As Long, ByVal garis As Boolean, _
                          ByVal titikPotong As Boolean, ByVal cekJarak As Double, nPot As Long)
    Dim j As Long, cur As Long, pStart As Long, num As Long
    num = BeLongU(b, rs(s0))
    cur = 0                                      ' jumlah titik di potongan sekarang
    For j = 0 To segN - 1
        If flg(j) Then
            If cur > 0 Then
                If titikPotong And garis Then EmitCutPointBin b, rs(s0 + j - 1), rs(s0 + j), o, op, nPot
                CekPiece b, rs, s0, pStart, j - 1, garis, cekJarak, titikPotong And pStart > 0, titikPotong
                PutSep o, op
                cur = 0
            End If
        Else
            If cur = 0 Then
                pStart = j
                If j > 0 And titikPotong And garis Then
                    If flg(j - 1) Then EmitCutPointBin b, rs(s0 + j), rs(s0 + j - 1), o, op, nPot
                End If
            End If
            CopyBytes b, rs(s0 + j), rlen(s0 + j), o, op
            cur = cur + 1
        End If
    Next j
    If cur > 0 Then
        CekPiece b, rs, s0, pStart, segN - 1, garis, cekJarak, titikPotong And pStart > 0, False
        PutSep o, op
    End If
End Sub

' titik potong: dari titik yang disimpan (keep) ke titik yang dibuang (gone)
Private Sub EmitCutPointBin(b() As Byte, ByVal keep As Long, ByVal gone As Long, o() As Byte, op As Long, nPot As Long)
    Dim ky As Double, kx As Double, kz As Double, gy As Double, gx As Double, gz As Double, t As Double, d As String
    ky = BeDbl(b, keep + 4): kx = BeDbl(b, keep + 12): kz = BeDbl(b, keep + 20)
    gy = BeDbl(b, gone + 4): gx = BeDbl(b, gone + 12): gz = BeDbl(b, gone + 20)
    t = CutParam(kx, ky, gx, gy)
    If t < 0 Then t = 0
    d = "POTONG," & DescAt(b, keep)
    PutRec o, op, BeLongU(b, keep), ky + t * (gy - ky), kx + t * (gx - kx), kz + t * (gz - kz), d
    nPot = nPot + 1
End Sub

' ujung potongan yang punya titik potong (POTONG) tidak dicek, seperti progres.py
Private Sub CekPiece(b() As Byte, rs() As Long, ByVal s0 As Long, ByVal j0 As Long, ByVal j1 As Long, _
                     ByVal garis As Boolean, ByVal cekJarak As Double, ByVal skipA As Boolean, ByVal skipB As Boolean)
    If Not garis Or cekJarak <= 0 Then Exit Sub
    If Not skipA Then CekPoint BeDbl(b, rs(s0 + j0) + 4), BeDbl(b, rs(s0 + j0) + 12), BeDbl(b, rs(s0 + j0) + 20), DescAt(b, rs(s0 + j0)), cekJarak
    If Not skipB And (j1 <> j0 Or skipA) Then
        CekPoint BeDbl(b, rs(s0 + j1) + 4), BeDbl(b, rs(s0 + j1) + 12), BeDbl(b, rs(s0 + j1) + 20), DescAt(b, rs(s0 + j1)), cekJarak
    End If
End Sub

Private Sub CekPoint(ByVal y As Double, ByVal x As Double, ByVal z As Double, ByVal d As String, ByVal cekJarak As Double)
    If Left(d, 7) = "POTONG," Then Exit Sub
    If DistBdy(x, y, cekJarak) > cekJarak Then Exit Sub
    If NCk = 0 Then
        ReDim CkY(0 To 63)
        ReDim CkX(0 To 63)
        ReDim CkZ(0 To 63)
        ReDim CkD(0 To 63)
    End If
    If NCk > UBound(CkY) Then
        ReDim Preserve CkY(0 To 2 * NCk): ReDim Preserve CkX(0 To 2 * NCk)
        ReDim Preserve CkZ(0 To 2 * NCk): ReDim Preserve CkD(0 To 2 * NCk)
    End If
    CkY(NCk) = y: CkX(NCk) = x: CkZ(NCk) = z: CkD(NCk) = d
    NCk = NCk + 1
End Sub

' tulis segmen harian dengan nomor string <= upTo (biner atau teks)
Private Sub FlushHarian(o() As Byte, op As Long, hNext As Long, ByVal upTo As Long, ByVal inOrder As Boolean)
    Dim k As Long, j As Long, best As Long, bestNum As Long
    ' segmen harian ditulis urut nomor string; nomor sama: urutan file
    Do
        best = -1
        For k = 0 To NHSeg - 1
            If HSegL(k) >= 0 Then
                If HSegNum(k) <= upTo Then
                    If best < 0 Then
                        best = k: bestNum = HSegNum(k)
                    ElseIf HSegNum(k) < bestNum And Not inOrder Then
                        best = k: bestNum = HSegNum(k)
                    End If
                End If
            End If
        Next k
        If best < 0 Then Exit Do
        For j = 0 To HSegL(best) - 1
            k = HSegS(best) + j
            PutRec o, op, HSegNum(best), HY(k), HX(k), HZ(k), HD(k)
        Next j
        PutSep o, op
        HSegL(best) = -1 - HSegL(best)               ' tandai sudah ditulis
        hNext = hNext + 1
    Loop
End Sub

' =============================================================================
' Potong file TEKS
' =============================================================================
Private Function PotongTeks(ByVal inPath As String, ByVal outPath As String, ByVal nama As String, _
                            ByVal tgl As String, ByVal buangDalam As Boolean, ByVal titikPotong As Boolean, _
                            ByVal cekJarak As Double) As String
    Dim h1 As String, h2 As String, sn() As Long, ss() As Long, sl() As Long, ns As Long
    Dim py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long
    ReadAnyStr inPath, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    Dim sorted_ As Boolean, k As Long, j As Long, flg() As Boolean, anyCut As Boolean
    Dim nAwal As Long, nBuang As Long, nPot As Long, garis As Boolean, cur As Long, pStart As Long, t As Double, p As Long, q As Long
    sorted_ = True
    For k = 1 To ns - 1
        If sn(k) < sn(k - 1) Then sorted_ = False: Exit For
    Next k
    SBReset
    SBAdd NewHeader(h1, nama, tgl)
    SBAdd h2
    ReDim flg(0 To 1023)
    For k = 0 To ns - 1
        If sorted_ Then FlushHarianTeks sn(k), False
        If sl(k) > UBound(flg) + 1 Then
            ReDim flg(0 To 2 * sl(k))
        End If
        anyCut = False
        For j = 0 To sl(k) - 1
            p = ss(k) + j
            If buangDalam Then flg(j) = InsideAny(px(p), py(p)) Else flg(j) = Not InsideAny(px(p), py(p))
            If flg(j) Then anyCut = True: nBuang = nBuang + 1
        Next j
        nAwal = nAwal + sl(k)
        garis = (sl(k) > 1) And Not IsSpot(sn(k))
        cur = 0
        For j = 0 To sl(k) - 1
            p = ss(k) + j
            If flg(j) Then
                If cur > 0 Then
                    If titikPotong And garis Then
                        q = p - 1: t = CutParam(px(q), py(q), px(p), py(p))
                        If t < 0 Then t = 0
                        SBAdd RecLine(sn(k), py(q) + t * (py(p) - py(q)), px(q) + t * (px(p) - px(q)), pz(q) + t * (pz(p) - pz(q)), "POTONG," & pd(q))
                        nPot = nPot + 1
                    End If
                    If anyCut And garis And cekJarak > 0 Then CekPiecePts py, px, pz, pd, ss(k) + pStart, p - 1, cekJarak, titikPotong And pStart > 0, titikPotong
                    SBAdd "0, 0.000, 0.000, 0.000,"
                    cur = 0
                End If
            Else
                If cur = 0 Then
                    pStart = j
                    If j > 0 And titikPotong And garis Then
                        If flg(j - 1) Then
                            q = p - 1: t = CutParam(px(p), py(p), px(q), py(q))
                            If t < 0 Then t = 0
                            SBAdd RecLine(sn(k), py(p) + t * (py(q) - py(p)), px(p) + t * (px(q) - px(p)), pz(p) + t * (pz(q) - pz(p)), "POTONG," & pd(p))
                            nPot = nPot + 1
                        End If
                    End If
                End If
                SBAdd RecLine(sn(k), py(p), px(p), pz(p), pd(p))
                cur = cur + 1
            End If
        Next j
        If cur > 0 Then
            If anyCut And garis And cekJarak > 0 Then CekPiecePts py, px, pz, pd, ss(k) + pStart, ss(k) + sl(k) - 1, cekJarak, titikPotong And pStart > 0, False
            SBAdd "0, 0.000, 0.000, 0.000,"
        End If
    Next k
    FlushHarianTeks 2147483647, Not sorted_
    SBAdd "0, 0.000, 0.000, 0.000, END"
    WriteText outPath, SBText()
    PotongTeks = "titik awal " & nAwal & ", dibuang " & nBuang & ", titik potong " & nPot & ", harian " & NHP & _
                 IIf(sorted_, "", " (file tidak urut nomor string: harian ditaruh di akhir)")
End Function

Private Sub CekPiecePts(py() As Double, px() As Double, pz() As Double, pd() As String, ByVal a As Long, ByVal b As Long, _
                        ByVal cekJarak As Double, ByVal skipA As Boolean, ByVal skipB As Boolean)
    If Not skipA Then CekPoint py(a), px(a), pz(a), pd(a), cekJarak
    If Not skipB And (b <> a Or skipA) Then CekPoint py(b), px(b), pz(b), pd(b), cekJarak
End Sub

Private Sub FlushHarianTeks(ByVal upTo As Long, ByVal inOrder As Boolean)
    Dim k As Long, j As Long, best As Long, bestNum As Long, p As Long
    Do
        best = -1
        For k = 0 To NHSeg - 1
            If HSegL(k) >= 0 Then
                If HSegNum(k) <= upTo Then
                    If best < 0 Then
                        best = k: bestNum = HSegNum(k)
                    ElseIf HSegNum(k) < bestNum And Not inOrder Then
                        best = k: bestNum = HSegNum(k)
                    End If
                End If
            End If
        Next k
        If best < 0 Then Exit Do
        For j = 0 To HSegL(best) - 1
            p = HSegS(best) + j
            SBAdd RecLine(HSegNum(best), HY(p), HX(p), HZ(p), HD(p))
        Next j
        SBAdd "0, 0.000, 0.000, 0.000,"
        HSegL(best) = -1 - HSegL(best)
    Loop
End Sub

Private Sub TulisCek(ByVal path As String, ByVal nama As String, ByVal tgl As String)
    Dim k As Long
    SBReset
    SBAdd nama & "_CEK," & tgl & ",0,0"
    SBAdd "0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000"
    For k = 0 To NCk - 1
        SBAdd RecLine(9006, CkY(k), CkX(k), CkZ(k), "CEK," & CkD(k))
        SBAdd "0, 0.000, 0.000, 0.000,"
    Next k
    SBAdd "0, 0.000, 0.000, 0.000, END"
    WriteText path, SBText()
End Sub

Private Function IsSpot(ByVal num As Long) As Boolean
    IsSpot = (num = 500 Or num = 600 Or num = 602)
End Function

' =============================================================================
' 2. BOUNDARY: A + B, A - B, A x B   (sama dengan boundary_op di progres.py)
' =============================================================================
' ring set: titik datar RX/RY/RZ/RD, ring k = RS(k) .. RS(k)+RL(k)-1 (terbuka, tanpa titik penutup)
Private AX() As Double, AY() As Double, AZ() As Double, AD() As String, ARS() As Long, ARL() As Long, NAR As Long
Private BXr() As Double, BYr() As Double, BZr() As Double, BDr() As String, BRS() As Long, BRL() As Long, NBR As Long
Private AFlip() As Boolean, BFlip() As Boolean
' kotak batas per ring (untuk lewati ring yang jauh)
Private AQx0() As Double, AQx1() As Double, AQy0() As Double, AQy1() As Double
Private BQx0() As Double, BQx1() As Double, BQy0() As Double, BQy1() As Double
' potongan sisi: titik awal (P*) dan akhir (Q*), sumber 0=A 1=B, ring, kelas
Private PPx() As Double, PPy() As Double, PPz() As Double, PPd() As String, PPnew() As Long
Private PQx() As Double, PQy() As Double, PQz() As Double, PQd() As String, PQnew() As Long
Private PSrc() As Long, PRing() As Long, PCls() As Long, NPc As Long
' kelas: 1 luar, 2 dalam, 3 sama, 4 lawan

Public Function BoundaryOp(ByVal aPath As String, ByVal aNo As Long, ByVal bList As String, ByVal bNo As Long, _
                           ByVal op As String, ByVal outPath As String, ByVal tgl As String, _
                           Optional ByVal outNo As Long = 0) As String
    Dim t0 As Double, files() As String, i As Long, h1 As String, h2 As String, isBin As Boolean
    t0 = Timer
    InitPow2
    op = UCase(Trim(op))
    If outNo = 0 Then outNo = aNo
    ReadRingsA aPath, aNo, h1, h2, isBin
    NBR = 0
    files = Split(bList, ";")
    For i = 0 To UBound(files)
        If Len(Trim(files(i))) > 0 Then ReadRingsB Trim(files(i)), bNo
    Next i
    ' hasil
    Dim RX() As Double, RY() As Double, RZ() As Double, RD() As String, RRS() As Long, RRL() As Long, NRR As Long, ROrd() As Long
    BoolOp op, RX, RY, RZ, RD, RRS, RRL, NRR, ROrd
    ' tulis
    Dim nama As String, hdr As String
    nama = BaseName(outPath)
    hdr = NewHeader(h1, nama, tgl)
    WriteRings outPath, hdr, h2, isBin, RX, RY, RZ, RD, RRS, RRL, NRR, outNo
    BoundaryOp = "ring A " & NAR & ", ring B " & NBR & " -> hasil " & NRR & " ring; " & Format(Timer - t0, "0.0") & " s"
    LastStat = BoundaryOp
End Function

Private Sub ReadRingsA(ByVal path As String, ByVal no As Long, h1 As String, h2 As String, isBin As Boolean)
    Dim sn() As Long, ss() As Long, sl() As Long, ns As Long, py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long
    Dim k As Long, j As Long, n As Long
    isBin = IsBinaryFile(path)
    ReadAnyStr path, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    NAR = 0
    ReDim AX(0 To pn + 1): ReDim AY(0 To pn + 1): ReDim AZ(0 To pn + 1): ReDim AD(0 To pn + 1)
    ReDim ARS(0 To ns + 1): ReDim ARL(0 To ns + 1)
    n = 0
    For k = 0 To ns - 1
        If sn(k) = no And sl(k) >= 3 Then
            ARS(NAR) = n
            For j = 0 To sl(k) - 1
                AX(n) = px(ss(k) + j): AY(n) = py(ss(k) + j): AZ(n) = pz(ss(k) + j): AD(n) = pd(ss(k) + j): n = n + 1
            Next j
            ' buka ring (titik akhir = titik awal)
            If AX(n - 1) = AX(ARS(NAR)) And AY(n - 1) = AY(ARS(NAR)) Then n = n - 1
            ARL(NAR) = n - ARS(NAR)
            If ARL(NAR) >= 3 Then NAR = NAR + 1 Else n = ARS(NAR)
        End If
    Next k
End Sub

Private Sub ReadRingsB(ByVal path As String, ByVal no As Long)
    Dim sn() As Long, ss() As Long, sl() As Long, ns As Long, py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long
    Dim k As Long, j As Long, n As Long, h1 As String, h2 As String
    ReadAnyStr path, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    If NBR = 0 Then
        ReDim BXr(0 To pn + 1): ReDim BYr(0 To pn + 1): ReDim BZr(0 To pn + 1): ReDim BDr(0 To pn + 1)
        ReDim BRS(0 To ns + 1): ReDim BRL(0 To ns + 1)
        n = 0
    Else
        n = BRS(NBR - 1) + BRL(NBR - 1)
        ReDim Preserve BXr(0 To n + pn + 1): ReDim Preserve BYr(0 To n + pn + 1)
        ReDim Preserve BZr(0 To n + pn + 1): ReDim Preserve BDr(0 To n + pn + 1)
        ReDim Preserve BRS(0 To NBR + ns + 1): ReDim Preserve BRL(0 To NBR + ns + 1)
    End If
    For k = 0 To ns - 1
        If sn(k) = no And sl(k) >= 3 Then
            BRS(NBR) = n
            For j = 0 To sl(k) - 1
                BXr(n) = px(ss(k) + j): BYr(n) = py(ss(k) + j): BZr(n) = pz(ss(k) + j): BDr(n) = pd(ss(k) + j): n = n + 1
            Next j
            If BXr(n - 1) = BXr(BRS(NBR)) And BYr(n - 1) = BYr(BRS(NBR)) Then n = n - 1
            BRL(NBR) = n - BRS(NBR)
            If BRL(NBR) >= 3 Then NBR = NBR + 1 Else n = BRS(NBR)
        End If
    Next k
End Sub

Private Sub RingBoxes(x() As Double, y() As Double, rs() As Long, rl() As Long, ByVal nr As Long, _
                      qx0() As Double, qx1() As Double, qy0() As Double, qy1() As Double)
    Dim k As Long, i As Long, p As Long
    ReDim qx0(0 To nr): ReDim qx1(0 To nr): ReDim qy0(0 To nr): ReDim qy1(0 To nr)
    For k = 0 To nr - 1
        qx0(k) = 1E+300: qx1(k) = -1E+300: qy0(k) = 1E+300: qy1(k) = -1E+300
        For i = 0 To rl(k) - 1
            p = rs(k) + i
            If x(p) < qx0(k) Then qx0(k) = x(p)
            If x(p) > qx1(k) Then qx1(k) = x(p)
            If y(p) < qy0(k) Then qy0(k) = y(p)
            If y(p) > qy1(k) Then qy1(k) = y(p)
        Next i
    Next k
End Sub

Private Function RingArea(x() As Double, y() As Double, ByVal s As Long, ByVal n As Long) As Double
    Dim i As Long, j As Long, a As Double
    For i = 0 To n - 1
        j = s + ((i + 1) Mod n)
        a = a + x(s + i) * y(j) - x(j) * y(s + i)
    Next i
    RingArea = a / 2
End Function

' titik (x,y) di dalam ring k dari set (genap-ganjil, tanpa toleransi)
Private Function InRing(x() As Double, y() As Double, ByVal s As Long, ByVal n As Long, ByVal px As Double, ByVal py As Double) As Boolean
    Dim i As Long, a As Long, b As Long, c As Boolean
    For i = 0 To n - 1
        a = s + i: b = s + ((i + 1) Mod n)
        If (y(a) > py) <> (y(b) > py) Then
            If px < x(a) + (py - y(a)) * (x(b) - x(a)) / (y(b) - y(a)) Then c = Not c
        End If
    Next i
    InRing = c
End Function

Private Function InSetA(ByVal px As Double, ByVal py As Double) As Boolean
    Dim k As Long, c As Boolean
    For k = 0 To NAR - 1
        If px >= AQx0(k) And px <= AQx1(k) And py >= AQy0(k) And py <= AQy1(k) Then
            If InRing(AX, AY, ARS(k), ARL(k), px, py) Then c = Not c
        End If
    Next k
    InSetA = c
End Function

Private Function InSetB(ByVal px As Double, ByVal py As Double) As Boolean
    Dim k As Long, c As Boolean
    For k = 0 To NBR - 1
        If px >= BQx0(k) And px <= BQx1(k) And py >= BQy0(k) And py <= BQy1(k) Then
            If InRing(BXr, BYr, BRS(k), BRL(k), px, py) Then c = Not c
        End If
    Next k
    InSetB = c
End Function

' arah sisi set yang dilalui titik (dalam 1e-4 m): 0 = tidak, lain: dx,dy diisi
Private Function OnSet(x() As Double, y() As Double, rs() As Long, rl() As Long, ByVal nr As Long, _
                       qx0() As Double, qx1() As Double, qy0() As Double, qy1() As Double, _
                       ByVal px As Double, ByVal py As Double, odx As Double, ody As Double) As Boolean
    Dim k As Long, i As Long, a As Long, b As Long, dx As Double, dy As Double, L As Double, t As Double, qx As Double, qy As Double
    For k = 0 To nr - 1
        If px < qx0(k) - 0.001 Or px > qx1(k) + 0.001 Or py < qy0(k) - 0.001 Or py > qy1(k) + 0.001 Then GoTo nextRing
        For i = 0 To rl(k) - 1
            a = rs(k) + i: b = rs(k) + ((i + 1) Mod rl(k))
            dx = x(b) - x(a): dy = y(b) - y(a): L = dx * dx + dy * dy
            If L = 0 Then
                t = 0
            Else
                t = ((px - x(a)) * dx + (py - y(a)) * dy) / L
                If t < 0 Then t = 0
                If t > 1 Then t = 1
            End If
            qx = x(a) + t * dx - px: qy = y(a) + t * dy - py
            If qx * qx + qy * qy < 0.00000001 Then odx = dx: ody = dy: OnSet = True: Exit Function
        Next i
nextRing:
    Next k
End Function

' arah: luar = berlawanan jarum jam, lubang = searah; ring dibalik di tempat, flag dicatat
Private Sub OrientSet(x() As Double, y() As Double, z() As Double, d() As String, rs() As Long, rl() As Long, _
                      ByVal nr As Long, flp() As Boolean)
    Dim k As Long, j As Long, depth As Long, wantCcw As Boolean, isCcw As Boolean
    ReDim flp(0 To nr)
    For k = 0 To nr - 1
        depth = 0
        For j = 0 To nr - 1
            If j <> k Then
                If InRing(x, y, rs(j), rl(j), x(rs(k)), y(rs(k))) Then depth = depth + 1
            End If
        Next j
        wantCcw = (depth Mod 2 = 0)
        isCcw = RingArea(x, y, rs(k), rl(k)) > 0
        flp(k) = (isCcw <> wantCcw)
    Next k
    For k = 0 To nr - 1
        If flp(k) Then ReverseRing x, y, z, d, rs(k), rl(k)
    Next k
End Sub

Private Sub ReverseRing(x() As Double, y() As Double, z() As Double, d() As String, ByVal s As Long, ByVal n As Long)
    Dim i As Long, j As Long, tv As Double, ts As String
    i = s: j = s + n - 1
    Do While i < j
        tv = x(i): x(i) = x(j): x(j) = tv
        tv = y(i): y(i) = y(j): y(j) = tv
        tv = z(i): z(i) = z(j): z(j) = tv
        ts = d(i): d(i) = d(j): d(j) = ts
        i = i + 1: j = j - 1
    Loop
End Sub

Private Sub AddPiece(ByVal px As Double, ByVal py As Double, ByVal pz As Double, ByVal pd As String, ByVal pnew As Long, _
                     ByVal qx As Double, ByVal qy As Double, ByVal qz As Double, ByVal qd As String, ByVal qnew As Long, _
                     ByVal src As Long, ByVal ring As Long)
    If NPc > UBound(PPx) Then
        Dim m As Long
        m = 2 * NPc
        ReDim Preserve PPx(0 To m): ReDim Preserve PPy(0 To m): ReDim Preserve PPz(0 To m): ReDim Preserve PPd(0 To m): ReDim Preserve PPnew(0 To m)
        ReDim Preserve PQx(0 To m): ReDim Preserve PQy(0 To m): ReDim Preserve PQz(0 To m): ReDim Preserve PQd(0 To m): ReDim Preserve PQnew(0 To m)
        ReDim Preserve PSrc(0 To m): ReDim Preserve PRing(0 To m): ReDim Preserve PCls(0 To m)
    End If
    PPx(NPc) = px: PPy(NPc) = py: PPz(NPc) = pz: PPd(NPc) = pd: PPnew(NPc) = pnew
    PQx(NPc) = qx: PQy(NPc) = qy: PQz(NPc) = qz: PQd(NPc) = qd: PQnew(NPc) = qnew
    PSrc(NPc) = src: PRing(NPc) = ring
    NPc = NPc + 1
End Sub

' potong sisi ring (set "own") di titik potong/sentuh dengan sisi set lain; tambah potongan
' titik baru: z = (2*zA + zB)/3 ; PPnew/PQnew = 1 + indeks ring B tempat titik potong
Private Sub SplitRing(ox() As Double, oy() As Double, oz() As Double, od() As String, ByVal s As Long, ByVal n As Long, _
                      tx() As Double, ty() As Double, tz() As Double, trs() As Long, trl() As Long, ByVal tnr As Long, _
                      tqx0() As Double, tqx1() As Double, tqy0() As Double, tqy1() As Double, _
                      ByVal isA As Boolean, ByVal ringIdx As Long, ByVal src As Long, nTot As Long)
    Dim i As Long, a As Long, b As Long, k As Long, j As Long, c As Long, d2 As Long
    Dim px As Double, py As Double, qx As Double, qy As Double, ex As Double, ey As Double, L2 As Double
    Dim qbx0 As Double, qbx1 As Double, qby0 As Double, qby1 As Double, ax_ As Double, ay_ As Double, bx_ As Double, by_ As Double
    Dim dd As Double, t As Double, u As Double, uu As Double, zo As Double, zs As Double
    Dim ts() As Double, tz_() As Double, tr() As Long, nt As Long, w As Long, ok As Boolean
    ReDim ts(0 To 63): ReDim tz_(0 To 63): ReDim tr(0 To 63)
    For i = 0 To n - 1
        a = s + i: b = s + ((i + 1) Mod n)
        px = ox(a): py = oy(a): qx = ox(b): qy = oy(b)
        ex = qx - px: ey = qy - py: L2 = ex * ex + ey * ey
        If L2 > 0 Then
            nt = 0
            qbx0 = IIf(px < qx, px, qx) - 0.000001: qbx1 = IIf(px > qx, px, qx) + 0.000001
            qby0 = IIf(py < qy, py, qy) - 0.000001: qby1 = IIf(py > qy, py, qy) + 0.000001
            For k = 0 To tnr - 1
                If tqx1(k) < qbx0 Or tqx0(k) > qbx1 Or tqy1(k) < qby0 Or tqy0(k) > qby1 Then GoTo nextK
                For j = 0 To trl(k) - 1
                    c = trs(k) + j: d2 = trs(k) + ((j + 1) Mod trl(k))
                    ax_ = tx(c): ay_ = ty(c): bx_ = tx(d2): by_ = ty(d2)
                    ok = True
                    If ax_ < qbx0 And bx_ < qbx0 Then ok = False
                    If ok Then
                        If ax_ > qbx1 And bx_ > qbx1 Then ok = False
                    End If
                    If ok Then
                        If ay_ < qby0 And by_ < qby0 Then ok = False
                    End If
                    If ok Then
                        If ay_ > qby1 And by_ > qby1 Then ok = False
                    End If
                    If ok Then
                        dd = ex * (by_ - ay_) - ey * (bx_ - ax_)
                        If Abs(dd) > 0.000000000001 * IIf(L2 > 1, L2, 1) Then
                            t = ((ax_ - px) * (by_ - ay_) - (ay_ - py) * (bx_ - ax_)) / dd
                            u = ((ax_ - px) * ey - (ay_ - py) * ex) / dd
                            If t > 0.000000001 And t < 1 - 0.000000001 And u >= -0.000000001 And u <= 1 + 0.000000001 Then
                                uu = u: If uu < 0 Then uu = 0
                                If uu > 1 Then uu = 1
                                zo = tz(c) + uu * (tz(d2) - tz(c)): zs = oz(a) + t * (oz(b) - oz(a))
                                If isA Then
                                    AddT ts, tz_, tr, nt, t, (2 * zs + zo) / 3, k
                                Else
                                    AddT ts, tz_, tr, nt, t, (2 * zo + zs) / 3, ringIdx
                                End If
                            End If
                        Else
                            For w = 0 To 1
                                If w = 0 Then
                                    t = ((ax_ - px) * ex + (ay_ - py) * ey) / L2
                                    If t > 0.000000001 And t < 1 - 0.000000001 Then
                                        If Abs((ax_ - px) * ey - (ay_ - py) * ex) / Sqr(L2) < 0.000001 Then
                                            AddT ts, tz_, tr, nt, t, tz(c), IIf(isA, k, ringIdx)
                                        End If
                                    End If
                                Else
                                    t = ((bx_ - px) * ex + (by_ - py) * ey) / L2
                                    If t > 0.000000001 And t < 1 - 0.000000001 Then
                                        If Abs((bx_ - px) * ey - (by_ - py) * ex) / Sqr(L2) < 0.000001 Then
                                            AddT ts, tz_, tr, nt, t, tz(d2), IIf(isA, k, ringIdx)
                                        End If
                                    End If
                                End If
                            Next w
                        End If
                    End If
                Next j
nextK:
            Next k
            ' urutkan t
            SortT ts, tz_, tr, nt
            Dim lx As Double, ly As Double, lz As Double, ld As String, ln As Long, m As Long
            lx = px: ly = py: lz = oz(a): ld = od(a): ln = 0
            For m = 0 To nt - 1
                AddPiece lx, ly, lz, ld, ln, px + ts(m) * ex, py + ts(m) * ey, tz_(m), od(a), 1 + tr(m), src, ringIdx
                lx = px + ts(m) * ex: ly = py + ts(m) * ey: lz = tz_(m): ld = od(a): ln = 1 + tr(m)
            Next m
            AddPiece lx, ly, lz, ld, ln, qx, qy, oz(b), od(b), 0, src, ringIdx
        End If
    Next i
    nTot = nTot + 1
End Sub

Private Sub AddT(ts() As Double, tz_() As Double, tr() As Long, nt As Long, ByVal t As Double, ByVal z As Double, ByVal r As Long)
    Dim i As Long
    For i = 0 To nt - 1
        If ts(i) = t Then tz_(i) = z: tr(i) = r: Exit Sub        ' t sama: nilai terakhir menang (seperti dict)
    Next i
    If nt > UBound(ts) Then
        ReDim Preserve ts(0 To 2 * nt)
        ReDim Preserve tz_(0 To 2 * nt)
        ReDim Preserve tr(0 To 2 * nt)
    End If
    ts(nt) = t: tz_(nt) = z: tr(nt) = r: nt = nt + 1
End Sub

Private Sub SortT(ts() As Double, tz_() As Double, tr() As Long, ByVal nt As Long)
    Dim i As Long, j As Long, a As Double, b As Double, c As Long
    For i = 1 To nt - 1
        a = ts(i): b = tz_(i): c = tr(i): j = i - 1
        Do While j >= 0
            If ts(j) <= a Then Exit Do
            ts(j + 1) = ts(j): tz_(j + 1) = tz_(j): tr(j + 1) = tr(j): j = j - 1
        Loop
        ts(j + 1) = a: tz_(j + 1) = b: tr(j + 1) = c
    Next i
End Sub

Private Function KeyOf(ByVal x As Double, ByVal y As Double) As String
    KeyOf = Replace(Format(Round(x, 4), KEY_DEC), ",", ".") & "|" & Replace(Format(Round(y, 4), KEY_DEC), ",", ".")
End Function

Private Sub BoolOp(ByVal op As String, RX() As Double, RY() As Double, RZ() As Double, RD() As String, _
                   RRS() As Long, RRL() As Long, NRR As Long, ROrd() As Long)
    Dim A0x() As Double, A0y() As Double, A0z() As Double, A0d() As String, B0x() As Double, B0y() As Double, B0z() As Double, B0d() As String
    Dim k As Long, i As Long, n As Long, dummy As Long
    ' salinan asli (arah asal) untuk ring utuh & aturan titik awal
    CopyD AX, A0x: CopyD AY, A0y: CopyD AZ, A0z: CopyS AD, A0d
    If NBR > 0 Then
        CopyD BXr, B0x: CopyD BYr, B0y: CopyD BZr, B0z: CopyS BDr, B0d
    End If
    OrientSet AX, AY, AZ, AD, ARS, ARL, NAR, AFlip
    If NBR > 0 Then OrientSet BXr, BYr, BZr, BDr, BRS, BRL, NBR, BFlip
    RingBoxes AX, AY, ARS, ARL, NAR, AQx0, AQx1, AQy0, AQy1
    RingBoxes BXr, BYr, BRS, BRL, NBR, BQx0, BQx1, BQy0, BQy1
    ' potongan
    NPc = 0
    ReDim PPx(0 To 1023): ReDim PPy(0 To 1023): ReDim PPz(0 To 1023): ReDim PPd(0 To 1023): ReDim PPnew(0 To 1023)
    ReDim PQx(0 To 1023): ReDim PQy(0 To 1023): ReDim PQz(0 To 1023): ReDim PQd(0 To 1023): ReDim PQnew(0 To 1023)
    ReDim PSrc(0 To 1023): ReDim PRing(0 To 1023): ReDim PCls(0 To 1023)
    Dim aStart() As Long, aEnd() As Long, bStart() As Long, bEnd() As Long
    ReDim aStart(0 To NAR): ReDim aEnd(0 To NAR): ReDim bStart(0 To NBR): ReDim bEnd(0 To NBR)
    For k = 0 To NAR - 1
        aStart(k) = NPc
        SplitRing AX, AY, AZ, AD, ARS(k), ARL(k), BXr, BYr, BZr, BRS, BRL, NBR, BQx0, BQx1, BQy0, BQy1, True, k, 0, dummy
        aEnd(k) = NPc - 1
    Next k
    For k = 0 To NBR - 1
        bStart(k) = NPc
        SplitRing BXr, BYr, BZr, BDr, BRS(k), BRL(k), AX, AY, AZ, ARS, ARL, NAR, AQx0, AQx1, AQy0, AQy1, False, k, 1, dummy
        bEnd(k) = NPc - 1
    Next k
    ' kelas
    Dim mx As Double, my As Double, odx As Double, ody As Double
    For i = 0 To NPc - 1
        mx = (PPx(i) + PQx(i)) / 2: my = (PPy(i) + PQy(i)) / 2
        If PSrc(i) = 0 Then
            If OnSet(BXr, BYr, BRS, BRL, NBR, BQx0, BQx1, BQy0, BQy1, mx, my, odx, ody) Then
                If odx * (PQx(i) - PPx(i)) + ody * (PQy(i) - PPy(i)) > 0 Then PCls(i) = 3 Else PCls(i) = 4
            ElseIf InSetB(mx, my) Then
                PCls(i) = 2
            Else
                PCls(i) = 1
            End If
        Else
            If OnSet(AX, AY, ARS, ARL, NAR, AQx0, AQx1, AQy0, AQy1, mx, my, odx, ody) Then
                If odx * (PQx(i) - PPx(i)) + ody * (PQy(i) - PPy(i)) > 0 Then PCls(i) = 3 Else PCls(i) = 4
            ElseIf InSetA(mx, my) Then
                PCls(i) = 2
            Else
                PCls(i) = 1
            End If
        End If
    Next i
    ' aturan per operasi
    Dim keepA1 As Long, keepA2 As Long, keepB As Long, revB As Boolean, utuhA As Long
    Select Case op
        Case "KURANGI"
            keepA1 = 1: keepA2 = 4: keepB = 2: revB = True: utuhA = 1
        Case "IRISAN"
            keepA1 = 2: keepA2 = 3: keepB = 2: revB = False: utuhA = 2
        Case Else
            keepA1 = 1: keepA2 = 3: keepB = 1: revB = False: utuhA = 1
    End Select
    ' hasil
    NRR = 0
    ReDim RX(0 To 1023): ReDim RY(0 To 1023): ReDim RZ(0 To 1023): ReDim RD(0 To 1023)
    ReDim RRS(0 To NAR + NBR + 16): ReDim RRL(0 To NAR + NBR + 16): ReDim ROrd(0 To NAR + NBR + 16)
    Dim use() As Boolean, utuh As Boolean, nRes As Long
    ReDim use(0 To NPc)
    For k = 0 To NAR - 1
        utuh = True
        For i = aStart(k) To aEnd(k)
            If PCls(i) <> utuhA Then utuh = False: Exit For
        Next i
        If utuh And (aEnd(k) - aStart(k) + 1) = ARL(k) Then
            AppendRingCopy A0x, A0y, A0z, A0d, ARS(k), ARL(k), RX, RY, RZ, RD, RRS, RRL, NRR, ROrd, k
        Else
            For i = aStart(k) To aEnd(k)
                If PCls(i) = keepA1 Or PCls(i) = keepA2 Then use(i) = True
            Next i
        End If
    Next k
    For k = 0 To NBR - 1
        utuh = True
        For i = bStart(k) To bEnd(k)
            If PCls(i) <> keepB Then utuh = False: Exit For
        Next i
        If utuh And (bEnd(k) - bStart(k) + 1) = BRL(k) And Not revB Then
            AppendRingCopy B0x, B0y, B0z, B0d, BRS(k), BRL(k), RX, RY, RZ, RD, RRS, RRL, NRR, ROrd, NAR + k
        Else
            For i = bStart(k) To bEnd(k)
                If PCls(i) = keepB Then
                    use(i) = True
                    If revB Then SwapPiece i
                End If
            Next i
        End If
    Next k
    ' sambung potongan menjadi ring: indeks berdasarkan kunci titik awal
    Dim keys As New Collection, firstOf() As Long, nextOf() As Long, kk As String, h As Long
    ReDim nextOf(0 To NPc): ReDim firstOf(0 To NPc)
    Dim nk As Long
    For i = NPc - 1 To 0 Step -1
        If use(i) Then
            kk = KeyOf(PPx(i), PPy(i))
            h = KeyIndex(keys, kk, nk)
            nextOf(i) = firstOf(h)
            firstOf(h) = i + 1                      ' 1-based, 0 = kosong
        End If
    Next i
    ' urutan mulai: A dulu (ring asal), titik awal ring asal dulu, lalu B
    Dim order_() As Long, no As Long, pr() As Double
    ReDim order_(0 To NPc): ReDim pr(0 To NPc)
    For i = 0 To NPc - 1
        If use(i) Then
            order_(no) = i
            If PSrc(i) = 0 Then
                pr(no) = PRing(i) * 2
                If PPx(i) = AX(ARS(PRing(i))) And PPy(i) = AY(ARS(PRing(i))) Then pr(no) = pr(no) Else pr(no) = pr(no) + 1
            Else
                pr(no) = 1000000# + PRing(i) * 2
                If PPx(i) = BXr(BRS(PRing(i))) And PPy(i) = BYr(BRS(PRing(i))) Then pr(no) = pr(no) Else pr(no) = pr(no) + 1
            End If
            no = no + 1
        End If
    Next i
    StableSortByKey order_, pr, no
    Dim used() As Boolean, cur As Long, cx() As Double, cy() As Double, cz() As Double, cd() As String, cnw() As Long, cn As Long, c As Long
    ReDim used(0 To NPc)
    For i = 0 To no - 1
        If Not used(order_(i)) Then
            cn = 0
            ReDim cx(0 To 255): ReDim cy(0 To 255): ReDim cz(0 To 255): ReDim cd(0 To 255): ReDim cnw(0 To 255)
            cur = order_(i)
            Do While cur >= 0
                If used(cur) Then Exit Do
                used(cur) = True
                If cn > UBound(cx) Then
                    ReDim Preserve cx(0 To 2 * cn): ReDim Preserve cy(0 To 2 * cn): ReDim Preserve cz(0 To 2 * cn)
                    ReDim Preserve cd(0 To 2 * cn): ReDim Preserve cnw(0 To 2 * cn)
                End If
                cx(cn) = PPx(cur): cy(cn) = PPy(cur): cz(cn) = PPz(cur): cd(cn) = PPd(cur): cnw(cn) = PPnew(cur): cn = cn + 1
                ' potongan berikut: titik awal = titik akhir potongan ini, belum dipakai (pertama dalam urutan indeks)
                h = KeyFind(keys, KeyOf(PQx(cur), PQy(cur)))
                cur = -1
                If h >= 0 Then
                    c = firstOf(h)
                    Do While c > 0
                        If Not used(c - 1) Then cur = c - 1: Exit Do
                        c = nextOf(c - 1)
                    Loop
                End If
            Loop
            If cn >= 3 Then FinishRing order_(i), cx, cy, cz, cd, cnw, cn, B0x, B0y, B0d, RX, RY, RZ, RD, RRS, RRL, NRR, ROrd
        End If
    Next i
    ' urutkan hasil menurut ring asal
    SortResult RX, RY, RZ, RD, RRS, RRL, NRR, ROrd
End Sub

Private Sub SwapPiece(ByVal i As Long)
    Dim tv As Double, ts As String, tl As Long
    tv = PPx(i): PPx(i) = PQx(i): PQx(i) = tv
    tv = PPy(i): PPy(i) = PQy(i): PQy(i) = tv
    tv = PPz(i): PPz(i) = PQz(i): PQz(i) = tv
    ts = PPd(i): PPd(i) = PQd(i): PQd(i) = ts
    tl = PPnew(i): PPnew(i) = PQnew(i): PQnew(i) = tl
End Sub

Private Function KeyIndex(keys As Collection, ByVal k As String, nk As Long) As Long
    Dim v As Variant
    On Error Resume Next
    v = keys.Item(k)
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        keys.Add nk, k
        KeyIndex = nk: nk = nk + 1
        Exit Function
    End If
    On Error GoTo 0
    KeyIndex = CLng(v)
End Function

Private Function KeyFind(keys As Collection, ByVal k As String) As Long
    Dim v As Variant
    On Error Resume Next
    v = keys.Item(k)
    If Err.Number <> 0 Then
        Err.Clear
        KeyFind = -1
    Else
        KeyFind = CLng(v)
    End If
    On Error GoTo 0
End Function

Private Sub StableSortByKey(ord() As Long, pr() As Double, ByVal n As Long)
    ' merge sort (stabil)
    Dim tmpO() As Long, tmpP() As Double, w As Long, i As Long, lo As Long, mid_ As Long, hi As Long, a As Long, b As Long, k As Long
    If n < 2 Then Exit Sub
    ReDim tmpO(0 To n): ReDim tmpP(0 To n)
    w = 1
    Do While w < n
        lo = 0
        Do While lo < n
            mid_ = lo + w: If mid_ > n Then mid_ = n
            hi = lo + 2 * w: If hi > n Then hi = n
            a = lo: b = mid_: k = lo
            Do While a < mid_ Or b < hi
                If b >= hi Then
                    tmpO(k) = ord(a): tmpP(k) = pr(a): a = a + 1
                ElseIf a >= mid_ Then
                    tmpO(k) = ord(b): tmpP(k) = pr(b): b = b + 1
                ElseIf pr(b) < pr(a) Then
                    tmpO(k) = ord(b): tmpP(k) = pr(b): b = b + 1
                Else
                    tmpO(k) = ord(a): tmpP(k) = pr(a): a = a + 1
                End If
                k = k + 1
            Loop
            lo = hi
        Loop
        For i = 0 To n - 1
            ord(i) = tmpO(i): pr(i) = tmpP(i)
        Next i
        w = w * 2
    Loop
End Sub

Private Sub AppendRingCopy(x() As Double, y() As Double, z() As Double, d() As String, ByVal s As Long, ByVal n As Long, _
                           RX() As Double, RY() As Double, RZ() As Double, RD() As String, RRS() As Long, RRL() As Long, _
                           NRR As Long, ROrd() As Long, ByVal ordKey As Long)
    Dim i As Long, p As Long
    If NRR = 0 Then p = 0 Else p = RRS(NRR - 1) + RRL(NRR - 1)
    If p + n > UBound(RX) Then
        ReDim Preserve RX(0 To 2 * (p + n)): ReDim Preserve RY(0 To 2 * (p + n))
        ReDim Preserve RZ(0 To 2 * (p + n)): ReDim Preserve RD(0 To 2 * (p + n))
    End If
    If NRR > UBound(RRS) Then
        ReDim Preserve RRS(0 To 2 * NRR)
        ReDim Preserve RRL(0 To 2 * NRR)
        ReDim Preserve ROrd(0 To 2 * NRR)
    End If
    For i = 0 To n - 1
        RX(p + i) = x(s + i): RY(p + i) = y(s + i): RZ(p + i) = z(s + i): RD(p + i) = d(s + i)
    Next i
    RRS(NRR) = p: RRL(NRR) = n: ROrd(NRR) = ordKey: NRR = NRR + 1
End Sub

' ring hasil rangkaian: kembalikan ke arah asal, titik awal & deskripsi seperti Surpac
Private Sub FinishRing(ByVal startPiece As Long, cx() As Double, cy() As Double, cz() As Double, cd() As String, cnw() As Long, _
                       ByVal cn As Long, B0x() As Double, B0y() As Double, B0d() As String, _
                       RX() As Double, RY() As Double, RZ() As Double, RD() As String, RRS() As Long, RRL() As Long, _
                       NRR As Long, ROrd() As Long)
    Dim src As Long, rg As Long, flip As Boolean, i As Long, j As Long, tv As Double, ts As String, tl As Long
    src = PSrc(startPiece): rg = PRing(startPiece)
    If src = 0 Then flip = AFlip(rg) Else flip = BFlip(rg)
    If flip Then
        i = 0: j = cn - 1
        Do While i < j
            tv = cx(i): cx(i) = cx(j): cx(j) = tv
            tv = cy(i): cy(i) = cy(j): cy(j) = tv
            tv = cz(i): cz(i) = cz(j): cz(j) = tv
            ts = cd(i): cd(i) = cd(j): cd(j) = ts
            tl = cnw(i): cnw(i) = cnw(j): cnw(j) = tl
            i = i + 1: j = j - 1
        Loop
    End If
    Dim st As Long, g As Long, dsc As String, hasD As Boolean
    st = 0
    If src = 0 And NBR > 0 Then
        StartLikeSurpac cx, cy, cnw, cn, B0x, B0y, st, g
        If g >= 0 Then dsc = B0d(BRS(g)): hasD = True
    End If
    Dim p As Long
    If NRR = 0 Then p = 0 Else p = RRS(NRR - 1) + RRL(NRR - 1)
    If p + cn > UBound(RX) Then
        ReDim Preserve RX(0 To 2 * (p + cn)): ReDim Preserve RY(0 To 2 * (p + cn))
        ReDim Preserve RZ(0 To 2 * (p + cn)): ReDim Preserve RD(0 To 2 * (p + cn))
    End If
    If NRR > UBound(RRS) Then
        ReDim Preserve RRS(0 To 2 * NRR)
        ReDim Preserve RRL(0 To 2 * NRR)
        ReDim Preserve ROrd(0 To 2 * NRR)
    End If
    For i = 0 To cn - 1
        j = (st + i) Mod cn
        RX(p + i) = cx(j): RY(p + i) = cy(j): RZ(p + i) = cz(j)
        If hasD Then RD(p + i) = dsc Else RD(p + i) = cd(j)
    Next i
    RRS(NRR) = p: RRL(NRR) = cn
    If src = 0 Then ROrd(NRR) = rg Else ROrd(NRR) = NAR + rg
    NRR = NRR + 1
End Sub

' ring harian terakhir yang menyentuh = g; titik pertama ring g ada di hasil -> mulai di situ;
' kalau tidak: telusuri ring g mundur dari titik pertamanya sampai bertemu titik potong / titik hasil
Private Sub StartLikeSurpac(cx() As Double, cy() As Double, cnw() As Long, ByVal cn As Long, _
                            B0x() As Double, B0y() As Double, st As Long, g As Long)
    Dim i As Long, k As Long, c As Long, j As Long, n As Long, s As Long
    Dim u As Long, v As Long, dx As Double, dy As Double, L2 As Double, t As Double, bestT As Double, bestJ As Long
    Dim bk As New Collection, kk As String
    ' indeks titik B: kunci -> ring terbesar
    For k = 0 To NBR - 1
        For j = 0 To BRL(k) - 1
            kk = KeyOf(B0x(BRS(k) + j), B0y(BRS(k) + j))
            On Error Resume Next
            bk.Remove kk
            On Error GoTo 0
            bk.Add k, kk
        Next j
    Next k
    g = -1
    For i = 0 To cn - 1
        If cnw(i) > 0 Then
            c = cnw(i) - 1
        Else
            c = KeyFind(bk, KeyOf(cx(i), cy(i)))
        End If
        If c > g Then g = c
    Next i
    st = 0
    If g < 0 Then Exit Sub
    s = BRS(g): n = BRL(g)
    For i = 0 To cn - 1
        If KeyOf(cx(i), cy(i)) = KeyOf(B0x(s), B0y(s)) Then st = i: Exit Sub
    Next i
    For j = n - 1 To 0 Step -1
        u = s + j: v = s + ((j + 1) Mod n)
        dx = B0x(v) - B0x(u): dy = B0y(v) - B0y(u): L2 = dx * dx + dy * dy
        If L2 > 0 Then
            bestJ = -1
            For i = 0 To cn - 1
                If cnw(i) = g + 1 Then
                    t = ((cx(i) - B0x(u)) * dx + (cy(i) - B0y(u)) * dy) / L2
                    If t >= -0.000000001 And t <= 1.000000001 Then
                        If Abs((cx(i) - B0x(u)) * dy - (cy(i) - B0y(u)) * dx) / Sqr(L2) < 0.000001 Then
                            If bestJ < 0 Then
                                bestT = t: bestJ = i
                            ElseIf t > bestT Then
                                bestT = t: bestJ = i
                            End If
                        End If
                    End If
                End If
            Next i
            If bestJ >= 0 Then st = bestJ: Exit Sub
            kk = KeyOf(B0x(u), B0y(u))
            For i = 0 To cn - 1
                If KeyOf(cx(i), cy(i)) = kk Then st = i: Exit Sub
            Next i
        End If
    Next j
End Sub

Private Sub SortResult(RX() As Double, RY() As Double, RZ() As Double, RD() As String, RRS() As Long, RRL() As Long, _
                       ByVal NRR As Long, ROrd() As Long)
    Dim i As Long, j As Long, a As Long, b As Long, c As Long
    For i = 1 To NRR - 1
        a = RRS(i): b = RRL(i): c = ROrd(i): j = i - 1
        Do While j >= 0
            If ROrd(j) <= c Then Exit Do
            RRS(j + 1) = RRS(j): RRL(j + 1) = RRL(j): ROrd(j + 1) = ROrd(j): j = j - 1
        Loop
        RRS(j + 1) = a: RRL(j + 1) = b: ROrd(j + 1) = c
    Next i
End Sub

Private Sub WriteRings(ByVal path As String, ByVal hdr As String, ByVal h2 As String, ByVal isBin As Boolean, _
                       RX() As Double, RY() As Double, RZ() As Double, RD() As String, RRS() As Long, RRL() As Long, _
                       ByVal NRR As Long, ByVal no As Long)
    Dim k As Long, i As Long, p As Long
    If isBin Then
        Dim o() As Byte, op As Long, cap As Long
        cap = Len(hdr) + Len(h2) + 64
        For k = 0 To NRR - 1
            For i = 0 To RRL(k)
                cap = cap + 29 + Len(RD(RRS(k) + (i Mod RRL(k))))
            Next i
            cap = cap + 29
        Next k
        ReDim o(0 To cap)
        PutTxt o, op, hdr & vbCrLf & h2 & vbCrLf
        op = op + 5
        For k = 0 To NRR - 1
            For i = 0 To RRL(k)
                p = RRS(k) + (i Mod RRL(k))
                PutRec o, op, no, RY(p), RX(p), RZ(p), RD(p)
            Next i
            PutSep o, op
        Next k
        PutBeLongU o, op, 0: op = op + 28
        PutTxt o, op, "END": op = op + 1
        ReDim Preserve o(0 To op - 1)
        WriteBytes path, o
    Else
        SBReset
        SBAdd hdr
        SBAdd h2
        For k = 0 To NRR - 1
            For i = 0 To RRL(k)
                p = RRS(k) + (i Mod RRL(k))
                SBAdd RecLine(no, RY(p), RX(p), RZ(p), RD(p))
            Next i
            SBAdd "0, 0.000, 0.000, 0.000,"
        Next k
        SBAdd "0, 0.000, 0.000, 0.000, END"
        WriteText path, SBText()
    End If
End Sub

' =============================================================================
' 3. UPDATE HARIAN = potong global lama dengan boundary harian + tambah harian,
'                    lalu bdy lama + boundary harian
' =============================================================================
Public Function UpdateHarian(ByVal globalLama As String, ByVal bdyLama As String, ByVal bdyNo As Long, _
                             ByVal harianList As String, ByVal harianBdyNo As Long, ByVal folderOut As String, _
                             ByVal tglTeks As String, Optional ByVal cekJarak As Double = 2#) As String
    Dim ymd As Long, tgl As String, outG As String, outB As String, r1 As String, r2 As String
    ymd = ResolveYmd(tglTeks, harianList)
    If ymd = 0 Then Err.Raise vbObjectError + 2, , "Tanggal tidak ditemukan; isi kolom tanggal"
    tgl = SurpacDateU(ymd)
    outG = JoinPathU(folderOut, NameWithDate(BaseName(globalLama) & ".str", ymd))
    r1 = PotongProgres(globalLama, harianList, harianBdyNo, "DALAM", harianList, outG, tgl, False, cekJarak)
    If Len(bdyLama) > 0 Then
        outB = JoinPathU(folderOut, NameWithDate(BaseName(bdyLama) & ".str", ymd))
        r2 = BoundaryOp(bdyLama, bdyNo, harianList, harianBdyNo, "TAMBAH", outB, tgl, bdyNo)
    End If
    UpdateHarian = BaseName(outG) & ": " & r1 & IIf(Len(r2) > 0, " | " & BaseName(outB) & ": " & r2, "")
    LastStat = UpdateHarian
End Function

' =============================================================================
' Tanggal & nama
' =============================================================================
' "auto"/kosong = dari nama file pertama di daftar (ddmmyy, ddmmyyyy, yyyy_mm_dd) atau header;
' "2026-10-27", "27/10/2026", "27-Oct-26" juga diterima. Hasil yyyymmdd.
Public Function ResolveYmd(ByVal v As String, ByVal fileList As String) As Long
    Dim p() As String, f As String, m As Long
    v = Trim(v)
    If Len(v) = 8 And IsNum(v) Then
        If Left(v, 2) = "20" Then ResolveYmd = CLng(v): Exit Function
    End If
    p = Split(v, "-")
    If UBound(p) = 2 Then
        If Len(p(0)) = 4 And IsNum(p(0)) And IsNum(p(1)) And IsNum(p(2)) Then ResolveYmd = CLng(p(0)) * 10000 + CLng(p(1)) * 100 + CLng(p(2)): Exit Function
        If IsNum(p(0)) And IsNum(p(2)) And Len(p(1)) = 3 Then
            m = (InStr("JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC", UCase(p(1))) + 2) \ 3
            If m > 0 Then ResolveYmd = (2000 + CLng(p(2)) Mod 100) * 10000 + m * 100 + CLng(p(0)): Exit Function
        End If
    End If
    p = Split(v, "/")
    If UBound(p) = 2 Then
        If Len(p(2)) = 4 And IsNum(p(0)) And IsNum(p(1)) And IsNum(p(2)) Then ResolveYmd = CLng(p(2)) * 10000 + CLng(p(1)) * 100 + CLng(p(0)): Exit Function
    End If
    If Len(v) > 0 And LCase(v) <> "auto" Then Exit Function
    p = Split(fileList, ";")
    If UBound(p) < 0 Then Exit Function
    f = Trim(p(0))
    ResolveYmd = YmdFromName(BaseName(f))
    If ResolveYmd = 0 Then ResolveYmd = YmdFromHeader(f)
End Function

Private Function YmdFromName(ByVal b As String) As Long
    If Len(b) >= 10 Then
        If IsNum(Left(b, 4)) And Mid(b, 5, 1) = "_" And IsNum(Mid(b, 6, 2)) And Mid(b, 8, 1) = "_" And IsNum(Mid(b, 9, 2)) Then
            YmdFromName = CLng(Left(b, 4)) * 10000 + CLng(Mid(b, 6, 2)) * 100 + CLng(Mid(b, 9, 2)): Exit Function
        End If
    End If
    If Len(b) >= 8 Then
        If IsNum(Left(b, 8)) And Not IsNum(Mid(b, 9, 1)) Then
            YmdFromName = CLng(Mid(b, 5, 4)) * 10000 + CLng(Mid(b, 3, 2)) * 100 + CLng(Left(b, 2)): Exit Function
        End If
    End If
    If Len(b) >= 6 Then
        If IsNum(Left(b, 6)) And Not IsNum(Mid(b, 7, 1)) Then
            YmdFromName = (2000 + CLng(Mid(b, 5, 2))) * 10000 + CLng(Mid(b, 3, 2)) * 100 + CLng(Left(b, 2))
        End If
    End If
End Function

Private Function YmdFromHeader(ByVal path As String) As Long
    Dim f As Integer, s As String, p() As String, q() As String, m As Long
    On Error GoTo done
    f = FreeFile
    Open path For Input As #f
    Line Input #f, s
    Close #f
    s = Replace(s, Chr(13), "")
    p = Split(s, ",")
    If UBound(p) < 1 Then Exit Function
    q = Split(Trim(p(1)), "-")
    If UBound(q) <> 2 Then Exit Function
    m = (InStr("JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC", UCase(Left(q(1), 3))) + 2) \ 3
    If m = 0 Or Not IsNum(q(0)) Or Not IsNum(Left(q(2), 2)) Then Exit Function
    YmdFromHeader = (2000 + CLng(Left(q(2), 2))) * 10000 + m * 100 + CLng(q(0))
done:
End Function

Public Function SurpacDateU(ByVal ymd As Long) As String
    SurpacDateU = Right("0" & CStr(ymd Mod 100), 2) & "-" & Mid("JanFebMarAprMayJunJulAugSepOctNovDec", ((ymd \ 100) Mod 100 - 1) * 3 + 1, 3) & _
                  "-" & Right("0" & CStr((ymd \ 10000) Mod 100), 2)
End Function

' 2026_10_26_x -> 2026_10_27_x ; 26102026_x -> 27102026_x ; 261026_x -> 271026_x ; lain: awalan yyyy_mm_dd_
Public Function NameWithDate(ByVal nama As String, ByVal ymd As Long) As String
    Dim bs As String, ex2 As String, i As Long, y As Long, m As Long, d As Long, tg As String
    i = InStrRev(nama, ".")
    If i > 0 Then
        bs = Left(nama, i - 1): ex2 = Mid(nama, i)
    Else
        bs = nama: ex2 = ""
    End If
    y = ymd \ 10000: m = (ymd \ 100) Mod 100: d = ymd Mod 100
    tg = CStr(y) & "_" & Right("0" & m, 2) & "_" & Right("0" & d, 2)
    If YmdFromName(bs) > 0 Then
        If Mid(bs, 5, 1) = "_" Then NameWithDate = tg & Mid(bs, 11) & ex2: Exit Function
        If IsNum(Left(bs, 8)) Then NameWithDate = Right("0" & d, 2) & Right("0" & m, 2) & CStr(y) & Mid(bs, 9) & ex2: Exit Function
        NameWithDate = Right("0" & d, 2) & Right("0" & m, 2) & Right("0" & (y Mod 100), 2) & Mid(bs, 7) & ex2: Exit Function
    End If
    NameWithDate = tg & "_" & bs & ex2
End Function

Private Function NewHeader(ByVal h1 As String, ByVal nama As String, ByVal tgl As String) As String
    Dim p() As String, i As Long, s As String, n As Long
    p = Split(h1, ",")
    s = nama & "," & tgl
    n = UBound(p)
    If n < 3 Then n = 3
    For i = 2 To n
        If i <= UBound(p) Then s = s & "," & p(i) Else s = s & ",0"
    Next i
    NewHeader = s
End Function

' =============================================================================
' Baca .str (teks / biner) -> segmen
' =============================================================================
Private Sub ReadAnyStr(ByVal path As String, h1 As String, h2 As String, sn() As Long, ss() As Long, sl() As Long, ns As Long, _
                       py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long)
    ns = 0: pn = 0
    ReDim sn(0 To 63): ReDim ss(0 To 63): ReDim sl(0 To 63)
    ReDim py(0 To 1023): ReDim px(0 To 1023): ReDim pz(0 To 1023): ReDim pd(0 To 1023)
    If IsBinaryFile(path) Then
        ReadBin path, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    Else
        ReadTxt path, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    End If
End Sub

Private Sub AddPt(ByVal num As Long, ByVal y As Double, ByVal x As Double, ByVal z As Double, ByVal d As String, ByVal newSeg As Boolean, _
                  sn() As Long, ss() As Long, sl() As Long, ns As Long, py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long)
    If newSeg Then
        If ns > UBound(sn) Then
            ReDim Preserve sn(0 To 2 * ns)
            ReDim Preserve ss(0 To 2 * ns)
            ReDim Preserve sl(0 To 2 * ns)
        End If
        sn(ns) = num: ss(ns) = pn: sl(ns) = 0: ns = ns + 1
    End If
    If pn > UBound(py) Then
        ReDim Preserve py(0 To 2 * pn): ReDim Preserve px(0 To 2 * pn): ReDim Preserve pz(0 To 2 * pn): ReDim Preserve pd(0 To 2 * pn)
    End If
    py(pn) = y: px(pn) = x: pz(pn) = z: pd(pn) = d: pn = pn + 1
    sl(ns - 1) = sl(ns - 1) + 1
End Sub

Private Sub ReadTxt(ByVal path As String, h1 As String, h2 As String, sn() As Long, ss() As Long, sl() As Long, ns As Long, _
                    py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long)
    Dim f As Integer, s As String, ln As Long, c1 As Long, c2 As Long, c3 As Long, c4 As Long, num As Long, open_ As Boolean
    Dim a As String, d As String
    f = FreeFile
    Open path For Input As #f
    Do While Not EOF(f)
        Line Input #f, s
        s = Replace(s, Chr(13), "")
        ln = ln + 1
        If ln = 1 Then
            h1 = s
        ElseIf ln = 2 Then
            h2 = s
        Else
            c1 = InStr(s, ",")
            If c1 > 0 Then c2 = InStr(c1 + 1, s, ",") Else c2 = 0
            If c2 > 0 Then c3 = InStr(c2 + 1, s, ",") Else c3 = 0
            If c3 > 0 Then
                a = Trim(Left(s, c1 - 1))
                If IsNum(a) Then
                    num = CLng(a)
                    c4 = InStr(c3 + 1, s, ",")
                    If num = 0 Then
                        open_ = False
                        If c4 > 0 Then
                            If Trim(Mid(s, c4 + 1)) = "END" Then Exit Do
                        End If
                    Else
                        If c4 > 0 Then
                            d = LTrim(Mid(s, c4 + 1))
                        Else
                            d = ""
                            c4 = Len(s) + 1
                        End If
                        AddPt num, Val(Trim(Mid(s, c1 + 1, c2 - c1 - 1))), Val(Trim(Mid(s, c2 + 1, c3 - c2 - 1))), _
                              Val(Trim(Mid(s, c3 + 1, c4 - c3 - 1))), d, Not open_, sn, ss, sl, ns, py, px, pz, pd, pn
                        open_ = True
                    End If
                End If
            End If
        End If
    Loop
    Close #f
End Sub

Private Sub ReadBin(ByVal path As String, h1 As String, h2 As String, sn() As Long, ss() As Long, sl() As Long, ns As Long, _
                    py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long)
    Dim f As Integer, b() As Byte, n As Long, pos As Long, e As Long, num As Long, open_ As Boolean
    f = FreeFile
    Open path For Binary Access Read As #f
    n = LOF(f)
    ReDim b(0 To n - 1)
    Get #f, 1, b
    Close #f
    pos = 0
    h1 = LineOf(b, pos): h2 = LineOf(b, pos)
    If pos + 5 <= n Then
        If b(pos) = 0 And b(pos + 1) = 0 And b(pos + 2) = 0 And b(pos + 3) = 0 And b(pos + 4) = 0 Then pos = pos + 5
    End If
    Do While pos + 28 <= n
        num = BeLongU(b, pos)
        e = pos + 28
        Do While e < n
            If b(e) = 0 Then Exit Do
            e = e + 1
        Loop
        If num = 0 Then
            open_ = False
            If e - pos - 28 = 3 Then
                If b(pos + 28) = 69 And b(pos + 29) = 78 And b(pos + 30) = 68 Then Exit Do
            End If
        Else
            AddPt num, BeDbl(b, pos + 4), BeDbl(b, pos + 12), BeDbl(b, pos + 20), DescAt(b, pos), Not open_, _
                  sn, ss, sl, ns, py, px, pz, pd, pn
            open_ = True
        End If
        pos = e + 1
    Loop
End Sub

' ring dari string nomor no (buka: titik terakhir = pertama dibuang)
Private Sub ReadRings(ByVal path As String, ByVal no As Long, rx() As Double, ry() As Double, rz() As Double, rd() As String, _
                      rs() As Long, rl() As Long, nr As Long)
    Dim h1 As String, h2 As String, sn() As Long, ss() As Long, sl() As Long, ns As Long
    Dim py() As Double, px() As Double, pz() As Double, pd() As String, pn As Long, k As Long, j As Long, n As Long
    ReadAnyStr path, h1, h2, sn, ss, sl, ns, py, px, pz, pd, pn
    ReDim rx(0 To pn + 1): ReDim ry(0 To pn + 1): ReDim rz(0 To pn + 1): ReDim rd(0 To pn + 1)
    ReDim rs(0 To ns + 1): ReDim rl(0 To ns + 1)
    nr = 0: n = 0
    For k = 0 To ns - 1
        If sn(k) = no And sl(k) >= 3 Then
            rs(nr) = n
            For j = 0 To sl(k) - 1
                rx(n) = px(ss(k) + j): ry(n) = py(ss(k) + j): rz(n) = pz(ss(k) + j): rd(n) = pd(ss(k) + j): n = n + 1
            Next j
            If rx(n - 1) = rx(rs(nr)) And ry(n - 1) = ry(rs(nr)) Then n = n - 1
            rl(nr) = n - rs(nr)
            If rl(nr) >= 3 Then nr = nr + 1 Else n = rs(nr)
        End If
    Next k
End Sub

' =============================================================================
' Byte helpers
' =============================================================================
Private Function IsBinaryFile(ByVal path As String) As Boolean
    Dim f As Integer, b() As Byte, n As Long, i As Long, nl As Long
    f = FreeFile
    Open path For Binary Access Read As #f
    n = LOF(f): If n > 8192 Then n = 8192
    If n < 8 Then Close #f: Exit Function
    ReDim b(0 To n - 1)
    Get #f, 1, b
    Close #f
    For i = 0 To n - 1
        If b(i) = 10 Then
            nl = nl + 1
            If nl = 2 Then
                If i + 5 < n Then
                    IsBinaryFile = (b(i + 1) = 0 And b(i + 2) = 0 And b(i + 3) = 0 And b(i + 4) = 0 And b(i + 5) = 0)
                End If
                Exit Function
            End If
        End If
    Next i
End Function

Private Function LineOf(b() As Byte, pos As Long) As String
    Dim s As String, st As Long
    st = pos
    Do While pos <= UBound(b)
        If b(pos) = 10 Then pos = pos + 1: Exit Do
        If b(pos) <> 13 Then s = s & Chr(b(pos))
        pos = pos + 1
    Loop
    LineOf = s
End Function

Private Function DescAt(b() As Byte, ByVal rec As Long) As String
    Dim e As Long, s As String
    e = rec + 28
    Do While e <= UBound(b)
        If b(e) = 0 Then Exit Do
        s = s & Chr(b(e)): e = e + 1
    Loop
    DescAt = s
End Function

Private Sub InitPow2()
    Dim i As Long
    If Pow2Ready Then Exit Sub
    Pow2(1023) = 1#
    For i = 1024 To 2046                     ' 2047 = Inf/NaN, tidak dipakai (2^1024 overflow)
        Pow2(i) = Pow2(i - 1) * 2#
    Next i
    For i = 1022 To 0 Step -1
        Pow2(i) = Pow2(i + 1) / 2#
    Next i
    Pow2Ready = True
End Sub

Private Function BeLongU(b() As Byte, ByVal pos As Long) As Long
    Dim v As Double
    v = ((CDbl(b(pos)) * 256# + b(pos + 1)) * 256# + b(pos + 2)) * 256# + b(pos + 3)
    If v >= 2147483648# Then v = v - 4294967296#
    BeLongU = CLng(v)
End Function

' double big-endian; tabel pangkat 2 supaya cepat (tanpa API / LSet)
Private Function BeDbl(b() As Byte, ByVal pos As Long) As Double
    Dim ex As Long, mant As Double, v As Double
    ex = (CLng(b(pos)) And 127) * 16 + (CLng(b(pos + 1)) \ 16)
    mant = ((((((CLng(b(pos + 1)) And 15) * 256# + b(pos + 2)) * 256# + b(pos + 3)) * 256# + b(pos + 4)) * 256# + _
             b(pos + 5)) * 256# + b(pos + 6)) * 256# + b(pos + 7)
    If ex = 0 Then
        If mant = 0 Then BeDbl = 0#: Exit Function
        v = mant * Pow2(0) / 4503599627370496# * 2#
    Else
        v = (4503599627370496# + mant) * (Pow2(ex) / 4503599627370496#)
    End If
    If b(pos) >= 128 Then v = -v
    BeDbl = v
End Function

Private Sub PutBeDbl(o() As Byte, ByVal pos As Long, ByVal v As Double)
    Dim sgnv As Long, ex As Long, m As Double, i As Long, hi As Double
    If v = 0 Then
        For i = 0 To 7
            o(pos + i) = 0
        Next i
        Exit Sub
    End If
    If v < 0 Then sgnv = 128: v = -v
    ex = Int(Log(v) / Log(2#)) + 1023
    If ex < 1 Then ex = 1
    If ex > 2046 Then ex = 2046
    Do While Pow2(ex) > v
        ex = ex - 1
    Loop
    Do While Pow2(ex + 1) <= v
        ex = ex + 1
    Loop
    m = (v / Pow2(ex) - 1#) * 4503599627370496#      ' tepat: pembagian pangkat 2
    For i = 7 To 2 Step -1
        hi = Int(m / 256#)
        o(pos + i) = CByte(m - hi * 256#): m = hi
    Next i
    o(pos + 1) = CByte((ex And 15) * 16 + m)
    o(pos) = CByte(sgnv + ex \ 16)
End Sub

Private Sub PutBeLongU(o() As Byte, ByVal pos As Long, ByVal v As Long)
    Dim d As Double, i As Long, hi As Double
    d = v: If d < 0 Then d = d + 4294967296#
    For i = 3 To 0 Step -1
        hi = Int(d / 256#)
        o(pos + i) = CByte(d - hi * 256#): d = hi
    Next i
End Sub

Private Sub EnsureCap(o() As Byte, ByVal nNeed As Long)
    Dim nc As Long
    If nNeed > UBound(o) Then
        nc = nNeed + nNeed \ 2 + 1024
        ReDim Preserve o(0 To nc)
    End If
End Sub

Private Sub PutTxt(o() As Byte, op As Long, ByVal s As String)
    Dim i As Long
    EnsureCap o, op + Len(s) + 1
    For i = 1 To Len(s)
        o(op) = Asc(Mid(s, i, 1)) And 255: op = op + 1
    Next i
End Sub

Private Sub PutRec(o() As Byte, op As Long, ByVal num As Long, ByVal y As Double, ByVal x As Double, ByVal z As Double, ByVal d As String)
    EnsureCap o, op + 30 + Len(d)
    PutBeLongU o, op, num
    PutBeDbl o, op + 4, y: PutBeDbl o, op + 12, x: PutBeDbl o, op + 20, z
    op = op + 28
    PutTxt o, op, d
    o(op) = 0: op = op + 1
End Sub

Private Sub PutSep(o() As Byte, op As Long)
    Dim i As Long
    EnsureCap o, op + 30
    For i = 0 To 28
        o(op + i) = 0
    Next i
    op = op + 29
End Sub

Private Sub CopyBytes(b() As Byte, ByVal src As Long, ByVal n As Long, o() As Byte, op As Long)
    Dim i As Long
    EnsureCap o, op + n + 1
    For i = 0 To n - 1
        o(op + i) = b(src + i)
    Next i
    op = op + n
End Sub

Private Sub WriteBytes(ByVal path As String, o() As Byte)
    Dim f As Integer
    On Error Resume Next
    Kill path
    On Error GoTo 0
    f = FreeFile
    Open path For Binary Access Write As #f
    Put #f, 1, o
    Close #f
End Sub

Private Sub WriteText(ByVal path As String, ByVal s As String)
    ' ditulis sebagai byte supaya akhir baris tetap CRLF di semua sistem
    Dim o() As Byte, i As Long, n As Long
    n = Len(s)
    If n = 0 Then
        ReDim o(0 To 0)
    Else
        On Error Resume Next
        o = StrConv(s, vbFromUnicode)
        If Err.Number <> 0 Then
            Err.Clear
            On Error GoTo 0
            ReDim o(0 To n - 1)
            For i = 1 To n
                o(i - 1) = Asc(Mid(s, i, 1)) And 255
            Next i
        End If
        On Error GoTo 0
    End If
    WriteBytes path, o
End Sub

Private Sub SBReset()
    NSB = 0
    ReDim SB(0 To 4095)
End Sub

Private Sub SBAdd(ByVal t As String)
    If NSB > UBound(SB) Then
        ReDim Preserve SB(0 To 2 * NSB)
    End If
    SB(NSB) = t: NSB = NSB + 1
End Sub

Private Function SBText() As String
    If NSB = 0 Then Exit Function
    ReDim Preserve SB(0 To NSB - 1)
    SBText = Join(SB, vbCrLf) & vbCrLf
End Function

Private Sub CopyD(src() As Double, dst() As Double)
    Dim i As Long
    ReDim dst(LBound(src) To UBound(src))
    For i = LBound(src) To UBound(src)
        dst(i) = src(i)
    Next i
End Sub

Private Sub CopyS(src() As String, dst() As String)
    Dim i As Long
    ReDim dst(LBound(src) To UBound(src))
    For i = LBound(src) To UBound(src)
        dst(i) = src(i)
    Next i
End Sub

Private Function RecLine(ByVal num As Long, ByVal y As Double, ByVal x As Double, ByVal z As Double, ByVal d As String) As String
    RecLine = CStr(num) & ", " & F3(y) & ", " & F3(x) & ", " & F3(z) & ", " & d
End Function

Private Function F3(ByVal x As Double) As String
    Dim v As Double, t As Double, ip As Double, fr As Long, s As String
    v = Abs(x)
    t = Int(v * 1000# + 0.5)
    ip = Int(t / 1000#)
    fr = CLng(t - ip * 1000#)
    s = Format(ip, "0") & "." & Right("00" & CStr(fr), 3)
    If x < 0 And t <> 0 Then s = "-" & s
    F3 = s
End Function

Private Function IsNum(ByVal s As String) As Boolean
    Dim i As Long
    If Len(s) = 0 Then Exit Function
    For i = 1 To Len(s)
        If Mid(s, i, 1) < "0" Or Mid(s, i, 1) > "9" Then Exit Function
    Next i
    IsNum = True
End Function

Public Function BaseName(ByVal path As String) As String
    Dim i As Long, s As String
    i = InStrRev(path, "\"): If InStrRev(path, "/") > i Then i = InStrRev(path, "/")
    s = Mid(path, i + 1)
    i = InStrRev(s, ".")
    If i > 0 Then s = Left(s, i - 1)
    BaseName = s
End Function

Private Function StripExt(ByVal path As String) As String
    Dim i As Long, j As Long
    i = InStrRev(path, "."): j = InStrRev(path, "\"): If InStrRev(path, "/") > j Then j = InStrRev(path, "/")
    If i > j Then StripExt = Left(path, i - 1) Else StripExt = path
End Function

Public Function JoinPathU(ByVal folder As String, ByVal name As String) As String
    Dim sep As String
    If InStr(folder, "/") > 0 And InStr(folder, "\") = 0 Then sep = "/" Else sep = "\"
    If Right(folder, 1) = "/" Or Right(folder, 1) = "\" Then
        JoinPathU = folder & name
    Else
        JoinPathU = folder & sep & name
    End If
End Function
