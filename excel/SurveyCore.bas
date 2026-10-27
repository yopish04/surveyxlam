Attribute VB_Name = "SurveyCore"
Option Explicit
' =============================================================================
' SurveyCore - raw instrument .txt  ->  Surpac .str
' VBA port of riset/prototipe/raw2str.py + proses_job.py (same rules, same output).
'
' Job list (what the panel fills in), one item per line:
'   FOLDER_IN=<folder with .txt>     FOLDER_OUT=<folder for .str>
'   DATE=auto | 2026-10-25 | 25/10/2026 | 25-Oct-26    (auto = newest date in file names)
'   TAG=251026 (optional, made from DATE)           LABEL=RTK_SMA (last description field)
'   AREA|pit_tofu3|harian|a.txt;b.txt      (harian: 2->5 3->6 500->600 602->602)
'   AREA|waste_tf9|base|c.txt              (base:   2->2 3->3 500->500 602->602)
'   JALAN|jalan|7                          (code 7 taken from all AREA files)
'   EXCA|exa_ds|AREA                       (unit codes taken from all AREA files)
'   EXCA|241026_exa_ns|x.txt;y.txt         (unit codes taken from these files)
' Raw .txt files are only read, never changed.
' Numbers are read with Val() and written with Fmt3(): always a dot as decimal
' separator, whatever the Windows regional setting (Indonesian uses a comma).
' =============================================================================

Private Const C_CREST As Long = 1
Private Const C_TOE As Long = 2
Private Const C_JUNC As Long = 4
Private Const C_SPOT As Long = 8
Private Const C_ROAD As Long = 16
Private Const C_EXCA As Long = 32

Private Const LINE_GAP As Double = 8#      ' m: break a crest/toe line
Private Const AREA_LINK As Double = 12#    ' m: points further apart = separate area
Private Const HULL_K As Long = 8           ' neighbours for the concave hull
Private Const FOLLOW_DEV As Double = 6#    ' m: boundary may follow a string this far off
Private Const DOUBLE_TOL As Double = 0.05  ' m: same spot shot twice
Private Const SPOT_GAP As Double = 15#     ' m: break a spot string
Private Const ROAD_PTS As Long = 5         ' points per road cross-section
Private Const EXCA_SPREAD As Double = 1#   ' m: unit shots further apart -> pick by hand
Private Const DUP_TOL As Double = 1#       ' m: crest/toe measured twice (second pass this close)
Private Const DIG_EDGE As Double = 5#      ' m: boundary edges longer than this are dug inwards
Private Const DIG_DEPTH As Double = 0.3    ' dug point at most this fraction of the edge inside
Private Const DIG_CAP As Double = 2#       ' m: and at most this far inside

' ---- point pool (one area at a time) ----------------------------------------
Private PN() As Double, PE() As Double, PZ() As Double
Private PName() As String, PCode() As String, PFile() As String
Private PCls() As Long
Private NP As Long

' ---- output buffers ------------------------------------------------------------
Private BufA() As String, NA As Long     ' current area file body
Private BufG() As String, NG As Long     ' gabung body (all areas)
Private BufR() As String, NR As Long     ' jalan body (all areas)
Private LogTxt As String

Private gDate As String      ' as written in the .str, e.g. 26-Oct-26
Private gDateIn As String    ' as given by the panel / job file (auto, 2026-10-26, ...)
Private gLabel As String     ' last description field, e.g. RTK_SMA
Private gRoadCode As String

' =============================================================================
' Entry points
' =============================================================================
Public Sub RunJobFile(ByVal jobPath As String)
    Dim lines() As String, n As Long, i As Long, s As String
    Dim folderIn As String, folderOut As String, tag As String
    Dim kinds() As String, names() As String, args() As String, files() As String
    Dim nRows As Long, f As Integer, parts() As String

    f = FreeFile
    Open jobPath For Input As #f
    Do While Not EOF(f)
        Line Input #f, s
        s = Trim(Replace(s, Chr(13), ""))
        If Len(s) > 0 And Left(s, 1) <> "#" Then
            If InStr(s, "|") = 0 And InStr(s, "=") > 0 Then
                Select Case UCase(Trim(Left(s, InStr(s, "=") - 1)))
                    Case "FOLDER_IN": folderIn = Trim(Mid(s, InStr(s, "=") + 1))
                    Case "FOLDER_OUT": folderOut = Trim(Mid(s, InStr(s, "=") + 1))
                    Case "DATE": gDateIn = Trim(Mid(s, InStr(s, "=") + 1))
                    Case "LABEL": gLabel = Trim(Mid(s, InStr(s, "=") + 1))
                    Case "TAG": tag = Trim(Mid(s, InStr(s, "=") + 1))
                End Select
            Else
                parts = Split(s, "|")
                ReDim Preserve kinds(0 To nRows): ReDim Preserve names(0 To nRows)
                ReDim Preserve args(0 To nRows): ReDim Preserve files(0 To nRows)
                kinds(nRows) = UCase(Trim(parts(0)))
                names(nRows) = Trim(parts(1))
                If UBound(parts) >= 2 Then args(nRows) = Trim(parts(2))
                If UBound(parts) >= 3 Then files(nRows) = Trim(parts(3))
                nRows = nRows + 1
            End If
        End If
    Loop
    Close #f
    RunJob folderIn, folderOut, tag, kinds, names, args, files, nRows
End Sub

' The panel sets the date field ("auto", a day, or text) and the label before RunJob.
Public Sub SetDateLabel(ByVal dateText As String, ByVal label As String)
    gDateIn = dateText: gLabel = label
End Sub

' The panel calls this directly with the rows it shows.
Public Sub RunJob(ByVal folderIn As String, ByVal folderOut As String, ByVal tag As String, _
                  kinds() As String, names() As String, args() As String, files() As String, _
                  ByVal nRows As Long)
    Dim i As Long, title As String, areaFiles As String, fl() As String, nf As Long
    LogTxt = ""
    NG = 0: NR = 0
    gRoadCode = "7"
    If Len(gLabel) = 0 Then gLabel = "RTK_SMA"
    Dim allFiles As String
    For i = 0 To nRows - 1
        If kinds(i) = "AREA" Then allFiles = allFiles & ";" & files(i)
        If kinds(i) = "EXCA" And UCase(args(i)) <> "AREA" Then allFiles = allFiles & ";" & args(i)
    Next i
    gDate = ResolveDate(gDateIn, allFiles)
    If Len(tag) = 0 Then tag = TagOf(gDate)
    For i = 0 To nRows - 1
        If kinds(i) = "JALAN" And Len(args(i)) > 0 Then gRoadCode = args(i)
    Next i
    MakeFolder folderOut
    MakeFolder JoinPath(folderOut, "gabung")

    For i = 0 To nRows - 1
        If kinds(i) = "AREA" Then
            title = FullName(tag, names(i))
            nf = SplitFiles(files(i), folderIn, fl)
            If Len(areaFiles) > 0 Then areaFiles = areaFiles & ";"
            areaFiles = areaFiles & files(i)
            ConvertArea fl, nf, title, LCase(args(i)), JoinPath(folderOut, title & ".str")
        End If
    Next i
    For i = 0 To nRows - 1
        title = FullName(tag, names(i))
        If kinds(i) = "JALAN" Then
            If NR > 0 Then
                WriteStr JoinPath(folderOut, title & ".str"), title, 3
                AddLog title & ".str: jalan dibuat"
            Else
                AddLog title & ": 0 titik kode " & gRoadCode & ", file tidak dibuat"
            End If
        ElseIf kinds(i) = "EXCA" Then
            If UCase(args(i)) = "AREA" Then
                nf = SplitFiles(areaFiles, folderIn, fl)
            Else
                nf = SplitFiles(args(i), folderIn, fl)
            End If
            WriteExca fl, nf, title, JoinPath(folderOut, title & ".str")
        End If
    Next i
    WriteStr JoinPath(JoinPath(folderOut, "gabung"), tag & ".str"), tag, 2
    WriteText JoinPath(folderOut, tag & "_LOG.txt"), LogTxt
End Sub

Public Function LastLog() As String
    LastLog = LogTxt
End Function

' =============================================================================
' One area: files -> <title>.str
' =============================================================================
Private Sub ConvertArea(fl() As String, ByVal nf As Long, ByVal title As String, _
                        ByVal profile As String, ByVal outPath As String)
    Dim i As Long, j As Long, k As Long, c As Long
    Dim pts() As Long, np2 As Long, road() As Long, nRoad As Long
    Dim nNoCode As Long, nExca As Long
    Dim crestNo As Long, toeNo As Long

    If profile = "base" Or profile = "tetap" Then crestNo = 2: toeNo = 3 Else crestNo = 5: toeNo = 6
    NP = 0
    For i = 0 To nf - 1
        LoadRaw fl(i)
    Next i
    ReDim pts(0 To NP): ReDim road(0 To NP)
    For i = 0 To NP - 1
        c = PCls(i)
        If c = 0 Then
            nNoCode = nNoCode + 1
        ElseIf (c And C_EXCA) <> 0 Then
            nExca = nExca + 1
        ElseIf (c And C_ROAD) <> 0 Then
            road(nRoad) = i: nRoad = nRoad + 1
        Else
            pts(np2) = i: np2 = np2 + 1
        End If
    Next i

    Dim roadOk As Boolean
    If nRoad > 0 Then roadOk = BuildRoad(road, nRoad)

    ' ---- true doubles: keep the first ----
    Dim kept() As Long, nk As Long, nDbl As Long, isDbl As Boolean
    ReDim kept(0 To np2)
    For i = 0 To np2 - 1
        isDbl = False
        For j = 0 To nk - 1
            If Abs(PE(pts(i)) - PE(kept(j))) <= DOUBLE_TOL Then
                If Dist(pts(i), kept(j)) <= DOUBLE_TOL And Abs(PZ(pts(i)) - PZ(kept(j))) <= DOUBLE_TOL Then
                    isDbl = True: Exit For
                End If
            End If
        Next j
        If isDbl Then nDbl = nDbl + 1 Else kept(nk) = pts(i): nk = nk + 1
    Next i

    ' ---- points per file, in the order the files first appear ----
    Dim fNames() As String, nFil As Long, fOf() As Long
    ReDim fNames(0 To nf): ReDim fOf(0 To nk)
    For i = 0 To nk - 1
        k = -1
        For j = 0 To nFil - 1
            If fNames(j) = PFile(kept(i)) Then k = j: Exit For
        Next j
        If k < 0 Then fNames(nFil) = PFile(kept(i)): k = nFil: nFil = nFil + 1
        fOf(i) = k
    Next i

    ' ---- crest / toe lines ----
    Dim crest As Collection, toe As Collection, allLines As Collection
    Set crest = BuildLines(kept, nk, fOf, nFil, C_CREST)
    Set toe = BuildLines(kept, nk, fOf, nFil, C_TOE)
    ' ---- no crossing lines: drop double passes, untangle, cut what still crosses ----
    Dim drop() As Boolean, nDrop As Long, nCut As Long
    ReDim drop(0 To NP)
    TidyLines crest, drop, nDrop
    TidyLines toe, drop, nDrop
    FixCrossings crest, toe, drop, nDrop, nCut
    j = 0
    For i = 0 To nk - 1
        If Not drop(kept(i)) Then kept(j) = kept(i): fOf(j) = fOf(i): j = j + 1
    Next i
    nk = j

    Set allLines = New Collection
    For i = 1 To crest.Count
        allLines.Add crest(i)
    Next i
    For i = 1 To toe.Count
        allLines.Add toe(i)
    Next i

    ' ---- areas and their boundary ----
    Dim lab() As Long, nAreas As Long, members() As Long, nm As Long
    Dim hull() As Long, nh As Long
    NA = 0
    nAreas = Clusters(kept, nk, lab)
    ReDim members(0 To nk)
    For c = 0 To nAreas - 1
        nm = 0
        For i = 0 To nk - 1
            If lab(i) = c Then members(nm) = kept(i): nm = nm + 1
        Next i
        If nm >= 10 Then
            If ConcaveHull(members, nm, hull, nh) Then
                FollowStrings hull, nh, allLines
                DigHull hull, nh, members, nm, allLines
                EmitIdx 1, 1, hull, nh, True
            End If
        End If
    Next c

    ' ---- crest, toe, junction, spot strings ----
    Dim arr As Variant
    For i = 1 To crest.Count
        arr = crest(i)
        If UBound(arr) >= 1 Then EmitVar 1, crestNo, arr, False
    Next i
    For i = 1 To toe.Count
        arr = toe(i)
        If UBound(arr) >= 1 Then EmitVar 1, toeNo, arr, False
    Next i
    Dim one(0 To 0) As Long
    For i = 0 To nk - 1
        If (PCls(kept(i)) And C_JUNC) <> 0 Then one(0) = kept(i): EmitIdx 1, 23, one, 1, False
    Next i
    EmitSpots kept, nk, fOf, nFil, profile

    WriteStr outPath, title, 1
    For i = 0 To NA - 1
        AddLine 2, BufA(i)
    Next i

    Dim msg As String
    msg = title & ".str: " & nAreas & " area"
    If nNoCode > 0 Then msg = msg & ", tanpa kode (dilewati): " & nNoCode
    If nExca > 0 Then msg = msg & ", posisi unit EX (dipisah): " & nExca
    If nRoad > 0 Then msg = msg & ", titik jalan (ke file jalan): " & nRoad
    If nRoad > 0 And Not roadOk Then msg = msg & ", JALAN PERLU DICEK"
    If nDbl > 0 Then msg = msg & ", titik double (dihapus): " & nDbl
    If nDrop > 0 Then msg = msg & ", crest/toe diukur 2x (dibuang): " & nDrop
    If nCut > 0 Then msg = msg & ", garis diputus agar tidak bersilangan: " & nCut
    AddLog msg
