'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Settings2, X, Gauge, Sparkle } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  decodeSettings,
  encodeSettings,
  applyPreset,
  getPalette,
  MODES,
  PRESETS,
  type CosmicSettings,
} from '@/lib/cosmic';
import type { CosmicCanvasHandle, CosmicStats } from '@/components/CosmicCanvas';
import CosmicControls, { type ControlActions } from '@/components/CosmicControls';

const CosmicCanvas = dynamic(() => import('@/components/CosmicCanvas'), { ssr: false });

const STORAGE_KEY = 'cosmic-nebula:settings';

export default function Home() {
  const [settings, setSettings] = useState<CosmicSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<CosmicStats>({ fps: 60, count: 0, supernovae: 0, tier: 'high' });
  const [isMobile, setIsMobile] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [mounted, setMounted] = useState(false);

  const canvasRef = useRef<CosmicCanvasHandle>(null);
  const hashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- hydrate from URL hash / localStorage ---------- */
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 767px)');
    const cp = window.matchMedia('(pointer: coarse)');
    const applyMq = () => {
      setIsMobile(mq.matches);
      setCoarse(cp.matches);
      setControlsOpen(!mq.matches); // open by default on desktop, closed on mobile
    };
    applyMq();
    mq.addEventListener('change', applyMq);

    let next = { ...DEFAULT_SETTINGS };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) next = { ...next, ...JSON.parse(saved) };
    } catch {}
    const fromHash = decodeSettings(window.location.hash);
    next = { ...next, ...fromHash };
    next.paused = false;
    next.audio = false; // never auto-request the mic on load
    setSettings(next);

    const introT = setTimeout(() => setShowIntro(false), 3200);
    const hintT = setTimeout(() => setShowHint(true), 3400);
    const hintHide = setTimeout(() => setShowHint(false), 8200);
    return () => {
      mq.removeEventListener('change', applyMq);
      clearTimeout(introT);
      clearTimeout(hintT);
      clearTimeout(hintHide);
    };
  }, []);

  /* ---------- persist ---------- */
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    if (hashTimer.current) clearTimeout(hashTimer.current);
    hashTimer.current = setTimeout(() => {
      const url = `${window.location.pathname}#${encodeSettings(settings)}`;
      window.history.replaceState(null, '', url);
    }, 400);
  }, [settings, mounted]);

  const update = useCallback((partial: Partial<CosmicSettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
  }, []);

  const applyPresetById = useCallback((id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setSettings((s) => applyPreset(s, preset));
    toast(`${preset.name}`, { description: 'Preset applied' });
  }, []);

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    setShowHint(false);
  }, []);

  /* ---------- actions ---------- */
  const actions: ControlActions = {
    surprise: () => canvasRef.current?.surprise(),
    reset: () => {
      canvasRef.current?.reset();
      toast('Field reset');
    },
    capture: () => {
      const url = canvasRef.current?.capture();
      if (!url) {
        toast.error('Could not capture frame');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = `cosmic-nebula-${Date.now()}.png`;
      a.click();
      toast('Saved', { description: 'Image downloaded' });
    },
    share: async () => {
      const link = `${window.location.origin}${window.location.pathname}#${encodeSettings(settings)}`;
      const shareData = { title: 'Cosmic Nebula', text: 'A particle universe I made', url: link };
      try {
        if (navigator.share && coarse) {
          await navigator.share(shareData);
          return;
        }
        await navigator.clipboard.writeText(link);
        toast('Link copied', { description: 'Share your universe' });
      } catch {
        toast.error('Could not share');
      }
    },
    fullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    },
  };

  const onStats = useCallback((s: CosmicStats) => setStats(s), []);
  const onAudioError = useCallback(() => {
    setSettings((s) => ({ ...s, audio: false }));
    toast.error('Microphone unavailable');
  }, []);

  /* ---------- keyboard shortcuts (desktop) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const mode = MODES.find((m) => m.key === e.key);
      if (mode) return update({ mode: mode.id });
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          update({ paused: !settings.paused });
          break;
        case 'g':
          update({ glow: !settings.glow });
          break;
        case 'p':
          update({ autopilot: !settings.autopilot });
          break;
        case 'r':
          update({ pointerMode: settings.pointerMode === 'attract' ? 'repel' : 'attract' });
          break;
        case 'c':
          setControlsOpen((o) => !o);
          break;
        case 'b':
          actions.surprise();
          break;
        case 'f':
          actions.fullscreen();
          break;
        case 's':
          actions.capture();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.paused, settings.glow, settings.autopilot, settings.pointerMode]);

  const pal = getPalette(settings.palette);
  const activeMode = MODES.find((m) => m.id === settings.mode);

  return (
    <div
      className="relative h-dvh w-full overflow-hidden"
      style={{ background: pal.bg }}
      onPointerDown={dismissIntro}
    >
      <CosmicCanvas ref={canvasRef} settings={settings} onStats={onStats} onFirstInteraction={dismissIntro} onAudioError={onAudioError} />

      {/* vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{ background: 'radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)' }}
      />

      {/* ---------- intro ---------- */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 1.1 }}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          >
            <div className="text-center">
              <motion.h1
                initial={{ letterSpacing: '0.05em', opacity: 0 }}
                animate={{ letterSpacing: '0.32em', opacity: 1 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
                className="text-5xl font-extralight text-white/90 md:text-8xl"
              >
                COSMIC
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 1 }}
                className="mt-3 text-[10px] uppercase tracking-[0.45em] text-white/40 md:text-sm"
              >
                Interactive Particle Universe
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- top bar ---------- */}
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.7 }}
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(0.9rem,env(safe-area-inset-top))] md:px-6"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: pal.accent, boxShadow: `0 0 10px ${pal.accent}` }} />
          <span className="text-[11px] font-light uppercase tracking-[0.28em] text-white/65">Cosmic Nebula</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-3 rounded-full border border-white/[0.07] bg-black/30 px-3.5 py-1.5 backdrop-blur-md sm:flex">
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/45">
              <Gauge className="h-3 w-3" />
              {stats.fps} fps
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="font-mono text-[10px] text-white/45">{stats.count.toLocaleString()} stars</span>
            {stats.supernovae > 0 && (
              <>
                <span className="h-3 w-px bg-white/10" />
                <span className="flex items-center gap-1 font-mono text-[10px] text-amber-300/60">
                  <Sparkle className="h-3 w-3" />
                  {stats.supernovae}
                </span>
              </>
            )}
            <span className="h-3 w-px bg-white/10" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">{stats.tier}</span>
          </div>
          <button
            onClick={() => setControlsOpen((o) => !o)}
            aria-label="Toggle controls"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/60 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
          >
            {controlsOpen && !isMobile ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
          </button>
        </div>
      </motion.header>

      {/* ---------- hint ---------- */}
      <AnimatePresence>
        {showHint && !controlsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mt-16 flex justify-center md:mt-24"
          >
            <span className="rounded-full border border-white/[0.06] bg-black/30 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-white/45 backdrop-blur-md">
              {coarse ? 'Drag to attract · Tap to ignite' : 'Move to attract · Click to ignite'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- mode label ---------- */}
      <AnimatePresence mode="wait">
        <motion.div
          key={settings.mode}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4 }}
          className="pointer-events-none absolute inset-x-0 bottom-[max(1.2rem,env(safe-area-inset-bottom))] z-10 flex justify-center"
        >
          <span className="rounded-full border border-white/[0.06] bg-black/25 px-4 py-1.5 text-[11px] tracking-[0.15em] text-white/40 backdrop-blur-md">
            {activeMode?.description}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* ---------- desktop panel ---------- */}
      <AnimatePresence>
        {controlsOpen && !isMobile && (
          <motion.aside
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="absolute right-4 top-[4.5rem] z-20 w-[300px] md:right-6"
          >
            <div className="cosmic-glass max-h-[calc(100dvh-6.5rem)] overflow-y-auto rounded-2xl p-5 [scrollbar-width:thin]">
              <CosmicControls settings={settings} update={update} applyPresetById={applyPresetById} actions={actions} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ---------- mobile bottom sheet ---------- */}
      {isMobile && (
        <>
          <AnimatePresence>
            {controlsOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setControlsOpen(false)}
                className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {controlsOpen && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 600) setControlsOpen(false);
                }}
                className="cosmic-glass absolute inset-x-0 bottom-0 z-40 max-h-[82dvh] overflow-y-auto rounded-t-3xl px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
              >
                <div className="sticky top-0 -mx-5 mb-3 flex justify-center bg-transparent pt-1">
                  <span className="h-1.5 w-10 rounded-full bg-white/20" />
                </div>
                <CosmicControls settings={settings} update={update} applyPresetById={applyPresetById} actions={actions} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* floating open button */}
          {!controlsOpen && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.4 }}
              onClick={() => setControlsOpen(true)}
              aria-label="Open controls"
              className="absolute bottom-[max(1.4rem,env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full border text-white shadow-lg backdrop-blur-md"
              style={{ borderColor: pal.accent, background: 'rgba(0,0,0,0.45)', boxShadow: `0 0 24px ${pal.accent}55` }}
            >
              <Settings2 className="h-5 w-5" style={{ color: pal.accent }} />
            </motion.button>
          )}
        </>
      )}
    </div>
  );
}
