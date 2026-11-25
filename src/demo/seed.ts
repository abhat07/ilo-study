/**
 * Builds the demo module on the device: makes a real PDF, transcript and two PowerPoints (with drawn slide
 * pictures) and puts them through the normal upload pipeline, so the demo exercises the same code as real use.
 */
import JSZip from 'jszip';
import { db, ensureModules } from '../db';
import { ingestFiles, mapModule, saveConfirmedIlos } from '../ingest/pipeline';
import { buildLectures } from '../learn/lectures';
import { CLONING_SLIDES, DEMO_ILOS, DEMO_LECTURE_TITLES, DEMO_MODULE, GEL_SLIDES, PCR_PAGES, PCR_VTT, type DemoSlide } from './content';

// ---------------- PDF (Helvetica text, like a simple exported slide deck) ----------------

function pdfBytes(pages: string[][]): Uint8Array {
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>'];
  objs.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  const fontId = 3 + pages.length * 2;
  pages.forEach((lines, i) => {
    const [title, ...rest] = lines;
    const content = `BT /F1 22 Tf 50 730 Td (${title.replace(/[()\\]/g, '')}) Tj ET BT /F1 13 Tf 50 690 Td 24 TL ` +
      rest.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ') + ' ET';
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let s = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(s.length);
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
}

// ---------------- slide pictures (drawn, like a figure pasted into a slide) ----------------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  return [c, g];
}
const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));

