/**
 * cosmic.ts — single source of truth for the Cosmic Nebula engine.
 *
 * Both the imperative canvas engine (CosmicCanvas.tsx) and the React UI
 * (page.tsx / CosmicControls.tsx) import their vocabulary from here: the set
 * of visual modes, the colour palettes, the quick presets, the per-device
 * performance budgets, and the shape of the settings object that flows
 * between them. Keeping it in one file means the simulation and the controls
 * can never disagree about what "galaxy" or "aurora-borealis" mean.
 */

/* ------------------------------------------------------------------ *
 * Visual modes
 * ------------------------------------------------------------------ */

export type ModeId =
  | 'nebula'
  | 'galaxy'
  | 'aurora'
  | 'fireflies'
  | 'blackhole'
  | 'constellation'
  | 'vortex';

export interface ModeDef {
  id: ModeId;
  label: string;
  /** lucide-react icon name, resolved in CosmicControls */
  icon: string;
  description: string;
  /** one-key shortcut on desktop */
  key: string;
}

export const MODES: ModeDef[] = [
  { id: 'nebula', label: 'Nebula', icon: 'Sparkles', key: '1', description: 'Drifting clouds of cosmic dust' },
  { id: 'galaxy', label: 'Galaxy', icon: 'Tornado', key: '2', description: 'A spiral galaxy locked in orbit' },
  { id: 'aurora', label: 'Aurora', icon: 'Waves', key: '3', description: 'Northern lights rippling across the sky' },
  { id: 'fireflies', label: 'Fireflies', icon: 'Bug', key: '4', description: 'An enchanted forest, softly glowing' },
  { id: 'blackhole', label: 'Black Hole', icon: 'CircleDot', key: '5', description: 'Matter spiralling past the event horizon' },
  { id: 'constellation', label: 'Web', icon: 'Share2', key: '6', description: 'Stars wired into a living constellation' },
  { id: 'vortex', label: 'Vortex', icon: 'Wind', key: '7', description: 'A whirlwind that chases your touch' },
];

export const MODE_IDS = MODES.map((m) => m.id);
export function isModeId(v: string): v is ModeId {
  return (MODE_IDS as string[]).includes(v);
}

/* ------------------------------------------------------------------ *
 * Colour palettes — each colour is [hue, saturation%, lightness%]
 * ------------------------------------------------------------------ */

export type HSL = [number, number, number];

export interface Palette {
  id: string;
  name: string;
  colors: HSL[];
  /** representative colour for UI accents, as a CSS string */
  accent: string;
  /** page/background tint behind the particles */
  bg: string;
}

