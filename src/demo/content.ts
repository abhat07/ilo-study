/**
 * Sample material for demo mode: three short lectures written for the demo (not course material).
 * Plain ASCII so the hand-built PDF and the verbatim quote checks behave exactly as with real files.
 */
import type { Visual } from '../types';

export const DEMO_LECTURE_TITLES = ['PCR', 'Restriction cloning', 'Agarose gel electrophoresis'];

export const DEMO_MODULE = { id: 'DEMO', short: 'DEMO', name: 'Demo: Molecular biology techniques' };

export const DEMO_ILOS: { text: string; lecture: string }[] = [
  { text: 'Describe the three steps of a PCR cycle and their temperatures', lecture: 'Lecture 1' },
  { text: 'Explain why a thermostable DNA polymerase is used in PCR and compare Taq with a proofreading polymerase', lecture: 'Lecture 1' },
  { text: 'Explain why PCR amplification is exponential and why it reaches a plateau', lecture: 'Lecture 1' },
  { text: 'Describe how type II restriction enzymes recognise and cut DNA', lecture: 'Lecture 2' },
  { text: 'Explain how sticky ends and DNA ligase join an insert into a plasmid vector', lecture: 'Lecture 2' },
  { text: 'Explain how agarose gel electrophoresis separates DNA fragments by size', lecture: 'Lecture 3' },
  { text: 'Interpret an agarose gel using a DNA ladder', lecture: 'Lecture 3' },
];

/** Lecture 1 as PDF pages (one sentence per line). */
export const PCR_PAGES: string[][] = [
  ['Lecture 1: The polymerase chain reaction', 'Learning outcomes',
    '1. Describe the three steps of a PCR cycle and their temperatures',
    '2. Explain why a thermostable DNA polymerase is used in PCR',
    '3. Explain why PCR amplification is exponential and why it reaches a plateau'],
  ['The PCR cycle',
    'Each PCR cycle has three steps: denaturation, annealing and extension.',
    'Denaturation at 95 C breaks the hydrogen bonds so the two template strands separate.',
    'Annealing at 50 to 65 C lets the forward and reverse primers bind to complementary sequences.',
    'Extension at 72 C lets the polymerase add nucleotides to the 3 prime end of each primer.',
    'The annealing temperature is set a few degrees below the melting temperature of the primers.'],
  ['Choosing the polymerase',
    'Taq polymerase comes from the thermophilic bacterium Thermus aquaticus and survives repeated heating to 95 C.',
    'Because the enzyme is thermostable, fresh polymerase does not need to be added after every cycle.',
    'Taq lacks 3 prime to 5 prime exonuclease proofreading activity, so it has a relatively high error rate.',
    'Proofreading polymerases such as Pfu remove mismatched nucleotides and copy DNA with far fewer errors.'],
  ['Exponential amplification',
    'In theory the number of copies of the target sequence doubles in every cycle.',
    'After n cycles a single template molecule can give 2 to the power n copies.',
    'In later cycles the reaction reaches a plateau because primers and dNTPs run out and the polymerase loses activity.'],
];

export const PCR_VTT = `WEBVTT

00:00:04.000 --> 00:00:18.000
PCR amplifies one chosen stretch of DNA, and each PCR cycle has three steps run at three different temperatures.

00:00:18.000 --> 00:00:36.000
The thing to remember about denaturation is that heating to about 95 degrees breaks the hydrogen bonds between the bases, so the two strands come apart.

00:00:36.000 --> 00:00:58.000
If the annealing temperature is too low the primers bind non-specifically and you see extra bands on your gel, and if it is too high they do not bind at all.

00:00:58.000 --> 00:01:20.000
The primers define the ends of the product, so the amplified fragment always runs from the forward primer to the reverse primer.
`;

export interface DemoSlide {
  title: string;
  body: string[];
  notes?: string;
  pic?: 'ecori' | 'plasmid' | 'gel' | 'ladder';
}

export const CLONING_SLIDES: DemoSlide[] = [
  { title: 'Lecture 2: Restriction cloning', body: ['Intended learning outcomes', 'Describe how type II restriction enzymes recognise and cut DNA', 'Explain how sticky ends and DNA ligase join an insert into a plasmid vector'] },
  {
    title: 'Restriction enzymes',
    body: ['Type II restriction enzymes recognise short palindromic sequences that are usually 4 to 8 base pairs long.',
      'EcoRI recognises GAATTC and cuts between the G and the A on both strands.',
      'The staggered cut leaves single-stranded 5 prime overhangs called sticky ends.'],
    notes: 'The EcoRI site reads GAATTC on both strands when each strand is read 5 prime to 3 prime.',
    pic: 'ecori',
  },
  {
    title: 'Plasmid vectors',
    body: ['A cloning vector has an origin of replication so it is copied inside the host bacterium.',
      'A selectable marker such as the ampicillin resistance gene lets only transformed cells grow on ampicillin plates.',
      'The multiple cloning site contains several unique restriction sites where the insert can be ligated.'],
    pic: 'plasmid',
  },
  {
    title: 'Ligation',
    body: ['Cutting the vector and the insert with the same enzyme gives compatible sticky ends.',
      'Compatible sticky ends anneal to each other by complementary base pairing.',
      'DNA ligase then seals the sugar-phosphate backbone by forming phosphodiester bonds.',
      'Treating the vector with phosphatase removes its 5 prime phosphates so the empty vector cannot re-ligate to itself.'],
  },
];

