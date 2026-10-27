######################################################################
#
# Macro Name  : cek_layer.tcl  (SMA Survey)
# Surpac      : 6.6.2 (SCL / Tcl 8.5)
# Description : Ringkasan layer aktif, hanya MEMBACA data (tidak mengubah apa pun):
#               per nomor string -> jumlah segment, jumlah titik, panjang 2D,
#               segment tertutup; boundary (string 1) dicek tertutup atau tidak.
#               Cara pakai: buka file .str di Surpac, lalu MACRO PLAYBACK file ini.
#
######################################################################

SclGetActiveViewport vp
$vp SclGetActiveLayer swa
puts "=== Layer aktif: [$swa SclGetId] ==="

$swa SclGetStrings strs
set totalTitik 0
$strs SclIterateFirst itStr
while {[$itStr SclIterateNext str] == $SCL_TRUE} {
  set nomor [$str SclGetId]
  set nSeg 0
  set nTitik 0
  set nTutup 0
  set panjang 0.0
  $str SclIterateFirst itSeg
  while {[$itSeg SclIterateNext seg] == $SCL_TRUE} {
    incr nSeg
    incr nTitik [$seg SclCountItems]
    set panjang [expr {$panjang + [$seg SclGetValueByName 2dlength]}]
    if {[$seg SclGetValueByName closure] eq "closed"} { incr nTutup }
  }
  incr totalTitik $nTitik
  puts [format "string %6s : %4d segment, %6d titik, %9.1f m, tertutup %d" \
        $nomor $nSeg $nTitik $panjang $nTutup]
  if {$nomor == 1 && $nTutup < $nSeg} {
    puts "   PERHATIAN: ada boundary (string 1) yang tidak tertutup"
  }
}
puts "=== Total titik: $totalTitik ==="
