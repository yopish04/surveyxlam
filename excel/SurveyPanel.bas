Attribute VB_Name = "SurveyPanel"
Option Explicit
' =============================================================================
' SurveyPanel - ribbon tab "SMA Survey" + sheet "Job" for SurveyCore
'
'   Siapkan Job  : pick the folder with raw .txt -> new workbook with sheet "Job"
'                  (one row per file; kind, area and profile guessed from the name)
'   Proses       : read sheet "Job" -> SurveyCore.RunJob -> .str files + sheet "Log"
'   Folder Hasil : open the output folder in Explorer
'   File Job     : run a job .txt (same format as uji_libreoffice/contoh_job_*.txt)
'   Simpan Job   : write sheet "Job" as a job .txt
' The ribbon callbacks (Rb*) only call the plain subs below, so those can be
' tested without a ribbon.
' =============================================================================

Private Const JOB_SHEET As String = "Job"
Private Const FIRST_ROW As Long = 11     ' first file row on sheet Job
Private Const COL_USE As Long = 1        ' A  Pakai (Y/N)
Private Const COL_FILE As Long = 2       ' B  File .txt
Private Const COL_KIND As Long = 3       ' C  Jenis (pit, rehandling, exca, ...)
Private Const COL_AREA As Long = 4       ' D  Nama area / file hasil
Private Const COL_PROF As Long = 5       ' E  Profil: harian / base / exca
Private Const COL_DATE As Long = 6       ' F  Tanggal di nama file

' ---- ribbon callbacks --------------------------------------------------------
Public Sub RbSiapkan(control As IRibbonControl)
    SiapkanJob ""
End Sub

Public Sub RbProses(control As IRibbonControl)
    ProsesJob
End Sub

Public Sub RbFolderHasil(control As IRibbonControl)
    BukaFolderHasil
End Sub

Public Sub RbFileJob(control As IRibbonControl)
    JalankanFileJob ""
End Sub

Public Sub RbSimpanJob(control As IRibbonControl)
    SimpanJob ""
End Sub

Public Sub RbMuatBoundary(control As IRibbonControl)
    MuatUlangBoundary
End Sub

Public Sub RbBantuan(control As IRibbonControl)
    MsgBox "1. Siapkan Job: pilih folder berisi file .txt dari alat." & vbLf & _
           "   Daftar file muncul di sheet Job. Periksa kolom Area dan Profil;" & vbLf & _
           "   file dengan nama Area yang sama digabung jadi satu .str." & vbLf & _
           "   Pakai = N untuk melewati file." & vbLf & _
           "2. Isi Folder keluar, Tanggal (auto / 2026-10-27 / 27/10/2026) dan Label." & vbLf & _
           "3. Proses: membuat .str per area, _jalan.str, exa_ds/exa_ns," & vbLf & _
           "   gabung\<tanggal>.str dan <tanggal>_LOG.txt." & vbLf & vbLf & _
           "Profil: harian (pit/rehandling/quarry: 2->5, 3->6, 500->600)," & vbLf & _
           "        base (base/dump/waste/pelebaran: 2->2, 3->3, 500->500)," & vbLf & _
           "        exca (posisi unit; Area = nama file hasil, mis. exa_ds)." & vbLf & _
           "Muat Ulang Boundary: setelah crest/toe/spot diedit di Surpac dan disimpan," & vbLf & _
           "   pilih file .str itu; string 1 dibuat ulang dari titik yang ada sekarang." & vbLf & _
           "   String lain tidak diubah. File lama disalin dulu ke folder backup_boundary." & vbLf & vbLf & _
           "File .txt mentah tidak pernah diubah.", vbInformation, "SMA Survey"
End Sub

