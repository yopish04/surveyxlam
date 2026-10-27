######################################################################
#
# Macro Name  : sma_potong.tcl  (SMA Survey)
# Surpac      : 6.6.2 (SCL / Tcl 8.5)
# Description : Potong file progress dengan boundary (satu atau dua file boundary,
#               nomor string boundary dipilih), buang titik DI DALAM atau DI LUAR,
#               opsional langsung tambah data harian. Hasil sama persis dengan tombol
#               Potong di Excel (mesin yang sama). File asal tidak diubah.
#
######################################################################
source [file join [file dirname [info script]] sma_lib.tcl]

set form {
  GuidoForm frmSmaPotong {
    -label "SMA Survey - Potong Progress"
    -default_buttons
    GuidoFileBrowserField progres {
      -label "File progress" -width 45 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoFileBrowserField bdy1 {
      -label "File boundary" -width 45 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoFileBrowserField bdy2 {
      -label "File boundary 2 (boleh kosong)" -width 45 -format none -null true
      -file_mask "*.str" -absolutePath true
    }
    GuidoField nobdy {
      -label "Nomor string boundary" -format integer_4 -display_length 6 -null false
      -low_bound 1 -high_bound 32000
    }
    GuidoComboBox mode {
      -label "Buang titik yang" -value_in DALAM LUAR -exclusive true
    }
    GuidoCheckBox tambah {
      -label "Tambah data harian" -height 1
      -caption "isi file boundary (selain string boundary) ikut ditambahkan"
      -selected_value YA -unselected_value TIDAK
    }
    GuidoField tgl {
      -label "Tanggal (auto / 27/10/2026)" -format none -width 15 -null false
    }
    GuidoFileBrowserField hasil {
      -label "File hasil (kosong = otomatis)" -width 45 -format none -null true
      -file_mask "*.str" -absolutePath true
    }
    GuidoCheckBox buka {
      -label "Buka hasil" -height 1 -caption "tampilkan hasil di layer baru"
      -selected_value YA -unselected_value TIDAK
    }
  }
}

SclCreateGuidoForm h $form {
  set nobdy 1
  set mode DALAM
  set tambah TIDAK
  set tgl auto
  set buka YA
}
proc smaPotongJalan {progres bdy1 bdy2 nobdy mode tambah tgl hasil buka} {
  global SMA

  set bdy [smaGabungFile $bdy1 $bdy2]
  set ymd [smaTanggal $tgl $bdy]
  if {[string trim $hasil] eq ""} {
    set folder $SMA(folder)
    set hasil [file join $folder [smaNama $progres $ymd]]
    if {[file normalize $hasil] eq [file normalize $progres]} {
      set hasil [file join $folder "[file rootname [file tail $progres]]_potong.str"]
    }
  }
  if {[smaDilindungi $hasil]} { SclMessage error "Folder hasil dilindungi (server): $hasil"; return }
  file mkdir [file dirname $hasil]
  if {$tambah eq "YA"} { set harian $bdy } else { set harian "-" }
  set r [smaJalan potong [file nativename $progres] $bdy $nobdy $mode $harian [file nativename $hasil] $ymd 2]
  smaPesan $r "Potong progress"
  if {[string range $r 0 1] eq "OK" && $buka eq "YA"} { smaBuka $hasil }
}

$h SclRun {}
if {"$_status" == "apply"} { smaPotongJalan $progres $bdy1 $bdy2 $nobdy $mode $tambah $tgl $hasil $buka }
