"use client";

import { SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { useId, useState } from "react";

import type { BaseballSoundscape } from "./use-baseball-soundscape";

const BUS_LABELS = [
  ["sfx", "효과음"],
  ["crowd", "관중"],
  ["music", "음악"],
  ["voice", "심판 콜"],
] as const;

export function BaseballSoundControls({
  soundscape,
}: {
  soundscape: Pick<BaseballSoundscape, "mix" | "updateMix">;
}) {
  const { mix, updateMix } = soundscape;
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="bbg-sound" data-open={open}>
      <button
        aria-label={mix.muted ? "경기 음향 켜기" : "경기 음향 끄기"}
        aria-pressed={!mix.muted}
        className="bbg-sound-toggle"
        onClick={() => updateMix({ muted: !mix.muted })}
        type="button"
      >
        {mix.muted ? (
          <VolumeX aria-hidden="true" size={15} />
        ) : (
          <Volume2 aria-hidden="true" size={15} />
        )}
      </button>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="음향 세부 설정"
        className="bbg-sound-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={15} />
      </button>
      <div className="bbg-sound-panel" hidden={!open} id={panelId}>
        <SoundSlider
          label="전체"
          ariaLabel="경기 음향 볼륨"
          value={mix.master}
          onChange={(master) => updateMix({ master })}
        />
        {BUS_LABELS.map(([bus, label]) => (
          <SoundSlider
            ariaLabel={`${label} 볼륨`}
            key={bus}
            label={label}
            value={mix[bus]}
            onChange={(value) => updateMix({ [bus]: value })}
          />
        ))}
      </div>
    </div>
  );
}

function SoundSlider({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="bbg-sound-slider">
      <span>{label}</span>
      <input
        aria-label={ariaLabel}
        max="1"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.05"
        type="range"
        value={value}
      />
      <output>{Math.round(value * 100)}</output>
    </label>
  );
}
