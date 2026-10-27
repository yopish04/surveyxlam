Attribute VB_Name = "SurveyUpdatePanel"
Option Explicit
' =============================================================================
' SurveyUpdatePanel - grup ribbon "Update Progress" + sheet "Update" untuk SurveyUpdate
'
'   Sheet Update    : buat / buka sheet "Update" (satu baris = satu pekerjaan)
'   Isi File        : pilih file (boleh banyak) -> path ditulis ke sel yang dipilih
'   Jalankan Update : kerjakan semua baris Pakai = Y
'   Potong Cepat    : potong satu file progress lewat dialog
'   Boundary Cepat  : tambah / kurangi / irisan boundary lewat dialog
' Hasil tidak pernah ditulis ke folder yang dilindungi (B5, mis. Y:\ dan Z:\) dan
' file asal tidak pernah ditimpa.
' =============================================================================

Private Const UPD_SHEET As String = "Update"
Private Const HDR_ROW As Long = 9
Private Const FIRST_ROW As Long = 10
Private Const C_USE As Long = 1      ' A Pakai
Private Const C_JOB As Long = 2      ' B Jenis
Private Const C_MAIN As Long = 3     ' C File utama
Private Const C_MAINNO As Long = 4   ' D String file utama (boundary A / bdy lama)
Private Const C_BDY As Long = 5      ' E File boundary / harian (banyak: pisah ;)
Private Const C_BDYNO As Long = 6    ' F String boundary
Private Const C_MODE As Long = 7     ' G Mode DALAM / LUAR
Private Const C_ADD As Long = 8      ' H Tambah harian YA / TIDAK
Private Const C_OLDBDY As Long = 9   ' I Bdy lama (UPDATE HARIAN)
Private Const C_NAME As Long = 10    ' J Nama hasil (kosong = otomatis)
Private Const C_OUT As Long = 11     ' K File hasil
Private Const C_NOTE As Long = 12    ' L Keterangan
Private Const JOBS As String = "UPDATE HARIAN,POTONG,BDY TAMBAH,BDY KURANGI,BDY IRISAN"
Private Const DEF_OUT As String = "D:\yopi\SurveySMA\hasil_update"
Private Const DEF_PROT As String = "Y:\;Z:\;\\"

' ---- ribbon callbacks --------------------------------------------------------
Public Sub RbUpdSheet(control As IRibbonControl)
    SiapkanSheetUpdate
End Sub

Public Sub RbUpdIsiFile(control As IRibbonControl)
    IsiFileKeSel
End Sub

Public Sub RbUpdJalankan(control As IRibbonControl)
    JalankanUpdate
End Sub

Public Sub RbPotongCepat(control As IRibbonControl)
    PotongCepat
End Sub

Public Sub RbBoundaryCepat(control As IRibbonControl)
    BoundaryCepat
End Sub

Public Sub RbUpdBantuan(control As IRibbonControl)
    MsgBox "UPDATE PROGRESS" & vbLf & vbLf & _
           "Sheet Update: satu baris = satu pekerjaan, Pakai = Y untuk dikerjakan." & vbLf & _
           "  UPDATE HARIAN : C = global lama, I = bdy lama (string D), E = file harian (string F)." & vbLf & _
           "                  Hasil: YYYY_MM_DD_update_topo_..str (titik di dalam boundary harian" & vbLf & _
           "                  dibuang, data harian ditambah), _bdy.str (bdy lama + boundary harian)" & vbLf & _
           "                  dan _CEK.str (ujung garis lama dekat boundary, untuk dicek)." & vbLf & _
           "  POTONG        : C = file progress, E = boundary (boleh banyak, pisah ;), F = string," & vbLf & _
           "                  G = DALAM (buang di dalam) / LUAR (buang di luar)," & vbLf & _
           "                  H = YA: data di file E (selain string boundary) langsung ditambahkan." & vbLf & _
           "  BDY TAMBAH / KURANGI / IRISAN : C = boundary A (string D), E = boundary B (string F)." & vbLf & vbLf & _
           "Tanggal (B3): auto = dari nama file harian/boundary (271026_..., 2026_10_27_...)," & vbLf & _
           "  atau 2026-10-27 / 27/10/2026. Nama hasil kosong = nama file utama dengan tanggal baru." & vbLf & _
           "Isi File: pilih sel, klik Isi File, pilih satu atau banyak file." & vbLf & _
           "Hasil ditulis ke Folder keluar (B2), tidak pernah ke folder dilindungi (B5)." & vbLf & _
           "Format hasil (teks/biner) sama dengan file utama.", vbInformation, "SMA Survey - Update Progress"
