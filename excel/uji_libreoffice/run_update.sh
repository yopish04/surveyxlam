#!/bin/bash
# Jalankan SurveyUpdate.bas di LibreOffice (headless) dengan file job.
# usage: run_update.sh <SurveyUpdate.bas> <job.txt>
#   job: POTONG|progres|bdy1;bdy2|no|DALAM/LUAR|harian1;harian2|out|tgl|0/1 titikPotong|cek
#        BDY|a|aNo|b1;b2|bNo|TAMBAH/KURANGI/IRISAN|out|tgl|outNo
#        HARIAN|globalLama|bdyLama|bdyNo|harian|harianBdyNo|folderOut|tgl|cek
PROF=${LO_PROFILE:-/tmp/surveyupdate_lo_profile}; BAS=$1; JOB=$2
if [ ! -d "$PROF/user/basic/Standard" ]; then
  timeout 120 soffice -env:UserInstallation=file://$PROF --headless --terminate_after_init >/dev/null 2>&1 || true
fi
python3 -I - "$BAS" "$PROF/user/basic/Standard" <<'PY'
import sys, html, os, re
bas, lib = sys.argv[1], sys.argv[2]
code = open(bas, encoding='utf-8').read().replace('\r\n', '\n')
code = re.sub(r'^Attribute VB_Name.*\n', '', code)
code = 'Option VBASupport 1\n' + code + '''
Public Sub TestUpd()
    Dim f As Integer, s As String, p() As String, r As String, res As String, g As Integer
    On Error GoTo fail
    f = FreeFile
    Open Environ("UPD_JOB") For Input As #f
    Do While Not EOF(f)
        Line Input #f, s
        If Len(Trim(s)) > 0 Then
            p = Split(s, "|")
            If p(0) = "POTONG" Then
                r = PotongProgres(p(1), p(2), CLng(p(3)), p(4), p(5), p(6), p(7), (p(8) = "1"), Val(p(9)))
            ElseIf p(0) = "BDY" Then
                r = BoundaryOp(p(1), CLng(p(2)), p(3), CLng(p(4)), p(5), p(6), p(7), CLng(p(8)))
            Else
                r = UpdateHarian(p(1), p(2), CLng(p(3)), p(4), CLng(p(5)), p(6), p(7), Val(p(8)))
            End If
            res = res & p(0) & " " & r & Chr(10)
        End If
    Loop
    Close #f
    g = FreeFile
    Open Environ("UPD_JOB") & ".done" For Output As #g: Print #g, "OK" & Chr(10) & res: Close #g
    Exit Sub
fail:
    g = FreeFile
    Open Environ("UPD_JOB") & ".done" For Output As #g
    Print #g, "ERROR " & Err.Number & ": " & Err.Description & Chr(10) & res
    Close #g
End Sub
'''
xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">\n'
       '<script:module xmlns:script="http://openoffice.org/2000/script" script:name="SurveyUpdate" script:language="StarBasic" script:moduleType="normal">'
       + html.escape(code, quote=True) + '</script:module>\n')
open(os.path.join(lib, 'SurveyUpdate.xba'), 'w', encoding='utf-8').write(xml)
xlb = os.path.join(lib, 'script.xlb'); s = open(xlb, encoding='utf-8').read()
if 'SurveyUpdate' not in s:
    s = s.replace('</library:library>', ' <library:element library:name="SurveyUpdate"/>\n</library:library>')
    open(xlb, 'w', encoding='utf-8').write(s)
PY
rm -f "$JOB.done"
UPD_JOB="$JOB" timeout 900 soffice -env:UserInstallation=file://$PROF --headless --norestore \
  "vnd.sun.star.script:Standard.SurveyUpdate.TestUpd?language=Basic&location=application" >/dev/null 2>&1 || true
cat "$JOB.done" 2>/dev/null || echo "NO RESULT (macro did not finish)"
