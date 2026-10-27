######################################################################
#
# sma_lib.tcl  (SMA Survey) - dipakai oleh sma_potong.tcl, sma_boundary.tcl,
#                              sma_update_harian.tcl
# Surpac 6.6.2 (Tcl 8.5). Mesin hitung = add-in Excel SurveySMA.xlam (sama persis
# dengan tombol di Excel), dipanggil lewat sma_survey.vbs (cscript).
#
######################################################################

# --- setelan (ubah kalau folder berbeda) ---
set ::SMA(xlam)   "D:/yopi/SurveySMA/SurveySMA.xlam"
set ::SMA(folder) "D:/yopi/SurveySMA/hasil_update"
set ::SMA(dir)    [file dirname [info script]]
if {![file exists [file join $::SMA(dir) sma_survey.vbs]]} { set ::SMA(dir) "D:/yopi/SurveySMA/surpac" }

# folder server: hasil tidak boleh ditulis ke sini
proc smaDilindungi {path} {
  set p [string toupper [string map {/ \\} $path]]
  return [expr {[string range $p 0 2] eq "Y:\\" || [string range $p 0 2] eq "Z:\\" || [string range $p 0 1] eq "\\\\"}]
}

# tanggal yyyymmdd: "auto" = dari nama file pertama (ddmmyy_, ddmmyyyy_, yyyy_mm_dd_), atau dd/mm/yyyy, yyyy-mm-dd
proc smaTanggal {teks files} {
  set teks [string trim $teks]
  if {[regexp {^(\d{1,2})/(\d{1,2})/(\d{4})$} $teks -> d m y]} { return [format %04d%02d%02d $y [scan $m %d] [scan $d %d]] }
  if {[regexp {^(\d{4})-(\d{1,2})-(\d{1,2})$} $teks -> y m d]} { return [format %04d%02d%02d $y [scan $m %d] [scan $d %d]] }
  set f [lindex [split $files ";"] 0]
  set b [file tail $f]
  if {[regexp {^(\d{4})_(\d{2})_(\d{2})} $b -> y m d]} { return "$y$m$d" }
  if {[regexp {^(\d{2})(\d{2})(\d{4})(?!\d)} $b -> d m y]} { return "$y$m$d" }
  if {[regexp {^(\d{2})(\d{2})(\d{2})(?!\d)} $b -> d m y]} { return "20$y$m$d" }
  return [clock format [clock seconds] -format %Y%m%d]
}

# nama file dengan tanggal baru (sama dengan NameWithDate di Excel)
proc smaNama {file ymd} {
  set b [file rootname [file tail $file]]
  set y [string range $ymd 0 3]; set m [string range $ymd 4 5]; set d [string range $ymd 6 7]
  if {[regexp {^\d{4}_\d{2}_\d{2}} $b]} { return "${y}_${m}_${d}[string range $b 10 end].str" }
  if {[regexp {^\d{8}(?!\d)} $b]} { return "$d$m$y[string range $b 8 end].str" }
  if {[regexp {^\d{6}(?!\d)} $b]} { return "$d$m[string range $y 2 3][string range $b 6 end].str" }
  return "${y}_${m}_${d}_$b.str"
}

# jalankan mesin Excel; hasil "OK ..." atau "GAGAL ..."
proc smaJalan {args} {
  global SMA
  set vbs [file nativename [file join $SMA(dir) sma_survey.vbs]]
  set cmd [list cscript //nologo $vbs [file nativename $SMA(xlam)]]
  foreach a $args { lappend cmd $a }
  SclMessage assist "SMA Survey: menghitung di Excel ..."
  if {[catch {set out [eval exec $cmd]} err]} { set out "GAGAL $err" }
  SclMessage noAssist {}
  return [string trim $out]
}

# buka file hasil di layer baru (kalau gagal cukup pesan)
proc smaBuka {file} {
  set f [string map {\\ /} $file]
  if {[catch {SclFunction "RECALL ANY FILE" "file=\"$f\" mode=\"openInNewLayer\""} err]} {
    puts "Buka sendiri di Surpac: $f"
  }
}

proc smaPesan {hasil judul} {
  puts "=== $judul ==="
  puts $hasil
  if {[string range $hasil 0 1] eq "OK"} {
    SclMessage print "$judul selesai"
  } else {
    SclMessage error "$judul: $hasil"
  }
}

proc smaGabungFile {args} {
  set out {}
  foreach f $args { if {[string trim $f] ne ""} { lappend out [file nativename [string trim $f]] } }
  return [join $out ";"]
}
