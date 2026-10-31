# Uji .dtm SMA Survey di Surpac

`uji_dtm.str` + `uji_dtm.dtm` dibuat oleh SMA Survey (CREATE DTM lalu *File › Save DTM*).
Tujuannya memastikan file .dtm teks dari SMA Survey terbaca benar di Surpac, terutama **angka di baris header**:

```
uji_dtm.str,0;algorithm=standard;fields=x,y
```

Angka `0` dan teks `algorithm=standard;fields=x,y` diambil dari spesifikasi riset (`riset/volume/update_harian.py`,
`dtm_text`), belum dicocokkan dengan file buatan Surpac sendiri.

## Langkah di Surpac

1. Salin **kedua** file ke satu folder (.dtm merujuk nomor baris di `uji_dtm.str`).
2. Buka `uji_dtm.dtm` (seret ke layar grafis). Yang diharapkan:
   - tidak ada pesan galat atau peringatan soal header;
   - **39 segitiga**, 25 titik dipakai (string 1 = boundary tidak dipakai, string 500 = titik saja, string 5 = breakline).
3. *Inquire › Point properties* / Z di permukaan DTM pada titik berikut (hasil SMA Survey):

   | X | Y | Z |
   |---|---|---|
   | 350010.000 | 9650010.000 | 100.596 |
   | 350020.000 | 9650015.000 | 101.149 |
   | 350033.000 | 9650024.000 | 100.297 |

4. **Penting:** buat DTM di Surpac dari `uji_dtm.str` (*Surfaces › Create DTM from layer*, setelan bawaan, string 1 tidak dipakai,
   500 sebagai spot) lalu simpan sebagai **teks** dengan nama `uji_dtm_surpac.dtm`. Kirim file itu kembali.
   Dengan file itu header, urutan tepi (string 1) dan urutan tetangga segitiga bisa disamakan persis dengan Surpac.

## Hasil uji di SMA Survey (otomatis)

`viewer/uji/cek_dtm.py` membaca file ini dengan alat riset: 39 segitiga, sama dengan TIN pembanding `cdt2`
(pembanding TIN Surpac), tetangga konsisten, baris segitiga sama dengan `dtm_text`.
