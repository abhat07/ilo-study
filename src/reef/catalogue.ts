/**
 * Everything that can live in your reef. Real species, each with one true fact.
 *
 * How you get them:
 *  - coral: each module grows its own coral species from the XP you earn on it
 *  - school: every lecture you finish adds 3 fish to that module's school
 *  - lecture: every 3rd lecture of a module also brings a special creature
 *  - pick: every level-up lets you choose one of 3 creatures
 *  - streak: reaching a streak length brings a big visitor
 */

export type Zone = 'swim' | 'drift' | 'sand' | 'plant' | 'big' | 'far';
export type Source = 'pick' | 'lecture' | 'school' | 'streak';

export type Pattern =
  | { t: 'band'; x: number; w: number; c: string } // vertical band; x from -0.5 (tail) to 0.5 (nose)
  | { t: 'stripe'; y: number; w: number; c: string } // horizontal stripe; y from -0.5 (top) to 0.5
  | { t: 'front'; x: number; c: string } // colour from x to the nose
  | { t: 'back'; x: number; c: string } // colour from x to the tail
  | { t: 'top'; y: number; c: string } // colour above y
  | { t: 'spots'; c: string; n: number; r: number }
  | { t: 'eyespot'; x: number; y: number; r: number; c: string }
  | { t: 'squiggle'; c: string };

export interface FishSpec {
  kind: 'fish';
  L: number;
  h: number;
  body: string;
  fin?: string;
  tail?: 'fork' | 'round' | 'lunate' | 'long' | 'fan';
  tailC?: string;
  dorsal?: 'none' | 'tall' | 'spines' | 'streamer' | 'sail' | 'low';
  pat?: Pattern[];
  nose?: 'long' | 'beak';
  shape?: 'normal' | 'round' | 'box' | 'disc' | 'long';
  spikes?: boolean;
  fans?: boolean;
  horns?: boolean;
}

export type DrawSpec =
  | FishSpec
  | { kind: 'jelly'; c: string; glow?: boolean; comb?: boolean }
  | { kind: 'star'; c: string; c2?: string; arms?: number; thin?: boolean }
  | { kind: 'urchin'; c: string; long?: boolean }
  | { kind: 'crab'; c: string; shell?: string; deco?: boolean }
  | { kind: 'lobster'; c: string; c2: string }
  | { kind: 'shrimp'; c: string; c2: string; mantis?: boolean; claw?: boolean }
  | { kind: 'nudi'; c: string; c2: string; c3: string }
  | { kind: 'cucumber'; c: string }
  | { kind: 'featherstar'; c: string }
  | { kind: 'xmasworm'; c: string }
  | { kind: 'duster'; c: string; c2: string }
  | { kind: 'seafan'; c: string }
  | { kind: 'sponge'; c: string; tube?: boolean }
  | { kind: 'seagrass'; c: string }
  | { kind: 'gardeneels'; c: string; c2: string }
  | { kind: 'octopus'; c: string; rings?: boolean }
  | { kind: 'cowrie'; c: string; c2: string }
  | { kind: 'anemone'; c: string; tip: string; clowns?: boolean }
  | { kind: 'clam'; c: string; c2: string }
  | { kind: 'seahorse'; c: string }
  | { kind: 'cuttle'; c: string; c2: string }
  | { kind: 'moray'; c: string; c2: string }
  | { kind: 'shark'; c: string; tip: string; whale?: boolean }
  | { kind: 'ray'; c: string; belly: string; manta?: boolean; spots?: string }
  | { kind: 'turtle'; c: string; shell: string }
  | { kind: 'whale'; c: string }
  | { kind: 'mushroom'; c: string };

export interface Organism {
  id: string;
  name: string;
  latin: string;
  fact: string;
  zone: Zone;
  source: Source;
  draw: DrawSpec;
  /** drawn size multiplier */
  size?: number;
  /** streak creatures: the streak length that brings them */
  streakAt?: number;
}

const fish = (s: Omit<FishSpec, 'kind'>): FishSpec => ({ kind: 'fish', ...s });