export const GEL_SLIDES: DemoSlide[] = [
  { title: 'Lecture 3: Agarose gel electrophoresis', body: ['Intended learning outcomes', 'Explain how agarose gel electrophoresis separates DNA fragments by size', 'Interpret an agarose gel using a DNA ladder'] },
  {
    title: 'Running a gel',
    body: ['DNA is negatively charged because of its phosphate backbone, so it migrates towards the positive anode.',
      'The agarose forms a porous mesh, so smaller fragments move through it faster and travel further.',
      'A higher percentage agarose gel has smaller pores and separates small fragments more clearly.'],
    pic: 'gel',
  },
  {
    title: 'Reading a gel',
    body: ['To interpret an agarose gel, a DNA ladder of fragments with known sizes is run in a lane beside the samples.',
      'The size of an unknown fragment is estimated by comparing its band with the bands of the ladder.',
      'Supercoiled plasmid DNA usually runs faster than linear DNA of the same length because it is more compact.'],
    notes: 'Fragment sizes are estimated by reading across from each sample band to the nearest ladder bands.',
    pic: 'ladder',
  },
];

/** Hand-written diagrams for the demo lessons, keyed by ILO number (DEMO-01 …). */
export const DEMO_VISUALS: Record<string, Visual> = {
  'DEMO-01': { kind: 'cycle', title: 'One PCR cycle', columns: [], items: [
    { label: 'Denaturation', detail: '95 C: strands separate' },
    { label: 'Annealing', detail: '50-65 C: primers bind' },
    { label: 'Extension', detail: '72 C: polymerase extends primers' },
  ] },
  'DEMO-02': { kind: 'compare', title: 'Taq vs a proofreading polymerase', columns: ['Taq', 'Pfu'], items: [
    { label: 'Survives 95 C', detail: 'Yes | Yes' },
    { label: "3'-5' proofreading", detail: 'No | Yes' },
    { label: 'Error rate', detail: 'Higher | Much lower' },
  ] },
  'DEMO-03': { kind: 'process', title: 'Copies of the target', columns: [], items: [
    { label: 'Start', detail: '1 template' },
    { label: 'Cycle 1', detail: '2 copies' },
    { label: 'Cycle 2', detail: '4 copies' },
    { label: 'Cycle n', detail: '2^n copies' },
    { label: 'Plateau', detail: 'primers and dNTPs run out' },
  ] },
  'DEMO-04': { kind: 'parts', title: 'EcoRI', columns: [], items: [
    { label: 'Site', detail: 'GAATTC' },
    { label: 'Palindrome', detail: 'same 5-3 on both strands' },
    { label: 'Cut', detail: 'between G and A' },
    { label: 'Product', detail: "5' sticky ends" },
  ] },
  'DEMO-05': { kind: 'process', title: 'Cloning an insert', columns: [], items: [
    { label: 'Cut', detail: 'vector and insert, same enzyme' },
    { label: 'Dephosphorylate', detail: 'vector only' },
    { label: 'Anneal', detail: 'sticky ends pair' },
    { label: 'Ligate', detail: 'phosphodiester bonds' },
    { label: 'Select', detail: 'ampicillin plates' },
  ] },
  'DEMO-06': { kind: 'process', title: 'Running a gel', columns: [], items: [
    { label: 'Load', detail: 'samples + ladder in wells' },
    { label: 'Apply current', detail: 'DNA moves to the + anode' },
    { label: 'Separate', detail: 'small fragments travel further' },
    { label: 'Stain & image', detail: 'bands under UV/blue light' },
  ] },
  'DEMO-07': { kind: 'compare', title: 'What a band tells you', columns: ['Ladder lane', 'Sample lane'], items: [
    { label: 'Band position', detail: 'known size | estimate by comparison' },
    { label: 'Runs further', detail: 'smaller fragment | smaller fragment' },
    { label: 'Fast extra band', detail: '- | may be supercoiled plasmid' },
  ] },
};

/** Step names for the demo lessons (a real model writes these itself), keyed by a sentence's first four words. */
export const DEMO_LABELS: Record<string, string> = {
  'each pcr cycle has': 'The PCR cycle',
  'denaturation at 95 c': 'Denaturation',
  'annealing at 50 to': 'Annealing',
  'extension at 72 c': 'Extension',
  'the annealing temperature is': 'Setting the annealing temperature',
  'taq polymerase comes from': 'Where Taq comes from',
  'because the enzyme is': 'Why thermostability matters',
  'taq lacks 3 prime': "Taq's error rate",
  'proofreading polymerases such as': 'Proofreading polymerases',
  'in theory the number': 'Doubling every cycle',
  'after n cycles a': '2^n copies',
  'in later cycles the': 'The plateau',
  'pcr amplifies one chosen': 'What PCR does',
  'the thing to remember': 'Why the strands separate',
  'if the annealing temperature': 'Annealing too cold or too hot',
  'the primers define the': 'Primers define the product',
  'type ii restriction enzymes': 'Recognition sites',
  'ecori recognises gaattc and': 'The EcoRI cut',
  'the staggered cut leaves': 'Sticky ends',
  'the ecori site reads': 'A palindrome',
  'a cloning vector has': 'Origin of replication',
  'a selectable marker such': 'Selectable marker',
  'the multiple cloning site': 'Multiple cloning site',
  'cutting the vector and': 'Matching ends',
  'compatible sticky ends anneal': 'Ends pair up',
  'dna ligase then seals': 'Ligase seals the backbone',
  'treating the vector with': 'Stopping self-ligation',
  'dna is negatively charged': 'DNA moves to the anode',
  'the agarose forms a': 'Separation by size',
  'a higher percentage agarose': 'Gel percentage',
  'to interpret an agarose': 'The DNA ladder',
  'the size of an': 'Estimating fragment size',
  'supercoiled plasmid dna usually': 'Supercoiled plasmid',
  'fragment sizes are estimated': 'Reading across',
};