End Sub

' =============================================================================
' Raw file reading
' =============================================================================
' Two instrument formats, detected per line (same as raw2str.read_raw):
'   A  tab, header line:   name<TAB>N<TAB>E<TAB>Z<TAB>code          (pit RTK export)
'   B  spaces, no header:  code N E Z name [antenna height] [FIXED|DGNSS|...]
Private Sub LoadRaw(ByVal path As String)
    Dim f As Integer, s As String, parts As Variant
    f = FreeFile
    Open path For Input As #f
    Do While Not EOF(f)
        Line Input #f, s
        s = Replace(s, Chr(13), "")
        If InStr(s, Chr(9)) > 0 Then
            parts = Split(s, Chr(9))
            If UBound(parts) >= 3 Then
                If IsNumText(parts(1)) And IsNumText(parts(2)) And IsNumText(parts(3)) Then
                    Dim rawCode As String
                    rawCode = ""
                    If UBound(parts) >= 4 Then rawCode = Trim(parts(4))
                    AddRawPoint Trim(parts(0)), parts(1), parts(2), parts(3), rawCode, path
                End If
            End If
        Else
            parts = SplitSpaces(s)
            If UBound(parts) >= 4 Then
                If IsNumText(parts(1)) And IsNumText(parts(2)) And IsNumText(parts(3)) Then
                    AddRawPoint parts(4), parts(1), parts(2), parts(3), parts(0), path
                End If
            End If
        End If
    Loop
    Close #f
End Sub

Private Sub AddRawPoint(ByVal nm As String, ByVal sn As String, ByVal se As String, ByVal sz As String, _
                        ByVal code As String, ByVal path As String)
    If NP Mod 512 = 0 Then GrowPool NP + 512
    PName(NP) = nm
    PN(NP) = Val(sn): PE(NP) = Val(se): PZ(NP) = Val(sz)
    PCode(NP) = code
    PFile(NP) = path
    PCls(NP) = Classify(PCode(NP))
    NP = NP + 1
End Sub

' "  a  b   c " -> (a, b, c)
Public Function SplitSpaces(ByVal s As String) As Variant
    Dim t As String, parts() As String
    t = Trim(Replace(s, Chr(9), " "))
    Do While InStr(t, "  ") > 0
        t = Replace(t, "  ", " ")
    Loop
    If Len(t) = 0 Then
        ReDim parts(0 To 0): parts(0) = "": SplitSpaces = parts: Exit Function
    End If
    SplitSpaces = Split(t, " ")
End Function

' A number as written by the instrument (digits, one dot, optional leading minus)
Public Function IsNumText(ByVal s As String) As Boolean
    Dim i As Long, c As String, dots As Long, digits As Long
    s = Trim(s)
    If Len(s) = 0 Then Exit Function
    For i = 1 To Len(s)
        c = Mid(s, i, 1)
        If c >= "0" And c <= "9" Then
            digits = digits + 1
        ElseIf c = "." Then
            dots = dots + 1
        ElseIf c = "-" And i = 1 Then
        Else
            Exit Function
        End If
    Next i
    IsNumText = (digits > 0 And dots <= 1)
End Function

' Format of a raw file: "B" when the first data line is code N E Z name (spaces), else "A"
Public Function RawFormatOf(ByVal path As String) As String
    Dim f As Integer, s As String, parts As Variant
    RawFormatOf = "A"
    f = FreeFile
    Open path For Input As #f
    Do While Not EOF(f)
        Line Input #f, s
        s = Replace(s, Chr(13), "")
        If InStr(s, Chr(9)) > 0 Then
            parts = Split(s, Chr(9))
            If UBound(parts) >= 3 Then
                If IsNumText(parts(1)) Then Exit Do
            End If
        ElseIf Len(Trim(s)) > 0 Then
            parts = SplitSpaces(s)
            If UBound(parts) >= 4 Then
                If IsNumText(parts(1)) And IsNumText(parts(2)) Then RawFormatOf = "B": Exit Do
            End If
        End If
    Loop
    Close #f
End Function

Private Sub GrowPool(ByVal n As Long)
    ReDim Preserve PN(0 To n): ReDim Preserve PE(0 To n): ReDim Preserve PZ(0 To n)
    ReDim Preserve PName(0 To n): ReDim Preserve PCode(0 To n): ReDim Preserve PFile(0 To n)
    ReDim Preserve PCls(0 To n)
End Sub

Private Function Classify(ByVal code As String) As Long
    If code = "2" Then
        Classify = C_CREST
    ElseIf code = "3" Then
        Classify = C_TOE
    ElseIf code = "23" Then
        Classify = C_CREST Or C_TOE Or C_JUNC
    ElseIf code = gRoadCode Then
        Classify = C_ROAD
    ElseIf code = "" Then
        Classify = 0
    ElseIf IsDigits(code) Then
        Classify = C_SPOT
    Else
        Classify = C_EXCA
    End If
End Function

Public Function IsDigits(ByVal s As String) As Boolean
    Dim i As Long, ch As String
    If Len(s) = 0 Then Exit Function
    For i = 1 To Len(s)
        ch = Mid(s, i, 1)
        If ch < "0" Or ch > "9" Then Exit Function
    Next i
    IsDigits = True
End Function

' =============================================================================
' Crest / toe lines
' =============================================================================
Private Function BuildLines(kept() As Long, ByVal nk As Long, fOf() As Long, ByVal nFil As Long, _
                            ByVal kind As Long) As Collection
    Dim runs As New Collection, fi As Long, i As Long
    Dim cur() As Long, nc As Long
    For fi = 0 To nFil - 1
        nc = 0
        ReDim cur(0 To nk)
        For i = 0 To nk - 1
            If fOf(i) = fi Then
                If (PCls(kept(i)) And kind) <> 0 Then
                    If nc > 0 Then
                        If Dist(cur(nc - 1), kept(i)) > LINE_GAP Then runs.Add Slice(cur, 0, nc): nc = 0
                    End If
                    cur(nc) = kept(i): nc = nc + 1
                Else
                    If nc > 0 Then runs.Add Slice(cur, 0, nc): nc = 0
                End If
            End If
        Next i
        If nc > 0 Then runs.Add Slice(cur, 0, nc)
    Next fi
    MergeRuns runs
    Set BuildLines = runs
End Function

' Join the nearest pair of free line ends (<= LINE_GAP), repeatedly.
' A junction (23) end is a natural line end and is never joined.
Private Sub MergeRuns(runs As Collection)
    Dim i As Long, j As Long, ea As Long, eb As Long, a As Variant, b As Variant
    Dim pa As Long, pb As Long, dd As Double
    Dim found As Boolean, bd As Double, bi As Long, bj As Long, bea As Long, beb As Long
    Do
        found = False
        For i = 1 To runs.Count
            a = runs(i)
            For j = i + 1 To runs.Count
                b = runs(j)
                For ea = 0 To 1
                    For eb = 0 To 1
                        If ea = 0 Then pa = a(0) Else pa = a(UBound(a))
                        If eb = 0 Then pb = b(0) Else pb = b(UBound(b))
                        If (PCls(pa) And C_JUNC) = 0 And (PCls(pb) And C_JUNC) = 0 Then
                            dd = Dist(pa, pb)
                            If dd <= LINE_GAP Then
                                If Not found Or dd < bd Then
                                    found = True: bd = dd: bi = i: bj = j: bea = ea: beb = eb
                                End If
                            End If
                        End If
                    Next eb
                Next ea
            Next j
        Next i
        If Not found Then Exit Do
        a = runs(bi): b = runs(bj)
        If bea = 0 Then a = Reversed(a)
        If beb = 1 Then b = Reversed(b)
        Dim joined As Variant
        joined = Concat(a, b)
        runs.Remove bj
        runs.Add joined, , , bi
        runs.Remove bi
    Loop
End Sub

' =============================================================================
' Areas (single linkage) and concave hull boundary
' =============================================================================
Private Function Clusters(kept() As Long, ByVal nk As Long, lab() As Long) As Long
    Dim par() As Long, i As Long, j As Long, ri As Long, rj As Long
    ReDim par(0 To nk): ReDim lab(0 To nk)
    For i = 0 To nk - 1
        par(i) = i
    Next i
    For i = 0 To nk - 1
        For j = i + 1 To nk - 1
            If Abs(PE(kept(i)) - PE(kept(j))) <= AREA_LINK Then
                If Dist(kept(i), kept(j)) <= AREA_LINK Then
                    ri = Root(par, i): rj = Root(par, j)
                    If ri <> rj Then If ri < rj Then par(rj) = ri Else par(ri) = rj
                End If
            End If
        Next j
    Next i
    ' number the areas in the order of their first point
    Dim rootLab() As Long, n As Long, r As Long
    ReDim rootLab(0 To nk)
    For i = 0 To nk - 1
        rootLab(i) = -1
    Next i
    For i = 0 To nk - 1
        r = Root(par, i)
        If rootLab(r) < 0 Then rootLab(r) = n: n = n + 1
        lab(i) = rootLab(r)
    Next i
    Clusters = n
End Function

Private Function Root(par() As Long, ByVal i As Long) As Long
    Do While par(i) <> i
        par(i) = par(par(i)): i = par(i)
    Loop
    Root = i
End Function