// ---------------------------------------------------------------- schools (one per module, in module order)
export const SCHOOLS: Organism[] = [
  {
    id: 'chromis', name: 'Blue-green chromis', latin: 'Chromis viridis', zone: 'swim', source: 'school',
    fact: 'Shoals hover above branching coral and dive into it together when a predator comes near.',
    draw: fish({ L: 16, h: 8, body: '#5fd4c4', fin: '#8be9db', tail: 'fork', dorsal: 'low', pat: [{ t: 'top', y: -0.1, c: '#38b6c9' }] }),
  },
  {
    id: 'anthias', name: 'Sea goldie', latin: 'Pseudanthias squamipinnis', zone: 'swim', source: 'school',
    fact: 'Groups are mostly females with one male; if he dies, the top female changes sex and takes his place.',
    draw: fish({ L: 17, h: 8, body: '#ff9a3c', fin: '#ffc06b', tail: 'lunate', dorsal: 'low', pat: [{ t: 'stripe', y: 0.05, w: 0.12, c: '#ffd07a' }] }),
  },
  {
    id: 'fusilier', name: 'Yellowtail fusilier', latin: 'Caesio cuning', zone: 'swim', source: 'school',
    fact: 'Fusiliers feed on plankton in open water by day and shelter in the reef at night.',
    draw: fish({ L: 18, h: 7.5, body: '#5b8def', fin: '#9fbaf5', tail: 'fork', tailC: '#ffd23f', dorsal: 'low', pat: [{ t: 'back', x: -0.2, c: '#ffd23f' }] }),
  },
  {
    id: 'silverside', name: 'Hardyhead silverside', latin: 'Atherinomorus lacunosus', zone: 'swim', source: 'school',
    fact: 'A silver stripe along the side reflects light, which helps a whole shoal flash and confuse predators.',
    draw: fish({ L: 17, h: 5.5, body: '#c9d6df', fin: '#e6eef3', tail: 'fork', shape: 'long', dorsal: 'low', pat: [{ t: 'stripe', y: 0, w: 0.16, c: '#ffffff' }] }),
  },
];

// ---------------------------------------------------------------- lecture specials (every 3rd lecture of a module)
export const LECTURE_SPECIALS: Organism[] = [
  {
    id: 'clown-anemone', name: 'Clownfish in a magnificent anemone', latin: 'Amphiprion ocellaris · Heteractis magnifica', zone: 'plant', source: 'lecture', size: 1.3,
    fact: 'A mucus coat stops the anemone from firing its stinging cells at the clownfish.',
    draw: { kind: 'anemone', c: '#f2a3c4', tip: '#ffe0ef', clowns: true },
  },
  {
    id: 'octopus', name: 'Day octopus', latin: 'Octopus cyanea', zone: 'sand', source: 'lecture', size: 1.2,
    fact: 'Octopuses have three hearts and blue, copper-based blood (haemocyanin).',
    draw: { kind: 'octopus', c: '#c8664a' },
  },
  {
    id: 'moray', name: 'Giant moray', latin: 'Gymnothorax javanicus', zone: 'sand', source: 'lecture', size: 1.2,
    fact: 'Morays have a second set of jaws in the throat that shoot forward to pull prey in.',
    draw: { kind: 'moray', c: '#8a8a3c', c2: '#3d3d1c' },
  },
  {
    id: 'giant-clam', name: 'Giant clam', latin: 'Tridacna gigas', zone: 'sand', source: 'lecture', size: 1.2,
    fact: 'Its coloured mantle farms photosynthetic algae, just like coral does.',
    draw: { kind: 'clam', c: '#4fb3d9', c2: '#2b6f99' },
  },
  {
    id: 'seahorse', name: 'Thorny seahorse', latin: 'Hippocampus histrix', zone: 'plant', source: 'lecture',
    fact: 'The male carries the eggs in a brood pouch and gives birth.',
    draw: { kind: 'seahorse', c: '#f2c14e' },
  },
  {
    id: 'cuttlefish', name: 'Broadclub cuttlefish', latin: 'Sepia latimanus', zone: 'swim', source: 'lecture', size: 1.2,
    fact: 'Chromatophores under nervous control let it ripple colour bands across its skin in a fraction of a second.',
    draw: { kind: 'cuttle', c: '#b89a7a', c2: '#e6d3bd' },
  },
  {
    id: 'blacktip', name: 'Blacktip reef shark', latin: 'Carcharhinus melanopterus', zone: 'swim', source: 'lecture', size: 1.6,
    fact: 'Sharks sense the weak electric fields of prey with jelly-filled pores called ampullae of Lorenzini.',
    draw: { kind: 'shark', c: '#9fb3bf', tip: '#1c2730' },
  },
  {
    id: 'napoleon', name: 'Humphead wrasse', latin: 'Cheilinus undulatus', zone: 'swim', source: 'lecture', size: 1.6,
    fact: 'One of the few predators that eats crown-of-thorns starfish, which feed on coral.',
    draw: fish({ L: 30, h: 15, body: '#3fa58f', fin: '#5cc7ae', tail: 'round', dorsal: 'low', pat: [{ t: 'squiggle', c: '#2a7a68' }] }),
  },
  {
    id: 'eagle-ray', name: 'Spotted eagle ray', latin: 'Aetobatus narinari', zone: 'big', source: 'lecture', size: 1.3,
    fact: 'It digs clams out of the sand with its snout and crushes them with plate-like teeth.',
    draw: { kind: 'ray', c: '#2f3e55', belly: '#e8eef3', spots: '#ffffff' },
  },
  {
    id: 'mantis', name: 'Peacock mantis shrimp', latin: 'Odontodactylus scyllarus', zone: 'sand', source: 'lecture',
    fact: 'Its club strikes at about 23 m/s, fast enough to crack snail shells, and its eyes have 12 or more types of colour receptor.',
    draw: { kind: 'shrimp', c: '#3fbf6a', c2: '#ff5a5a', mantis: true },
  },
];