' ---- Siapkan Job -------------------------------------------------------------
Public Sub SiapkanJob(ByVal folderIn As String)
    Dim f As String, names() As String, n As Long, i As Long, j As Long, t As String
    If Len(folderIn) = 0 Then folderIn = PickFolder("Pilih folder berisi file .txt mentah")
    If Len(folderIn) = 0 Then Exit Sub

    f = Dir(JoinPath(folderIn, "*.txt"))
    Do While Len(f) > 0
        ReDim Preserve names(0 To n)
        names(n) = f: n = n + 1
        f = Dir()
    Loop
    If n = 0 Then
        MsgBox "Tidak ada file .txt di" & vbLf & folderIn, vbExclamation, "SMA Survey"
        Exit Sub
    End If
    For i = 0 To n - 2                       ' sort by name
        For j = i + 1 To n - 1
            If LCase(names(j)) < LCase(names(i)) Then t = names(i): names(i) = names(j): names(j) = t
        Next j
    Next i

    Dim newest As Long, d As Long
    For i = 0 To n - 1
        d = FileDate(names(i))
        If d > newest Then newest = d
    Next i

    Dim wb As Workbook, ws As Worksheet
    Set wb = Workbooks.Add(xlWBATWorksheet)
    Set ws = wb.Worksheets(1)
    ws.Name = JOB_SHEET
    ws.Cells.Font.Name = "Calibri": ws.Cells.Font.Size = 10

    ws.Range("A1").Value = "SMA Survey - daftar pekerjaan"
    ws.Range("A1").Font.Bold = True: ws.Range("A1").Font.Size = 14
    PutSetting ws, 2, "Folder masuk", folderIn
    PutSetting ws, 3, "Folder keluar", JoinPath(folderIn, "STR")
    PutSetting ws, 4, "Tanggal", "auto"
    PutSetting ws, 5, "Label", "RTK_SMA"
    PutSetting ws, 6, "Kode jalan", "7"
    PutSetting ws, 7, "Nama exca DS", "exa_ds"
    ws.Range("C4").Value = "auto = tanggal terbaru di nama file; atau 2026-10-27 / 27/10/2026"
    ws.Range("C6").Value = "kosongkan kalau tidak ada jalan"
    ws.Range("C2:C7").Font.Italic = True: ws.Range("C2:C7").Font.Color = RGB(110, 110, 110)

    ws.Cells(FIRST_ROW - 1, COL_USE).Resize(1, 6).Value = _
        Array("Pakai", "File .txt", "Jenis", "Area (nama .str)", "Profil", "Tgl file")
    With ws.Cells(FIRST_ROW - 1, COL_USE).Resize(1, 6)
        .Font.Bold = True: .Interior.Color = RGB(31, 78, 121): .Font.Color = vbWhite
    End With

    Dim r As Long, kind As String, loc As String, area As String, prof As String, use_ As String
    For i = 0 To n - 1
        r = FIRST_ROW + i
        kind = KindOf(names(i)): loc = LocationOf(names(i))
        d = FileDate(names(i))
        use_ = "Y"
        Select Case kind
            Case "exca"
                prof = "exca"
                If IsNightShift(names(i), d, newest) Then
                    area = TagOfDay(d) & "_exa_ns"
                Else
                    area = "exa_ds"
                End If
            Case "abaikan"
                prof = "": area = "": use_ = "N"
            Case Else
                prof = ProfileOf(kind)
                If kind = "dumpingan" Then
                    area = "dumpingan"
                ElseIf Len(loc) > 0 Then
                    area = kind & "_" & loc
                Else
                    area = kind
                End If
                If d > 0 And newest > 0 And d < newest Then area = TagOfDay(d) & "_" & area
        End Select
        ws.Cells(r, COL_USE).Value = use_
        ws.Cells(r, COL_FILE).Value = names(i)
        ws.Cells(r, COL_KIND).Value = kind
        ws.Cells(r, COL_AREA).Value = area
        ws.Cells(r, COL_PROF).Value = prof
        If d > 0 Then ws.Cells(r, COL_DATE).Value = "'" & Format(d Mod 100, "00") & "-" & _
            Format((d \ 100) Mod 100, "00") & "-" & CStr(d \ 10000)
    Next i

    Dim last As Long: last = FIRST_ROW + n - 1
    With ws.Range(ws.Cells(FIRST_ROW, COL_USE), ws.Cells(last + 50, COL_USE)).Validation
        .Delete: .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="Y,N"
    End With
    With ws.Range(ws.Cells(FIRST_ROW, COL_PROF), ws.Cells(last + 50, COL_PROF)).Validation
        .Delete: .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="harian,base,exca"
    End With
    ws.Range(ws.Cells(FIRST_ROW, COL_AREA), ws.Cells(last, COL_PROF)).Interior.Color = RGB(255, 242, 204)
    ws.Range("B2:B7").Interior.Color = RGB(255, 242, 204)
    ws.Columns("A").ColumnWidth = 14
    ws.Columns("B").ColumnWidth = 62
    ws.Columns("C").ColumnWidth = 12
    ws.Columns("D").ColumnWidth = 30
    ws.Columns("E").ColumnWidth = 9
    ws.Columns("F").ColumnWidth = 11
    ws.Activate
    ws.Cells(FIRST_ROW, 1).Select
    ActiveWindow.FreezePanes = True
    ws.Range("D11").Select
    Application.StatusBar = False