' Moreira & Santos k-nearest-neighbour concave hull on existing points only.
Private Function ConcaveHull(mem() As Long, ByVal nm As Long, hull() As Long, nh As Long) As Boolean
    Dim P() As Long, np2 As Long, i As Long, j As Long, dup As Boolean, k As Long, ok As Boolean
    ReDim P(0 To nm)
    For i = 0 To nm - 1
        dup = False
        For j = 0 To np2 - 1
            If Round(PE(mem(i)), 3) = Round(PE(P(j)), 3) Then
                If Round(PN(mem(i)), 3) = Round(PN(P(j)), 3) Then dup = True: Exit For
            End If
        Next j
        If Not dup Then P(np2) = mem(i): np2 = np2 + 1
    Next i
    If np2 < 4 Then
        hull = P: nh = np2: ConcaveHull = True: Exit Function
    End If
    k = HULL_K: If k < 3 Then k = 3
    Do While k < np2
        If KnnHull(P, np2, k, hull, nh) Then
            ok = True
            For i = 0 To np2 - 1 Step 3
                If Not InArr(hull, nh, P(i)) Then
                    If Not InsidePoly(hull, nh, P(i)) Then ok = False: Exit For
                End If
            Next i
            If ok Then ConcaveHull = True: Exit Function
        End If
        k = k + 2
    Loop
End Function

Private Function KnnHull(P() As Long, ByVal np2 As Long, ByVal k As Long, hull() As Long, nh As Long) As Boolean
    Dim first As Long, i As Long, j As Long, cur As Long, prevAng As Double, stp As Long
    Dim rem_() As Long, nRem As Long
    Dim cand() As Long, dc() As Double, tc() As Double, used() As Boolean, m As Long
    Dim best As Long, bestD As Double, t As Long, tmpL As Long, tmpD As Double
    Dim nxt As Long, last As Long, ok As Boolean

    first = P(0)
    For i = 1 To np2 - 1
        If PN(P(i)) < PN(first) Or (PN(P(i)) = PN(first) And PE(P(i)) < PE(first)) Then first = P(i)
    Next i
    ReDim hull(0 To np2 + 1): nh = 1: hull(0) = first
    ReDim rem_(0 To np2 + 1)
    For i = 0 To np2 - 1
        If P(i) <> first Then rem_(nRem) = P(i): nRem = nRem + 1
    Next i
    cur = first: prevAng = 0#: stp = 0
    ReDim cand(0 To k): ReDim dc(0 To nRem + 1): ReDim tc(0 To k): ReDim used(0 To nRem + 1)
    Do
        If stp = 4 Then rem_(nRem) = first: nRem = nRem + 1
        ' k nearest, ties keep the order of rem_ (stable)
        m = k: If m > nRem Then m = nRem
        For i = 0 To nRem - 1
            dc(i) = Dist(cur, rem_(i)): used(i) = False
        Next i
        For t = 0 To m - 1
            best = -1
            For i = 0 To nRem - 1
                If Not used(i) Then
                    If best < 0 Then
                        best = i
                    ElseIf dc(i) < dc(best) Then
                        best = i
                    End If
                End If
            Next i
            used(best) = True: cand(t) = rem_(best)
        Next t
        ' order by right-hand turn from the previous direction, largest first (stable)
        For t = 0 To m - 1
            tc(t) = TurnKey(prevAng, cur, cand(t))
        Next t
        For i = 1 To m - 1
            j = i
            Do While j > 0
                If tc(j - 1) < tc(j) Then
                    tmpD = tc(j - 1): tc(j - 1) = tc(j): tc(j) = tmpD
                    tmpL = cand(j - 1): cand(j - 1) = cand(j): cand(j) = tmpL
                    j = j - 1
                Else
                    Exit Do
                End If
            Loop
        Next i
        nxt = -1
        For t = 0 To m - 1
            If cand(t) = first Then last = 1 Else last = 0
            ok = True
            For i = 0 To nh - 3 - last
                If SegX(cur, cand(t), hull(i), hull(i + 1)) Then ok = False: Exit For
            Next i
            If ok Then nxt = cand(t): Exit For
        Next t
        If nxt < 0 Then Exit Function
        If nxt = first Then KnnHull = True: Exit Function
        prevAng = Ang(nxt, cur)
        hull(nh) = nxt: nh = nh + 1
        For i = 0 To nRem - 1
            If rem_(i) = nxt Then
                For j = i To nRem - 2
                    rem_(j) = rem_(j + 1)
                Next j
                nRem = nRem - 1: Exit For
            End If
        Next i
        cur = nxt: stp = stp + 1
        If stp > np2 + 5 Then Exit Function
    Loop
End Function

Private Function TurnKey(ByVal prevAng As Double, ByVal cur As Long, ByVal p As Long) As Double
    Dim a As Double, twoPi As Double
    twoPi = 8# * Atn(1#)
    a = prevAng - Ang(cur, p)
    a = a - twoPi * Int(a / twoPi)
    If a > 0.000000000001 Then TurnKey = a Else TurnKey = twoPi
End Function

' Where two consecutive boundary points lie on the same crest/toe string, walk along
' that string point by point instead of cutting across - as done by hand. A walk is
' kept only if the boundary stays simple (no crossing).
Private Sub FollowStrings(hull() As Long, nh As Long, lines As Collection)
    Dim occL() As Long, occI() As Long, occNext() As Long, head() As Long, tail() As Long, nOcc As Long
    Dim li As Long, i As Long, arr As Variant, p As Long
    ReDim head(0 To NP): ReDim tail(0 To NP)
    For i = 0 To NP - 1
        head(i) = -1: tail(i) = -1
    Next i
    ReDim occL(0 To 16): ReDim occI(0 To 16): ReDim occNext(0 To 16)
    For li = 1 To lines.Count
        arr = lines(li)
        For i = 0 To UBound(arr)
            p = arr(i)
            If nOcc > UBound(occL) Then
                ReDim Preserve occL(0 To 2 * nOcc): ReDim Preserve occI(0 To 2 * nOcc)
                ReDim Preserve occNext(0 To 2 * nOcc)
            End If
            occL(nOcc) = li: occI(nOcc) = i: occNext(nOcc) = -1
            If head(p) < 0 Then head(p) = nOcc Else occNext(tail(p)) = nOcc
            tail(p) = nOcc: nOcc = nOcc + 1
        Next i
    Next li

    Dim inHull() As Boolean
    ReDim inHull(0 To NP)
    For i = 0 To nh - 1
        inHull(hull(i)) = True
    Next i

    Dim det() As Variant, hasDet() As Boolean, detLen() As Long
    Dim e As Long, a As Long, b As Long, oa As Long, ob As Long, ia As Long, ib As Long, stp As Long
    Dim cnt As Long, okDev As Boolean, j As Long, bestLen As Long, bestL As Long, bestA As Long, bestB As Long
    Dim haveBest As Boolean, lineArr As Variant
    ReDim det(0 To nh): ReDim hasDet(0 To nh): ReDim detLen(0 To nh)
    For e = 0 To nh - 1
        a = hull(e): b = hull((e + 1) Mod nh)
        haveBest = False
        oa = head(a)
        Do While oa >= 0
            ob = head(b)
            Do While ob >= 0
                If occL(oa) = occL(ob) And Abs(occI(oa) - occI(ob)) >= 2 Then
                    ia = occI(oa): ib = occI(ob)
                    If ib > ia Then stp = 1 Else stp = -1
                    lineArr = lines(occL(oa))
                    cnt = Abs(ib - ia) - 1
                    okDev = True
                    For j = ia + stp To ib - stp Step stp
                        If SegDist(lineArr(j), a, b) > FOLLOW_DEV Then okDev = False: Exit For
                    Next j
                    If okDev And (Not haveBest Or cnt < bestLen) Then
                        haveBest = True: bestLen = cnt: bestL = occL(oa): bestA = ia: bestB = ib
                    End If
                End If
                ob = occNext(ob)
            Loop
            oa = occNext(oa)
        Loop
        If haveBest Then
            Dim path() As Long, anyHull As Boolean
            lineArr = lines(bestL)
            If bestB > bestA Then stp = 1 Else stp = -1
            ReDim path(0 To bestLen - 1): cnt = 0: anyHull = False
            For j = bestA + stp To bestB - stp Step stp
                path(cnt) = lineArr(j): cnt = cnt + 1
                If inHull(lineArr(j)) Then anyHull = True
            Next j
            If Not anyHull Then det(e) = path: hasDet(e) = True: detLen(e) = bestLen
        End If
    Next e

    ' try the longest walks first; keep each only if the ring stays simple
    Dim order() As Long, nOrd As Long, t As Long, tmp As Long
    ReDim order(0 To nh)
    For e = 0 To nh - 1
        If hasDet(e) Then order(nOrd) = e: nOrd = nOrd + 1
    Next e
    For i = 1 To nOrd - 1
        j = i
        Do While j > 0
            If detLen(order(j - 1)) < detLen(order(j)) Then
                tmp = order(j - 1): order(j - 1) = order(j): order(j) = tmp: j = j - 1
            Else
                Exit Do
            End If
        Loop
    Next i
    Dim chosen() As Boolean, ring() As Long, nr2 As Long
    ReDim chosen(0 To nh)
    For t = 0 To nOrd - 1
        chosen(order(t)) = True
        BuildRing hull, nh, det, chosen, ring, nr2
        If Not IsSimple(ring, nr2) Then chosen(order(t)) = False
    Next t
    BuildRing hull, nh, det, chosen, ring, nr2
    hull = ring: nh = nr2
End Sub

Private Sub BuildRing(hull() As Long, ByVal nh As Long, det() As Variant, chosen() As Boolean, _
                      ring() As Long, nr2 As Long)
    Dim e As Long, j As Long, arr As Variant, usedP() As Boolean, total As Long
    total = nh
    For e = 0 To nh - 1
        If chosen(e) Then arr = det(e): total = total + UBound(arr) + 1
    Next e
    ReDim ring(0 To total): ReDim usedP(0 To NP)
    nr2 = 0
    For e = 0 To nh - 1
        ring(nr2) = hull(e): nr2 = nr2 + 1
        If chosen(e) Then
            arr = det(e)
            For j = 0 To UBound(arr)
                If Not usedP(arr(j)) Then ring(nr2) = arr(j): nr2 = nr2 + 1: usedP(arr(j)) = True
            Next j
        End If
    Next e
End Sub

Private Function IsSimple(ring() As Long, ByVal n As Long) As Boolean
    Dim i As Long, j As Long, jEnd As Long
    Dim a1 As Long, b1 As Long, a2 As Long, b2 As Long
    Dim x1 As Double, x2 As Double, y1 As Double, y2 As Double
    For i = 0 To n - 1
        For j = i + 1 To n - 1
            If Round(PE(ring(i)), 3) = Round(PE(ring(j)), 3) Then
                If Round(PN(ring(i)), 3) = Round(PN(ring(j)), 3) Then Exit Function
            End If
        Next j
    Next i
    For i = 0 To n - 1
        a1 = ring(i): b1 = ring((i + 1) Mod n)
        x1 = Min2(PE(a1), PE(b1)): x2 = Max2(PE(a1), PE(b1))
        y1 = Min2(PN(a1), PN(b1)): y2 = Max2(PN(a1), PN(b1))
        If i = 0 Then jEnd = n - 2 Else jEnd = n - 1
        For j = i + 2 To jEnd
            a2 = ring(j): b2 = ring((j + 1) Mod n)
            If Not (Max2(PE(a2), PE(b2)) < x1 Or Min2(PE(a2), PE(b2)) > x2 Or _
                    Max2(PN(a2), PN(b2)) < y1 Or Min2(PN(a2), PN(b2)) > y2) Then
                If SegX(a1, b1, a2, b2) Then Exit Function
                If Touch(a1, b1, a2, b2) Then Exit Function
            End If
        Next j
    Next i
    IsSimple = True
End Function