End Sub

' ---- sheet Update ----------------------------------------------------------------
Public Sub SiapkanSheetUpdate()
    Dim wb As Workbook, ws As Worksheet
    If ActiveWorkbook Is Nothing Then
        Set wb = Workbooks.Add(xlWBATWorksheet)
    Else
        Set wb = ActiveWorkbook
    End If
    On Error Resume Next
    Set ws = wb.Worksheets(UPD_SHEET)
    On Error GoTo 0
    If Not ws Is Nothing Then ws.Activate: Exit Sub
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = UPD_SHEET
    ws.Cells.Font.Name = "Calibri": ws.Cells.Font.Size = 10
    ws.Range("A1").Value = "SMA Survey - Update Progress"
    ws.Range("A1").Font.Bold = True: ws.Range("A1").Font.Size = 14
    Setting ws, 2, "Folder keluar", DEF_OUT, "hasil ditulis di sini (kosong = folder file utama, kecuali folder dilindungi)"
    Setting ws, 3, "Tanggal", "auto", "auto = dari nama file harian/boundary; atau 2026-10-27 / 27/10/2026"
    Setting ws, 4, "Jarak cek (m)", "2", "ujung garis lama terpotong sedekat ini dari boundary -> _CEK.str (0 = tidak)"
    Setting ws, 5, "Folder dilindungi", DEF_PROT, "tidak pernah ditulisi (server); pisah dengan ;"
    Setting ws, 6, "Titik di garis bdy", "TIDAK", "YA = garis yang terpotong diberi titik baru tepat di garis boundary"
    Setting ws, 7, "Buka hasil", "TIDAK", "YA = buka folder keluar setelah selesai"
    ws.Range("C2:C7").Font.Italic = True: ws.Range("C2:C7").Font.Color = RGB(110, 110, 110)

    ws.Cells(HDR_ROW, 1).Resize(1, 12).Value = Array("Pakai", "Jenis", "File utama (progress / boundary A / global lama)", _
        "String utama", "File boundary / harian (pisah ;)", "String bdy", "Mode", "Tambah harian", _
        "Bdy lama (UPDATE HARIAN)", "Nama hasil (kosong = otomatis)", "File hasil", "Keterangan")
    With ws.Cells(HDR_ROW, 1).Resize(1, 12)
        .Font.Bold = True: .Interior.Color = RGB(31, 78, 121): .Font.Color = vbWhite: .WrapText = True
    End With
    ' contoh baris
    ws.Cells(FIRST_ROW, 1).Resize(1, 9).Value = Array("N", "UPDATE HARIAN", "", 1, "", 1, "DALAM", "YA", "")
    ws.Cells(FIRST_ROW + 1, 1).Resize(1, 9).Value = Array("N", "POTONG", "", 1, "", 1, "DALAM", "TIDAK", "")
    ws.Cells(FIRST_ROW + 2, 1).Resize(1, 9).Value = Array("N", "BDY TAMBAH", "", 1, "", 1, "", "", "")
    ws.Cells(FIRST_ROW + 3, 1).Resize(1, 9).Value = Array("N", "BDY KURANGI", "", 1, "", 1, "", "", "")
    ' pilihan
    Dim rng As Range
    Set rng = ws.Range(ws.Cells(FIRST_ROW, C_USE), ws.Cells(FIRST_ROW + 200, C_USE))
    AddList rng, "Y,N"
    Set rng = ws.Range(ws.Cells(FIRST_ROW, C_JOB), ws.Cells(FIRST_ROW + 200, C_JOB))
    AddList rng, JOBS
    Set rng = ws.Range(ws.Cells(FIRST_ROW, C_MODE), ws.Cells(FIRST_ROW + 200, C_MODE))
    AddList rng, "DALAM,LUAR"
    Set rng = ws.Range(ws.Cells(FIRST_ROW, C_ADD), ws.Cells(FIRST_ROW + 200, C_ADD))
    AddList rng, "YA,TIDAK"
    ws.Columns(1).ColumnWidth = 7: ws.Columns(2).ColumnWidth = 15
    ws.Columns(3).ColumnWidth = 45: ws.Columns(4).ColumnWidth = 8
    ws.Columns(5).ColumnWidth = 45: ws.Columns(6).ColumnWidth = 8
    ws.Columns(7).ColumnWidth = 8: ws.Columns(8).ColumnWidth = 9
    ws.Columns(9).ColumnWidth = 40: ws.Columns(10).ColumnWidth = 28
    ws.Columns(11).ColumnWidth = 45: ws.Columns(12).ColumnWidth = 60
    ws.Range("A1:B7").Columns(1).ColumnWidth = 18
    ws.Rows(HDR_ROW).RowHeight = 30
    ws.Range(ws.Cells(FIRST_ROW, C_MAIN), ws.Cells(FIRST_ROW + 200, C_NAME)).NumberFormat = "@"
    ws.Activate
    ws.Cells(FIRST_ROW, C_MAIN).Select
    MsgBox "Sheet Update siap." & vbLf & "Pilih sel kolom C / E / I lalu klik Isi File untuk memilih file." & vbLf & _
           "Ubah Pakai jadi Y untuk baris yang dikerjakan, lalu Jalankan Update.", vbInformation, "SMA Survey"