End Sub

Private Sub PutSetting(ws As Worksheet, ByVal r As Long, ByVal label As String, ByVal v As String)
    ws.Cells(r, 1).Value = label
    ws.Cells(r, 1).Font.Bold = True
    ws.Cells(r, 2).NumberFormat = "@"
    ws.Cells(r, 2).Value = v
End Sub

' ---- Proses ------------------------------------------------------------------
Public Sub ProsesJob()
    Dim ws As Worksheet
    Set ws = JobSheet()
    If ws Is Nothing Then Exit Sub

    Dim folderIn As String, folderOut As String, dt As String, lbl As String
    Dim roadCode As String, dsName As String
    folderIn = Trim(CStr(ws.Range("B2").Value))
    folderOut = Trim(CStr(ws.Range("B3").Value))
    dt = Trim(CStr(ws.Range("B4").Text))
    lbl = Trim(CStr(ws.Range("B5").Value))
    roadCode = Trim(CStr(ws.Range("B6").Value))
    dsName = Trim(CStr(ws.Range("B7").Value))
    If Len(folderIn) = 0 Or Len(Dir(folderIn, vbDirectory)) = 0 Then
        MsgBox "Folder masuk (B2) tidak ditemukan.", vbExclamation, "SMA Survey": Exit Sub
    End If
    If Len(folderOut) = 0 Then MsgBox "Isi Folder keluar (B3).", vbExclamation, "SMA Survey": Exit Sub
    If Len(dsName) = 0 Then dsName = "exa_ds"

    Dim kinds() As String, names() As String, args() As String, files() As String, nRows As Long
    Dim r As Long, last As Long, area As String, prof As String, fname As String, k As Long
    Dim missing As String, nArea As Long
    last = ws.Cells(ws.Rows.Count, COL_FILE).End(xlUp).Row
    For r = FIRST_ROW To last
        fname = Trim(CStr(ws.Cells(r, COL_FILE).Value))
        area = Trim(CStr(ws.Cells(r, COL_AREA).Value))
        prof = LCase(Trim(CStr(ws.Cells(r, COL_PROF).Value)))
        If UCase(Trim(CStr(ws.Cells(r, COL_USE).Value))) <> "N" And Len(fname) > 0 _
           And Len(area) > 0 And Len(prof) > 0 Then
            If Len(Dir(JoinPath(folderIn, fname))) = 0 Then
                missing = missing & vbLf & fname
            Else
                Dim want As String
                If prof = "exca" Then want = "EXCA" Else want = "AREA"
                k = FindRow(kinds, names, nRows, want, area)
                If k < 0 Then
                    ReDim Preserve kinds(0 To nRows): ReDim Preserve names(0 To nRows)
                    ReDim Preserve args(0 To nRows): ReDim Preserve files(0 To nRows)
                    kinds(nRows) = want: names(nRows) = area
                    If want = "AREA" Then
                        args(nRows) = prof: files(nRows) = fname: nArea = nArea + 1
                    Else
                        args(nRows) = fname
                    End If
                    nRows = nRows + 1
                ElseIf want = "AREA" Then
                    files(k) = files(k) & ";" & fname
                Else
                    args(k) = args(k) & ";" & fname
                End If
            End If
        End If
    Next r
    If Len(missing) > 0 Then
        MsgBox "File tidak ditemukan di folder masuk:" & missing, vbExclamation, "SMA Survey": Exit Sub
    End If
    If nArea = 0 Then MsgBox "Tidak ada baris area yang dipakai.", vbExclamation, "SMA Survey": Exit Sub

    ' exca DS: unit codes inside the area files, plus DS unit files if any
    Dim allArea As String
    For k = 0 To nRows - 1
        If kinds(k) = "AREA" Then
            If Len(allArea) > 0 Then allArea = allArea & ";"
            allArea = allArea & files(k)
        End If
    Next k
    k = FindRow(kinds, names, nRows, "EXCA", dsName)
    If k >= 0 Then
        args(k) = allArea & ";" & args(k)
    Else
        ReDim Preserve kinds(0 To nRows): ReDim Preserve names(0 To nRows)
        ReDim Preserve args(0 To nRows): ReDim Preserve files(0 To nRows)
        kinds(nRows) = "EXCA": names(nRows) = dsName: args(nRows) = "AREA"
        nRows = nRows + 1
    End If
    If Len(roadCode) > 0 Then
        ReDim Preserve kinds(0 To nRows): ReDim Preserve names(0 To nRows)
        ReDim Preserve args(0 To nRows): ReDim Preserve files(0 To nRows)
        kinds(nRows) = "JALAN": names(nRows) = "jalan": args(nRows) = roadCode
        nRows = nRows + 1
    End If

    Dim t0 As Double: t0 = Timer
    Application.ScreenUpdating = False
    Application.Cursor = xlWait
    Application.StatusBar = "SMA Survey: memproses " & nArea & " area ..."
    On Error GoTo fail
    SetDateLabel IIf(Len(dt) = 0, "auto", dt), IIf(Len(lbl) = 0, "RTK_SMA", lbl)
    RunJob folderIn, folderOut, "", kinds, names, args, files, nRows
    On Error GoTo 0
    Application.Cursor = xlDefault
    Application.ScreenUpdating = True
    Application.StatusBar = False

    ShowLog ws.Parent, LastLog(), folderOut, Timer - t0
    Exit Sub