' =============================================================================
' No crossing lines (port of raw2str.py tidy_lines / fix_crossings)
' =============================================================================
' Per kind: drop a pass measured twice inside one line, then a shorter line lying on a
' longer one, join again, and untangle (2-opt) every line.
Private Sub TidyLines(lines As Collection, drop() As Boolean, nDrop As Long)
    Dim i As Long, arr As Variant, outL As New Collection
    For i = 1 To lines.Count
        arr = DropSelfPass(lines(i), drop, nDrop)
        If Not IsEmpty(arr) Then outL.Add arr
    Next i
    DropDoublePass outL, drop, nDrop
    MergeRuns outL
    Set lines = New Collection
    For i = 1 To outL.Count
        lines.Add Untangle(outL(i))
    Next i
End Sub

Private Function NearLine(ByVal p As Long, arr As Variant, ByVal tol As Double) As Boolean
    Dim k As Long
    For k = 0 To UBound(arr) - 1
        If SegDist(p, arr(k), arr(k + 1)) <= tol Then NearLine = True: Exit Function
    Next k
End Function

' Points within DUP_TOL of a LATER, non-neighbouring part of the same line are the first
' copy of a stretch measured twice; blocks of >= 2 are removed. Returns Empty if nothing left.
Private Function DropSelfPass(arr As Variant, drop() As Boolean, nDrop As Long) As Variant
    Dim n As Long, i As Long, j As Long, k As Long, mark() As Boolean
    Dim keep() As Long, nk As Long, rest As Variant, t As Long
    n = UBound(arr) + 1
    ReDim mark(0 To n): ReDim keep(0 To n)
    For i = 0 To n - 1
        If (PCls(arr(i)) And C_JUNC) = 0 Then
            For k = i + 3 To n - 2
                If SegDist(arr(i), arr(k), arr(k + 1)) <= DUP_TOL Then mark(i) = True: Exit For
            Next k
        End If
    Next i
    i = 0
    Do While i < n
        If Not mark(i) Then
            keep(nk) = arr(i): nk = nk + 1: i = i + 1
        Else
            j = i
            Do While j < n
                If Not mark(j) Then Exit Do
                j = j + 1
            Loop
            If j - i >= 2 Then
                For t = i To j - 1
                    drop(arr(t)) = True: nDrop = nDrop + 1
                Next t
                If nk > 0 And j < n Then
                    If Dist(keep(nk - 1), arr(n - 1)) < Dist(keep(nk - 1), arr(j)) Then
                        For t = n - 1 To j Step -1
                            keep(nk) = arr(t): nk = nk + 1
                        Next t
                        DropSelfPass = Slice(keep, 0, nk)
                        Exit Function
                    End If
                End If
            Else
                For t = i To j - 1
                    keep(nk) = arr(t): nk = nk + 1
                Next t
            End If
            i = j
        End If
    Loop
    If nk > 0 Then DropSelfPass = Slice(keep, 0, nk)
End Function

' Longest lines first (stable). Points at the END of a line (or the whole line) lying within
' DUP_TOL of an earlier (longer) line are removed; 23 points never.
Private Sub DropDoublePass(lines As Collection, drop() As Boolean, nDrop As Long)
    Dim n As Long, L() As Variant, ln() As Long, i As Long, j As Long, o As Long, t As Long
    Dim s As Variant, m As Long, near() As Boolean, allNear As Boolean, a As Long, b As Long
    Dim cutA As Long, cutB As Long, tmpV As Variant, tmpL As Long
    n = lines.Count
    If n = 0 Then Exit Sub
    ReDim L(0 To n - 1): ReDim ln(0 To n - 1)
    For i = 0 To n - 1
        L(i) = lines(i + 1): ln(i) = UBound(L(i)) + 1
    Next i
    For i = 1 To n - 1                      ' stable insertion sort, longest first
        j = i
        Do While j > 0
            If ln(j - 1) < ln(j) Then
                tmpV = L(j - 1): L(j - 1) = L(j): L(j) = tmpV
                tmpL = ln(j - 1): ln(j - 1) = ln(j): ln(j) = tmpL
                j = j - 1
            Else
                Exit Do
            End If
        Loop
    Next i
    For i = 0 To n - 1
        If ln(i) >= 2 Then
            s = L(i): m = ln(i)
            ReDim near(0 To m - 1)
            allNear = True
            For t = 0 To m - 1
                near(t) = False
                If (PCls(s(t)) And C_JUNC) = 0 Then
                    For o = 0 To i - 1
                        If ln(o) >= 2 Then
                            If NearLine(s(t), L(o), DUP_TOL) Then near(t) = True: Exit For
                        End If
                    Next o
                End If
                If Not near(t) Then allNear = False
            Next t
            If i > 0 Then
                If allNear Then
                    For t = 0 To m - 1
                        drop(s(t)) = True: nDrop = nDrop + 1
                    Next t
                    ln(i) = 0
                Else
                    a = 0
                    Do While a < m
                        If Not near(a) Then Exit Do
                        a = a + 1
                    Loop
                    b = m
                    Do While b > a
                        If Not near(b - 1) Then Exit Do
                        b = b - 1
                    Loop
                    If a >= 2 Or m - b >= 2 Then
                        If a >= 2 Then cutA = a Else cutA = 0
                        If m - b >= 2 Then cutB = b Else cutB = m
                        For t = 0 To cutA - 1
                            drop(s(t)) = True: nDrop = nDrop + 1
                        Next t
                        For t = cutB To m - 1
                            drop(s(t)) = True: nDrop = nDrop + 1
                        Next t
                        Dim part() As Long
                        ReDim part(0 To cutB - cutA - 1)
                        For t = cutA To cutB - 1
                            part(t - cutA) = s(t)
                        Next t
                        L(i) = part: ln(i) = cutB - cutA
                    End If
                End If
            End If
        End If
    Next i
    Set lines = New Collection
    For i = 0 To n - 1
        If ln(i) > 0 Then lines.Add L(i)
    Next i
End Sub

' 2-opt: while two edges cross, reverse the part between them (ends stay).
Private Function Untangle(arr As Variant) As Variant
    Dim s() As Long, n As Long, i As Long, j As Long, r As Long, hit As Boolean, t As Long, u As Long, tmp As Long
    n = UBound(arr) + 1
    ReDim s(0 To n - 1)
    For i = 0 To n - 1
        s(i) = arr(i)
    Next i
    For r = 1 To 200
        hit = False
        For i = 0 To n - 4
            For j = i + 2 To n - 2
                If SegX(s(i), s(i + 1), s(j), s(j + 1)) Then hit = True: Exit For
            Next j
            If hit Then Exit For
        Next i
        If Not hit Then Exit For
        t = i + 1: u = j
        Do While t < u
            tmp = s(t): s(t) = s(u): s(u) = tmp
            t = t + 1: u = u - 1
        Loop
    Next r
    Untangle = s
End Function

' Crossing edges between different lines. With wantFirst it stops at the first one
' (in the order line i, line j > i, edge of i, edge of j) and returns it in fi/fe/fj/fg.
Private Function CountCross(L() As Variant, ByVal n As Long, ByVal wantFirst As Boolean, _
                            fi As Long, fe As Long, fj As Long, fg As Long, skipKeys As String) As Long
    Dim i As Long, j As Long, ei As Long, ej As Long, x As Variant, y As Variant
    Dim a As Long, b As Long, c As Long, e As Long, cnt As Long
    For i = 0 To n - 1
        x = L(i)
        If Not IsEmpty(x) Then
        For j = i + 1 To n - 1
            y = L(j)
            If Not IsEmpty(y) Then
            For ei = 0 To UBound(x) - 1
                a = x(ei): b = x(ei + 1)
                For ej = 0 To UBound(y) - 1
                    c = y(ej): e = y(ej + 1)
                    If Not (Max2(PE(a), PE(b)) < Min2(PE(c), PE(e)) Or Min2(PE(a), PE(b)) > Max2(PE(c), PE(e)) Or _
                            Max2(PN(a), PN(b)) < Min2(PN(c), PN(e)) Or Min2(PN(a), PN(b)) > Max2(PN(c), PN(e))) Then
                        If SegX(a, b, c, e) Then
                            If wantFirst Then
                                If InStr(skipKeys, "|" & a & "," & b & "," & c & "," & e & "|") = 0 Then
                                    fi = i: fe = ei: fj = j: fg = ej: CountCross = 1: Exit Function
                                End If
                            Else
                                cnt = cnt + 1
                            End If
                        End If
                    End If
                Next ej
            Next ei
            End If
        Next j
        End If
    Next i
    CountCross = cnt
End Function

' Crossings left between different lines: remove one point next to a line end (never a 23),
' or cut the line at the crossing edge with the bigger height jump - whichever is cheapest
' and clears the crossing without making a new one.
Private Sub FixCrossings(crest As Collection, toe As Collection, drop() As Boolean, nDrop As Long, nCut As Long)
    Dim L() As Variant, T() As Variant, n As Long, nT As Long, i As Long, it As Long, total As Long
    Dim stuck As String, fi As Long, fe As Long, fj As Long, fg As Long, dum As Long
    Dim cand(0 To 3) As Long, candI(0 To 3) As Long, c As Long, li As Long, idx As Long, p As Long
    Dim bestRank As Double, haveBest As Boolean, bestL As Long, bestKind As Long, bestIdx As Long
    Dim rank As Double, arr As Variant, arr2 As Variant, m As Long, k As Long
    n = crest.Count + toe.Count
    If n < 2 Then Exit Sub
    ReDim L(0 To 2 * n + 210)
    For i = 1 To crest.Count
        L(i - 1) = crest(i)
    Next i
    For i = 1 To toe.Count
        L(crest.Count + i - 1) = toe(i)
    Next i
    For it = 1 To 100
        total = CountCross(L, n, False, dum, dum, dum, dum, "")
        If total = 0 Then Exit For
        If CountCross(L, n, True, fi, fe, fj, fg, stuck) = 0 Then Exit For
        haveBest = False
        candI(0) = fi: cand(0) = fe
        candI(1) = fi: cand(1) = fe + 1
        candI(2) = fj: cand(2) = fg
        candI(3) = fj: cand(3) = fg + 1
        For c = 0 To 3                                 ' remove a point near a line end
            li = candI(c): idx = cand(c): arr = L(li): m = UBound(arr) + 1
            p = arr(idx)
            If (PCls(p) And C_JUNC) = 0 Then
                rank = idx
                If m - 1 - idx < rank Then rank = m - 1 - idx
                If rank <= 1 Then
                    CopyList L, T, n: nT = n
                    T(li) = WithoutIdx(arr, idx)
                    If CountCross(T, nT, False, dum, dum, dum, dum, "") < total Then
                        If Not haveBest Or rank < bestRank Then
                            haveBest = True: bestRank = rank: bestL = li: bestKind = 0: bestIdx = idx
                        End If
                    End If
                End If
            End If
        Next c
        For c = 0 To 2 Step 2                          ' cut the line at the crossing edge
            li = candI(c): idx = cand(c): arr = L(li)
            CopyList L, T, n: nT = n
            CutLine T, nT, li, idx
            If CountCross(T, nT, False, dum, dum, dum, dum, "") < total Then
                rank = 2# + 1# / (1# + Abs(PZ(arr(idx)) - PZ(arr(idx + 1))))
                If Not haveBest Or rank < bestRank Then
                    haveBest = True: bestRank = rank: bestL = li: bestKind = 1: bestIdx = idx
                End If
            End If
        Next c
        If Not haveBest Then
            arr = L(fi): arr2 = L(fj)
            stuck = stuck & "|" & arr(fe) & "," & arr(fe + 1) & "," & arr2(fg) & "," & arr2(fg + 1) & "|"
        ElseIf bestKind = 0 Then
            arr = L(bestL)
            drop(arr(bestIdx)) = True: nDrop = nDrop + 1
            L(bestL) = WithoutIdx(arr, bestIdx)
        Else
            CutLine L, n, bestL, bestIdx
            nCut = nCut + 1
        End If
    Next it
    ' back to crest / toe: a crest line has a crest point that is not a 23
    Set crest = New Collection
    Set toe = New Collection
    For i = 0 To n - 1
        arr = L(i)
        m = 0
        For k = 0 To UBound(arr)
            If (PCls(arr(k)) And C_CREST) <> 0 And (PCls(arr(k)) And C_JUNC) = 0 Then m = 1: Exit For
        Next k
        If m = 1 Then
            crest.Add arr
        Else
            toe.Add arr
        End If
    Next i
