######################################################################
#
# Macro Name  : sma_boundary.tcl  (SMA Survey)
# Surpac      : 6.6.2 (SCL / Tcl 8.5)
# Description : Boundary A + B (TAMBAH), A - B (KURANGI) atau irisan (IRISAN),
#               nomor string A dan B dipilih. Contoh: bdy progress global kemarin
#               + boundary harian = bdy progress global hari ini (sama dengan Surpac manual).
#               File asal tidak diubah.
#
######################################################################
source [file join [file dirname [info script]] sma_lib.tcl]

set form {
  GuidoForm frmSmaBoundary {
    -label "SMA Survey - Update Boundary"
    -default_buttons
    GuidoFileBrowserField fa {
      -label "Boundary A (mis. bdy global kemarin)" -width 45 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoField noa {
      -label "String A" -format integer_4 -display_length 6 -null false -low_bound 1 -high_bound 32000
    }
    GuidoFileBrowserField fb1 {
      -label "Boundary B (mis. file harian)" -width 45 -format none -null false
      -file_mask "*.str" -absolutePath true
    }
    GuidoFileBrowserField fb2 {
      -label "Boundary B 2 (boleh kosong)" -width 45 -format none -null true
      -file_mask "*.str" -absolutePath true
    }
    GuidoField nob {
      -label "String B" -format integer_4 -display_length 6 -null false -low_bound 1 -high_bound 32000
    }
    GuidoComboBox op {
      -label "Operasi" -value_in TAMBAH KURANGI IRISAN -exclusive true
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
  set noa 1
  set nob 1
  set op TAMBAH
  set tgl auto
  set buka YA
}
proc smaBoundaryJalan {fa noa fb1 fb2 nob op tgl hasil buka} {
  global SMA

  set fb [smaGabungFile $fb1 $fb2]
  set ymd [smaTanggal $tgl $fb]
  if {[string trim $hasil] eq ""} {
    set folder $SMA(folder)
    set hasil [file join $folder [smaNama $fa $ymd]]
    if {[file normalize $hasil] eq [file normalize $fa]} {
      set hasil [file join $folder "[file rootname [file tail $fa]]_[string tolower $op].str"]
    }
  }
  if {[smaDilindungi $hasil]} { SclMessage error "Folder hasil dilindungi (server): $hasil"; return }
  file mkdir [file dirname $hasil]
  set r [smaJalan bdy [file nativename $fa] $noa $fb $nob $op [file nativename $hasil] $ymd]
  smaPesan $r "Update boundary"
  if {[string range $r 0 1] eq "OK" && $buka eq "YA"} { smaBuka $hasil }
}

$h SclRun {}
if {"$_status" == "apply"} { smaBoundaryJalan $fa $noa $fb1 $fb2 $nob $op $tgl $hasil $buka }
