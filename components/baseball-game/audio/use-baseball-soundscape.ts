"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getBeatSounds,
  getSceneAudioContext,
  type SoundCue,
  type SoundPerspective,
} from "@/lib/baseball-game/audio/cues";
import { getLeverage } from "@/lib/baseball-game/audio/leverage";
import type {
  GameView,
  PresentationBeat,
  PresentationScene,
} from "@/lib/baseball-game/types";

import {
  DEFAULT_SOUND_MIX,
  SoundscapeEngine,
  type SoundMix,
} from "./soundscape-engine";

export const SOUND_STORAGE_KEY = "bbg-broadcast-sound-v1";
export const VOLUME_STORAGE_KEY = "bbg-broadcast-volume-v1";
export const BUS_STORAGE_KEY = "bbg-sound-buses-v1";

type SoundscapeGame = Pick<
  GameView,
  | "eventLog"
  | "inning"
  | "half"
  | "outs"
  | "balls"
  | "strikes"
  | "bases"
  | "score"
  | "config"
  | "phase"
> & { pitchDuel?: { status: string } | null };

export type BaseballSoundscape = {
  mix: SoundMix;
  updateMix: (patch: Partial<SoundMix>) => void;
  onBeat: (beat: PresentationBeat, scene: PresentationScene) => void;
  playCue: (cue: SoundCue) => void;
};

export function readStoredMix(): SoundMix {
  const mix = { ...DEFAULT_SOUND_MIX };
  try {
    mix.muted = window.localStorage.getItem(SOUND_STORAGE_KEY) === "muted";
    const storedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const volume = Number(storedVolume);
    if (storedVolume !== null && volume >= 0 && volume <= 1) {
      mix.master = volume;
    }
    const buses = JSON.parse(
      window.localStorage.getItem(BUS_STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    for (const bus of ["sfx", "crowd", "music"] as const) {
      const value = Number(buses[bus]);
      if (buses[bus] !== undefined && value >= 0 && value <= 1) {
        mix[bus] = value;
      }
    }
  } catch {
    return mix;
  }
  return mix;
}

function storeMix(mix: SoundMix) {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, mix.muted ? "muted" : "on");
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(mix.master));
    window.localStorage.setItem(
      BUS_STORAGE_KEY,
      JSON.stringify({ sfx: mix.sfx, crowd: mix.crowd, music: mix.music }),
    );
  } catch {
    return;
  }
}

/**
 * Sounds follow the presentation beats instead of event arrival, so a result
 * is never heard before the scene shows it.
 */
export function useBaseballSoundscape({
  game,
  perspective,
  presenting,
}: {
  game: SoundscapeGame;
  perspective: SoundPerspective;
  presenting: boolean;
}): BaseballSoundscape {
  const engineRef = useRef<SoundscapeEngine | null>(null);
  const eventLogRef = useRef(game.eventLog);
  const [mix, setMix] = useState<SoundMix>(DEFAULT_SOUND_MIX);
  const mixRef = useRef(mix);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    eventLogRef.current = game.eventLog;
  }, [game.eventLog]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMix(readStoredMix()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (!engineRef.current) {
        engineRef.current = SoundscapeEngine.create();
        engineRef.current?.setMix(mixRef.current);
      }
      engineRef.current?.resume();
      setUnlocked(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) engineRef.current?.suspend();
      else engineRef.current?.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      engineRef.current?.close();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    mixRef.current = mix;
    engineRef.current?.setMix(mix);
  }, [mix]);

  const leverage = getLeverage(game);
  useEffect(() => {
    if (presenting || !unlocked) return;
    engineRef.current?.setTension(leverage);
  }, [leverage, presenting, unlocked]);

  const pitchLocked = game.pitchDuel?.status === "pitch_locked";
  useEffect(() => {
    engineRef.current?.setHeartbeat(unlocked && pitchLocked && !presenting);
  }, [pitchLocked, presenting, unlocked]);

  const updateMix = useCallback((patch: Partial<SoundMix>) => {
    setMix((current) => {
      const next = { ...current, ...patch };
      storeMix(next);
      return next;
    });
  }, []);

  const onBeat = useCallback(
    (beat: PresentationBeat, scene: PresentationScene) => {
      const engine = engineRef.current;
      if (!engine) return;
      const sounds = getBeatSounds(
        beat,
        getSceneAudioContext(scene, eventLogRef.current),
        perspective,
      );
      for (const cue of sounds.sfx) engine.play(cue);
      if (sounds.crowd) engine.crowd(sounds.crowd);
      if (sounds.sfx.includes("walk_off")) engine.crowd("roar");
    },
    [perspective],
  );

  const playCue = useCallback((cue: SoundCue) => {
    engineRef.current?.play(cue);
  }, []);

  return { mix, updateMix, onBeat, playCue };
}