// ---------------------------------------------------------------- streak visitors
export const STREAK_VISITORS: Organism[] = [
  {
    id: 'cleaner-shrimp', name: 'Pacific cleaner shrimp', latin: 'Lysmata amboinensis', zone: 'sand', source: 'streak', streakAt: 3,
    fact: 'Fish queue at "cleaning stations" so these shrimp can pick parasites off them, even inside their mouths.',
    draw: { kind: 'shrimp', c: '#ffdf6b', c2: '#e83b3b' },
  },
  {
    id: 'green-turtle', name: 'Green sea turtle', latin: 'Chelonia mydas', zone: 'big', source: 'streak', streakAt: 7, size: 1.5,
    fact: 'Hatchlings return decades later to nest on the beach where they hatched, navigating partly by the Earth\'s magnetic field.',
    draw: { kind: 'turtle', c: '#9bbf6a', shell: '#6b8a3a' },
  },
  {
    id: 'manta', name: 'Reef manta ray', latin: 'Mobula alfredi', zone: 'big', source: 'streak', streakAt: 14, size: 2,
    fact: 'Mantas have one of the largest brain-to-body ratios of any fish.',
    draw: { kind: 'ray', c: '#22303f', belly: '#f2f5f7', manta: true },
  },
  {
    id: 'whale-shark', name: 'Whale shark', latin: 'Rhincodon typus', zone: 'big', source: 'streak', streakAt: 30, size: 2.6,
    fact: 'The largest living fish, it eats plankton by filtering water through its gills.',
    draw: { kind: 'shark', c: '#3b5a73', tip: '#3b5a73', whale: true },
  },
  {
    id: 'humpback', name: 'Humpback whale', latin: 'Megaptera novaeangliae', zone: 'far', source: 'streak', streakAt: 60, size: 3,
    fact: 'Males sing long, structured songs that change over a season and spread between populations.',
    draw: { kind: 'whale', c: '#1f3b52' },
  },
  {
    id: 'coelacanth', name: 'Coelacanth', latin: 'Latimeria chalumnae', zone: 'swim', source: 'streak', streakAt: 100, size: 1.8,
    fact: 'Thought extinct for 66 million years until one was caught off South Africa in 1938.',
    draw: fish({ L: 34, h: 13, body: '#2f4f7a', fin: '#4a6d9c', tail: 'fan', dorsal: 'low', pat: [{ t: 'spots', c: '#e9f1ff', n: 14, r: 1.3 }] }),
  },
];

