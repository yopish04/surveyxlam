' sma_survey.vbs - jembatan Surpac (Tcl exec) -> mesin SMA Survey di Excel (SurveySMA.xlam)
' Dipanggil oleh sma_potong.tcl / sma_boundary.tcl / sma_update_harian.tcl:
'   cscript //nologo sma_survey.vbs <xlam> potong <progres> <bdy1;bdy2> <noBdy> <DALAM|LUAR> <harian|-> <hasil> <tgl|auto> <cek>
'   cscript //nologo sma_survey.vbs <xlam> bdy    <A> <noA> <B1;B2> <noB> <TAMBAH|KURANGI|IRISAN> <hasil> <tgl|auto>
'   cscript //nologo sma_survey.vbs <xlam> harian <globalLama> <bdyLama|-> <noBdy> <harian1;harian2> <noHarian> <folder> <tgl|auto> <cek>
' Keluaran satu baris: "OK <keterangan>" atau "GAGAL <pesan>". Excel dibuka tersembunyi lalu ditutup lagi.
' Hasil tidak pernah ditulis ke Y:\, Z:\ atau \\server (dicek di sini juga).
Option Explicit
Dim a, xl, wb, r, mode, xlam, nm, ymd, tgl, hasil
Set a = WScript.Arguments
If a.Count < 3 Then
    WScript.Echo "GAGAL argumen kurang"
    WScript.Quit 1
End If
xlam = a(0): mode = LCase(a(1))
Select Case mode
    Case "potong", "bdy": hasil = a(7)
    Case "harian": hasil = a(7) & "\"
    Case Else
        WScript.Echo "GAGAL mode tidak dikenal: " & mode
        WScript.Quit 1
End Select
If Dilindungi(hasil) Then
    WScript.Echo "GAGAL folder hasil dilindungi (server): " & hasil
    WScript.Quit 1
End If

On Error Resume Next
Set xl = CreateObject("Excel.Application")
If Err.Number <> 0 Then
    WScript.Echo "GAGAL Excel tidak bisa dibuka: " & Err.Description
    WScript.Quit 1
End If
xl.Visible = False
xl.DisplayAlerts = False
xl.EnableEvents = False
Set wb = xl.Workbooks.Open(xlam, 0, True)
If Err.Number <> 0 Then
    WScript.Echo "GAGAL add-in tidak bisa dibuka (" & xlam & "): " & Err.Description
    xl.Quit
    WScript.Quit 1
End If
nm = "'" & wb.Name & "'!"
Err.Clear
Select Case mode
    Case "potong"
        If a(6) = "-" Then
            ymd = xl.Run(nm & "ResolveYmd", a(8), a(3))
        Else
            ymd = xl.Run(nm & "ResolveYmd", a(8), a(6))
        End If
        If ymd = 0 Then ymd = Year(Date) * 10000 + Month(Date) * 100 + Day(Date)
        tgl = xl.Run(nm & "SurpacDateU", ymd)
        r = xl.Run(nm & "PotongProgres", a(2), a(3), CLng(a(4)), a(5), Bersih(a(6)), a(7), tgl, False, CDbl(a(9)))
    Case "bdy"
        ymd = xl.Run(nm & "ResolveYmd", a(8), a(4))
        If ymd = 0 Then ymd = Year(Date) * 10000 + Month(Date) * 100 + Day(Date)
        tgl = xl.Run(nm & "SurpacDateU", ymd)
        r = xl.Run(nm & "BoundaryOp", a(2), CLng(a(3)), a(4), CLng(a(5)), a(6), a(7), tgl, CLng(a(3)))
    Case "harian"
        r = xl.Run(nm & "UpdateHarian", a(2), Bersih(a(3)), CLng(a(4)), a(5), CLng(a(6)), a(7), a(8), CDbl(a(9)))
End Select
If Err.Number <> 0 Then
    WScript.Echo "GAGAL " & Err.Description
Else
    WScript.Echo "OK " & r
End If
wb.Close False
xl.Quit
Set xl = Nothing

Function Bersih(s)
    If s = "-" Then
        Bersih = ""
    Else
        Bersih = s
    End If
End Function

Function Dilindungi(p)
    Dim u
    u = UCase(Replace(p, "/", "\"))
    Dilindungi = (Left(u, 3) = "Y:\" Or Left(u, 3) = "Z:\" Or Left(u, 2) = "\\")
End Function