fail:
    Application.Cursor = xlDefault
    Application.ScreenUpdating = True
    Application.StatusBar = False
    MsgBox "Proses gagal: " & Err.Description & " (" & Err.Number & ")", vbCritical, "SMA Survey"
End Sub

Private Function FindRow(kinds() As String, names() As String, ByVal n As Long, _
                         ByVal kind As String, ByVal name As String) As Long
    Dim i As Long
    FindRow = -1
    For i = 0 To n - 1
        If kinds(i) = kind And LCase(names(i)) = LCase(name) Then FindRow = i: Exit Function
    Next i
End Function

Private Sub ShowLog(wb As Workbook, ByVal logText As String, ByVal folderOut As String, ByVal secs As Double)
    Dim ws As Worksheet, lines() As String, i As Long
    On Error Resume Next
    Set ws = wb.Worksheets("Log")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = "Log"
    End If
    ws.Cells.Clear
    ws.Range("A1").Value = "Hasil proses " & Format(Now, "dd-mm-yyyy hh:nn") & _
                           " (" & Format(secs, "0.0") & " detik) -> " & folderOut
    ws.Range("A1").Font.Bold = True
    lines = Split(Replace(logText, vbCr, ""), vbLf)
    For i = 0 To UBound(lines)
        ws.Cells(i + 3, 1).Value = "'" & lines(i)
    Next i
    ws.Columns("A").ColumnWidth = 120
    ws.Activate
    ws.Range("A1").Select
    If MsgBox("Selesai dalam " & Format(secs, "0.0") & " detik." & vbLf & _
              "Hasil ada di:" & vbLf & folderOut & vbLf & vbLf & "Buka folder hasil?", _
              vbYesNo + vbInformation, "SMA Survey") = vbYes Then
        Shell "explorer.exe """ & folderOut & """", vbNormalFocus
    End If
End Sub

' ---- Muat Ulang Boundary ------------------------------------------------------------
' For each chosen .str (edited in Surpac): copy it to <folder>\backup_boundary\, then
' rebuild string 1 from the points now in the file and write it back in place.
Public Sub MuatUlangBoundary()
    Dim v As Variant, i As Long, files() As String, n As Long
    v = Application.GetOpenFilename("String Surpac (*.str),*.str", , "Pilih file .str yang sudah diedit", , True)
    If Not IsArray(v) Then Exit Sub
    n = UBound(v) - LBound(v) + 1
    ReDim files(0 To n - 1)
    For i = 0 To n - 1
        files(i) = CStr(v(LBound(v) + i))
    Next i
    Dim msg As String, bak As String, folder As String, name As String, t0 As Double
    t0 = Timer
    Application.Cursor = xlWait
    For i = 0 To n - 1
        Application.StatusBar = "SMA Survey: boundary " & (i + 1) & "/" & n & " ..."
        folder = Left(files(i), InStrRev(files(i), "\") - 1)
        name = Mid(files(i), InStrRev(files(i), "\") + 1)
        On Error Resume Next
        MkDir JoinPath(folder, "backup_boundary")
        On Error GoTo 0
        bak = JoinPath(JoinPath(folder, "backup_boundary"), _
              Left(name, Len(name) - 4) & "_" & Format(Now, "yyyymmdd_hhnnss") & ".str")
        On Error GoTo fail
        FileCopy files(i), bak
        msg = msg & name & ": " & ReloadBoundary(bak, files(i)) & vbLf
        On Error GoTo 0
    Next i
    Application.Cursor = xlDefault
    Application.StatusBar = False
    MsgBox "Boundary dibuat ulang (" & Format(Timer - t0, "0.0") & " detik):" & vbLf & vbLf & msg & vbLf & _
           "File lama ada di folder backup_boundary." & vbLf & _
           "Buka ulang file di Surpac untuk melihat boundary baru.", vbInformation, "SMA Survey"
    Exit Sub
fail:
    Application.Cursor = xlDefault
    Application.StatusBar = False
    MsgBox "Gagal pada " & name & ": " & Err.Description & vbLf & _
           "File asli tidak diubah kalau salinan backup belum dibuat." & vbLf & vbLf & msg, vbCritical, "SMA Survey"
End Sub

' ---- other buttons -------------------------------------------------------------
Public Sub BukaFolderHasil()
    Dim ws As Worksheet, p As String
    Set ws = JobSheet()
    If ws Is Nothing Then Exit Sub
    p = Trim(CStr(ws.Range("B3").Value))
    If Len(p) = 0 Or Len(Dir(p, vbDirectory)) = 0 Then
        MsgBox "Folder keluar belum ada:" & vbLf & p, vbExclamation, "SMA Survey": Exit Sub
    End If
    Shell "explorer.exe """ & p & """", vbNormalFocus
End Sub

Public Sub JalankanFileJob(ByVal jobPath As String)
    If Len(jobPath) = 0 Then
        Dim v As Variant
        v = Application.GetOpenFilename("File job (*.txt),*.txt", , "Pilih file daftar pekerjaan")
        If VarType(v) = vbBoolean Then Exit Sub
        jobPath = CStr(v)
    End If
    Dim t0 As Double: t0 = Timer
    Application.Cursor = xlWait
    On Error GoTo fail
    RunJobFile jobPath
    Application.Cursor = xlDefault
    MsgBox "Selesai dalam " & Format(Timer - t0, "0.0") & " detik." & vbLf & vbLf & LastLog(), _
           vbInformation, "SMA Survey"
    Exit Sub
fail:
    Application.Cursor = xlDefault
    MsgBox "Proses gagal: " & Err.Description, vbCritical, "SMA Survey"
End Sub

Public Sub SimpanJob(ByVal jobPath As String)
    Dim ws As Worksheet
    Set ws = JobSheet()
    If ws Is Nothing Then Exit Sub
    If Len(jobPath) = 0 Then
        Dim v As Variant
        v = Application.GetSaveAsFilename("job.txt", "File job (*.txt),*.txt", , "Simpan daftar pekerjaan")
        If VarType(v) = vbBoolean Then Exit Sub
        jobPath = CStr(v)
    End If
    Dim f As Integer, r As Long, last As Long, s As String
    f = FreeFile
    Open jobPath For Output As #f
    Print #f, "# Dibuat oleh SMA Survey " & Format(Now, "yyyy-mm-dd hh:nn")
    Print #f, "FOLDER_IN=" & ws.Range("B2").Value
    Print #f, "FOLDER_OUT=" & ws.Range("B3").Value
    Print #f, "DATE=" & ws.Range("B4").Text
    Print #f, "LABEL=" & ws.Range("B5").Value
    ' one AREA / EXCA line per distinct area name
    Dim seen As String, area As String, prof As String, lst As String, r2 As Long
    last = ws.Cells(ws.Rows.Count, COL_FILE).End(xlUp).Row
    For r = FIRST_ROW To last
        area = Trim(CStr(ws.Cells(r, COL_AREA).Value))
        prof = LCase(Trim(CStr(ws.Cells(r, COL_PROF).Value)))
        If RowUsed(ws, r) And InStr(seen, "|" & LCase(area) & "|") = 0 Then
            seen = seen & "|" & LCase(area) & "|"
            lst = ""
            For r2 = r To last
                If RowUsed(ws, r2) And LCase(Trim(CStr(ws.Cells(r2, COL_AREA).Value))) = LCase(area) Then
                    If Len(lst) > 0 Then lst = lst & ";"
                    lst = lst & Trim(CStr(ws.Cells(r2, COL_FILE).Value))
                End If
            Next r2
            If prof = "exca" Then
                Print #f, "EXCA|" & area & "|" & lst
            Else
                Print #f, "AREA|" & area & "|" & prof & "|" & lst
            End If
        End If
    Next r
    If Len(Trim(CStr(ws.Range("B6").Value))) > 0 Then Print #f, "JALAN|jalan|" & ws.Range("B6").Value
    If InStr(seen, "|" & LCase(Trim(CStr(ws.Range("B7").Value))) & "|") = 0 Then _
        Print #f, "EXCA|" & ws.Range("B7").Value & "|AREA"
    Close #f
    MsgBox "Disimpan: " & jobPath, vbInformation, "SMA Survey"
End Sub

Private Function RowUsed(ws As Worksheet, ByVal r As Long) As Boolean
    RowUsed = UCase(Trim(CStr(ws.Cells(r, COL_USE).Value))) <> "N" _
        And Len(Trim(CStr(ws.Cells(r, COL_FILE).Value))) > 0 _
        And Len(Trim(CStr(ws.Cells(r, COL_AREA).Value))) > 0 _
        And Len(Trim(CStr(ws.Cells(r, COL_PROF).Value))) > 0
End Function

Private Function JobSheet() As Worksheet
    On Error Resume Next
    Set JobSheet = ActiveWorkbook.Worksheets(JOB_SHEET)
    On Error GoTo 0
    If JobSheet Is Nothing Then
        MsgBox "Sheet ""Job"" tidak ada di workbook aktif." & vbLf & _
               "Klik Siapkan Job dulu.", vbExclamation, "SMA Survey"
    End If
End Function

Private Function PickFolder(ByVal title As String) As String
    With Application.FileDialog(4)          ' msoFileDialogFolderPicker
        .Title = title
        .AllowMultiSelect = False
        If .Show = -1 Then PickFolder = .SelectedItems(1)
    End With
End Function

' ---- guesses from the file name (port of riset/prototipe/kelompok_area.py) ------
Public Function KindOf(ByVal fileName As String) As String
    Dim runs() As String, nr As Long, i As Long, k As Long, w As Long
    Dim kinds As Variant, words As Variant, ws_ As Variant
    kinds = Array("exca", "abaikan", "base", "pelebaran", "rehandling", "dumpingan", "quarry", "pit")
    words = Array("REC,EXA,EXC,EXCA", "GCP", "BASE,BES", "PELEBARAN,LAMINATING", "REH,RH", _
                  "DUMP,DAMP,WSD,WASTE,WST,WD", "QUAR", "PIT")
    nr = LetterRuns(StripExt(UCase(fileName)), runs)
    For k = 0 To UBound(kinds)
        ws_ = Split(words(k), ",")
        For w = 0 To UBound(ws_)
            For i = 0 To nr - 1
                If runs(i) = ws_(w) Or Left(runs(i), Len(ws_(w))) = ws_(w) Or _
                   Right(runs(i), Len(ws_(w))) = ws_(w) Or _
                   (Len(ws_(w)) >= 3 And InStr(runs(i), ws_(w)) > 0) Then
                    KindOf = kinds(k): Exit Function
                End If
            Next i
        Next w
    Next k
    KindOf = "lain"
End Function

Public Function ProfileOf(ByVal kind As String) As String
    Select Case kind
        Case "base", "pelebaran", "dumpingan": ProfileOf = "base"
        Case Else: ProfileOf = "harian"
    End Select
End Function

' TF3 / TF03 / TOFU-03 -> tofu3, LD-03 -> ld03, REHANDLING-05 -> ld05, TOS17 -> tos17
Public Function LocationOf(ByVal fileName As String) As String
    Dim u As String, p As Long, dg As String, best As Long, v As String
    u = StripExt(UCase(fileName))
    ' LD<sep>digits
    p = 0
    Do
        p = InStr(p + 1, u, "LD")
        If p = 0 Then Exit Do
        dg = DigitsAfter(u, p + 2, False)
        If Len(dg) > 0 Then
            If Left(dg, 1) = "0" Or Len(dg) <= 2 Then dg = Left(dg, 2) Else dg = Left(dg, 1)
            LocationOf = "ld" & Format(CLng(dg), "00"): Exit Function
        End If
    Loop
    ' R(E)H<letters><sep>0d
    v = RehLoc(u, "REH"): If Len(v) = 0 Then v = RehLoc(u, "RH")
    If Len(v) > 0 Then LocationOf = v: Exit Function
    ' TOS<sep>d{1,2}
    p = 0
    Do
        p = InStr(p + 1, u, "TOS")
        If p = 0 Then Exit Do
        dg = DigitsAfter(u, p + 3, False)
        If Len(dg) > 0 Then LocationOf = "tos" & CStr(CLng(Left(dg, 2))): Exit Function
    Loop
    ' (TOFU|TF)<sep>(0d|d), earliest match wins
    Dim pa As Long, pb As Long, da As String, db As String
    pa = FirstWithDigits(u, "TOFU", da)
    pb = FirstWithDigits(u, "TF", db)
    If pa > 0 And (pb = 0 Or pa <= pb) Then
        LocationOf = "tofu" & CStr(CLng(OneOrZeroLead(da)))
    ElseIf pb > 0 Then
        LocationOf = "tofu" & CStr(CLng(OneOrZeroLead(db)))
    End If
End Function

Private Function RehLoc(ByVal u As String, ByVal word As String) As String
    Dim p As Long, dg As String
    p = 0
    Do
        p = InStr(p + 1, u, word)
        If p = 0 Then Exit Do
        dg = DigitsAfter(u, p + Len(word), True)
        If Len(dg) >= 2 Then
            If Left(dg, 1) = "0" Then RehLoc = "ld" & Left(dg, 2): Exit Function
        End If
    Loop
End Function

Private Function FirstWithDigits(ByVal u As String, ByVal word As String, dg As String) As Long
    Dim p As Long
    p = 0
    Do
        p = InStr(p + 1, u, word)
        If p = 0 Then Exit Do
        dg = DigitsAfter(u, p + Len(word), False)
        If Len(dg) > 0 Then FirstWithDigits = p: Exit Function
    Loop
End Function

Private Function OneOrZeroLead(ByVal dg As String) As String
    If Left(dg, 1) = "0" And Len(dg) >= 2 Then OneOrZeroLead = Left(dg, 2) Else OneOrZeroLead = Left(dg, 1)
End Function

' digit run starting at position p after optional letters (if allowed) and " _-"
Private Function DigitsAfter(ByVal u As String, ByVal p As Long, ByVal skipLetters As Boolean) As String
    Dim c As String
    If skipLetters Then
        Do While p <= Len(u)
            c = Mid(u, p, 1)
            If c < "A" Or c > "Z" Then Exit Do
            p = p + 1
        Loop
    End If
    Do While p <= Len(u)
        c = Mid(u, p, 1)
        If c <> " " And c <> "_" And c <> "-" Then Exit Do
        p = p + 1
    Loop
    Do While p <= Len(u)
        c = Mid(u, p, 1)
        If c < "0" Or c > "9" Then Exit Do
        DigitsAfter = DigitsAfter & c
        p = p + 1
    Loop
End Function

Private Function LetterRuns(ByVal u As String, runs() As String) As Long
    Dim i As Long, c As String, cur As String, n As Long
    ReDim runs(0 To Len(u))
    For i = 1 To Len(u) + 1
        If i <= Len(u) Then c = Mid(u, i, 1) Else c = " "
        If c >= "A" And c <= "Z" Then
            cur = cur & c
        ElseIf Len(cur) > 0 Then
            runs(n) = cur: n = n + 1: cur = ""
        End If
    Next i
    LetterRuns = n
End Function

Private Function StripExt(ByVal s As String) As String
    If InStrRev(s, ".") > 0 Then StripExt = Left(s, InStrRev(s, ".") - 1) Else StripExt = s
End Function

' NS = night-shift unit file: "NS" in the name, or older than the newest file
Private Function IsNightShift(ByVal fileName As String, ByVal d As Long, ByVal newest As Long) As Boolean
    Dim runs() As String, nr As Long, i As Long
    nr = LetterRuns(StripExt(UCase(fileName)), runs)
    For i = 0 To nr - 1
        If runs(i) = "NS" Then IsNightShift = True: Exit Function
    Next i
    If d > 0 And newest > 0 And d < newest Then IsNightShift = True
End Function

' yyyymmdd -> ddmmyy
Private Function TagOfDay(ByVal d As Long) As String
    TagOfDay = Format(d Mod 100, "00") & Format((d \ 100) Mod 100, "00") & Format((d \ 10000) Mod 100, "00")
End Function