export const PALETTES: Palette[] = [
  {
    id: 'cosmic',
    name: 'Cosmic Purple',
    accent: 'rgb(168, 85, 247)',
    bg: '#05020f',
    colors: [
      [270, 80, 62],
      [290, 85, 66],
      [250, 75, 60],
      [315, 80, 68],
      [225, 70, 64],
    ],
  },
  {
    id: 'aurora',
    name: 'Aurora Borealis',
    accent: 'rgb(45, 212, 191)',
    bg: '#02060a',
    colors: [
      [150, 85, 58],
      [170, 80, 60],
      [120, 75, 56],
      [190, 80, 62],
      [95, 70, 58],
    ],
  },
  {
    id: 'solar',
    name: 'Solar Flare',
    accent: 'rgb(251, 146, 60)',
    bg: '#0a0402',
    colors: [
      [20, 95, 60],
      [38, 100, 62],
      [8, 90, 58],
      [50, 95, 64],
      [330, 80, 60],
    ],
  },
  {
    id: 'ice',
    name: 'Ice Crystal',
    accent: 'rgb(125, 211, 252)',
    bg: '#02050c',
    colors: [
      [195, 90, 70],
      [210, 85, 72],
      [180, 80, 70],
      [225, 75, 74],
      [200, 30, 92],
    ],
  },
  {
    id: 'bio',
    name: 'Bioluminescent',
    accent: 'rgb(74, 222, 128)',
    bg: '#02080a',
    colors: [
      [160, 90, 56],
      [185, 85, 60],
      [140, 80, 54],
      [90, 75, 58],
      [205, 80, 64],
    ],
  },
  {
    id: 'sunset',
    name: 'Nebula Sunset',
    accent: 'rgb(244, 114, 182)',
    bg: '#0a0310',
    colors: [
      [330, 85, 66],
      [350, 80, 64],
      [25, 90, 64],
      [285, 75, 64],
      [205, 70, 64],
    ],
  },
  {
    id: 'gold',
    name: 'Stardust Gold',
    accent: 'rgb(250, 204, 21)',
    bg: '#080502',
    colors: [
      [45, 95, 64],
      [38, 90, 60],
      [52, 100, 70],
      [30, 85, 58],
      [48, 40, 92],
    ],
  },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/* ------------------------------------------------------------------ *
 * Quick presets — opinionated starting points
 * ------------------------------------------------------------------ */

export interface Preset {
  id: string;
  name: string;
  mode: ModeId;
  palette: string;
  density: number;
  gravity: number;
  trail: number;
}

export const PRESETS: Preset[] = [
  { id: 'deep-space', name: 'Deep Space', mode: 'nebula', palette: 'cosmic', density: 0.55, gravity: 3, trail: 6 },
  { id: 'galactic-core', name: 'Galactic Core', mode: 'galaxy', palette: 'sunset', density: 0.7, gravity: 4, trail: 7 },
  { id: 'northern-lights', name: 'Northern Lights', mode: 'aurora', palette: 'aurora', density: 0.6, gravity: 2, trail: 8 },
  { id: 'enchanted', name: 'Enchanted Forest', mode: 'fireflies', palette: 'bio', density: 0.4, gravity: 2.5, trail: 3 },
  { id: 'event-horizon', name: 'Event Horizon', mode: 'blackhole', palette: 'ice', density: 0.75, gravity: 5, trail: 9 },
  { id: 'neural', name: 'Neural Web', mode: 'constellation', palette: 'ice', density: 0.35, gravity: 2, trail: 2 },
  { id: 'tempest', name: 'Tempest', mode: 'vortex', palette: 'solar', density: 0.65, gravity: 5, trail: 7 },
];

/* ------------------------------------------------------------------ *
 * Settings — the live state shared between UI and engine
 * ------------------------------------------------------------------ */

export interface CosmicSettings {
  mode: ModeId;
  palette: string;
  /** 0..1 — fraction of the device particle budget */
  density: number;
  /** 0.5..8 — pointer gravitational strength */
  gravity: number;
  /** 0..12 — higher = longer motion-blur trails */
  trail: number;
  /** soft additive glow on/off (off is cheaper) */
  glow: boolean;
  /** pointer attracts or repels particles */
  pointerMode: 'attract' | 'repel';
  /** roaming virtual attractor when idle */
  autopilot: boolean;
  /** microphone-reactive intensity */
  audio: boolean;
  paused: boolean;
}

export const PARAM_RANGES = {
  density: { min: 0, max: 1, step: 0.01 },
  gravity: { min: 0.5, max: 8, step: 0.1 },
  trail: { min: 0, max: 12, step: 1 },
} as const;

export const DEFAULT_SETTINGS: CosmicSettings = {
  mode: 'nebula',
  palette: 'cosmic',
  density: 0.55,
  gravity: 3,
  trail: 6,
  glow: true,
  pointerMode: 'attract',
  autopilot: true,
  audio: false,
  paused: false,
};

export function applyPreset(s: CosmicSettings, preset: Preset): CosmicSettings {
  return { ...s, mode: preset.mode, palette: preset.palette, density: preset.density, gravity: preset.gravity, trail: preset.trail };
}

/* ------------------------------------------------------------------ *
 * URL-hash serialisation — makes any creation a shareable permalink
 * ------------------------------------------------------------------ */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function encodeSettings(s: CosmicSettings): string {
  const p = new URLSearchParams();
  p.set('m', s.mode);
  p.set('c', s.palette);
  p.set('d', s.density.toFixed(2));
  p.set('g', s.gravity.toFixed(1));
  p.set('t', String(s.trail));
  p.set('pm', s.pointerMode === 'repel' ? 'r' : 'a');
  p.set('gl', s.glow ? '1' : '0');
  p.set('ap', s.autopilot ? '1' : '0');
  return p.toString();
}

export function decodeSettings(hash: string): Partial<CosmicSettings> {
  const out: Partial<CosmicSettings> = {};
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return out;
  const p = new URLSearchParams(raw);
  const m = p.get('m');
  if (m && isModeId(m)) out.mode = m;
  const c = p.get('c');
  if (c && PALETTES.some((x) => x.id === c)) out.palette = c;
  const d = p.get('d');
  if (d != null && !Number.isNaN(+d)) out.density = clamp(+d, 0, 1);
  const g = p.get('g');
  if (g != null && !Number.isNaN(+g)) out.gravity = clamp(+g, 0.5, 8);
  const t = p.get('t');
  if (t != null && !Number.isNaN(+t)) out.trail = clamp(Math.round(+t), 0, 12);
  const pm = p.get('pm');
  if (pm === 'r' || pm === 'a') out.pointerMode = pm === 'r' ? 'repel' : 'attract';
  const gl = p.get('gl');
  if (gl === '0' || gl === '1') out.glow = gl === '1';
  const ap = p.get('ap');
  if (ap === '0' || ap === '1') out.autopilot = ap === '1';
  return out;
}

/* ------------------------------------------------------------------ *
 * Device performance tiering — the heart of mobile optimisation
 * ------------------------------------------------------------------ */

export interface DeviceTier {
  tier: 'low' | 'mid' | 'high';
  /** ceiling on simultaneous field particles */
  maxParticles: number;
  /** ceiling on devicePixelRatio used for the backing store */
  dprCap: number;
  /** coarse pointer => touch device */
  coarse: boolean;
  reducedMotion: boolean;
}

export function detectDevice(): DeviceTier {
  if (typeof window === 'undefined') {
    return { tier: 'high', maxParticles: 3000, dprCap: 2, coarse: false, reducedMotion: false };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  const small = minSide < 720;

  let tier: DeviceTier['tier'];
  if (reducedMotion) {
    tier = 'low';
  } else if (cores >= 8 && mem >= 8 && !small) {
    tier = 'high';
  } else if ((coarse && (cores <= 4 || mem <= 3)) || (small && coarse)) {
    tier = 'low';
  } else {
    tier = 'mid';
  }

  const budgets = {
    low: { maxParticles: 700, dprCap: 1.5 },
    mid: { maxParticles: 1600, dprCap: 2 },
    high: { maxParticles: 3000, dprCap: 2 },
  } as const;

  return { tier, ...budgets[tier], coarse, reducedMotion };
}

export const MIN_PARTICLES = 120;

/** Map a 0..1 density slider onto an absolute particle budget for this device. */
export function particleBudget(device: DeviceTier, density: number): number {
  return Math.round(MIN_PARTICLES + (device.maxParticles - MIN_PARTICLES) * clamp(density, 0, 1));
}
