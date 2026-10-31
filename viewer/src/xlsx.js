/* SMA Viewer - isi template Excel (.xlsx) tanpa pustaka luar.
   Template = file .xlsx biasa; sel berisi penanda {{kunci}} diganti nilainya. Sel yang isinya tepat satu penanda
   dan nilainya angka menjadi sel angka (format sel tetap), selain itu teks. Gaya, rumus, sheet lain tidak diubah;
   Excel diminta menghitung ulang rumus saat dibuka (fullCalcOnLoad). ZIP dibaca/ditulis dengan (De)CompressionStream. */
'use strict';
const XL = (() => {
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u) => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function pipe(u, s) { const r = new Response(new Blob([u]).stream().pipeThrough(s)); return new Uint8Array(await r.arrayBuffer()); }
const inflate = (u) => pipe(u, new DecompressionStream('deflate-raw'));
const deflate = (u) => pipe(u, new CompressionStream('deflate-raw'));
const te = new TextEncoder(), td = new TextDecoder();

/* ZIP: -> Map nama -> isi (sudah dibuka) */
async function unzip(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('bukan file .xlsx (zip)');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    const meth = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(u.subarray(p + 46, p + 46 + nl));
    const lo = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u.subarray(lo, lo + csize);
    out.set(name, meth === 0 ? raw.slice() : meth === 8 ? await inflate(raw) : (() => { throw new Error('kompresi zip tidak didukung: ' + meth); })());
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function zip(files) {          // files: Map nama -> Uint8Array
  const parts = [], cen = []; let off = 0;
  for (const [name, data] of files) {
    const nm = te.encode(name), comp = await deflate(data), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 8, true); h.setUint32(14, crc, true);
    h.setUint32(18, comp.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, comp);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, 8, true); c.setUint32(16, crc, true);
    c.setUint32(20, comp.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + comp.length;
  }
  const csz = cen.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.size, true); end.setUint16(10, files.size, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  const all = parts.concat(cen, [new Uint8Array(end.buffer)]), r = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let k = 0; for (const x of all) { r.set(x, k); k += x.length; }
  return r;
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const escx = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textOf = (xml) => { let s = ''; for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += unesc(m[1]); return s; };
const PH = /\{\{\s*([^{}]+?)\s*\}\}/g;

/* isi template: values = { kunci: angka | teks } ; -> { data: Uint8Array, filled, missing:[kunci tanpa nilai] } */
async function fill(template, values) {
  const files = await unzip(template);
  const sst = files.has('xl/sharedStrings.xml') ? [...td.decode(files.get('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  let filled = 0; const missing = new Set();
  const val = (k) => { if (Object.prototype.hasOwnProperty.call(values, k)) return values[k]; missing.add(k); return ''; };
  for (const name of [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const xml = td.decode(files.get(name));
    const out = xml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (all, attrs, body) => {
      const t = (/\st="([^"]*)"/.exec(attrs) || [])[1];
      let text = null;
      if (t === 's') { const v = /<v>(\d+)<\/v>/.exec(body || ''); if (v) text = sst[+v[1]]; }
      else if (t === 'inlineStr') text = textOf(body || '');
      else if (t === 'str') { const v = /<v>([\s\S]*?)<\/v>/.exec(body || ''); if (v && !/<f[\s>]/.test(body)) text = unesc(v[1]); }
      if (text == null || !text.includes('{{')) return all;
      filled++;
      const a = attrs.replace(/\st="[^"]*"/, '');
      const one = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(text);
      if (one) { const v = val(one[1]); if (typeof v === 'number' && isFinite(v)) return `<c${a}><v>${v}</v></c>`; }
      const s = text.replace(PH, (_, k) => { const v = val(k); return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v ?? ''); });
      return s === '' ? `<c${a}/>` : `<c${a} t="inlineStr"><is><t xml:space="preserve">${escx(s)}</t></is></c>`;
    });
    files.set(name, te.encode(out));
  }
  // hitung ulang rumus saat dibuka; calcChain lama bisa tidak cocok lagi
  if (files.has('xl/workbook.xml')) {
    let w = td.decode(files.get('xl/workbook.xml'));
    w = /<calcPr\b/.test(w) ? w.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, sl) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${sl}>`) : w.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    files.set('xl/workbook.xml', te.encode(w));
  }
  if (files.has('xl/calcChain.xml')) {
    files.delete('xl/calcChain.xml');
    for (const k of ['[Content_Types].xml', 'xl/_rels/workbook.xml.rels']) if (files.has(k)) files.set(k, te.encode(td.decode(files.get(k)).replace(/<(Override|Relationship)\b[^>]*calcChain[^>]*\/>/g, '')));
  }
  return { data: await zip(files), filled, missing: [...missing] };
}

/* template bawaan: laporan volume harian, 10 baris area + total. Bisa diedit di Excel (tata letak, logo, rumus). */
const AREA_KEYS = [['no', 'No'], ['area', 'Area'], ['first_dtm', 'First DTM (base)'], ['second_dtm', 'Second DTM'], ['bdy', 'Boundary'],
  ['cut', 'Cut (m³)'], ['fill', 'Fill (m³)'], ['nett', 'Nett (m³)'], ['nett_kemarin', 'Nett kemarin (m³)'], ['hari_ini', 'Volume hari ini (m³)']];
async function defaultTemplate(rows = 10) {
  const col = (i) => String.fromCharCode(65 + i);
  const cell = (r, c, v, s = 0) => `<c r="${col(c)}${r}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t>${escx(v)}</t></is></c>`;
  const R = [];
  R.push(`<row r="1">${cell(1, 0, 'LAPORAN VOLUME HARIAN — SMA Survey', 1)}</row>`);
  R.push(`<row r="2">${cell(2, 0, 'Tanggal', 1)}${cell(2, 1, '{{tanggal}}')}${cell(2, 3, 'Tanggal Surpac', 1)}${cell(2, 4, '{{tanggal_surpac}}')}</row>`);
  R.push(`<row r="4">${AREA_KEYS.map(([, h], i) => cell(4, i, h, 2)).join('')}</row>`);
  for (let k = 1; k <= rows; k++) R.push(`<row r="${4 + k}">${AREA_KEYS.map(([key], i) => cell(4 + k, i, `{{${k}.${key}}}`, i >= 5 ? 3 : 0)).join('')}</row>`);
  const t = 5 + rows;
  R.push(`<row r="${t}">${cell(t, 1, 'Total', 2)}${['cut', 'fill', 'nett', 'nett_kemarin', 'hari_ini'].map((k, i) => cell(t, 5 + i, `{{total.${k}}}`, 4)).join('')}</row>`);
  R.push(`<row r="${t + 2}">${cell(t + 2, 0, 'Volume dihitung SMA Survey (irisan TIN eksak, sama dengan DTM CUT AND FILL Surpac). Volume hari ini = nett − nett kemarin.')}</row>`);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="5" width="34" customWidth="1"/><col min="6" max="10" width="17" customWidth="1"/></cols><sheetData>${R.join('')}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.000"/></numFmts>
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="5"><xf/><xf fontId="1" applyFont="1"/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const f = new Map([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Laporan" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', sheet], ['xl/styles.xml', styles],
  ].map(([k, v]) => [k, te.encode(v)]));
  return zip(f);
}
/* nilai penanda dari daftar area: [{area, first_dtm, second_dtm, bdy, cut, fill, nett, nett_kemarin}] */
const r3 = (x) => Math.round(x * 1000) / 1000;          // 3 desimal seperti report Surpac
function valuesOf(tgl, items, tglSurpac) {
  const v = { tanggal: tgl, tanggal_surpac: tglSurpac || '' }, tot = { cut: 0, fill: 0, nett: 0, nett_kemarin: 0, hari_ini: 0 };
  items.forEach((it, i) => {
    const nett = r3(it.nett), kem = isFinite(it.nett_kemarin) ? r3(it.nett_kemarin) : '', hari = kem === '' ? '' : r3(nett - kem);
    const row = { no: i + 1, area: it.area, first_dtm: it.first_dtm, second_dtm: it.second_dtm, bdy: it.bdy, cut: r3(it.cut), fill: r3(it.fill), nett, nett_kemarin: kem, hari_ini: hari };
    for (const [k, x] of Object.entries(row)) { v[`${i + 1}.${k}`] = x; v[`${String(it.area).toLowerCase()}.${k}`] = x; }
    for (const k of Object.keys(tot)) if (typeof row[k] === 'number') tot[k] += row[k];
  });
  for (const [k, x] of Object.entries(tot)) v[`total.${k}`] = r3(x);
  return v;
}
/* penanda baris area yang tidak terisi (mis. area ke-7 dari 10) dikosongkan tanpa dianggap kurang */
function blankRest(values, rows = 50) { for (let k = 1; k <= rows; k++) for (const [key] of AREA_KEYS) if (!(`${k}.${key}` in values)) values[`${k}.${key}`] = ''; return values; }
return { unzip, zip, fill, defaultTemplate, valuesOf, blankRest, crc32 };
})();
if (typeof module !== 'undefined') module.exports = XL;
