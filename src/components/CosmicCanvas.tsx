'use client';

/**
 * CosmicCanvas — the imperative particle engine.
 *
 * Design notes (the "why" behind the structure):
 *  - The animation loop is mounted ONCE. Live settings are pushed into a ref
 *    (`cfg`) every render, so dragging a slider never tears down or reseeds the
 *    simulation. React owns the UI; the rAF loop owns the pixels.
 *  - Input is unified through Pointer Events, so mouse, touch, pen and
 *    multi-touch all drive the same attractor list. Tap = supernova, drag/hover
 *    = gravity well.
 *  - Glow is drawn from pre-rendered sprites (one per palette colour) instead of
 *    building a radial gradient per particle per frame — the single biggest
 *    perf lever on phones.
 *  - Trails are a global canvas fade, not per-particle history arrays: O(1)
 *    memory regardless of particle count.
 *  - An FPS governor watches frame time and throttles the live particle count,
 *    so a weak device degrades gracefully instead of dropping frames.
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
  type CosmicSettings,
  type DeviceTier,
  getPalette,
  detectDevice,
  particleBudget,
  MIN_PARTICLES,
} from '@/lib/cosmic';

export interface CosmicStats {
  fps: number;
  count: number;
  supernovae: number;
  tier: DeviceTier['tier'];
}

export interface CosmicCanvasHandle {
  /** fire a supernova at canvas-centre-ish random points */
  surprise: () => void;
  /** clear everything and reseed the field */
  reset: () => void;
  /** PNG data URL of the current frame, or null */
  capture: () => string | null;
}

interface CosmicCanvasProps {
  settings: CosmicSettings;
  onStats?: (s: CosmicStats) => void;
  onFirstInteraction?: () => void;
  /** called if audio was requested but permission/feature failed */
  onAudioError?: () => void;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  ci: number; // colour index into the sprite set
  life: number;
  maxLife: number;
  alpha: number;
}

interface Spark extends P {}
interface Ring {
  x: number;
  y: number;
  t: number;
  max: number;
  hue: number;
}

