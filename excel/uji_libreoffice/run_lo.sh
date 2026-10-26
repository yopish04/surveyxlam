#!/bin/bash
# Run excel/SurveyCore.bas inside LibreOffice (headless) on a job file.
# usage: run_lo.sh <SurveyCore.bas> <job.txt>
set -e
S=$(cd "$(dirname "$0")" && pwd); PROF=${LO_PROFILE:-/tmp/surveycore_lo_profile}; BAS=$1; JOB=$2
if [ ! -d "$PROF/user/basic/Standard" ]; then
  timeout 120 soffice -env:UserInstallation=file://$PROF --headless --terminate_after_init >/dev/null 2>&1 || true
fi
python3 -I - "$BAS" "$PROF/user/basic/Standard" <<'PY'
import sys, html, os, re
bas, lib = sys.argv[1], sys.argv[2]
code = open(bas, encoding='utf-8').read().replace('\r\n', '\n')
code = re.sub(r'^Attribute VB_Name.*\n', '', code)
code = 'Option VBASupport 1\n' + code + '''
Public Sub TestMain()
    On Error GoTo fail
    RunJobFile Environ("SURVEY_JOB")
    Dim f As Integer: f = FreeFile
    Open Environ("SURVEY_JOB") & ".done" For Output As #f: Print #f, "OK": Close #f
    Exit Sub
fail:
    Dim g As Integer: g = FreeFile
    Open Environ("SURVEY_JOB") & ".done" For Output As #g
    Print #g, "ERROR " & Err.Number & " line " & Erl & ": " & Err.Description
    Close #g
End Sub
'''
xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">\n'
       '<script:module xmlns:script="http://openoffice.org/2000/script" script:name="SurveyCore" script:language="StarBasic" script:moduleType="normal">'
       + html.escape(code, quote=True) + '</script:module>\n')
open(os.path.join(lib, 'SurveyCore.xba'), 'w', encoding='utf-8').write(xml)
xlb = os.path.join(lib, 'script.xlb'); s = open(xlb, encoding='utf-8').read()
if 'SurveyCore' not in s:
    s = s.replace('</library:library>', ' <library:element library:name="SurveyCore"/>\n</library:library>')
    open(xlb, 'w', encoding='utf-8').write(s)
PY
rm -f "$JOB.done"
SURVEY_JOB="$JOB" timeout 900 soffice -env:UserInstallation=file://$PROF --headless --norestore \
  "vnd.sun.star.script:Standard.SurveyCore.TestMain?language=Basic&location=application" >/dev/null 2>&1 || true
cat "$JOB.done" 2>/dev/null || echo "NO RESULT (macro did not finish)"
