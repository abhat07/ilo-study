// Generates small sample lecture files in dev-fixtures/ for manual testing (not real course material).
import { mkdirSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

const out = new URL('../dev-fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });

// ---------- PDF (hand-built, Helvetica text) ----------
const pages = [
  ['Lecture 3: The polymerase chain reaction', '', 'Learning outcomes', '1. Describe the three steps of a PCR cycle and their temperatures',
    '2. Explain why a thermostable DNA polymerase is required', '3. Calculate the number of target copies after a given number of cycles'],
  ['The PCR cycle', 'Each cycle has three steps.', 'Denaturation at 95 C separates the two strands of the template DNA.',
    'Annealing at 50-65 C allows the primers to bind to complementary sequences.',
    'Extension at 72 C lets Taq polymerase synthesise new DNA from the primers.'],
  ['Why Taq polymerase?', 'Taq polymerase is thermostable, so it is not denatured at 95 C.',
    'This means fresh enzyme does not need to be added after every cycle.', 'Taq lacks 3 to 5 exonuclease proofreading activity, so it has a higher error rate.'],
  ['Exponential amplification', 'In theory the number of target copies doubles every cycle.',
    'After n cycles one template gives 2 to the power n copies.', 'In practice efficiency falls in later cycles as primers and nucleotides run out.'],
];
function pdf(pages) {
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const fontId = 3 + pages.length * 2;
  pages.forEach((lines, i) => {
    const content = 'BT /F1 16 Tf 50 740 Td 22 TL ' + lines.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ') + ' ET';
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let s = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return s;
}
writeFileSync(new URL('AMB_L3_PCR.pdf', out), pdf(pages), 'latin1');

// ---------- VTT transcript ----------
writeFileSync(new URL('AMB_L3_PCR.vtt', out), `WEBVTT

00:00:05.000 --> 00:00:15.000
Right, so today we are looking at PCR, the polymerase chain reaction, which lets us amplify a specific target sequence of DNA.

00:00:15.000 --> 00:00:32.000
The key point about denaturation is that heating to around 95 degrees breaks the hydrogen bonds between the bases, so the two strands come apart.

00:00:32.000 --> 00:00:50.000
Then we cool down for annealing. The primers are short single-stranded oligonucleotides and they bind to the ends of the region we want, which defines what gets amplified.

00:00:50.000 --> 00:01:10.000
If the annealing temperature is too low the primers bind non-specifically and you get extra bands on your gel. Too high and they do not bind at all.
`);

// ---------- PPTX (minimal) ----------
const slides = [
  { title: 'Lecture 4: Restriction cloning', body: ['Intended learning outcomes', 'Describe how restriction enzymes recognise and cut DNA', 'Explain how sticky ends allow DNA ligase to join fragments into a vector'], notes: '' },
  { title: 'Restriction enzymes', body: ['Type II restriction enzymes recognise short palindromic sequences, usually 4 to 8 base pairs long.', 'EcoRI cuts GAATTC between G and A, leaving a 5 prime overhang called a sticky end.'], notes: 'Emphasise that the same enzyme on vector and insert gives compatible ends.' },
  { title: 'Ligation', body: ['Compatible sticky ends anneal by complementary base pairing.', 'DNA ligase then seals the sugar-phosphate backbone by forming phosphodiester bonds.', 'Dephosphorylating the vector with phosphatase stops the vector re-ligating to itself.'], notes: '' },
];
const zip = new JSZip();
const ct = ['<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'];
const para = (t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`;
const presRels = [];
const sldIds = [];
slides.forEach((s, i) => {
  const n = i + 1;
  zip.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${para(s.title)}</p:txBody></p:sp><p:sp><p:txBody>${s.body.map(para).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  const rels = [];
  if (s.notes) {
    zip.file(`ppt/notesSlides/notesSlide${n}.xml`, `<?xml version="1.0"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${para(s.notes)}${para(String(n))}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
    rels.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`);
  }
  zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  presRels.push(`<Relationship Id="rId${n + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`);
  sldIds.push(`<p:sldId id="${255 + n}" r:id="rId${n + 10}"/>`);
});
zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIds.join('')}</p:sldIdLst></p:presentation>`);
zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels.join('')}</Relationships>`);
zip.file('[Content_Types].xml', ct[0] + '</Types>');
writeFileSync(new URL('AMB_L4_Cloning.pptx', out), await zip.generateAsync({ type: 'nodebuffer' }));
console.log('fixtures written');

// ---------- v2 of the PCR lecture: page 3 changed, a new page added (tests re-ingestion) ----------
const v2 = pages.map((p) => [...p]);
v2[2] = ['Why Taq polymerase?', 'Taq polymerase comes from a thermophilic bacterium and survives repeated heating to 95 C.',
  'Fresh enzyme is therefore not needed after every cycle.', 'Proofreading polymerases such as Pfu have lower error rates than Taq.'];
v2.push(['Controls', 'A no-template control contains every reagent except the DNA template.', 'A band in the no-template control means the reagents are contaminated.']);
mkdirSync(new URL('v2/', out), { recursive: true });
writeFileSync(new URL('v2/AMB_L3_PCR.pdf', out), pdf(v2), 'latin1');
console.log('v2 fixture written');

// ---------- PPTX with pictures (tests slide pictures; the logo repeats on every slide and should be skipped) ----------
import { deflateSync } from 'node:zlib';
function png(w, h, px) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// an agarose gel: dark lanes with bright bands, some noise so it is a realistic size
const lanes = [[60, 120, 200, 260, 300], [90, 160, 240], [60, 120, 200, 260, 300], [140, 220]];
const gel = png(640, 420, (x, y) => {
  const lane = Math.floor((x - 40) / 150), inLane = x > 40 && (x - 40) % 150 < 110 && lane < 4;
  let v = 25 + rnd() * 18;
  if (y < 30 && inLane) v = 90;
  if (inLane) for (const b of lanes[lane]) { const d = Math.abs(y - (b + 40)); if (d < 7) v = Math.max(v, 235 - d * 18 + rnd() * 10); }
  return [v * 0.55, v, v * 0.6];
});
const plasmid = png(560, 420, (x, y) => {
  const d = Math.hypot(x - 280, y - 210);
  const ring = Math.abs(d - 150) < 14, ang = Math.atan2(y - 210, x - 280);
  const ori = ring && ang > 0.2 && ang < 0.9, amp = ring && ang < -1.2 && ang > -2.4;
  const n = rnd() * 14;
  return ori ? [230, 140 + n, 40] : amp ? [60 + n, 120, 220] : ring ? [90 + n, 90 + n, 100 + n] : [250 - n * 0.3, 250 - n * 0.3, 248];
});
const logo = png(220, 90, (x, y) => (x < 70 ? [0, 62 + (y % 9), 116] : [250 - (x % 13), 250 - (y % 11), 250 - ((x * y) % 7)]));
const icon = png(24, 24, () => [200, 50, 50]);
const pslides = [
  { title: 'Lecture 5: Agarose gel electrophoresis', body: ['Intended learning outcomes', 'Explain how agarose gel electrophoresis separates DNA fragments by size', 'Interpret a gel using a DNA ladder'], pics: ['logo'] },
  { title: 'Running a gel', body: ['DNA is negatively charged because of its phosphate backbone, so it migrates towards the positive anode.', 'Smaller fragments move faster through the agarose matrix, so they travel further.'], pics: ['gel', 'logo', 'icon'] },
  { title: 'Reading a plasmid map', body: ['A plasmid map shows the origin of replication and the selectable marker such as the ampicillin resistance gene.', 'Supercoiled plasmid DNA runs faster than linear DNA of the same length.'], pics: ['plasmid', 'logo'] },
  { title: 'Summary', body: ['Fragment size is estimated by comparing band positions to a DNA ladder of known sizes.'], pics: ['logo'] },
];
const media = { gel, plasmid, logo, icon };
const z2 = new JSZip();
const pr = [], si = [];
for (const [name, buf] of Object.entries(media)) z2.file(`ppt/media/${name}.png`, buf);
pslides.forEach((s, i) => {
  const n = i + 1;
  z2.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${para(s.title)}</p:txBody></p:sp><p:sp><p:txBody>${s.body.map(para).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  const rels = s.pics.map((p, k) => `<Relationship Id="rId${k + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${p}.png"/>`);
  z2.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  pr.push(`<Relationship Id="rId${n + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`);
  si.push(`<p:sldId id="${255 + n}" r:id="rId${n + 10}"/>`);
});
z2.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${si.join('')}</p:sldIdLst></p:presentation>`);
z2.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pr.join('')}</Relationships>`);
z2.file('[Content_Types].xml', ct[0] + '<Default Extension="png" ContentType="image/png"/></Types>');
writeFileSync(new URL('AMB_L5_Gels.pptx', out), await z2.generateAsync({ type: 'nodebuffer' }));
console.log('sizes', Object.fromEntries(Object.entries(media).map(([k, v]) => [k, v.length])));