// ---------------------------------------------------------------- level-up picks
export const PICKS: Organism[] = [
  { id: 'blue-tang', name: 'Blue tang', latin: 'Paracanthurus hepatus', zone: 'swim', source: 'pick',
    fact: 'A scalpel-sharp spine on each side of the tail base gives surgeonfish their name.',
    draw: fish({ L: 24, h: 13, body: '#2563eb', fin: '#1e3a8a', tail: 'lunate', tailC: '#facc15', dorsal: 'low', pat: [{ t: 'stripe', y: -0.12, w: 0.18, c: '#0f1d4a' }] }) },
  { id: 'yellow-tang', name: 'Yellow tang', latin: 'Zebrasoma flavescens', zone: 'swim', source: 'pick',
    fact: 'It grazes algae off coral all day, which helps keep the coral from being smothered.',
    draw: fish({ L: 22, h: 16, body: '#facc15', fin: '#fde047', tail: 'lunate', dorsal: 'tall', nose: 'beak', shape: 'disc' }) },
  { id: 'moorish-idol', name: 'Moorish idol', latin: 'Zanclus cornutus', zone: 'swim', source: 'pick',
    fact: 'The only living species in its family, Zanclidae.',
    draw: fish({ L: 20, h: 16, body: '#f8f4e3', fin: '#f8f4e3', tail: 'lunate', tailC: '#1c1c1c', dorsal: 'streamer', nose: 'beak', shape: 'disc',
      pat: [{ t: 'band', x: 0.08, w: 0.24, c: '#1c1c1c' }, { t: 'band', x: -0.3, w: 0.18, c: '#1c1c1c' }, { t: 'back', x: -0.12, c: '#f5c518' }, { t: 'band', x: -0.3, w: 0.18, c: '#1c1c1c' }] }) },
  { id: 'copperband', name: 'Copperband butterflyfish', latin: 'Chelmon rostratus', zone: 'swim', source: 'pick',
    fact: 'The false eyespot near its tail makes predators strike the wrong end.',
    draw: fish({ L: 20, h: 15, body: '#fdf6e3', fin: '#f2b134', tail: 'round', dorsal: 'tall', nose: 'long', shape: 'disc',
      pat: [{ t: 'band', x: 0.22, w: 0.12, c: '#f08a24' }, { t: 'band', x: 0.0, w: 0.14, c: '#f08a24' }, { t: 'band', x: -0.22, w: 0.13, c: '#f08a24' }, { t: 'eyespot', x: -0.32, y: -0.32, r: 0.09, c: '#111' }] }) },
  { id: 'emperor-angel', name: 'Emperor angelfish', latin: 'Pomacanthus imperator', zone: 'swim', source: 'pick',
    fact: 'Juveniles look completely different (dark blue with white rings) and change pattern as they mature.',
    draw: fish({ L: 24, h: 17, body: '#1d4ed8', fin: '#f2c230', tail: 'round', tailC: '#f2c230', dorsal: 'low', shape: 'disc',
      pat: [{ t: 'stripe', y: -0.3, w: 0.06, c: '#fde68a' }, { t: 'stripe', y: -0.12, w: 0.06, c: '#fde68a' }, { t: 'stripe', y: 0.06, w: 0.06, c: '#fde68a' }, { t: 'stripe', y: 0.24, w: 0.06, c: '#fde68a' }, { t: 'band', x: 0.3, w: 0.08, c: '#0b1a3a' }] }) },
  { id: 'mandarin', name: 'Mandarinfish', latin: 'Synchiropus splendidus', zone: 'sand', source: 'pick',
    fact: 'One of very few vertebrates known to make its own blue pigment rather than using structural colour.',
    draw: fish({ L: 16, h: 8, body: '#1e6fd9', fin: '#f97316', tail: 'round', dorsal: 'sail', pat: [{ t: 'squiggle', c: '#f97316' }] }) },
  { id: 'royal-gramma', name: 'Royal gramma', latin: 'Gramma loreto', zone: 'swim', source: 'pick',
    fact: 'It often swims upside down under ledges, orienting to the nearest surface rather than to gravity.',
    draw: fish({ L: 16, h: 7, body: '#facc15', fin: '#a855f7', tail: 'round', tailC: '#facc15', dorsal: 'low', pat: [{ t: 'front', x: 0.0, c: '#a855f7' }] }) },
  { id: 'lionfish', name: 'Red lionfish', latin: 'Pterois volitans', zone: 'swim', source: 'pick', size: 1.2,
    fact: 'Its fin spines carry venom; in the Atlantic it is an invasive species with few predators.',
    draw: fish({ L: 22, h: 11, body: '#f4e4d4', fin: '#c0392b', tail: 'round', dorsal: 'spines', fans: true,
      pat: [{ t: 'band', x: 0.3, w: 0.07, c: '#a0291e' }, { t: 'band', x: 0.12, w: 0.07, c: '#a0291e' }, { t: 'band', x: -0.06, w: 0.07, c: '#a0291e' }, { t: 'band', x: -0.24, w: 0.07, c: '#a0291e' }, { t: 'band', x: -0.4, w: 0.06, c: '#a0291e' }] }) },
  { id: 'porcupinefish', name: 'Porcupinefish', latin: 'Diodon holocanthus', zone: 'swim', source: 'pick',
    fact: 'It gulps water to inflate into a spiky ball, and many species carry tetrodotoxin, a sodium-channel blocker.',
    draw: fish({ L: 20, h: 16, body: '#d9c69a', fin: '#c4ad78', tail: 'round', shape: 'round', spikes: true, pat: [{ t: 'spots', c: '#5b4a2a', n: 9, r: 1.4 }] }) },
  { id: 'boxfish', name: 'Yellow boxfish', latin: 'Ostracion cubicus', zone: 'swim', source: 'pick',
    fact: 'Its body is encased in fused bony plates, so only its fins and tail can move.',
    draw: fish({ L: 18, h: 12, body: '#fcd34d', fin: '#fbbf24', tail: 'round', shape: 'box', pat: [{ t: 'spots', c: '#1f2937', n: 12, r: 0.9 }] }) },
  { id: 'cowfish', name: 'Longhorn cowfish', latin: 'Lactoria cornuta', zone: 'swim', source: 'pick',
    fact: 'The "horns" are spines that make it very hard for a predator to swallow.',
    draw: fish({ L: 19, h: 11, body: '#e2c64a', fin: '#c9ab32', tail: 'long', shape: 'box', horns: true, pat: [{ t: 'spots', c: '#4f7fd1', n: 10, r: 1 }] }) },
  { id: 'picasso', name: 'Picasso triggerfish', latin: 'Rhinecanthus aculeatus', zone: 'swim', source: 'pick',
    fact: 'A locking dorsal spine wedges it into crevices so predators cannot pull it out.',
    draw: fish({ L: 22, h: 12, body: '#efe9df', fin: '#c9c0b0', tail: 'round', dorsal: 'low',
      pat: [{ t: 'back', x: -0.05, c: '#8c7b65' }, { t: 'stripe', y: 0.2, w: 0.06, c: '#1d4ed8' }, { t: 'band', x: 0.22, w: 0.05, c: '#f59e0b' }, { t: 'stripe', y: -0.1, w: 0.05, c: '#111' }] }) },
  { id: 'cleaner-wrasse', name: 'Bluestreak cleaner wrasse', latin: 'Labroides dimidiatus', zone: 'swim', source: 'pick',
    fact: 'It has passed the mirror test in some experiments, a test usually used for self-recognition.',
    draw: fish({ L: 16, h: 5, body: '#cde3ff', fin: '#5b9bff', tail: 'round', shape: 'long', dorsal: 'low', pat: [{ t: 'stripe', y: 0, w: 0.22, c: '#111827' }, { t: 'back', x: -0.1, c: '#3b82f6' }, { t: 'stripe', y: 0, w: 0.22, c: '#111827' }] }) },
  { id: 'parrotfish', name: 'Steephead parrotfish', latin: 'Chlorurus microrhinos', zone: 'swim', source: 'pick', size: 1.3,
    fact: 'It bites off coral rock, digests the algae and excretes the rest as fine white sand.',
    draw: fish({ L: 28, h: 13, body: '#22b8a6', fin: '#7c5cdb', tail: 'lunate', dorsal: 'low', nose: 'beak', pat: [{ t: 'front', x: 0.3, c: '#f0abfc' }, { t: 'squiggle', c: '#7c5cdb' }] }) },
  { id: 'flame-angel', name: 'Flame angelfish', latin: 'Centropyge loricula', zone: 'swim', source: 'pick',
    fact: 'Like many reef angelfish it starts life female and can change into a male.',
    draw: fish({ L: 16, h: 11, body: '#ef4444', fin: '#1e1b4b', tail: 'round', dorsal: 'low', shape: 'disc', pat: [{ t: 'band', x: 0.05, w: 0.06, c: '#1e1b4b' }, { t: 'band', x: -0.15, w: 0.06, c: '#1e1b4b' }, { t: 'front', x: 0.3, c: '#f97316' }] }) },
  { id: 'firefish', name: 'Fire goby', latin: 'Nemateleotris magnifica', zone: 'sand', source: 'pick',
    fact: 'It hovers over its burrow, flicking its long first dorsal spine as a signal.',
    draw: fish({ L: 16, h: 5.5, body: '#fff1d6', fin: '#ef4444', tail: 'round', tailC: '#b91c1c', shape: 'long', dorsal: 'streamer', pat: [{ t: 'back', x: -0.1, c: '#f97316' }, { t: 'front', x: 0.32, c: '#facc15' }] }) },
  { id: 'hawkfish', name: 'Longnose hawkfish', latin: 'Oxycirrhites typus', zone: 'sand', source: 'pick',
    fact: 'Hawkfish have no swim bladder, so they perch on coral and black coral fans rather than hover.',
    draw: fish({ L: 16, h: 6, body: '#fff5f5', fin: '#ef4444', tail: 'round', shape: 'long', nose: 'long', dorsal: 'spines', pat: [{ t: 'squiggle', c: '#dc2626' }] }) },
  { id: 'bannerfish', name: 'Pennant coralfish', latin: 'Heniochus acuminatus', zone: 'swim', source: 'pick',
    fact: 'Juveniles sometimes act as cleaners, picking parasites off larger fish.',
    draw: fish({ L: 20, h: 16, body: '#fafafa', fin: '#facc15', tail: 'round', tailC: '#facc15', dorsal: 'streamer', shape: 'disc', pat: [{ t: 'band', x: 0.12, w: 0.18, c: '#1c1c1c' }, { t: 'band', x: -0.18, w: 0.16, c: '#1c1c1c' }] }) },
  { id: 'sweetlips', name: 'Oriental sweetlips', latin: 'Plectorhinchus vittatus', zone: 'swim', source: 'pick', size: 1.2,
    fact: 'Named for their thick lips, sweetlips rest in groups under ledges by day and feed at night.',
    draw: fish({ L: 24, h: 10, body: '#fafafa', fin: '#facc15', tail: 'fork', tailC: '#facc15', dorsal: 'low', pat: [{ t: 'stripe', y: -0.28, w: 0.08, c: '#1f2937' }, { t: 'stripe', y: -0.06, w: 0.08, c: '#1f2937' }, { t: 'stripe', y: 0.16, w: 0.08, c: '#1f2937' }] }) },
  { id: 'clown-trigger', name: 'Clown triggerfish', latin: 'Balistoides conspicillum', zone: 'swim', source: 'pick',
    fact: 'Triggerfish blow jets of water to uncover sea urchins and flip them over.',
    draw: fish({ L: 22, h: 12, body: '#111827', fin: '#111827', tail: 'round', dorsal: 'low', pat: [{ t: 'spots', c: '#f8fafc', n: 8, r: 1.8 }, { t: 'front', x: 0.36, c: '#facc15' }] }) },
  { id: 'barracuda', name: 'Great barracuda', latin: 'Sphyraena barracuda', zone: 'swim', source: 'pick', size: 1.5,
    fact: 'It can accelerate in bursts to around 40 km/h to ambush prey.',
    draw: fish({ L: 34, h: 6, body: '#a9bccb', fin: '#7d93a6', tail: 'fork', shape: 'long', dorsal: 'low', nose: 'long', pat: [{ t: 'top', y: -0.15, c: '#6f8698' }] }) },
  { id: 'watchman-goby', name: 'Yellow watchman goby', latin: 'Cryptocentrus cinctus', zone: 'sand', source: 'pick',
    fact: 'It shares a burrow with a near-blind pistol shrimp: the shrimp digs, the goby keeps watch.',
    draw: fish({ L: 14, h: 5, body: '#fde047', fin: '#facc15', tail: 'round', shape: 'long', dorsal: 'low', pat: [{ t: 'spots', c: '#60a5fa', n: 6, r: 0.7 }] }) },
  { id: 'moon-jelly', name: 'Moon jellyfish', latin: 'Aurelia aurita', zone: 'drift', source: 'pick',
    fact: 'The four rings you can see through its bell are its gonads.',
    draw: { kind: 'jelly', c: '#dfe9ff' } },
  { id: 'comb-jelly', name: 'Sea gooseberry', latin: 'Pleurobrachia pileus', zone: 'drift', source: 'pick',
    fact: 'Comb jellies swim with rows of beating cilia that scatter light into rainbows.',
    draw: { kind: 'jelly', c: '#c4f1ff', comb: true, glow: true } },
  { id: 'blue-star', name: 'Blue sea star', latin: 'Linckia laevigata', zone: 'sand', source: 'pick',
    fact: 'A single lost arm can regrow a whole new starfish.',
    draw: { kind: 'star', c: '#3b82f6' } },
  { id: 'red-star', name: 'Red knobbed sea star', latin: 'Protoreaster linckii', zone: 'sand', source: 'pick',
    fact: 'Starfish move on hundreds of hydraulic tube feet powered by a water vascular system.',
    draw: { kind: 'star', c: '#f1f5f9', c2: '#dc2626' } },
  { id: 'brittle-star', name: 'Brittle star', latin: 'Ophiocoma scolopendrina', zone: 'sand', source: 'pick',
    fact: 'Some brittle stars detect light across their whole skeleton, which acts like a compound eye.',
    draw: { kind: 'star', c: '#7c5a3c', thin: true } },
  { id: 'diadema', name: 'Long-spined sea urchin', latin: 'Diadema antillarum', zone: 'sand', source: 'pick',
    fact: 'A 1983 mass die-off in the Caribbean let algae overgrow many reefs, showing how much grazers matter.',
    draw: { kind: 'urchin', c: '#1e1b2e', long: true } },
  { id: 'hermit', name: 'Hermit crab', latin: 'Dardanus megistos', zone: 'sand', source: 'pick',
    fact: 'Hermit crabs line up by size to swap shells when a bigger one becomes free.',
    draw: { kind: 'crab', c: '#e25d33', shell: '#e8d5b5' } },
  { id: 'decorator', name: 'Decorator crab', latin: 'Camposcia retusa', zone: 'sand', source: 'pick',
    fact: 'It sticks sponges and algae onto hooked hairs on its shell as living camouflage.',
    draw: { kind: 'crab', c: '#b07a4a', deco: true } },
  { id: 'lobster', name: 'Painted spiny lobster', latin: 'Panulirus versicolor', zone: 'sand', source: 'pick', size: 1.2,
    fact: 'Spiny lobsters migrate in single-file queues, each touching the one in front with its antennae.',
    draw: { kind: 'lobster', c: '#2c8a8a', c2: '#f5f5f5' } },
  { id: 'pistol', name: 'Pistol shrimp', latin: 'Alpheus randalli', zone: 'sand', source: 'pick',
    fact: 'Snapping its claw makes a collapsing bubble that briefly reaches thousands of degrees and stuns prey.',
    draw: { kind: 'shrimp', c: '#f4f4f5', c2: '#ef4444', claw: true } },
  { id: 'nudibranch', name: 'Blue dragon nudibranch', latin: 'Pteraeolidia semperi', zone: 'sand', source: 'pick',
    fact: 'Some nudibranchs keep the stinging cells of the hydroids they eat and use them for defence.',
    draw: { kind: 'nudi', c: '#7c3aed', c2: '#f97316', c3: '#fafafa' } },
  { id: 'chromodoris', name: 'Annae\'s chromodoris', latin: 'Chromodoris annae', zone: 'sand', source: 'pick',
    fact: 'Bright colours warn predators that it stores distasteful chemicals taken from sponges.',
    draw: { kind: 'nudi', c: '#2563eb', c2: '#fb923c', c3: '#f8fafc' } },
  { id: 'cucumber', name: 'Leopard sea cucumber', latin: 'Bohadschia argus', zone: 'sand', source: 'pick',
    fact: 'Sea cucumbers recycle nutrients by eating sand and excreting it cleaned of organic matter.',
    draw: { kind: 'cucumber', c: '#c9a66b' } },
  { id: 'featherstar', name: 'Feather star', latin: 'Comanthina schlegelii', zone: 'plant', source: 'pick',
    fact: 'Feather stars are crinoids, a group of echinoderms that was far more common 300 million years ago.',
    draw: { kind: 'featherstar', c: '#f59e0b' } },
  { id: 'xmas-worm', name: 'Christmas tree worms', latin: 'Spirobranchus giganteus', zone: 'plant', source: 'pick',
    fact: 'The spiral "trees" are feeding and breathing crowns; the worm\'s body lives in a tube inside living coral.',
    draw: { kind: 'xmasworm', c: '#3b82f6' } },
  { id: 'duster', name: 'Feather duster worm', latin: 'Sabellastarte spectabilis', zone: 'plant', source: 'pick',
    fact: 'It snaps its crown back into its tube the moment a shadow passes over it.',
    draw: { kind: 'duster', c: '#a16207', c2: '#fde68a' } },
  { id: 'seafan', name: 'Sea fan', latin: 'Annella mollis', zone: 'plant', source: 'pick', size: 1.3,
    fact: 'Sea fans grow across the current so their polyps can catch plankton drifting past.',
    draw: { kind: 'seafan', c: '#e11d48' } },
  { id: 'barrel-sponge', name: 'Giant barrel sponge', latin: 'Xestospongia muta', zone: 'plant', source: 'pick', size: 1.2,
    fact: 'Some giant barrel sponges are estimated to be over 2,000 years old.',
    draw: { kind: 'sponge', c: '#b45309' } },
  { id: 'tube-sponge', name: 'Azure vase sponge', latin: 'Callyspongia plicifera', zone: 'plant', source: 'pick',
    fact: 'Sponges have no tissues or organs; flagellated choanocytes pump water through them.',
    draw: { kind: 'sponge', c: '#a78bfa', tube: true } },
  { id: 'seagrass', name: 'Turtle grass', latin: 'Thalassia testudinum', zone: 'plant', source: 'pick',
    fact: 'Seagrasses are flowering plants that returned to the sea, and they pollinate underwater.',
    draw: { kind: 'seagrass', c: '#4d9a3a' } },
  { id: 'garden-eels', name: 'Spotted garden eels', latin: 'Heteroconger hassi', zone: 'sand', source: 'pick',
    fact: 'Whole colonies sway out of their burrows to catch plankton and vanish into the sand together.',
    draw: { kind: 'gardeneels', c: '#f5f5f4', c2: '#1c1917' } },
  { id: 'blue-ringed', name: 'Blue-ringed octopus', latin: 'Hapalochlaena lunulata', zone: 'sand', source: 'pick',
    fact: 'Its saliva contains tetrodotoxin, made by bacteria living in its salivary glands.',
    draw: { kind: 'octopus', c: '#e3b34a', rings: true } },
  { id: 'cowrie', name: 'Tiger cowrie', latin: 'Cypraea tigris', zone: 'sand', source: 'pick',
    fact: 'The shell stays glossy because the snail\'s mantle covers it while it moves.',
    draw: { kind: 'cowrie', c: '#f3e9d2', c2: '#3b2a1a' } },
  { id: 'carpet-anemone', name: 'Carpet anemone', latin: 'Stichodactyla gigantea', zone: 'plant', source: 'pick',
    fact: 'Anemones are cnidarians, like coral and jellyfish, and sting prey with harpoon-like nematocysts.',
    draw: { kind: 'anemone', c: '#22c55e', tip: '#bbf7d0' } },
  { id: 'mushroom', name: 'Mushroom coral', latin: 'Fungia fungites', zone: 'sand', source: 'pick',
    fact: 'Unlike most coral, each one is a single huge polyp that lies loose on the sand and can right itself.',
    draw: { kind: 'mushroom', c: '#c084fc' } },
];