End Sub

Private Sub CopyList(L() As Variant, T() As Variant, ByVal n As Long)
    Dim i As Long
    ReDim T(0 To UBound(L))
    For i = 0 To n - 1
        T(i) = L(i)
    Next i
End Sub

Private Function WithoutIdx(arr As Variant, ByVal idx As Long) As Variant
    Dim o() As Long, i As Long, k As Long
    ReDim o(0 To UBound(arr) - 1)
    For i = 0 To UBound(arr)
        If i <> idx Then o(k) = arr(i): k = k + 1
    Next i
    WithoutIdx = o
End Function

' Replace L(li) by its two halves (cut after point idx); halves shorter than 2 points
' are left out, so the list grows by one, stays or shrinks by one (as raw2str.fix_crossings).
Private Sub CutLine(L() As Variant, n As Long, ByVal li As Long, ByVal idx As Long)
    Dim arr As Variant, a As Variant, b As Variant, k As Long, hasA As Boolean, hasB As Boolean
    arr = L(li)
    hasA = (idx + 1 >= 2): hasB = (UBound(arr) - idx >= 2)
    If hasA Then a = Slice2(arr, 0, idx + 1)
    If hasB Then b = Slice2(arr, idx + 1, UBound(arr) - idx)
    If hasA And hasB Then
        For k = n - 1 To li + 1 Step -1
            L(k + 1) = L(k)
        Next k
        L(li) = a: L(li + 1) = b: n = n + 1
    ElseIf hasA Then
        L(li) = a
    ElseIf hasB Then
        L(li) = b
    Else
        For k = li To n - 2
            L(k) = L(k + 1)
        Next k
        L(n - 1) = Empty: n = n - 1
    End If
End Sub

Private Function Slice2(arr As Variant, ByVal s0 As Long, ByVal n As Long) As Variant
    Dim o() As Long, i As Long
    ReDim o(0 To n - 1)
    For i = 0 To n - 1
        o(i) = arr(s0 + i)
    Next i
    Slice2 = o
End Function

' =============================================================================
' Boundary: dig long edges inwards (port of raw2str.dig)
' =============================================================================
' An edge a-b longer than DIG_EDGE becomes a-p-b, p the inside point (of this area, not on
' the boundary yet) that keeps both new edges shortest, when p lies at most
' min(DIG_DEPTH * edge, DIG_CAP) inside, the triangle a-p-b holds no other point, and the
' new edges cross neither the boundary nor a crest/toe line.
Private Sub DigHull(hull() As Long, nh As Long, mem() As Long, ByVal nm As Long, lines As Collection)
    Dim onR() As Boolean, i As Long, it As Long, a As Long, b As Long, Lg As Double, lim As Double
    Dim cand() As Long, cd() As Double, nc As Long, t As Long, j As Long, p As Long, q As Long
    Dim tmpL As Long, tmpD As Double, ringSgn As Double, side As Double, ok As Boolean, done As Boolean
    Dim ring() As Long, k As Long
    ReDim onR(0 To NP)
    For i = 0 To nh - 1
        onR(hull(i)) = True
    Next i
    ReDim cand(0 To nm): ReDim cd(0 To nm)
    ReDim ring(0 To nh + nm + 1)
    For i = 0 To nh - 1
        ring(i) = hull(i)
    Next i
    i = 0
    Do While i < nh And it < 5000
        a = ring(i): b = ring((i + 1) Mod nh)
        Lg = Dist(a, b)
        If Lg <= DIG_EDGE Then
            i = i + 1
        Else
            it = it + 1
            lim = DIG_DEPTH * Lg: If DIG_CAP < lim Then lim = DIG_CAP
            nc = 0
            For t = 0 To nm - 1
                p = mem(t)
                If Not onR(p) Then
                    If Max2(Dist(a, p), Dist(p, b)) < Lg Then
                        If SegDist(p, a, b) <= lim Then
                            cand(nc) = p: cd(nc) = Max2(Dist(a, p), Dist(p, b)): nc = nc + 1
                        End If
                    End If
                End If
            Next t
            For t = 1 To nc - 1                         ' stable sort by the longer new edge
                j = t
                Do While j > 0
                    If cd(j - 1) > cd(j) Then
                        tmpD = cd(j - 1): cd(j - 1) = cd(j): cd(j) = tmpD
                        tmpL = cand(j - 1): cand(j - 1) = cand(j): cand(j) = tmpL
                        j = j - 1
                    Else
                        Exit Do
                    End If
                Loop
            Next t
            If nc > 12 Then nc = 12
            ringSgn = 0
            For t = 0 To nh - 1
                ringSgn = ringSgn + PE(ring(t)) * PN(ring((t + 1) Mod nh)) - PE(ring((t + 1) Mod nh)) * PN(ring(t))
            Next t
            done = False
            For t = 0 To nc - 1
                p = cand(t)
                side = (PE(b) - PE(a)) * (PN(p) - PN(a)) - (PN(b) - PN(a)) * (PE(p) - PE(a))
                ok = True
                If side > 0 And ringSgn < 0 Then ok = False
                If side < 0 And ringSgn > 0 Then ok = False
                If ok Then
                    For j = 0 To nm - 1
                        q = mem(j)
                        If q <> p And Not onR(q) Then
                            If InTri(a, p, b, q) Then ok = False: Exit For
                        End If
                    Next j
                End If
                If ok Then
                    If CrossesLines(a, p, lines) Then ok = False
                End If
                If ok Then
                    If CrossesLines(p, b, lines) Then ok = False
                End If
                If ok Then
                    For k = nh To i + 2 Step -1
                        ring(k) = ring(k - 1)
                    Next k
                    ring(i + 1) = p: nh = nh + 1
                    If SimpleNear(ring, nh, i + 1) Then
                        onR(p) = True: done = True: Exit For
                    End If
                    For k = i + 1 To nh - 2
                        ring(k) = ring(k + 1)
                    Next k
                    nh = nh - 1
                End If
            Next t
            If Not done Then i = i + 1
        End If
    Loop
    ReDim hull(0 To nh)
    For i = 0 To nh - 1
        hull(i) = ring(i)
    Next i
End Sub

Private Function InTri(ByVal a As Long, ByVal b As Long, ByVal c As Long, ByVal p As Long) As Boolean
    Dim d1 As Double, d2 As Double, d3 As Double, hasNeg As Boolean, hasPos As Boolean
    d1 = TriS(p, a, b): d2 = TriS(p, b, c): d3 = TriS(p, c, a)
    hasNeg = (d1 < 0) Or (d2 < 0) Or (d3 < 0)
    hasPos = (d1 > 0) Or (d2 > 0) Or (d3 > 0)
    InTri = Not (hasNeg And hasPos)
End Function

Private Function TriS(ByVal p1 As Long, ByVal p2 As Long, ByVal p3 As Long) As Double
    TriS = (PE(p1) - PE(p3)) * (PN(p2) - PN(p3)) - (PE(p2) - PE(p3)) * (PN(p1) - PN(p3))
End Function

Private Function CrossesLines(ByVal a As Long, ByVal b As Long, lines As Collection) As Boolean
    Dim li As Long, arr As Variant, k As Long, c As Long, e As Long
    For li = 1 To lines.Count
        arr = lines(li)
        For k = 0 To UBound(arr) - 1
            c = arr(k): e = arr(k + 1)
            If Not (Max2(PE(a), PE(b)) < Min2(PE(c), PE(e)) Or Min2(PE(a), PE(b)) > Max2(PE(c), PE(e)) Or _
                    Max2(PN(a), PN(b)) < Min2(PN(c), PN(e)) Or Min2(PN(a), PN(b)) > Max2(PN(c), PN(e))) Then
                If SegX(a, b, c, e) Then CrossesLines = True: Exit Function
            End If
        Next k
    Next li
End Function

' Only the two edges at ring(k) are new: check them against all other edges.
Private Function SimpleNear(ring() As Long, ByVal n As Long, ByVal k As Long) As Boolean
    Dim e As Long, i0 As Long, i1 As Long, j As Long, a As Long, b As Long, c As Long, d As Long
    For e = 0 To 1
        If e = 0 Then i0 = (k - 1 + n) Mod n: i1 = k Else i0 = k: i1 = (k + 1) Mod n
        a = ring(i0): b = ring(i1)
        For j = 0 To n - 1
            c = ring(j): d = ring((j + 1) Mod n)
            If Not (j = i0 Or j = (i0 - 1 + n) Mod n Or j = i1 Or c = a Or c = b Or d = a Or d = b) Then
                If SegX(a, b, c, d) Then Exit Function
            End If
        Next j
    Next e
    SimpleNear = True
End Function

' =============================================================================
' Muat ulang boundary (port of riset/prototipe/boundary_ulang.py)
' =============================================================================
' Reads a .str edited in Surpac (text or binary), throws string 1 away and makes it again
' from the points that remain. All other strings are written back unchanged.
Public Function ReloadBoundary(ByVal inPath As String, ByVal outPath As String) As String
    Dim h1 As String, h2 As String, isBin As Boolean
    Dim segNum() As Long, segStart() As Long, segLen() As Long, nSeg As Long
    Dim ptDesc() As String, ptGeo() As Long, nOcc As Long
    NP = 0: nSeg = 0: nOcc = 0
    ReDim segNum(0 To 64): ReDim segStart(0 To 64): ReDim segLen(0 To 64)
    ReDim ptDesc(0 To 1024): ReDim ptGeo(0 To 1024)
    isBin = IsBinaryStr(inPath)
    If isBin Then
        ReadBinStr inPath, h1, h2, segNum, segStart, segLen, nSeg, ptDesc, ptGeo, nOcc
    Else
        ReadTextStr inPath, h1, h2, segNum, segStart, segLen, nSeg, ptDesc, ptGeo, nOcc
    End If

    ' points that take part: not boundary, not road, not check strings
    Dim useP() As Boolean, kept() As Long, nk As Long, s As Long, i As Long, p As Long
    ReDim useP(0 To NP): ReDim kept(0 To NP)
    For s = 0 To nSeg - 1
        If segNum(s) <> 1 And segNum(s) <> 7 And segNum(s) <> 77 And segNum(s) < 9001 Then
            For i = segStart(s) To segStart(s) + segLen(s) - 1
                p = ptGeo(i)
                If Not useP(p) Then useP(p) = True: kept(nk) = p: nk = nk + 1
            Next i
        End If
    Next s
    Dim lines As New Collection
    For s = 0 To nSeg - 1
        Select Case segNum(s)
            Case 5, 6, 2, 3
                If segLen(s) >= 2 Then lines.Add Slice(ptGeo, segStart(s), segLen(s))
        End Select
    Next s

    Dim lab() As Long, nAreas As Long, members() As Long, nm As Long, c As Long
    Dim hull() As Long, nh As Long, nRing As Long, nPtsB As Long
    NA = 0
    nAreas = Clusters(kept, nk, lab)
    ReDim members(0 To nk)
    For c = 0 To nAreas - 1
        nm = 0
        For i = 0 To nk - 1
            If lab(i) = c Then members(nm) = kept(i): nm = nm + 1
        Next i
        If nm >= 10 Then
            If ConcaveHull(members, nm, hull, nh) Then
                FollowStrings hull, nh, lines
                DigHull hull, nh, members, nm, lines
                For i = 0 To nh
                    p = hull(i Mod nh)
                    AddLine 1, "1, " & Fmt3(PN(p)) & ", " & Fmt3(PE(p)) & ", " & Fmt3(PZ(p)) & ", " & PName(p)
                Next i
                AddLine 1, "0, 0.000, 0.000, 0.000,"
                nRing = nRing + 1: nPtsB = nPtsB + nh
            End If
        End If
    Next c
    ' boundary lines carry the description of the point's first occurrence (kept in PName)
    For s = 0 To nSeg - 1
        If segNum(s) <> 1 Then
            For i = segStart(s) To segStart(s) + segLen(s) - 1
                p = ptGeo(i)
                AddLine 1, CStr(segNum(s)) & ", " & Fmt3(PN(p)) & ", " & Fmt3(PE(p)) & ", " & Fmt3(PZ(p)) & ", " & ptDesc(i)
            Next i
            AddLine 1, "0, 0.000, 0.000, 0.000,"
        End If
    Next s
    If isBin Then
        WriteBinStr outPath, h1, h2
    Else
        Dim f As Integer
        f = FreeFile
        Open outPath For Output As #f
        Print #f, h1
        Print #f, h2
        For i = 0 To NA - 1
            Print #f, BufA(i)
        Next i
        Print #f, "0, 0.000, 0.000, 0.000, END"
        Close #f
    End If
    ReloadBoundary = nRing & " boundary, " & nPtsB & " titik boundary"
