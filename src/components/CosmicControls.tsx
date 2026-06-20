'use client';

/**
 * CosmicControls — purely presentational control surface.
 *
 * It renders the same widgets whether it lives inside the desktop glass panel
 * or the mobile bottom sheet; the parent decides the container. All state and
 * side effects live in page.tsx — this component only reads `settings` and
 * calls back. Touch targets are >= 44px so it stays thumb-friendly on phones.
 */

import React from 'react';
import {
  Sparkles,
  Tornado,
  Waves,
  Bug,
  CircleDot,
  Share2,
  Wind,
  Magnet,
  Zap,
  Play,
  Pause,
  Camera,
  Link2,
  Maximize,
  RotateCcw,
  Mic,
  MicOff,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import {
  MODES,
  PALETTES,
  PRESETS,
  PARAM_RANGES,
  getPalette,
  type CosmicSettings,
  type ModeId,
} from '@/lib/cosmic';

const MODE_ICONS: Record<ModeId, LucideIcon> = {
  nebula: Sparkles,
  galaxy: Tornado,
  aurora: Waves,
  fireflies: Bug,
  blackhole: CircleDot,
  constellation: Share2,
  vortex: Wind,
};

export interface ControlActions {
  surprise: () => void;
  capture: () => void;
  share: () => void;
  fullscreen: () => void;
  reset: () => void;
}

interface Props {
  settings: CosmicSettings;
  update: (partial: Partial<CosmicSettings>) => void;
  applyPresetById: (id: string) => void;
  actions: ControlActions;
}

/* ---------------- small building blocks ---------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-[10px] uppercase tracking-[0.22em] text-white/40">{title}</div>
      {children}
    </div>
  );
}

function GlowSlider({
  value,
  min,
  max,
  step,
  onChange,
  color,
  label,
  display,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color: string;
  label: string;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</span>
        <span className="font-mono text-[10px] text-white/35">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="cosmic-range h-9 w-full cursor-pointer appearance-none bg-transparent"
        style={{
          // expose fill % + accent to the CSS in globals
          ['--pct' as string]: `${pct}%`,
          ['--accent' as string]: color,
        }}
      />
    </div>
  );
}

function Toggle({
  on,
  onToggle,
  iconOn,
  iconOff,
  label,
  accent,
}: {
  on: boolean;
  onToggle: () => void;
  iconOn: LucideIcon;
  iconOff: LucideIcon;
  label: string;
  accent: string;
}) {
  const Icon = on ? iconOn : iconOff;
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3.5 py-2 transition-colors"
      style={{
        borderColor: on ? accent : 'rgba(255,255,255,0.08)',
        background: on ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <span className="flex items-center gap-2 text-[11px] tracking-wide text-white/70">
        <Icon className="h-4 w-4" style={{ color: on ? accent : 'rgba(255,255,255,0.4)' }} />
        {label}
      </span>
      <span
        className="h-1.5 w-1.5 rounded-full transition-all"
        style={{ background: on ? accent : 'rgba(255,255,255,0.2)', boxShadow: on ? `0 0 8px ${accent}` : 'none' }}
      />
    </button>
  );
}

function ActionBtn({ icon: Icon, label, onClick, accent }: { icon: LucideIcon; label: string; onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] py-2 text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-95"
    >
      <Icon className="h-4 w-4" style={{ color: accent }} />
      <span className="text-[9px] uppercase tracking-wider">{label}</span>
    </button>
  );
}

/* ---------------- main component ---------------- */

export default function CosmicControls({ settings, update, applyPresetById, actions }: Props) {
  const pal = getPalette(settings.palette);
  const accent = pal.accent;

  return (
    <div className="space-y-5">
      {/* Presets */}
      <Section title="Presets">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPresetById(p.id)}
              className="min-h-[36px] shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[11px] tracking-wide text-white/60 transition-colors hover:border-white/25 hover:text-white active:scale-95"
            >
              {p.name}
            </button>
          ))}
        </div>
      </Section>

      {/* Modes */}
      <Section title="Visual Mode">
        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => {
            const Icon = MODE_ICONS[m.id];
            const active = settings.mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => update({ mode: m.id })}
                aria-pressed={active}
                title={m.description}
                className="flex min-h-[58px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 transition-all active:scale-95"
                style={{
                  borderColor: active ? accent : 'rgba(255,255,255,0.07)',
                  background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                  boxShadow: active ? `inset 0 0 18px ${accent}22` : 'none',
                }}
              >
                <Icon className="h-4 w-4" style={{ color: active ? accent : 'rgba(255,255,255,0.45)' }} />
                <span className="text-[9px] tracking-wide" style={{ color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Palettes */}
      <Section title="Palette">
        <div className="flex flex-wrap gap-2.5">
          {PALETTES.map((p) => {
            const active = settings.palette === p.id;
            return (
              <button
                key={p.id}
                onClick={() => update({ palette: p.id })}
                aria-pressed={active}
                title={p.name}
                className="group relative h-9 w-9 rounded-full transition-transform active:scale-90"
                style={{
                  background: `conic-gradient(${p.colors
                    .map(([h, s, l], i) => `hsl(${h} ${s}% ${l}%) ${(i / p.colors.length) * 360}deg ${((i + 1) / p.colors.length) * 360}deg`)
                    .join(', ')})`,
                  boxShadow: active ? `0 0 0 2px ${p.bg}, 0 0 0 3.5px ${p.accent}` : 'none',
                  transform: active ? 'scale(1.08)' : undefined,
                }}
              />
            );
          })}
        </div>
      </Section>

      {/* Sliders */}
      <Section title="Physics">
        <div className="space-y-4">
          <GlowSlider
            label="Density"
            value={settings.density}
            min={PARAM_RANGES.density.min}
            max={PARAM_RANGES.density.max}
            step={PARAM_RANGES.density.step}
            onChange={(v) => update({ density: v })}
            color={accent}
            display={`${Math.round(settings.density * 100)}%`}
          />
          <GlowSlider
            label="Gravity"
            value={settings.gravity}
            min={PARAM_RANGES.gravity.min}
            max={PARAM_RANGES.gravity.max}
            step={PARAM_RANGES.gravity.step}
            onChange={(v) => update({ gravity: v })}
            color={accent}
            display={settings.gravity.toFixed(1)}
          />
          <GlowSlider
            label="Trails"
            value={settings.trail}
            min={PARAM_RANGES.trail.min}
            max={PARAM_RANGES.trail.max}
            step={PARAM_RANGES.trail.step}
            onChange={(v) => update({ trail: v })}
            color={accent}
            display={String(settings.trail)}
          />
        </div>
      </Section>

      {/* Toggles */}
      <Section title="Field">
        <div className="grid grid-cols-2 gap-2">
          <Toggle
            on={settings.pointerMode === 'attract'}
            onToggle={() => update({ pointerMode: settings.pointerMode === 'attract' ? 'repel' : 'attract' })}
            iconOn={Magnet}
            iconOff={Zap}
            label={settings.pointerMode === 'attract' ? 'Attract' : 'Repel'}
            accent={accent}
          />
          <Toggle on={settings.glow} onToggle={() => update({ glow: !settings.glow })} iconOn={Sparkles} iconOff={Sparkles} label="Glow" accent={accent} />
          <Toggle on={settings.autopilot} onToggle={() => update({ autopilot: !settings.autopilot })} iconOn={Wand2} iconOff={Wand2} label="Autopilot" accent={accent} />
          <Toggle on={settings.audio} onToggle={() => update({ audio: !settings.audio })} iconOn={Mic} iconOff={MicOff} label="Sound" accent={accent} />
        </div>
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <div className="flex gap-2">
          <ActionBtn icon={settings.paused ? Play : Pause} label={settings.paused ? 'Play' : 'Pause'} onClick={() => update({ paused: !settings.paused })} accent={accent} />
          <ActionBtn icon={Wand2} label="Burst" onClick={actions.surprise} accent={accent} />
          <ActionBtn icon={Camera} label="Save" onClick={actions.capture} accent={accent} />
          <ActionBtn icon={Link2} label="Share" onClick={actions.share} accent={accent} />
          <ActionBtn icon={Maximize} label="Full" onClick={actions.fullscreen} accent={accent} />
          <ActionBtn icon={RotateCcw} label="Reset" onClick={actions.reset} accent={accent} />
        </div>
      </Section>
    </div>
  );
}