export const ALL_ORGANISMS: Organism[] = [...SCHOOLS, ...LECTURE_SPECIALS, ...STREAK_VISITORS, ...PICKS];
export const ORG = new Map(ALL_ORGANISMS.map((o) => [o.id, o]));

// ---------------------------------------------------------------- corals (one species per module, in module order)
export type CoralKind = 'staghorn' | 'brain' | 'table' | 'pillar' | 'lettuce' | 'finger';
export interface CoralSpecies {
  kind: CoralKind;
  name: string;
  latin: string;
  c: string;
  c2: string;
  fact: string;
}
export const CORALS: CoralSpecies[] = [
  { kind: 'staghorn', name: 'Staghorn coral', latin: 'Acropora cervicornis', c: '#f4a259', c2: '#ffd6a5', fact: 'One of the fastest-growing corals, up to 10–20 cm a year, but very sensitive to bleaching.' },
  { kind: 'brain', name: 'Brain coral', latin: 'Diploria labyrinthiformis', c: '#9bd17a', c2: '#d9f2c4', fact: 'Each groove is a valley of joined polyps, and large heads can be hundreds of years old.' },
  { kind: 'table', name: 'Table coral', latin: 'Acropora hyacinthus', c: '#7cc6e8', c2: '#cdeefc', fact: 'Its flat plates shade the reef below and shelter fish from predators above.' },
  { kind: 'pillar', name: 'Pillar coral', latin: 'Dendrogyra cylindrus', c: '#e8c27a', c2: '#fff1cc', fact: 'Unusually, its polyps feed with tentacles out during the day, which makes the pillars look fuzzy.' },
  { kind: 'lettuce', name: 'Lettuce coral', latin: 'Agaricia agaricites', c: '#e98fb6', c2: '#ffd1e4', fact: 'Its thin wavy plates grow in shapes that change with how much light reaches them.' },
  { kind: 'finger', name: 'Finger leather coral', latin: 'Sinularia flexibilis', c: '#c8b6ff', c2: '#ede6ff', fact: 'A soft coral: no hard skeleton, just tiny spicules of calcium carbonate in its tissue.' },
];