End Sub

Private Sub Setting(ws As Worksheet, ByVal r As Long, ByVal label As String, ByVal v As String, ByVal note As String)
    ws.Cells(r, 1).Value = label: ws.Cells(r, 1).Font.Bold = True
    ws.Cells(r, 2).NumberFormat = "@": ws.Cells(r, 2).Value = v
    ws.Cells(r, 3).Value = note
End Sub

Private Sub AddList(rng As Range, ByVal items As String)
    On Error Resume Next
    rng.Validation.Delete
    rng.Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:=items
    On Error GoTo 0
End Sub

' ---- Isi File --------------------------------------------------------------------
Public Sub IsiFileKeSel()
    Dim v As Variant, i As Long, s As String
    If TypeName(Selection) <> "Range" Then Exit Sub
    v = Application.GetOpenFilename("String Surpac (*.str),*.str,Semua file (*.*),*.*", , "Pilih file (boleh lebih dari satu)", , True)
    If Not IsArray(v) Then Exit Sub
    For i = LBound(v) To UBound(v)
        If Len(s) > 0 Then s = s & ";"
        s = s & CStr(v(i))
    Next i
    Selection.Cells(1, 1).NumberFormat = "@"
    Selection.Cells(1, 1).Value = s
End Sub

' ---- Jalankan --------------------------------------------------------------------
Public Sub JalankanUpdate()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ActiveWorkbook.Worksheets(UPD_SHEET)
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "Sheet Update tidak ada. Klik Sheet Update dulu.", vbExclamation, "SMA Survey": Exit Sub
    End If
    Dim folderOut As String, tglSet As String, cek As Double, prot As String, titik As Boolean, buka As Boolean
    folderOut = Trim(CStr(ws.Range("B2").Value))
    tglSet = Trim(CStr(ws.Range("B3").Text))
    cek = Val(CStr(ws.Range("B4").Value))
    prot = Trim(CStr(ws.Range("B5").Value))
    titik = (UCase(Left(Trim(CStr(ws.Range("B6").Value)), 1)) = "Y")
    buka = (UCase(Left(Trim(CStr(ws.Range("B7").Value)), 1)) = "Y")

    Dim r As Long, lastR As Long, n As Long, nOk As Long, nErr As Long, t0 As Double, msg As String
    lastR = ws.Cells(ws.Rows.Count, C_JOB).End(xlUp).Row
    t0 = Timer
    Application.Cursor = xlWait
    For r = FIRST_ROW To lastR
        If UCase(Trim(CStr(ws.Cells(r, C_USE).Value))) = "Y" Then
            n = n + 1
            Application.StatusBar = "SMA Survey: baris " & r & " ..."
            DoEvents
            msg = KerjakanBaris(ws, r, folderOut, tglSet, cek, prot, titik)
            If Left(msg, 6) = "GAGAL:" Then
                nErr = nErr + 1
                ws.Cells(r, C_NOTE).Interior.Color = RGB(255, 199, 206)
            Else
                nOk = nOk + 1
                ws.Cells(r, C_NOTE).Interior.Color = RGB(198, 239, 206)
            End If
            ws.Cells(r, C_NOTE).Value = msg
        End If
    Next r
    Application.StatusBar = False
    Application.Cursor = xlDefault
    If n = 0 Then
        MsgBox "Tidak ada baris dengan Pakai = Y.", vbInformation, "SMA Survey": Exit Sub
    End If
    If buka And Len(folderOut) > 0 Then Shell "explorer.exe """ & folderOut & """", vbNormalFocus
    MsgBox nOk & " pekerjaan selesai, " & nErr & " gagal (" & Format(Timer - t0, "0.0") & " s)." & vbLf & _
           "Lihat kolom Keterangan.", IIf(nErr = 0, vbInformation, vbExclamation), "SMA Survey"
End Sub

Private Function KerjakanBaris(ws As Worksheet, ByVal r As Long, ByVal folderOut As String, ByVal tglSet As String, _
                               ByVal cek As Double, ByVal prot As String, ByVal titik As Boolean) As String
    Dim job As String, fMain As String, noMain As Long, fBdy As String, noBdy As Long, mode As String
    Dim addH As Boolean, fOld As String, nama As String, ymd As Long, tgl As String, outF As String, folder As String, res As String
    On Error GoTo fail
    job = UCase(Trim(CStr(ws.Cells(r, C_JOB).Value)))
    fMain = Trim(CStr(ws.Cells(r, C_MAIN).Value))
    noMain = CLng(Val(CStr(ws.Cells(r, C_MAINNO).Value))): If noMain = 0 Then noMain = 1
    fBdy = Trim(CStr(ws.Cells(r, C_BDY).Value))
    noBdy = CLng(Val(CStr(ws.Cells(r, C_BDYNO).Value))): If noBdy = 0 Then noBdy = 1
    mode = UCase(Trim(CStr(ws.Cells(r, C_MODE).Value))): If Len(mode) = 0 Then mode = "DALAM"
    addH = (UCase(Left(Trim(CStr(ws.Cells(r, C_ADD).Value)), 1)) = "Y")
    fOld = Trim(CStr(ws.Cells(r, C_OLDBDY).Value))
    nama = Trim(CStr(ws.Cells(r, C_NAME).Value))
    ' cek file
    If Len(fMain) = 0 Then KerjakanBaris = "GAGAL: kolom C (file utama) kosong": Exit Function
    If Not FileAda(fMain) Then KerjakanBaris = "GAGAL: file tidak ada: " & fMain: Exit Function
    If Len(fBdy) = 0 Then KerjakanBaris = "GAGAL: kolom E (boundary / harian) kosong": Exit Function
    If Not SemuaAda(fBdy) Then KerjakanBaris = "GAGAL: ada file di kolom E yang tidak ditemukan": Exit Function
    If Len(fOld) > 0 Then
        If Not FileAda(fOld) Then KerjakanBaris = "GAGAL: bdy lama tidak ada: " & fOld: Exit Function
    End If
    ' tanggal
    ymd = ResolveYmd(tglSet, fBdy)
    If ymd = 0 Then ymd = ResolveYmd("auto", fMain)
    If ymd = 0 Then ymd = CLng(Year(Date)) * 10000 + CLng(Month(Date)) * 100 + CLng(Day(Date))
    tgl = SurpacDateU(ymd)
    ' folder
    folder = folderOut
    If Len(folder) = 0 Then folder = Left(fMain, InStrRev(fMain, "\") - 1)
    If Dilindungi(folder, prot) Then KerjakanBaris = "GAGAL: folder keluar dilindungi (" & folder & "); isi B2 dengan folder lain": Exit Function
    BuatFolder folder

    Select Case job
        Case "UPDATE HARIAN"
            outF = JoinPathU(folder, NameWithDate(BaseName(fMain) & ".str", ymd))
            If SamaFile(outF, fMain & ";" & fOld & ";" & fBdy) Then KerjakanBaris = "GAGAL: file hasil sama dengan file asal (cek tanggal)": Exit Function
            If Len(fOld) > 0 Then
                If SamaFile(JoinPathU(folder, NameWithDate(BaseName(fOld) & ".str", ymd)), fMain & ";" & fOld & ";" & fBdy) Then
                    KerjakanBaris = "GAGAL: bdy hasil sama dengan file asal (cek tanggal)": Exit Function
                End If
            End If
            res = UpdateHarian(fMain, fOld, noMain, fBdy, noBdy, folder, CStr(ymd), cek)
            If Len(nama) > 0 Then res = res & " (kolom J diabaikan untuk UPDATE HARIAN)"
        Case "POTONG"
            outF = HasilPath(folder, nama, fMain, ymd, "_potong")
            If SamaFile(outF, fMain) Or SamaFile(outF, fBdy) Then KerjakanBaris = "GAGAL: file hasil sama dengan file asal": Exit Function
            res = PotongProgres(fMain, fBdy, noBdy, mode, IIf(addH, fBdy, ""), outF, tgl, titik, cek)
        Case "BDY TAMBAH", "BDY KURANGI", "BDY IRISAN"
            outF = HasilPath(folder, nama, fMain, ymd, "_" & LCase(Mid(job, 5)))
            If SamaFile(outF, fMain) Then KerjakanBaris = "GAGAL: file hasil sama dengan file asal": Exit Function
            res = BoundaryOp(fMain, noMain, fBdy, noBdy, Mid(job, 5), outF, tgl, noMain)
        Case Else
            KerjakanBaris = "GAGAL: jenis tidak dikenal: " & job: Exit Function
    End Select
    ws.Cells(r, C_OUT).NumberFormat = "@"
    ws.Cells(r, C_OUT).Value = outF
    KerjakanBaris = tgl & ": " & res
    Exit Function
fail:
    KerjakanBaris = "GAGAL: " & Err.Description
End Function

' nama hasil: kolom J, atau nama file utama dengan tanggal baru; tidak boleh sama dengan file asal
Private Function HasilPath(ByVal folder As String, ByVal nama As String, ByVal fMain As String, ByVal ymd As Long, _
                           ByVal suffix As String) As String
    Dim p As String
    If Len(nama) > 0 Then
        If LCase(Right(nama, 4)) <> ".str" Then nama = nama & ".str"
        p = JoinPathU(folder, nama)
    Else
        p = JoinPathU(folder, NameWithDate(BaseName(fMain) & ".str", ymd))
        If SamaFile(p, fMain) Then p = JoinPathU(folder, BaseName(fMain) & suffix & ".str")
    End If
    HasilPath = p
End Function

' ---- Potong cepat / Boundary cepat (dialog) ----------------------------------------
Public Sub PotongCepat()
    Dim fMain As String, fBdy As String, no As Long, mode As String, addH As Boolean, ymd As Long, outF As Variant
    Dim v As Variant, s As String, i As Long, ans As VbMsgBoxResult
    v = Application.GetOpenFilename("String Surpac (*.str),*.str", , "1/4 Pilih file PROGRESS yang akan dipotong")
    If VarType(v) = vbBoolean Then Exit Sub
    fMain = CStr(v)
    v = Application.GetOpenFilename("String Surpac (*.str),*.str", , "2/4 Pilih file BOUNDARY (boleh lebih dari satu)", , True)
    If Not IsArray(v) Then Exit Sub
    For i = LBound(v) To UBound(v)
        If Len(fBdy) > 0 Then fBdy = fBdy & ";"
        fBdy = fBdy & CStr(v(i))
    Next i
    s = InputBox("Nomor string boundary:", "SMA Survey - Potong", "1")
    If Len(s) = 0 Then Exit Sub
    no = CLng(Val(s))
    ans = MsgBox("Buang titik yang DI DALAM boundary?" & vbLf & vbLf & _
                 "Ya    = buang di dalam (untuk update global)" & vbLf & _
                 "Tidak = buang di luar (ambil area di dalam boundary)", vbYesNoCancel + vbQuestion, "SMA Survey - Potong")
    If ans = vbCancel Then Exit Sub
    If ans = vbYes Then mode = "DALAM" Else mode = "LUAR"
    ans = MsgBox("Tambahkan data dari file boundary (selain string " & no & ") ke hasil?" & vbLf & _
                 "(Ya untuk update harian: file boundary = file harian)", vbYesNo + vbQuestion, "SMA Survey - Potong")
    addH = (ans = vbYes)
    s = InputBox("Tanggal hasil (auto = dari nama file boundary, atau 27/10/2026):", "SMA Survey - Potong", "auto")
    If Len(s) = 0 Then Exit Sub
    ymd = ResolveYmd(s, fBdy)
    If ymd = 0 Then ymd = CLng(Year(Date)) * 10000 + CLng(Month(Date)) * 100 + CLng(Day(Date))
    outF = Application.GetSaveAsFilename(JoinPathU(FolderDefault(fMain), NameWithDate(BaseName(fMain) & ".str", ymd)), _
                                         "String Surpac (*.str),*.str", , "3/4 Simpan hasil sebagai")
    If VarType(outF) = vbBoolean Then Exit Sub
    If Not CekTujuan(CStr(outF), fMain & ";" & fBdy) Then Exit Sub
    Dim res As String
    Application.Cursor = xlWait
    On Error GoTo fail
    res = PotongProgres(fMain, fBdy, no, mode, IIf(addH, fBdy, ""), CStr(outF), SurpacDateU(ymd), False, 2#)
    Application.Cursor = xlDefault
    MsgBox "Selesai: " & CStr(outF) & vbLf & res, vbInformation, "SMA Survey - Potong"
    Exit Sub
fail:
    Application.Cursor = xlDefault
    MsgBox "Gagal: " & Err.Description, vbExclamation, "SMA Survey - Potong"
End Sub

Public Sub BoundaryCepat()
    Dim fA As String, fB As String, noA As Long, noB As Long, op As String, ymd As Long, outF As Variant
    Dim v As Variant, s As String, i As Long
    v = Application.GetOpenFilename("String Surpac (*.str),*.str", , "1/5 Pilih BOUNDARY A (mis. bdy progress global)")
    If VarType(v) = vbBoolean Then Exit Sub
    fA = CStr(v)
    s = InputBox("Nomor string boundary A:", "SMA Survey - Boundary", "1")
    If Len(s) = 0 Then Exit Sub
    noA = CLng(Val(s))
    v = Application.GetOpenFilename("String Surpac (*.str),*.str", , "2/5 Pilih BOUNDARY B (mis. file harian; boleh banyak)", , True)
    If Not IsArray(v) Then Exit Sub
    For i = LBound(v) To UBound(v)
        If Len(fB) > 0 Then fB = fB & ";"
        fB = fB & CStr(v(i))
    Next i
    s = InputBox("Nomor string boundary B:", "SMA Survey - Boundary", "1")
    If Len(s) = 0 Then Exit Sub
    noB = CLng(Val(s))
    s = InputBox("Operasi:" & vbLf & "1 = TAMBAH (A + B)" & vbLf & "2 = KURANGI (A - B)" & vbLf & "3 = IRISAN (bagian A yang juga di B)", _
                 "SMA Survey - Boundary", "1")
    Select Case Trim(s)
        Case "1": op = "TAMBAH"
        Case "2": op = "KURANGI"
        Case "3": op = "IRISAN"
        Case Else: Exit Sub
    End Select
    s = InputBox("Tanggal hasil (auto = dari nama file B, atau 27/10/2026):", "SMA Survey - Boundary", "auto")
    If Len(s) = 0 Then Exit Sub
    ymd = ResolveYmd(s, fB)
    If ymd = 0 Then ymd = CLng(Year(Date)) * 10000 + CLng(Month(Date)) * 100 + CLng(Day(Date))
    outF = Application.GetSaveAsFilename(JoinPathU(FolderDefault(fA), NameWithDate(BaseName(fA) & ".str", ymd)), _
                                         "String Surpac (*.str),*.str", , "Simpan boundary hasil sebagai")
    If VarType(outF) = vbBoolean Then Exit Sub
    If Not CekTujuan(CStr(outF), fA & ";" & fB) Then Exit Sub
    Dim res As String
    Application.Cursor = xlWait
    On Error GoTo fail
    res = BoundaryOp(fA, noA, fB, noB, op, CStr(outF), SurpacDateU(ymd), noA)
    Application.Cursor = xlDefault
    MsgBox "Selesai: " & CStr(outF) & vbLf & res, vbInformation, "SMA Survey - Boundary"
    Exit Sub
fail:
    Application.Cursor = xlDefault
    MsgBox "Gagal: " & Err.Description, vbExclamation, "SMA Survey - Boundary"
End Sub

' ---- helpers ---------------------------------------------------------------------
Private Function ProtList() As String
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ActiveWorkbook.Worksheets(UPD_SHEET)
    On Error GoTo 0
    If ws Is Nothing Then
        ProtList = DEF_PROT
    Else
        ProtList = Trim(CStr(ws.Range("B5").Value))
        If Len(ProtList) = 0 Then ProtList = DEF_PROT
    End If
End Function

Private Function FolderDefault(ByVal f As String) As String
    Dim d As String
    d = Left(f, InStrRev(f, "\") - 1)
    If Dilindungi(d, ProtList()) Then
        BuatFolder DEF_OUT
        d = DEF_OUT
    End If
    FolderDefault = d
End Function

Private Function CekTujuan(ByVal outF As String, ByVal asal As String) As Boolean
    Dim d As String
    d = Left(outF, InStrRev(outF, "\") - 1)
    If Dilindungi(d, ProtList()) Then
        MsgBox "Folder ini dilindungi (server), hasil tidak ditulis ke sana:" & vbLf & d, vbExclamation, "SMA Survey"
        Exit Function
    End If
    If SamaFile(outF, asal) Then
        MsgBox "File hasil tidak boleh sama dengan file asal.", vbExclamation, "SMA Survey"
        Exit Function
    End If
    CekTujuan = True
End Function

Private Function Dilindungi(ByVal folder As String, ByVal prot As String) As Boolean
    Dim p() As String, i As Long, a As String
    p = Split(prot, ";")
    For i = 0 To UBound(p)
        a = Trim(p(i))
        If Len(a) > 0 Then
            If LCase(Left(folder & "\", Len(a))) = LCase(a) Then Dilindungi = True: Exit Function
        End If
    Next i
End Function

Private Function SamaFile(ByVal a As String, ByVal list As String) As Boolean
    Dim p() As String, i As Long
    p = Split(list, ";")
    For i = 0 To UBound(p)
        If LCase(Trim(p(i))) = LCase(Trim(a)) Then SamaFile = True: Exit Function
    Next i
End Function

Private Function FileAda(ByVal f As String) As Boolean
    On Error Resume Next
    FileAda = (Len(Dir(f)) > 0)
End Function

Private Function SemuaAda(ByVal list As String) As Boolean
    Dim p() As String, i As Long
    p = Split(list, ";")
    For i = 0 To UBound(p)
        If Len(Trim(p(i))) > 0 Then
            If Not FileAda(Trim(p(i))) Then Exit Function
        End If
    Next i
    SemuaAda = True
End Function

Private Sub BuatFolder(ByVal path As String)
    Dim p() As String, i As Long, cur As String
    p = Split(path, "\")
    cur = p(0)
    For i = 1 To UBound(p)
        If Len(p(i)) > 0 Then
            cur = cur & "\" & p(i)
            On Error Resume Next
            MkDir cur
            On Error GoTo 0
        End If
    Next i
End Sub