function drawGel(ladderLabels: boolean): HTMLCanvasElement {
  const [c, g] = canvas(900, 560);
  g.fillStyle = '#10161a';
  g.fillRect(110, 40, 740, 470);
  // faint background texture
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(80,200,120,${Math.random() * 0.05})`;
    g.fillRect(110 + Math.random() * 740, 40 + Math.random() * 470, 3, 3);
  }
  const ladder = [3000, 2000, 1500, 1000, 700, 500, 300, 100];
  const y = (bp: number) => 70 + (Math.log(3500) - Math.log(bp)) / (Math.log(3500) - Math.log(80)) * 420;
  const lanes: number[][] = [ladder, [2700], [1500, 500], [1000, 700, 300], [2000, 1400, 2700]];
  lanes.forEach((bands, li) => {
    const x = 140 + li * 140;
    g.fillStyle = '#2b3a40';
    g.fillRect(x, 52, 100, 12); // well
    for (const bp of bands) {
      const yy = y(bp);
      const grd = g.createLinearGradient(0, yy - 6, 0, yy + 6);
      grd.addColorStop(0, 'rgba(120,255,160,0)');
      grd.addColorStop(0.5, li === 0 ? 'rgba(170,255,200,0.95)' : 'rgba(140,255,180,0.9)');
      grd.addColorStop(1, 'rgba(120,255,160,0)');
      g.fillStyle = grd;
      g.fillRect(x + 4, yy - 6, 92, 12);
    }
  });
  g.fillStyle = '#111';
  g.font = 'bold 22px Arial';
  ['Ladder', 'Uncut', 'EcoRI', 'BamHI', 'Mix'].forEach((t, i) => g.fillText(t, 150 + i * 140, 32));
  if (ladderLabels) {
    g.font = '18px Arial';
    for (const bp of ladder) g.fillText(`${bp} bp`, 18, y(bp) + 6);
  }
  g.font = 'bold 30px Arial';
  g.fillStyle = '#c0392b';
  g.fillText('-', 870, 70);
  g.fillText('+', 866, 505);
  g.strokeStyle = '#c0392b';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(875, 110);
  g.lineTo(875, 460);
  g.lineTo(867, 445);
  g.moveTo(875, 460);
  g.lineTo(883, 445);
  g.stroke();
  g.font = '16px Arial';
  g.fillStyle = '#333';
  g.fillText('1% agarose, stained; DNA migrates towards the anode (+)', 140, 540);
  return c;
}

function drawPlasmid(): HTMLCanvasElement {
  const [c, g] = canvas(800, 600);
  const cx = 400, cy = 300, R = 190;
  g.lineWidth = 16;
  g.strokeStyle = '#9aa3ad';
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  const arc = (a0: number, a1: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 22;
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    g.stroke();
    const ax = cx + R * Math.cos(a1), ay = cy + R * Math.sin(a1);
    g.fillStyle = col;
    g.beginPath();
    g.arc(ax, ay, 16, 0, Math.PI * 2);
    g.fill();
  };
  arc(0.3, 1.6, '#2f6fd6'); // AmpR
  arc(2.4, 3.2, '#e08a1e'); // ori
  arc(4.3, 5.2, '#2ca46a'); // lacZ alpha / MCS region
  g.font = 'bold 26px Arial';
  g.fillStyle = '#2f6fd6';
  g.fillText('ampR', cx + 150, cy + 170);
  g.fillStyle = '#e08a1e';
  g.fillText('ori', cx - 260, cy + 40);
  g.fillStyle = '#2ca46a';
  g.fillText('lacZα', cx - 20, cy - 220);
  g.fillStyle = '#222';
  g.font = '18px Arial';
  const sites = [['EcoRI', 4.55], ['BamHI', 4.75], ['HindIII', 4.95]] as const;
  for (const [name, a] of sites) {
    const x1 = cx + (R - 18) * Math.cos(a), y1 = cy + (R - 18) * Math.sin(a);
    const x2 = cx + (R + 60) * Math.cos(a), y2 = cy + (R + 60) * Math.sin(a);
    g.strokeStyle = '#222';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.fillText(name, x2 + (Math.cos(a) > 0 ? 4 : -70), y2 - 4);
  }
  g.font = 'bold 30px Arial';
  g.fillText('pDEMO', cx - 52, cy - 6);
  g.font = '20px Arial';
  g.fillText('2.7 kb', cx - 30, cy + 26);
  g.fillStyle = '#555';
  g.font = '16px Arial';
  g.fillText('MCS (multiple cloning site) inside lacZα', 30, 580);
  return c;
}

function drawEcoRI(): HTMLCanvasElement {
  const [c, g] = canvas(900, 460);
  g.font = 'bold 40px "Courier New", monospace';
  const top = "5'-  G  A  A  T  T  C  -3'", bot = "3'-  C  T  T  A  A  G  -5'";
  g.fillStyle = '#1d3557';
  g.fillText(top, 120, 110);
  g.fillText(bot, 120, 190);
  g.strokeStyle = '#d62828';
  g.lineWidth = 5;
  g.beginPath(); // staggered cut: after G on top, before G on bottom
  g.moveTo(285, 60);
  g.lineTo(285, 130);
  g.lineTo(555, 130);
  g.lineTo(555, 205);
  g.stroke();
  g.font = '22px Arial';
  g.fillStyle = '#d62828';
  g.fillText('EcoRI cuts here', 330, 40);
  // products
  g.fillStyle = '#1d3557';
  g.font = 'bold 34px "Courier New", monospace';
  g.fillText("5'- G", 100, 330);
  g.fillText("3'- C T T A A", 100, 380);
  g.fillText('A A T T C -3\'', 520, 330);
  g.fillText('      G -5\'', 520, 380);
  g.fillStyle = '#2a9d8f';
  g.font = '20px Arial';
  g.fillText("5' overhang (sticky end): AATT", 100, 430);
  g.fillText('compatible sticky end', 560, 430);
  return c;
}

async function pptx(slides: DemoSlide[]): Promise<Blob> {
  const zip = new JSZip();
  const para = (t: string) => `<a:p><a:r><a:t>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a:t></a:r></a:p>`;
  const ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const pr: string[] = [], ids: string[] = [];
  for (const [i, s] of slides.entries()) {
    const n = i + 1;
    zip.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0"?><p:sld ${ns}><p:cSld><p:spTree><p:sp><p:txBody>${para(s.title)}</p:txBody></p:sp><p:sp><p:txBody>${s.body.map(para).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
    const rels: string[] = [];
    if (s.notes) {
      zip.file(`ppt/notesSlides/notesSlide${n}.xml`, `<?xml version="1.0"?><p:notes ${ns}><p:cSld><p:spTree><p:sp><p:txBody>${para(s.notes)}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
      rels.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`);
    }
    if (s.pic) {
      const pic = s.pic === 'ecori' ? drawEcoRI() : s.pic === 'plasmid' ? drawPlasmid() : drawGel(s.pic === 'ladder');
      zip.file(`ppt/media/image${n}.jpg`, await toJpeg(pic));
      rels.push(`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.jpg"/>`);
    }
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    pr.push(`<Relationship Id="rId${n + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`);
    ids.push(`<p:sldId id="${255 + n}" r:id="rId${n + 10}"/>`);
  }
  zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${ids.join('')}</p:sldIdLst></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pr.join('')}</Relationships>`);
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="jpg" ContentType="image/jpeg"/></Types>');
  return zip.generateAsync({ type: 'blob' });
}

/** The sample files, as if picked in the upload screen. */
export async function demoFiles(): Promise<File[]> {
  return [
    new File([pdfBytes(PCR_PAGES) as BlobPart], 'Demo_L1_PCR.pdf', { type: 'application/pdf' }),
    new File([PCR_VTT], 'Demo_L1_PCR_transcript.vtt', { type: 'text/vtt' }),
    new File([await pptx(CLONING_SLIDES)], 'Demo_L2_Restriction_cloning.pptx'),
    new File([await pptx(GEL_SLIDES)], 'Demo_L3_Gel_electrophoresis.pptx'),
  ];
}

let seeding: Promise<void> | null = null;

/** First time in demo mode: upload the sample lectures, confirm their ILOs, match slides, build lectures. */
export function seedDemoIfEmpty(progress: (m: string) => void): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      await ensureModules();
      const d = await db();
      if ((await d.getAll('files')).length) return;
      progress('Making sample lectures');
      await ingestFiles(DEMO_MODULE.id, await demoFiles(), progress);
      progress('Confirming learning outcomes');
      await saveConfirmedIlos(DEMO_MODULE.id, DEMO_ILOS);
      progress('Matching slides to outcomes');
      await mapModule(DEMO_MODULE.id, progress);
      await buildLectures(DEMO_MODULE.id);
      for (const l of await d.getAllFromIndex('lectures', 'byModule', DEMO_MODULE.id)) {
        const title = DEMO_LECTURE_TITLES[l.number - 1];
        if (title) await d.put('lectures', { ...l, title, updatedAt: Date.now() });
      }
    })();
  }
  return seeding;
}