const SPRITE = 64;
const TAU = Math.PI * 2;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CosmicCanvas = forwardRef<CosmicCanvasHandle, CosmicCanvasProps>(function CosmicCanvas(
  { settings, onStats, onFirstInteraction, onAudioError },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live mutable mirrors of props — read by the loop without re-mounting it.
  const cfg = useRef<CosmicSettings>(settings);
  const statsCb = useRef(onStats);
  const firstCb = useRef(onFirstInteraction);
  const audioErrCb = useRef(onAudioError);
  cfg.current = settings;
  statsCb.current = onStats;
  firstCb.current = onFirstInteraction;
  audioErrCb.current = onAudioError;

  // Engine state held outside React.
  const fieldRef = useRef<P[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const sparkSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const paletteIdRef = useRef<string>('');
  const deviceRef = useRef<DeviceTier>(detectDevice());
  const capRef = useRef<number>(deviceRef.current.maxParticles); // governor ceiling
  const interactedRef = useRef(false);
  const snRef = useRef(0); // total supernovae fired

  // Pointer / input state.
  const pointersRef = useRef<Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean }>>(
    new Map()
  );
  const hoverRef = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const lastInputRef = useRef<number>(0);

  // Audio state.
  const audioRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    data: Uint8Array;
    stream: MediaStream;
  } | null>(null);
  const audioLevelRef = useRef(0);
  const audioWantRef = useRef(false);

  /* -------------------------------------------------------------- *
   * Sprite generation
   * -------------------------------------------------------------- */
  const buildSprites = useCallback((paletteId: string) => {
    const pal = getPalette(paletteId);
    const make = (h: number, s: number, l: number): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      grd.addColorStop(0, `hsla(${h}, ${s}%, ${Math.min(l + 28, 100)}%, 1)`);
      grd.addColorStop(0.25, `hsla(${h}, ${s}%, ${l}%, 0.85)`);
      grd.addColorStop(0.55, `hsla(${h}, ${s}%, ${l}%, 0.22)`);
      grd.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, SPRITE, SPRITE);
      return c;
    };
    spritesRef.current = pal.colors.map(([h, s, l]) => make(h, s, l));
    sparkSpriteRef.current = make(45, 100, 72); // warm golden spark
    paletteIdRef.current = paletteId;
  }, []);

  /* -------------------------------------------------------------- *
   * Particle spawning
   * -------------------------------------------------------------- */
  const spawn = useCallback((p: P, w: number, h: number) => {
    const cfgv = cfg.current;
    const colors = spritesRef.current.length || 5;
    p.ci = (Math.random() * colors) | 0;
    p.alpha = 0;
    switch (cfgv.mode) {
      case 'galaxy': {
        const ang = Math.random() * TAU;
        const dist = 40 + Math.random() * Math.min(w, h) * 0.42;
        p.x = w / 2 + Math.cos(ang) * dist;
        p.y = h / 2 + Math.sin(ang) * dist;
        const sp = 0.4 + Math.random() * 0.6;
        p.vx = -Math.sin(ang) * sp;
        p.vy = Math.cos(ang) * sp;
        p.size = 1 + Math.random() * 1.8;
        p.maxLife = p.life = 220 + Math.random() * 260;
        break;
      }
      case 'aurora': {
        p.x = Math.random() * w;
        p.y = h * 0.28 + Math.sin(Math.random() * 6) * h * 0.22;
        p.vx = 0.25 + Math.random() * 0.7;
        p.vy = (Math.random() - 0.5) * 0.3;
        p.size = 1.2 + Math.random() * 2.2;
        p.maxLife = p.life = 160 + Math.random() * 180;
        break;
      }
      case 'fireflies': {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = (Math.random() - 0.5) * 0.4;
        p.size = 1 + Math.random() * 2;
        p.maxLife = p.life = 240 + Math.random() * 320;
        break;
      }
      case 'blackhole': {
        const ang = Math.random() * TAU;
        const dist = Math.min(w, h) * (0.28 + Math.random() * 0.32);
        p.x = w / 2 + Math.cos(ang) * dist;
        p.y = h / 2 + Math.sin(ang) * dist;
        const sp = 0.5 + Math.random() * 0.5;
        p.vx = -Math.sin(ang) * sp;
        p.vy = Math.cos(ang) * sp;
        p.size = 1 + Math.random() * 2;
        p.maxLife = p.life = 300 + Math.random() * 300;
        break;
      }
      case 'constellation':
      case 'vortex':
      case 'nebula':
      default: {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.vx = (Math.random() - 0.5) * 0.6;
        p.vy = (Math.random() - 0.5) * 0.6;
        p.size = 1 + Math.random() * 2.4;
        p.maxLife = p.life = 180 + Math.random() * 240;
        break;
      }
    }
  }, []);

  const blank = (): P => ({ x: 0, y: 0, vx: 0, vy: 0, size: 1, ci: 0, life: 0, maxLife: 1, alpha: 0 });

  /* -------------------------------------------------------------- *
   * Supernova
   * -------------------------------------------------------------- */
  const supernova = useCallback((x: number, y: number) => {
    snRef.current++;
    const sparks = sparksRef.current;
    const n = deviceRef.current.tier === 'low' ? 36 : 64;
    for (let i = 0; i < n; i++) {
      if (sparks.length > 1400) break;
      const ang = Math.random() * TAU;
      const sp = 1.2 + Math.random() * 5;
      sparks.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        size: 1 + Math.random() * 2.6,
        ci: 0,
        life: 40 + Math.random() * 55,
        maxLife: 95,
        alpha: 1,
      });
    }
    ringsRef.current.push({ x, y, t: 0, max: 32, hue: 45 });
    // Impulse on nearby field particles.
    const field = fieldRef.current;
    for (let i = 0; i < field.length; i++) {
      const p = field[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 200 * 200) {
        const d = Math.sqrt(d2) + 1;
        const f = (1 - d / 200) * 6;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
  }, []);

  /* -------------------------------------------------------------- *
   * Imperative handle
   * -------------------------------------------------------------- */
  useImperativeHandle(
    ref,
    () => ({
      surprise: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        for (let i = 0; i < 3; i++) {
          supernova(w * (0.25 + Math.random() * 0.5), h * (0.25 + Math.random() * 0.5));
        }
      },
      reset: () => {
        fieldRef.current = [];
        sparksRef.current = [];
        ringsRef.current = [];
      },
      capture: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        try {
          return canvas.toDataURL('image/png');
        } catch {
          return null;
        }
      },
    }),
    [supernova]
  );

  /* -------------------------------------------------------------- *
   * Audio engine (lazy, permission-gated)
   * -------------------------------------------------------------- */
  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.stream.getTracks().forEach((t) => t.stop());
      a.ctx.close().catch(() => {});
      audioRef.current = null;
    }
    audioLevelRef.current = 0;
  }, []);

  const startAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioRef.current = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount), stream };
    } catch {
      audioWantRef.current = false;
      audioErrCb.current?.();
    }
  }, []);

  // React to the audio toggle.
  useEffect(() => {
    audioWantRef.current = settings.audio;
    if (settings.audio) startAudio();
    else stopAudio();
  }, [settings.audio, startAudio, stopAudio]);

  /* -------------------------------------------------------------- *
   * Main effect: mount once, run the loop.
   * -------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    deviceRef.current = detectDevice();
    capRef.current = deviceRef.current.maxParticles;
    buildSprites(cfg.current.palette);

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, deviceRef.current.dprCap);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const [r, g, b] = hexToRgb(getPalette(cfg.current.palette).bg);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    /* ---- input ---- */
    const markInput = () => {
      lastInputRef.current = performance.now();
      if (!interactedRef.current) {
        interactedRef.current = true;
        firstCb.current?.();
      }
    };
    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = local(e);
      pointersRef.current.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now(), moved: false });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      markInput();
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      const rec = pointersRef.current.get(e.pointerId);
      if (rec) {
        if (Math.abs(x - rec.sx) > 8 || Math.abs(y - rec.sy) > 8) rec.moved = true;
        rec.x = x;
        rec.y = y;
        markInput();
      } else if (e.pointerType === 'mouse') {
        hoverRef.current.x = x;
        hoverRef.current.y = y;
        hoverRef.current.on = true;
        markInput();
      }
    };
    const endPointer = (e: PointerEvent, cancelled: boolean) => {
      const rec = pointersRef.current.get(e.pointerId);
      if (rec) {
        const quick = performance.now() - rec.t < 320;
        if (!cancelled && !rec.moved && quick) {
          const { x, y } = local(e);
          supernova(x, y);
        }
        pointersRef.current.delete(e.pointerId);
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };
    const onUp = (e: PointerEvent) => endPointer(e, false);
    const onCancel = (e: PointerEvent) => endPointer(e, true);
    const onLeave = () => {
      hoverRef.current.on = false;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);

    /* ---- governor / stats bookkeeping ---- */
    let last = performance.now();
    let emaFps = 60;
    let frame = 0;
    let lastStats = 0;
    let raf = 0;
    let running = true;

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    /* ---- spatial grid for constellation ---- */
    const drawConnections = (field: P[], w: number, h: number, accent: string) => {
      const R = 118;
      const cell = R;
      const cols = Math.max(1, Math.ceil(w / cell));
      const rows = Math.max(1, Math.ceil(h / cell));
      const grid: number[][] = new Array(cols * rows);
      for (let i = 0; i < field.length; i++) {
        const p = field[i];
        const cx = Math.min(cols - 1, Math.max(0, (p.x / cell) | 0));
        const cy = Math.min(rows - 1, Math.max(0, (p.y / cell) | 0));
        const k = cy * cols + cx;
        (grid[k] || (grid[k] = [])).push(i);
      }
      ctx.lineWidth = 1;
      const R2 = R * R;
      for (let i = 0; i < field.length; i++) {
        const p = field[i];
        const cx = Math.min(cols - 1, Math.max(0, (p.x / cell) | 0));
        const cy = Math.min(rows - 1, Math.max(0, (p.y / cell) | 0));
        let links = 0;
        for (let oy = 0; oy <= 1 && links < 5; oy++) {
          for (let ox = -1; ox <= 1 && links < 5; ox++) {
            if (oy === 0 && ox < 0) continue;
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const bucket = grid[ny * cols + nx];
            if (!bucket) continue;
            for (let b = 0; b < bucket.length; b++) {
              const j = bucket[b];
              if (j <= i) continue;
              const q = field[j];
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2) {
                const a = (1 - Math.sqrt(d2) / R) * 0.5 * Math.min(p.alpha, q.alpha);
                ctx.strokeStyle = accent.replace('rgb(', 'rgba(').replace(')', `, ${a.toFixed(3)})`);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(q.x, q.y);
                ctx.stroke();
                if (++links >= 5) break;
              }
            }
          }
        }
      }
    };

    /* ---- the loop ---- */
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const instFps = dt > 0 ? 1000 / dt : 60;
      emaFps += (instFps - emaFps) * 0.1;
      frame++;

      const c = cfg.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const pal = getPalette(c.palette);
      if (paletteIdRef.current !== c.palette) buildSprites(c.palette);

      // audio level
      let energy = 0;
      const a = audioRef.current;
      if (a && c.audio) {
        a.analyser.getByteFrequencyData(a.data);
        let sum = 0;
        for (let i = 0; i < a.data.length; i++) sum += a.data[i];
        const avg = sum / a.data.length / 255;
        audioLevelRef.current += (avg - audioLevelRef.current) * 0.25;
        energy = audioLevelRef.current;
      }

      if (c.paused) {
        raf = requestAnimationFrame(loop);
        return;
      }

      // governor: adjust particle ceiling from measured fps
      if (frame % 30 === 0) {
        const target = particleBudget(deviceRef.current, c.density);
        if (emaFps < 46 && capRef.current > MIN_PARTICLES) {
          capRef.current = Math.max(MIN_PARTICLES, Math.floor(capRef.current * 0.88));
        } else if (emaFps > 57 && capRef.current < target) {
          capRef.current = Math.min(target, Math.ceil(capRef.current * 1.06) + 8);
        }
      }
      const targetCount = Math.min(particleBudget(deviceRef.current, c.density), capRef.current);

      // trail fade
      const fade = 0.45 - (c.trail / 12) * 0.415; // 0.45 .. 0.035
      const [br, bg, bb] = hexToRgb(pal.bg);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${br}, ${bg}, ${bb}, ${fade})`;
      ctx.fillRect(0, 0, w, h);

      // assemble attractors
      const attractors: { x: number; y: number; s: number }[] = [];
      pointersRef.current.forEach((p) => attractors.push({ x: p.x, y: p.y, s: 1 }));
      if (hoverRef.current.on && pointersRef.current.size === 0) {
        attractors.push({ x: hoverRef.current.x, y: hoverRef.current.y, s: 0.8 });
      }
      // idle autopilot
      const idle = now - lastInputRef.current > 3500;
      if (c.autopilot && idle && attractors.length === 0) {
        const t = now * 0.0004;
        attractors.push({
          x: w * (0.5 + 0.32 * Math.sin(t)),
          y: h * (0.5 + 0.28 * Math.sin(t * 1.37 + 1)),
          s: 0.7,
        });
      }

      const field = fieldRef.current;
      // grow / shrink field toward target
      if (field.length < targetCount) {
        const add = Math.min(targetCount - field.length, 24);
        for (let i = 0; i < add; i++) {
          const p = blank();
          spawn(p, w, h);
          field.push(p);
        }
      } else if (field.length > targetCount) {
        field.length = targetCount;
      }

      const grav = c.gravity * (1 + energy * 1.4);
      const repel = c.pointerMode === 'repel';
      const cxC = w / 2;
      const cyC = h / 2;

      ctx.globalCompositeOperation = c.glow ? 'lighter' : 'source-over';

      // constellation links drawn first (under the glow)
      if (c.mode === 'constellation') {
        ctx.globalCompositeOperation = 'source-over';
        drawConnections(field, w, h, pal.accent);
        ctx.globalCompositeOperation = c.glow ? 'lighter' : 'source-over';
      }

      for (let i = 0; i < field.length; i++) {
        const p = field[i];
        p.life--;

        // attractor forces
        for (let k = 0; k < attractors.length; k++) {
          const at = attractors[k];
          const dx = at.x - p.x;
          const dy = at.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 1;
          if (d < 320) {
            let f = ((grav * 0.5) / (d * 0.1)) * at.s;
            if (repel) f = -f;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }

        // mode behaviour
        switch (c.mode) {
          case 'galaxy': {
            const dx = cxC - p.x;
            const dy = cyC - p.y;
            const d = Math.sqrt(dx * dx + dy * dy) + 1;
            p.vx += (-dy / d) * 0.022 + (dx / d) * 0.0012;
            p.vy += (dx / d) * 0.022 + (dy / d) * 0.0012;
            break;
          }
          case 'blackhole': {
            const dx = cxC - p.x;
            const dy = cyC - p.y;
            const d = Math.sqrt(dx * dx + dy * dy) + 1;
            const pull = Math.min(2.2, 900 / (d * d)) + 0.02;
            p.vx += (dx / d) * pull + (-dy / d) * (0.05 + 60 / d);
            p.vy += (dy / d) * pull + (dx / d) * (0.05 + 60 / d);
            if (d < 26) {
              // swallowed — respawn at the rim
              spawn(p, w, h);
            }
            break;
          }
          case 'vortex': {
            const ax = attractors[0]?.x ?? cxC;
            const ay = attractors[0]?.y ?? cyC;
            const dx = ax - p.x;
            const dy = ay - p.y;
            const d = Math.sqrt(dx * dx + dy * dy) + 1;
            p.vx += (-dy / d) * 0.5 + (dx / d) * 0.04;
            p.vy += (dx / d) * 0.5 + (dy / d) * 0.04;
            break;
          }
          case 'aurora': {
            const wave = Math.sin(frame * 0.01 + p.x * 0.005) * 0.16;
            p.vy += wave - 0.012;
            p.vx += 0.02;
            if (p.x > w + 10) {
              p.x = -10;
            }
            break;
          }
          case 'fireflies': {
            p.vx += (Math.random() - 0.5) * 0.09;
            p.vy += (Math.random() - 0.5) * 0.09;
            p.vx *= 0.97;
            p.vy *= 0.97;
            break;
          }
          default:
            break;
        }

        p.vx *= 0.995;
        p.vy *= 0.995;
        p.x += p.vx;
        p.y += p.vy;

        // wrap (galaxy / blackhole keep their structure)
        if (c.mode !== 'galaxy' && c.mode !== 'blackhole') {
          if (p.x < -12) p.x = w + 12;
          else if (p.x > w + 12) p.x = -12;
          if (p.y < -12) p.y = h + 12;
          else if (p.y > h + 12) p.y = -12;
        }

        // alpha lifecycle (fade in/out at the ends of life)
        const lr = p.life / p.maxLife;
        if (lr > 0.9) p.alpha = (1 - lr) * 10;
        else if (lr < 0.18) p.alpha = lr * 5.5;
        else p.alpha = 1;
        if (c.mode === 'fireflies') {
          p.alpha *= 0.45 + 0.55 * Math.sin(frame * 0.05 + p.x * 0.02);
        }
        if (energy > 0) p.alpha = Math.min(1, p.alpha * (1 + energy));

        // draw
        const al = Math.max(0, p.alpha);
        if (al > 0.01) {
          if (c.glow) {
            const r = p.size * (5.5 + energy * 3);
            ctx.globalAlpha = al;
            ctx.drawImage(spritesRef.current[p.ci] ?? spritesRef.current[0], p.x - r, p.y - r, r * 2, r * 2);
          } else {
            const pal2 = pal.colors[p.ci % pal.colors.length];
            ctx.globalAlpha = al;
            ctx.fillStyle = `hsl(${pal2[0]}, ${pal2[1]}%, ${pal2[2]}%)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, TAU);
            ctx.fill();
          }
        }

        if (p.life <= 0) spawn(p, w, h);
      }

      // sparks (supernova debris)
      ctx.globalCompositeOperation = 'lighter';
      const sparks = sparksRef.current;
      const sprite = sparkSpriteRef.current ?? spritesRef.current[0];
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life--;
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.x += s.vx;
        s.y += s.vy;
        const lr = s.life / s.maxLife;
        const al = lr < 0.25 ? lr * 4 : 1;
        const r = s.size * 5;
        ctx.globalAlpha = Math.max(0, al);
        ctx.drawImage(sprite, s.x - r, s.y - r, r * 2, r * 2);
        if (s.life <= 0) {
          sparks[i] = sparks[sparks.length - 1];
          sparks.pop();
        }
      }

      // shockwave rings
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const rings = ringsRef.current;
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        rg.t++;
        const prog = rg.t / rg.max;
        if (prog >= 1) {
          rings[i] = rings[rings.length - 1];
          rings.pop();
          continue;
        }
        const radius = prog * 170;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, radius, 0, TAU);
        ctx.strokeStyle = `hsla(${rg.hue}, 100%, 70%, ${(1 - prog) * 0.55})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // stats ~5x/sec
      if (now - lastStats > 200) {
        lastStats = now;
        statsCb.current?.({
          fps: Math.round(emaFps),
          count: field.length,
          supernovae: snRef.current,
          tier: deviceRef.current.tier,
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none select-none"
      style={{ background: getPalette(settings.palette).bg, cursor: settings.pointerMode === 'repel' ? 'cell' : 'crosshair' }}
    />
  );
});

export default CosmicCanvas;
