######################################################################
#
# Macro Name  : sma_update_harian.tcl  (SMA Survey)
# Surpac      : 6.6.2 (SCL / Tcl 8.5)
# Description : Update progress harian satu area, seperti cara manual:
#               1. global lama dipotong boundary harian (titik di dalam dibuang)
#               2. data harian ditambahkan                -> YYYY_MM_DD_update_topo_<area>.str
#               3. bdy lama + boundary harian             -> ..._bdy.str
#               4. ujung garis lama dekat boundary        -> ..._CEK.str (dicek / diedit manual)
#               Opsional: buka form CREATE DTM dan DTM CUT AND FILL VOLUMES.
#               File asal (server) tidak diubah; hasil ke folder kerja.
#
######################################################################
source [file join [file dirname [info script]] sma_lib.tcl]

set form {
  GuidoForm frmSmaUpdate {
    -label "SMA Survey - Update Harian"
    -default_buttons
    GuidoFileBrowserField glama {
      -label "Global lama (update kemarin)" -width 45 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoFileBrowserField blama {
      -label "Bdy lama (kosong = tidak dibuat)" -width 45 -format none -null true
      -file_mask "*.str" -absolutePath true
    }
    GuidoField noblama {
      -label "String bdy lama" -format integer_4 -display_length 6 -null false -low_bound 1 -high_bound 32000
    }
    GuidoFileBrowserField h1 {
      -label "File harian" -width 45 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoFileBrowserField h2 {
      -label "File harian 2 (boleh kosong)" -width 45 -format none -null true
      -file_mask "*.str" -absolutePath true
    }
    GuidoField noharian {
      -label "String boundary harian" -format integer_4 -display_length 6 -null false -low_bound 1 -high_bound 32000
    }
    GuidoField tgl {
      -label "Tanggal (auto / 27/10/2026)" -format none -width 15 -null false
    }
    GuidoFileBrowserField folder {
      -label "Folder hasil" -width 45 -format none -null false
      -browser_type directory -absolutePath true
    }
    GuidoCheckBox buka {
      -label "Buka hasil" -height 1 -caption "tampilkan update, bdy dan CEK di layer baru"
      -selected_value YA -unselected_value TIDAK
    }
    GuidoCheckBox volume {
      -label "Lanjut DTM & volume" -height 1 -caption "buka form CREATE DTM lalu DTM CUT AND FILL VOLUMES"
      -selected_value YA -unselected_value TIDAK
    }
  }
}

SclCreateGuidoForm h $form {
  set noblama 1
  set noharian 1
  set tgl auto
  set folder $::SMA(folder)
  set buka YA
  set volume TIDAK
}
proc smaUpdateJalan {glama blama noblama h1 h2 noharian tgl folder buka volume} {
  global SMA

  if {[smaDilindungi $folder]} { SclMessage error "Folder hasil dilindungi (server): $folder"; return }
  file mkdir $folder
  set harian [smaGabungFile $h1 $h2]
  set ymd [smaTanggal $tgl $harian]
  set outG [file join $folder [smaNama $glama $ymd]]
  if {[file normalize $outG] eq [file normalize $glama]} { SclMessage error "Hasil sama dengan global lama; cek tanggal"; return }
  if {[string trim $blama] eq ""} { set bl "-" } else { set bl [file nativename $blama] }
  set r [smaJalan harian [file nativename $glama] $bl $noblama $harian $noharian [file nativename $folder] $ymd 2]
  smaPesan $r "Update harian"
  if {[string range $r 0 1] ne "OK"} { return }

  set outB ""
  if {$bl ne "-"} { set outB [file join $folder [smaNama $blama $ymd]] }
  set outC "[file rootname $outG]_CEK.str"
  if {$buka eq "YA"} {
    smaBuka $outG
    if {$outB ne ""} { smaBuka $outB }
    if {[file exists $outC]} { smaBuka $outC }
  }
  puts "Global baru : $outG"
  if {$outB ne ""} { puts "Bdy baru    : $outB" }
  if {[file exists $outC]} { puts "Titik cek   : $outC (ujung garis lama dekat boundary harian, string 9006)" }

  if {$volume eq "YA"} {
    puts "Buat DTM dari: $outG"
    catch {SclFunction "CREATE DTM" {}}
    puts "Volume: first DTM = base area, second DTM = [file rootname $outG].dtm, boundary = $outB string $noblama"
    catch {SclFunction "DTM CUT AND FILL VOLUMES" {}}
  }
}

$h SclRun {}
if {"$_status" == "apply"} { smaUpdateJalan $glama $blama $noblama $h1 $h2 $noharian $tgl $folder $buka $volume }