End Function

' one pool point per coordinate (first occurrence keeps its description in PName)
Private Function GeoPoint(ByVal n As Double, ByVal e As Double, ByVal z As Double, ByVal desc As String, _
                          keys As Collection) As Long
    Dim k As String, v As Variant
    k = Fmt3(e) & "/" & Fmt3(n)
    On Error Resume Next
    v = keys(k)
    If Err.Number = 0 Then
        On Error GoTo 0
        GeoPoint = CLng(v): Exit Function
    End If
    Err.Clear
    On Error GoTo 0
    If NP Mod 512 = 0 Then GrowPool NP + 512
    PN(NP) = n: PE(NP) = e: PZ(NP) = z: PName(NP) = desc: PCode(NP) = "": PFile(NP) = "": PCls(NP) = 0
    keys.Add NP, k
    GeoPoint = NP: NP = NP + 1
End Function

Private Sub AddOcc(ByVal num As Long, ByVal n As Double, ByVal e As Double, ByVal z As Double, ByVal desc As String, _
                   ByVal newSeg As Boolean, segNum() As Long, segStart() As Long, segLen() As Long, nSeg As Long, _
                   ptDesc() As String, ptGeo() As Long, nOcc As Long, keys As Collection)
    If newSeg Then
        If nSeg > UBound(segNum) Then
            ReDim Preserve segNum(0 To 2 * nSeg): ReDim Preserve segStart(0 To 2 * nSeg)
            ReDim Preserve segLen(0 To 2 * nSeg)
        End If
        segNum(nSeg) = num: segStart(nSeg) = nOcc: segLen(nSeg) = 0: nSeg = nSeg + 1
    End If
    If nOcc > UBound(ptDesc) Then
        ReDim Preserve ptDesc(0 To 2 * nOcc): ReDim Preserve ptGeo(0 To 2 * nOcc)
    End If
    ptDesc(nOcc) = desc
    If num = 1 Then
        ptGeo(nOcc) = -1                     ' old boundary: not used
    Else
        ptGeo(nOcc) = GeoPoint(n, e, z, desc, keys)
    End If
    nOcc = nOcc + 1
    segLen(nSeg - 1) = segLen(nSeg - 1) + 1
End Sub

Private Sub ReadTextStr(ByVal path As String, h1 As String, h2 As String, segNum() As Long, segStart() As Long, _
                        segLen() As Long, nSeg As Long, ptDesc() As String, ptGeo() As Long, nOcc As Long)
    Dim f As Integer, s As String, parts() As String, num As Long, open_ As Boolean, i As Long, desc As String
    Dim keys As New Collection, ln As Long
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
            parts = Split(s, ",")
            If UBound(parts) >= 3 Then
                If IsDigits(Trim(parts(0))) Then
                    num = CLng(Trim(parts(0)))
                    If num = 0 Then
                        open_ = False
                        If Right(Trim(s), 3) = "END" Then Exit Do
                    Else
                        desc = ""
                        For i = 4 To UBound(parts)
                            If i > 4 Then desc = desc & ","
                            desc = desc & Trim(parts(i))
                        Next i
                        AddOcc num, Val(Trim(parts(1))), Val(Trim(parts(2))), Val(Trim(parts(3))), desc, Not open_, _
                               segNum, segStart, segLen, nSeg, ptDesc, ptGeo, nOcc, keys
                        open_ = True
                    End If
                End If
            End If
        End If
    Loop
    Close #f
End Sub

' ---- binary Surpac .str: 2 text lines, 5 zero bytes, records of
'      int32 BE string number, float64 BE Y X Z, description NUL-terminated ----
Private Function IsBinaryStr(ByVal path As String) As Boolean
    Dim f As Integer, b() As Byte, n As Long, i As Long, nl As Long
    f = FreeFile
    Open path For Binary Access Read As #f
    n = LOF(f): If n > 4096 Then n = 4096
    If n < 8 Then Close #f: Exit Function
    ReDim b(0 To n - 1)
    Get #f, 1, b
    Close #f
    For i = 0 To n - 1
        If b(i) = 10 Then
            nl = nl + 1
            If nl = 2 Then
                If i + 5 < n Then
                    IsBinaryStr = (b(i + 1) = 0 And b(i + 2) = 0 And b(i + 3) = 0 And b(i + 4) = 0 And b(i + 5) = 0)
                End If
                Exit Function
            End If
        End If
    Next i
End Function

Private Sub ReadBinStr(ByVal path As String, h1 As String, h2 As String, segNum() As Long, segStart() As Long, _
                       segLen() As Long, nSeg As Long, ptDesc() As String, ptGeo() As Long, nOcc As Long)
    Dim f As Integer, b() As Byte, n As Long, pos As Long, i As Long, num As Long, open_ As Boolean
    Dim y As Double, x As Double, z As Double, e As Long, desc As String, keys As New Collection
    f = FreeFile
    Open path For Binary Access Read As #f
    n = LOF(f)
    ReDim b(0 To n - 1)
    Get #f, 1, b
    Close #f
    pos = 0
    h1 = ReadLineBytes(b, pos): h2 = ReadLineBytes(b, pos)
    If pos + 5 <= n Then
        If b(pos) = 0 And b(pos + 1) = 0 And b(pos + 2) = 0 And b(pos + 3) = 0 And b(pos + 4) = 0 Then pos = pos + 5
    End If
    Do While pos + 28 <= n
        num = BeLong(b, pos): y = BeDouble(b, pos + 4): x = BeDouble(b, pos + 12): z = BeDouble(b, pos + 20)
        e = pos + 28
        desc = ""
        Do While e < n
            If b(e) = 0 Then Exit Do
            desc = desc & Chr(b(e)): e = e + 1
        Loop
        pos = e + 1
        If num = 0 Then
            open_ = False
            If Right(RTrim(desc), 3) = "END" Then Exit Do
        Else
            AddOcc num, y, x, z, desc, Not open_, segNum, segStart, segLen, nSeg, ptDesc, ptGeo, nOcc, keys
            open_ = True
        End If
    Loop
End Sub

Private Function ReadLineBytes(b() As Byte, pos As Long) As String
    Dim s As String
    Do While pos <= UBound(b)
        If b(pos) = 10 Then pos = pos + 1: Exit Do
        If b(pos) <> 13 Then s = s & Chr(b(pos))
        pos = pos + 1
    Loop
    ReadLineBytes = s
End Function

Private Function BeLong(b() As Byte, ByVal pos As Long) As Long
    Dim v As Double
    v = ((CDbl(b(pos)) * 256# + b(pos + 1)) * 256# + b(pos + 2)) * 256# + b(pos + 3)
    If v >= 2147483648# Then v = v - 4294967296#
    BeLong = CLng(v)
End Function

' IEEE 754 big-endian double from 8 bytes, built arithmetically (no API, no LSet)
Private Function BeDouble(b() As Byte, ByVal pos As Long) As Double
    Dim sgnv As Double, ex As Long, mant As Double, i As Long
    sgnv = 1#: If b(pos) >= 128 Then sgnv = -1#
    ex = (CLng(b(pos)) And 127) * 16 + (CLng(b(pos + 1)) \ 16)
    mant = CLng(b(pos + 1)) And 15
    For i = 2 To 7
        mant = mant * 256# + b(pos + i)
    Next i
    If ex = 0 And mant = 0 Then BeDouble = 0#: Exit Function
    If ex = 0 Then
        BeDouble = sgnv * mant * 2# ^ (-1074)
    Else
        BeDouble = sgnv * (1# + mant / 4503599627370496#) * 2# ^ (ex - 1023)
    End If
End Function

Private Sub PutBeDouble(b() As Byte, ByVal pos As Long, ByVal v As Double)
    Dim sgnv As Long, ex As Long, m As Double, i As Long, hi As Double
    If v = 0 Then
        For i = 0 To 7
            b(pos + i) = 0
        Next i
        Exit Sub
    End If
    If v < 0 Then sgnv = 128: v = -v
    ex = Int(Log(v) / Log(2#))
    If 2# ^ ex > v Then ex = ex - 1
    If 2# ^ (ex + 1) <= v Then ex = ex + 1
    m = (v / 2# ^ ex - 1#) * 4503599627370496#      ' 52-bit mantissa
    m = Int(m + 0.5)
    If m >= 4503599627370496# Then m = 0: ex = ex + 1
    ex = ex + 1023
    For i = 7 To 2 Step -1
        hi = Int(m / 256#)
        b(pos + i) = CByte(m - hi * 256#): m = hi
    Next i
    b(pos + 1) = CByte((ex And 15) * 16 + m)
    b(pos) = CByte(sgnv + ex \ 16)
End Sub

Private Sub PutBeLong(b() As Byte, ByVal pos As Long, ByVal v As Long)
    Dim d As Double, i As Long, hi As Double
    d = v: If d < 0 Then d = d + 4294967296#
    For i = 3 To 0 Step -1
        hi = Int(d / 256#)
        b(pos + i) = CByte(d - hi * 256#): d = hi
    Next i
End Sub

' Write BufA (text rows "num, N, E, Z, desc") as a binary .str
Private Sub WriteBinStr(ByVal path As String, ByVal h1 As String, ByVal h2 As String)
    Dim b() As Byte, cap As Long, pos As Long, i As Long, parts() As String, j As Long, desc As String
    cap = 64 + Len(h1) + Len(h2) + 5
    For i = 0 To NA - 1
        cap = cap + 29 + Len(BufA(i))
    Next i
    cap = cap + 32
    ReDim b(0 To cap)
    PutText b, pos, h1 & vbCrLf & h2 & vbCrLf
    pos = pos + 5                              ' 5 zero bytes
    For i = 0 To NA - 1
        parts = Split(BufA(i), ",")
        desc = ""
        For j = 4 To UBound(parts)
            If j > 4 Then desc = desc & ","
            desc = desc & Trim(parts(j))
        Next j
        PutBeLong b, pos, CLng(Trim(parts(0)))
        If CLng(Trim(parts(0))) = 0 Then
            PutBeDouble b, pos + 4, 0: PutBeDouble b, pos + 12, 0: PutBeDouble b, pos + 20, 0
        Else
            PutBeDouble b, pos + 4, Val(Trim(parts(1)))
            PutBeDouble b, pos + 12, Val(Trim(parts(2)))
            PutBeDouble b, pos + 20, Val(Trim(parts(3)))
        End If
        pos = pos + 28
        PutText b, pos, desc
        pos = pos + 1                          ' NUL
    Next i
    PutBeLong b, pos, 0: pos = pos + 28
    PutText b, pos, "END": pos = pos + 1
    ReDim Preserve b(0 To pos - 1)
    Dim f As Integer
    On Error Resume Next
    Kill path
    On Error GoTo 0
    f = FreeFile
    Open path For Binary Access Write As #f
    Put #f, 1, b
    Close #f
End Sub

Private Sub PutText(b() As Byte, pos As Long, ByVal s As String)
    Dim i As Long
    For i = 1 To Len(s)
        b(pos) = Asc(Mid(s, i, 1)) And 255: pos = pos + 1
    Next i
End Sub

' =============================================================================
' Spot strings: per file, per code (sorted), break on other points or > SPOT_GAP
' =============================================================================
Private Sub EmitSpots(kept() As Long, ByVal nk As Long, fOf() As Long, ByVal nFil As Long, ByVal profile As String)
    Dim fi As Long, i As Long, j As Long, codes() As String, nCodes As Long, found As Boolean, tmp As String
    Dim ci As Long, cur() As Long, nc As Long, num As Long, p As Long
    ReDim codes(0 To nk): ReDim cur(0 To nk)
    For fi = 0 To nFil - 1
        nCodes = 0
        For i = 0 To nk - 1
            If fOf(i) = fi And (PCls(kept(i)) And C_SPOT) <> 0 Then
                found = False
                For j = 0 To nCodes - 1
                    If codes(j) = PCode(kept(i)) Then found = True: Exit For
                Next j
                If Not found Then codes(nCodes) = PCode(kept(i)): nCodes = nCodes + 1
            End If
        Next i
        For i = 1 To nCodes - 1
            j = i
            Do While j > 0
                If codes(j - 1) > codes(j) Then
                    tmp = codes(j - 1): codes(j - 1) = codes(j): codes(j) = tmp: j = j - 1
                Else
                    Exit Do
                End If
            Loop
        Next i
        For ci = 0 To nCodes - 1
            num = SpotNumber(codes(ci), profile)
            nc = 0
            For i = 0 To nk - 1
                If fOf(i) = fi Then
                    p = kept(i)
                    If (PCls(p) And C_SPOT) <> 0 Then
                        If PCode(p) = codes(ci) Then
                            If nc > 0 Then
                                If Dist(cur(nc - 1), p) > SPOT_GAP Then EmitIdx 1, num, cur, nc, False: nc = 0
                            End If
                            cur(nc) = p: nc = nc + 1
                        End If
                    Else
                        If nc > 0 Then EmitIdx 1, num, cur, nc, False: nc = 0
                    End If
                End If
            Next i
            If nc > 0 Then EmitIdx 1, num, cur, nc, False
        Next ci
    Next fi
End Sub

Private Function SpotNumber(ByVal code As String, ByVal profile As String) As Long
    If code = "500" Then
        If profile = "base" Or profile = "tetap" Then SpotNumber = 500 Else SpotNumber = 600
    ElseIf code = "602" Then
        SpotNumber = 602
    Else
        SpotNumber = CLng(Val(code))
    End If
End Function

' =============================================================================
' Road (code 7): cross-sections of ROAD_PTS points -> lanes 7, centre 77, boundary 1
' =============================================================================
Private Function BuildRoad(seq() As Long, ByVal ns As Long) As Boolean
    Dim n As Long, nCh As Long, c As Long, i As Long, j As Long, ok As Boolean
    Dim me_() As Double, mn_() As Double, resid As Double, maxRes As Double
    n = ROAD_PTS
    If ns < 2 * n Then
        EmitIdx 3, 7, seq, ns, False
        Exit Function
    End If
    nCh = (ns - (ns Mod n)) \ n
    ReDim me_(0 To nCh): ReDim mn_(0 To nCh)
    Dim ue As Double, un As Double
    For c = 0 To nCh - 1
        resid = AxisOf(seq, c * n, n, me_(c), mn_(c), ue, un)
        If resid > maxRes Then maxRes = resid
    Next c
    ok = (ns Mod n = 0) And maxRes <= 1#

    ' order each section across the road (signed distance to the road direction)
    Dim sec() As Long, key() As Double, j0 As Long, j1 As Long, de As Double, dn As Double, L As Double
    Dim tmpL As Long, tmpD As Double, p As Long
    ReDim sec(0 To nCh * n): ReDim key(0 To n)
    For c = 0 To nCh - 1
        j0 = c - 1: If j0 < 0 Then j0 = 0
        j1 = c + 1: If j1 > nCh - 1 Then j1 = nCh - 1
        de = me_(j1) - me_(j0): dn = mn_(j1) - mn_(j0)
        L = Sqr(de * de + dn * dn): If L = 0 Then L = 1#
        For i = 0 To n - 1
            p = seq(c * n + i): sec(c * n + i) = p
            key(i) = ((PE(p) - me_(c)) * dn - (PN(p) - mn_(c)) * de) / L
        Next i
        For i = 1 To n - 1
            j = i
            Do While j > 0
                If key(j - 1) > key(j) Then
                    tmpD = key(j - 1): key(j - 1) = key(j): key(j) = tmpD
                    tmpL = sec(c * n + j - 1): sec(c * n + j - 1) = sec(c * n + j): sec(c * n + j) = tmpL
                    j = j - 1
                Else
                    Exit Do
                End If
            Loop
        Next i
    Next c

    ' boundary: first section + right edge + last section reversed + left edge back
    Dim ring() As Long, nr2 As Long
    ReDim ring(0 To nCh * n)
    For i = 0 To n - 1
        ring(nr2) = sec(i): nr2 = nr2 + 1
    Next i
    For c = 1 To nCh - 1
        ring(nr2) = sec(c * n + n - 1): nr2 = nr2 + 1
    Next c
    For i = n - 2 To 0 Step -1
        ring(nr2) = sec((nCh - 1) * n + i): nr2 = nr2 + 1
    Next i
    For c = nCh - 2 To 1 Step -1
        ring(nr2) = sec(c * n): nr2 = nr2 + 1
    Next c
    EmitIdx 3, 1, ring, nr2, True

    Dim lane() As Long, num As Long
    ReDim lane(0 To nCh)
    For i = 0 To n - 1
        For c = 0 To nCh - 1
            lane(c) = sec(c * n + i)
        Next c
        If (n Mod 2 = 1) And i = n \ 2 Then num = 77 Else num = 7
        EmitIdx 3, num, lane, nCh, False
    Next i
    BuildRoad = ok
End Function

Private Function AxisOf(seq() As Long, ByVal s0 As Long, ByVal n As Long, me_ As Double, mn_ As Double, _
                        ue As Double, un As Double) As Double
    Dim i As Long, see As Double, snn As Double, sen As Double, th As Double, r As Double, mx As Double, p As Long
    me_ = 0: mn_ = 0
    For i = 0 To n - 1
        me_ = me_ + PE(seq(s0 + i)): mn_ = mn_ + PN(seq(s0 + i))
    Next i
    me_ = me_ / n: mn_ = mn_ / n
    For i = 0 To n - 1
        p = seq(s0 + i)
        see = see + (PE(p) - me_) ^ 2: snn = snn + (PN(p) - mn_) ^ 2
        sen = sen + (PE(p) - me_) * (PN(p) - mn_)
    Next i
    th = 0.5 * Atan2(2 * sen, see - snn)
    ue = Cos(th): un = Sin(th)
    For i = 0 To n - 1
        p = seq(s0 + i)
        r = Abs(-(PE(p) - me_) * un + (PN(p) - mn_) * ue)
        If r > mx Then mx = r
    Next i
    AxisOf = mx
End Function

' =============================================================================
' Unit positions (EX...): one point per code, the first shot; warn on spread
' =============================================================================
Private Sub WriteExca(fl() As String, ByVal nf As Long, ByVal title As String, ByVal outPath As String)
    Dim i As Long, j As Long, k As Long, codes() As String, firstI() As Long, nU As Long, found As Boolean
    Dim spread As Double, dd As Double
    NP = 0
    For i = 0 To nf - 1
        LoadRaw fl(i)
    Next i
    ReDim codes(0 To NP): ReDim firstI(0 To NP)
    For i = 0 To NP - 1
        If (PCls(i) And C_EXCA) <> 0 Then
            found = False
            For j = 0 To nU - 1
                If codes(j) = PCode(i) Then found = True: Exit For
            Next j
            If Not found Then codes(nU) = PCode(i): firstI(nU) = i: nU = nU + 1
        End If
    Next i
    NA = 0
    Dim one(0 To 0) As Long, keepName As String
    For k = 0 To nU - 1
        keepName = PName(firstI(k)): PName(firstI(k)) = codes(k)
        one(0) = firstI(k): EmitIdx 1, 1, one, 1, False
        PName(firstI(k)) = keepName
        spread = 0
        For i = 0 To NP - 1
            If PCode(i) = codes(k) Then
                For j = i + 1 To NP - 1
                    If PCode(j) = codes(k) Then
                        dd = Dist(i, j): If dd > spread Then spread = dd
                    End If
                Next j
            End If
        Next i
        If spread > EXCA_SPREAD Then AddLog "   PERLU DIPILIH: " & codes(k) & _
            ": tembakan berjarak sampai " & Fmt1(spread) & " m (dipakai yang pertama)"
    Next k
    WriteStr outPath, title, 1
    AddLog title & ".str: " & nU & " unit"
End Sub

' =============================================================================
' Output
' =============================================================================
Private Sub EmitIdx(ByVal which As Integer, ByVal num As Long, idx() As Long, ByVal n As Long, ByVal closed As Boolean)
    Dim i As Long
    For i = 0 To n - 1
        AddLine which, PointLine(num, idx(i))
    Next i
    If closed And n > 0 Then AddLine which, PointLine(num, idx(0))
    AddLine which, "0, 0.000, 0.000, 0.000,"
End Sub

Private Sub EmitVar(ByVal which As Integer, ByVal num As Long, arr As Variant, ByVal closed As Boolean)
    Dim i As Long
    For i = 0 To UBound(arr)
        AddLine which, PointLine(num, arr(i))
    Next i
    If closed Then AddLine which, PointLine(num, arr(0))
    AddLine which, "0, 0.000, 0.000, 0.000,"
End Sub

Private Function PointLine(ByVal num As Long, ByVal p As Long) As String
    PointLine = CStr(num) & ", " & Fmt3(PN(p)) & ", " & Fmt3(PE(p)) & ", " & Fmt3(PZ(p)) & ", " & _
                PName(p) & "," & gDate & "," & gLabel
End Function

Private Sub AddLine(ByVal which As Integer, ByVal s As String)
    Select Case which
        Case 1
            If NA Mod 1024 = 0 Then
                ReDim Preserve BufA(0 To NA + 1024)
            End If
            BufA(NA) = s: NA = NA + 1
        Case 2
            If NG Mod 1024 = 0 Then
                ReDim Preserve BufG(0 To NG + 1024)
            End If
            BufG(NG) = s: NG = NG + 1
        Case 3
            If NR Mod 1024 = 0 Then
                ReDim Preserve BufR(0 To NR + 1024)
            End If
            BufR(NR) = s: NR = NR + 1
    End Select
End Sub

' which: 1 = area buffer, 2 = gabung buffer, 3 = jalan buffer
Private Sub WriteStr(ByVal path As String, ByVal title As String, ByVal which As Integer)
    Dim f As Integer, i As Long, n As Long
    f = FreeFile
    Open path For Output As #f
    Print #f, title & "," & gDate & ",0,0"
    Print #f, "0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000"
    Select Case which
        Case 1
            For i = 0 To NA - 1
                Print #f, BufA(i)
            Next i
        Case 2
            For i = 0 To NG - 1
                Print #f, BufG(i)
            Next i
        Case 3
            For i = 0 To NR - 1
                Print #f, BufR(i)
            Next i
    End Select
    Print #f, "0, 0.000, 0.000, 0.000, END"
    Close #f
End Sub

Private Sub WriteText(ByVal path As String, ByVal s As String)
    Dim f As Integer
    f = FreeFile
    Open path For Output As #f
    Print #f, s;
    Close #f
End Sub

Private Sub AddLog(ByVal s As String)
    LogTxt = LogTxt & s & vbCrLf
End Sub

' Locale-independent "0.000" (always a dot)
Public Function Fmt3(ByVal x As Double) As String
    Dim v As Double, t As Double, ip As Double, fr As Long, s As String
    v = Abs(x)
    t = Int(v * 1000# + 0.5)
    ip = Int(t / 1000#)
    fr = CLng(t - ip * 1000#)
    s = Format(ip, "0") & "." & Right("00" & CStr(fr), 3)
    If x < 0 And t <> 0 Then s = "-" & s
    Fmt3 = s
End Function

Private Function Fmt1(ByVal x As Double) As String
    Dim t As Double
    t = Int(x * 10# + 0.5)
    Fmt1 = CStr(Int(t / 10#)) & "." & CStr(CLng(t - Int(t / 10#) * 10#))
End Function

' =============================================================================
' Geometry helpers
' =============================================================================
Private Function Dist(ByVal a As Long, ByVal b As Long) As Double
    Dim dx As Double, dy As Double
    dx = PE(a) - PE(b): dy = PN(a) - PN(b)
    Dist = Sqr(dx * dx + dy * dy)
End Function

Private Function Atan2(ByVal y As Double, ByVal x As Double) As Double
    Dim pi As Double
    pi = 4# * Atn(1#)
    If x > 0 Then
        Atan2 = Atn(y / x)
    ElseIf x < 0 Then
        If y >= 0 Then Atan2 = Atn(y / x) + pi Else Atan2 = Atn(y / x) - pi
    ElseIf y > 0 Then
        Atan2 = pi / 2
    ElseIf y < 0 Then
        Atan2 = -pi / 2
    Else
        Atan2 = 0
    End If
End Function

Private Function Ang(ByVal a As Long, ByVal b As Long) As Double
    Ang = Atan2(PN(b) - PN(a), PE(b) - PE(a))
End Function

Private Function Orient(ByVal a As Long, ByVal b As Long, ByVal c As Long) As Double
    Orient = (PE(b) - PE(a)) * (PN(c) - PN(a)) - (PN(b) - PN(a)) * (PE(c) - PE(a))
End Function

Private Function SegX(ByVal p1 As Long, ByVal p2 As Long, ByVal p3 As Long, ByVal p4 As Long) As Boolean
    If p1 = p3 Or p1 = p4 Or p2 = p3 Or p2 = p4 Then Exit Function
    If Orient(p1, p2, p3) * Orient(p1, p2, p4) < 0 Then
        If Orient(p3, p4, p1) * Orient(p3, p4, p2) < 0 Then SegX = True
    End If
End Function

Private Function SegDist(ByVal p As Long, ByVal a As Long, ByVal b As Long) As Double
    Dim ax As Double, ay As Double, bx As Double, by_ As Double, L2 As Double, t As Double
    ax = PE(a): ay = PN(a): bx = PE(b): by_ = PN(b)
    L2 = (bx - ax) ^ 2 + (by_ - ay) ^ 2
    If L2 = 0 Then
        t = 0
    Else
        t = ((PE(p) - ax) * (bx - ax) + (PN(p) - ay) * (by_ - ay)) / L2
        If t < 0 Then t = 0
        If t > 1 Then t = 1
    End If
    SegDist = Sqr((PE(p) - ax - t * (bx - ax)) ^ 2 + (PN(p) - ay - t * (by_ - ay)) ^ 2)
End Function

Private Function Touch(ByVal p1 As Long, ByVal p2 As Long, ByVal p3 As Long, ByVal p4 As Long) As Boolean
    Touch = SegDist(p1, p3, p4) < 0.000001 Or SegDist(p2, p3, p4) < 0.000001 Or _
            SegDist(p3, p1, p2) < 0.000001 Or SegDist(p4, p1, p2) < 0.000001
End Function

Private Function InsidePoly(poly() As Long, ByVal n As Long, ByVal p As Long) As Boolean
    Dim i As Long, a As Long, b As Long, c As Boolean
    For i = 0 To n - 1
        a = poly(i): b = poly((i + 1) Mod n)
        If (PN(a) > PN(p)) <> (PN(b) > PN(p)) Then
            If PE(p) < (PE(b) - PE(a)) * (PN(p) - PN(a)) / (PN(b) - PN(a)) + PE(a) Then c = Not c
        End If
    Next i
    InsidePoly = c
End Function

Private Function InArr(arr() As Long, ByVal n As Long, ByVal v As Long) As Boolean
    Dim i As Long
    For i = 0 To n - 1
        If arr(i) = v Then InArr = True: Exit Function
    Next i
End Function

Private Function Min2(ByVal a As Double, ByVal b As Double) As Double
    If a < b Then Min2 = a Else Min2 = b
End Function

Private Function Max2(ByVal a As Double, ByVal b As Double) As Double
    If a > b Then Max2 = a Else Max2 = b
End Function

' =============================================================================
' Array / path helpers
' =============================================================================
Private Function Slice(arr() As Long, ByVal s0 As Long, ByVal n As Long) As Variant
    Dim out() As Long, i As Long
    ReDim out(0 To n - 1)
    For i = 0 To n - 1
        out(i) = arr(s0 + i)
    Next i
    Slice = out
End Function

Private Function Reversed(arr As Variant) As Variant
    Dim out() As Long, i As Long, n As Long
    n = UBound(arr) + 1
    ReDim out(0 To n - 1)
    For i = 0 To n - 1
        out(i) = arr(n - 1 - i)
    Next i
    Reversed = out
End Function

Private Function Concat(a As Variant, b As Variant) As Variant
    Dim out() As Long, i As Long, na_ As Long, nb_ As Long
    na_ = UBound(a) + 1: nb_ = UBound(b) + 1
    ReDim out(0 To na_ + nb_ - 1)
    For i = 0 To na_ - 1
        out(i) = a(i)
    Next i
    For i = 0 To nb_ - 1
        out(na_ + i) = b(i)
    Next i
    Concat = out
End Function

Private Function SplitFiles(ByVal s As String, ByVal folder As String, fl() As String) As Long
    Dim parts() As String, i As Long, n As Long
    parts = Split(s, ";")
    ReDim fl(0 To UBound(parts) + 1)
    For i = 0 To UBound(parts)
        If Len(Trim(parts(i))) > 0 Then fl(n) = JoinPath(folder, Trim(parts(i))): n = n + 1
    Next i
    SplitFiles = n
End Function

' ---- dates: always English month names (26-Oct-26), whatever the Windows language ----
Public Function SurpacDate(ByVal y As Long, ByVal m As Long, ByVal d As Long) As String
    SurpacDate = Right("0" & CStr(d), 2) & "-" & Mid("JanFebMarAprMayJunJulAugSepOctNovDec", (m - 1) * 3 + 1, 3) & _
                 "-" & Right("0" & CStr(y Mod 100), 2)
End Function

' DATE from the panel: "auto"/empty = newest date in the file names (today if none),
' "2026-10-26" or "26/10/2026" = that day, anything else is used as written.
Private Function ResolveDate(ByVal v As String, ByVal fileList As String) As String
    Dim p() As String, i As Long, best As Long, k As Long, names() As String
    v = Trim(v)
    p = Split(v, "-")
    If UBound(p) = 2 Then
        If Len(p(0)) = 4 And IsDigits(p(0)) And IsDigits(p(1)) And IsDigits(p(2)) Then
            ResolveDate = SurpacDate(CLng(p(0)), CLng(p(1)), CLng(p(2))): Exit Function
        End If
    End If
    p = Split(v, "/")
    If UBound(p) = 2 Then
        If Len(p(2)) = 4 And IsDigits(p(0)) And IsDigits(p(1)) And IsDigits(p(2)) Then
            ResolveDate = SurpacDate(CLng(p(2)), CLng(p(1)), CLng(p(0))): Exit Function
        End If
    End If
    If Len(v) > 0 And LCase(v) <> "auto" Then ResolveDate = v: Exit Function
    names = Split(fileList, ";")
    For i = 0 To UBound(names)
        k = FileDate(names(i))
        If k > best Then best = k
    Next i
    If best = 0 Then best = CLng(Year(Now)) * 10000 + CLng(Month(Now)) * 100 + CLng(Day(Now))
    ResolveDate = SurpacDate(best \ 10000, (best \ 100) Mod 100, best Mod 100)
End Function

' Date written in a file name (26102026, 26-10-2026 or 20261026) as yyyymmdd, 0 if none.
Public Function FileDate(ByVal name As String) As Long
    Dim s As String, i As Long, j As Long, t As String, y As Long, m As Long, d As Long
    i = InStrRev(name, "\"): If InStrRev(name, "/") > i Then i = InStrRev(name, "/")
    s = Mid(name, i + 1)
    s = Replace(Replace(Replace(Replace(s, "-", ""), "_", ""), ".", ""), " ", "")
    i = 1
    Do While i <= Len(s)
        If IsDigits(Mid(s, i, 1)) Then
            j = i
            Do While j <= Len(s)
                If Not IsDigits(Mid(s, j, 1)) Then Exit Do
                j = j + 1
            Loop
            Do While j - i >= 8
                t = Mid(s, i, 8)
                y = CLng(Right(t, 4)): m = CLng(Mid(t, 3, 2)): d = CLng(Left(t, 2))
                If Left(Right(t, 4), 2) = "20" And m >= 1 And m <= 12 And d >= 1 And d <= 31 Then
                    FileDate = y * 10000 + m * 100 + d: Exit Function
                End If
                y = CLng(Left(t, 4)): m = CLng(Mid(t, 5, 2)): d = CLng(Right(t, 2))
                If Left(t, 2) = "20" And m >= 1 And m <= 12 And d >= 1 And d <= 31 Then
                    FileDate = y * 10000 + m * 100 + d: Exit Function
                End If
                i = i + 8
            Loop
            i = j
        Else
            i = i + 1
        End If
    Loop
End Function

' 26-Oct-26 -> 261026
Public Function TagOf(ByVal dt As String) As String
    Dim p() As String, m As Long
    p = Split(dt, "-")
    If UBound(p) <> 2 Then TagOf = Replace(dt, "-", ""): Exit Function
    m = (InStr("JanFebMarAprMayJunJulAugSepOctNovDec", UCase(Left(p(1), 1)) & LCase(Mid(p(1), 2, 2))) + 2) \ 3
    TagOf = Right("0" & p(0), 2) & Right("0" & CStr(m), 2) & Right(p(2), 2)
End Function

Private Function FullName(ByVal tag As String, ByVal name As String) As String
    If Len(name) >= 7 Then
        If IsDigits(Left(name, 6)) And Mid(name, 7, 1) = "_" Then FullName = name: Exit Function
    End If
    If Len(name) >= 9 Then
        If IsDigits(Left(name, 8)) And Mid(name, 9, 1) = "_" Then FullName = name: Exit Function
    End If
    FullName = tag & "_" & name
End Function

Public Function JoinPath(ByVal folder As String, ByVal name As String) As String
    Dim sep As String
    If InStr(folder, "/") > 0 And InStr(folder, "\") = 0 Then sep = "/" Else sep = "\"
    If Right(folder, 1) = "/" Or Right(folder, 1) = "\" Then
        JoinPath = folder & name
    Else
        JoinPath = folder & sep & name
    End If
End Function

Private Sub MakeFolder(ByVal path As String)
    On Error Resume Next
    MkDir path
    On Error GoTo 0
End Sub
