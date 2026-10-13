import type { CrowdReaction, SoundCue } from "@/lib/baseball-game/audio/cues";

export type SoundBus = "sfx" | "crowd" | "music" | "voice";

export type SoundMix = {
  muted: boolean;
  master: number;
  sfx: number;
  crowd: number;
  music: number;
  /** Umpire calls; spoken by the device voice, or synthesized as a fallback. */
  voice: number;
};

export const DEFAULT_SOUND_MIX: SoundMix = {
  muted: false,
  master: 0.65,
  sfx: 0.9,
  crowd: 0.7,
  music: 0.6,
  voice: 0.9,
};

type NoiseLayer = {
  kind: "noise";
  bus?: SoundBus;
  delay?: number;
  duration: number;
  attack: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
};

type ToneLayer = {
  kind: "tone";
  bus?: SoundBus;
  delay?: number;
  duration: number;
  attack: number;
  gain: number;
  wave: OscillatorType;
  freq: number;
  freqEnd?: number;
};

type OrganLayer = {
  kind: "organ";
  notes: number[];
  step: number;
  hold: number;
  gain: number;
};

type Layer = NoiseLayer | ToneLayer | OrganLayer;

const C4 = 60;

// Synth patches: every sound is generated here, no recorded audio is used.
const SFX_PATCHES: Record<SoundCue, Layer[]> = {
  pitch: [
    {
      kind: "noise",
      duration: 0.32,
      attack: 0.18,
      gain: 0.16,
      filter: "bandpass",
      freq: 320,
      freqEnd: 2200,
      q: 1.4,
    },
  ],
  mitt: [
    {
      kind: "tone",
      duration: 0.09,
      attack: 0.002,
      gain: 0.5,
      wave: "sine",
      freq: 150,
      freqEnd: 70,
    },
    {
      kind: "noise",
      duration: 0.05,
      attack: 0.001,
      gain: 0.32,
      filter: "lowpass",
      freq: 1600,
    },
  ],
  bat_solid: [
    {
      kind: "noise",
      duration: 0.05,
      attack: 0.001,
      gain: 0.62,
      filter: "highpass",
      freq: 1800,
    },
    {
      kind: "tone",
      duration: 0.07,
      attack: 0.001,
      gain: 0.32,
      wave: "triangle",
      freq: 980,
      freqEnd: 520,
    },
    {
      kind: "tone",
      duration: 0.14,
      attack: 0.002,
      gain: 0.22,
      wave: "sine",
      freq: 230,
      freqEnd: 160,
    },
  ],
  bat_foul: [
    {
      kind: "noise",
      duration: 0.035,
      attack: 0.001,
      gain: 0.34,
      filter: "highpass",
      freq: 2600,
    },
    {
      kind: "tone",
      duration: 0.04,
      attack: 0.001,
      gain: 0.16,
      wave: "triangle",
      freq: 1500,
      freqEnd: 1100,
    },
  ],
  whiff: [
    {
      kind: "noise",
      duration: 0.26,
      attack: 0.08,
      gain: 0.14,
      filter: "bandpass",
      freq: 700,
      freqEnd: 180,
      q: 1.1,
    },
  ],
  bounce: [
    {
      kind: "tone",
      duration: 0.06,
      attack: 0.002,
      gain: 0.28,
      wave: "sine",
      freq: 120,
      freqEnd: 80,
    },
    {
      kind: "tone",
      delay: 0.2,
      duration: 0.05,
      attack: 0.002,
      gain: 0.18,
      wave: "sine",
      freq: 115,
      freqEnd: 80,
    },
  ],
  catch: [
    {
      kind: "tone",
      duration: 0.07,
      attack: 0.002,
      gain: 0.32,
      wave: "sine",
      freq: 170,
      freqEnd: 90,
    },
    {
      kind: "noise",
      duration: 0.04,
      attack: 0.001,
      gain: 0.2,
      filter: "lowpass",
      freq: 1800,
    },
  ],
  throw: [
    {
      kind: "noise",
      duration: 0.22,
      attack: 0.1,
      gain: 0.12,
      filter: "bandpass",
      freq: 500,
      freqEnd: 2600,
      q: 1.6,
    },
  ],
  slide: [
    {
      kind: "noise",
      duration: 0.45,
      attack: 0.02,
      gain: 0.2,
      filter: "lowpass",
      freq: 1400,
      freqEnd: 400,
    },
  ],
  out: [
    {
      kind: "tone",
      duration: 0.14,
      attack: 0.004,
      gain: 0.22,
      wave: "sine",
      freq: 95,
      freqEnd: 60,
    },
  ],
  score: [
    {
      kind: "organ",
      notes: [C4 + 12, C4 + 16, C4 + 19, C4 + 24],
      step: 0.11,
      hold: 0.32,
      gain: 0.12,
    },
  ],
  lock: [
    {
      kind: "tone",
      duration: 0.016,
      attack: 0.001,
      gain: 0.12,
      wave: "square",
      freq: 1900,
    },
    {
      kind: "tone",
      delay: 0.045,
      duration: 0.016,
      attack: 0.001,
      gain: 0.09,
      wave: "square",
      freq: 1250,
    },
  ],
  card_basic: [
    {
      kind: "tone",
      duration: 0.09,
      attack: 0.004,
      gain: 0.12,
      wave: "triangle",
      freq: 880,
    },
    {
      kind: "tone",
      delay: 0.09,
      duration: 0.12,
      attack: 0.004,
      gain: 0.12,
      wave: "triangle",
      freq: 1320,
    },
  ],
  card_intermediate: [
    {
      kind: "tone",
      duration: 0.08,
      attack: 0.004,
      gain: 0.12,
      wave: "triangle",
      freq: 660,
    },
    {
      kind: "tone",
      delay: 0.08,
      duration: 0.08,
      attack: 0.004,
      gain: 0.12,
      wave: "triangle",
      freq: 880,
    },
    {
      kind: "tone",
      delay: 0.16,
      duration: 0.16,
      attack: 0.004,
      gain: 0.13,
      wave: "triangle",
      freq: 1320,
    },
  ],
  card_advanced: [
    {
      kind: "noise",
      duration: 0.7,
      attack: 0.5,
      gain: 0.08,
      filter: "bandpass",
      freq: 300,
      freqEnd: 3200,
      q: 2,
    },
    {
      kind: "tone",
      delay: 0.42,
      duration: 0.6,
      attack: 0.02,
      gain: 0.08,
      wave: "sawtooth",
      freq: 220,
    },
    {
      kind: "tone",
      delay: 0.42,
      duration: 0.6,
      attack: 0.02,
      gain: 0.07,
      wave: "sawtooth",
      freq: 330,
    },
    {
      kind: "tone",
      delay: 0.42,
      duration: 0.6,
      attack: 0.02,
      gain: 0.06,
      wave: "sawtooth",
      freq: 440,
    },
  ],
  organ_inning: [
    {
      kind: "organ",
      notes: [C4 + 7, C4 + 12, C4 + 16, C4 + 19, C4 + 16, C4 + 19],
      step: 0.15,
      hold: 0.5,
      gain: 0.11,
    },
  ],
  walk_off: [
    {
      kind: "organ",
      notes: [C4, C4 + 4, C4 + 7, C4 + 12, C4 + 16, C4 + 19, C4 + 24],
      step: 0.09,
      hold: 1.2,
      gain: 0.12,
    },
  ],
  game_end: [
    {
      kind: "organ",
      notes: [C4 + 12, C4 + 7, C4 + 4, C4 + 12],
      step: 0.28,
      hold: 1,
      gain: 0.1,
    },
  ],
  tick: [
    {
      kind: "tone",
      duration: 0.03,
      attack: 0.002,
      gain: 0.1,
      wave: "sine",
      freq: 1000,
    },
  ],
  tick_final: [
    {
      kind: "tone",
      duration: 0.04,
      attack: 0.002,
      gain: 0.16,
      wave: "sine",
      freq: 1500,
    },
  ],
  reaction: [
    {
      kind: "tone",
      duration: 0.07,
      attack: 0.004,
      gain: 0.1,
      wave: "triangle",
      freq: 740,
    },
    {
      kind: "tone",
      delay: 0.07,
      duration: 0.1,
      attack: 0.004,
      gain: 0.09,
      wave: "triangle",
      freq: 990,
    },
  ],
  your_turn: [
    {
      kind: "tone",
      duration: 0.18,
      attack: 0.01,
      gain: 0.1,
      wave: "sine",
      freq: 660,
    },
    {
      kind: "tone",
      delay: 0.16,
      duration: 0.28,
      attack: 0.01,
      gain: 0.1,
      wave: "sine",
      freq: 880,
    },
  ],
  bat_crush: [
    {
      kind: "noise",
      duration: 0.07,
      attack: 0.001,
      gain: 0.78,
      filter: "highpass",
      freq: 1500,
    },
    {
      kind: "tone",
      duration: 0.09,
      attack: 0.001,
      gain: 0.38,
      wave: "triangle",
      freq: 1150,
      freqEnd: 480,
    },
    {
      kind: "tone",
      duration: 0.26,
      attack: 0.002,
      gain: 0.3,
      wave: "sine",
      freq: 190,
      freqEnd: 110,
    },
    {
      kind: "noise",
      delay: 0.05,
      duration: 0.45,
      attack: 0.02,
      gain: 0.07,
      filter: "bandpass",
      freq: 2800,
      q: 0.8,
    },
  ],
  bat_dull: [
    {
      kind: "noise",
      duration: 0.06,
      attack: 0.001,
      gain: 0.46,
      filter: "lowpass",
      freq: 1900,
    },
    {
      kind: "tone",
      duration: 0.12,
      attack: 0.002,
      gain: 0.3,
      wave: "sine",
      freq: 270,
      freqEnd: 140,
    },
  ],
  bat_pop: [
    {
      kind: "noise",
      duration: 0.04,
      attack: 0.001,
      gain: 0.3,
      filter: "bandpass",
      freq: 1400,
      q: 1.2,
    },
    {
      kind: "tone",
      duration: 0.05,
      attack: 0.001,
      gain: 0.18,
      wave: "triangle",
      freq: 720,
      freqEnd: 410,
    },
  ],
  catch_far: [
    {
      kind: "tone",
      duration: 0.06,
      attack: 0.002,
      gain: 0.16,
      wave: "sine",
      freq: 165,
      freqEnd: 95,
    },
    {
      kind: "tone",
      delay: 0.12,
      duration: 0.05,
      attack: 0.002,
      gain: 0.06,
      wave: "sine",
      freq: 160,
      freqEnd: 95,
    },
  ],
  fence: [
    {
      kind: "tone",
      delay: 0.35,
      duration: 0.26,
      attack: 0.003,
      gain: 0.34,
      wave: "sine",
      freq: 72,
      freqEnd: 44,
    },
    {
      kind: "noise",
      delay: 0.35,
      duration: 0.3,
      attack: 0.004,
      gain: 0.2,
      filter: "lowpass",
      freq: 420,
    },
  ],
  strikeout: [
    {
      kind: "tone",
      duration: 0.08,
      attack: 0.004,
      gain: 0.12,
      wave: "triangle",
      freq: 523,
    },
    {
      kind: "tone",
      delay: 0.09,
      duration: 0.08,
      attack: 0.004,
      gain: 0.12,
      wave: "triangle",
      freq: 659,
    },
    {
      kind: "tone",
      delay: 0.18,
      duration: 0.22,
      attack: 0.004,
      gain: 0.14,
      wave: "triangle",
      freq: 880,
    },
  ],
  // Fallback umpire calls: each has its own contour so they stay distinct
  // on devices without a Korean speech voice.
  ump_play: [
    {
      kind: "tone",
      bus: "voice",
      duration: 0.16,
      attack: 0.01,
      gain: 0.14,
      wave: "sawtooth",
      freq: 330,
      freqEnd: 440,
    },
    {
      kind: "tone",
      bus: "voice",
      delay: 0.18,
      duration: 0.26,
      attack: 0.01,
      gain: 0.14,
      wave: "sawtooth",
      freq: 440,
      freqEnd: 400,
    },
  ],
  ump_strike: [
    {
      kind: "tone",
      bus: "voice",
      duration: 0.12,
      attack: 0.008,
      gain: 0.13,
      wave: "sawtooth",
      freq: 300,
      freqEnd: 420,
    },
    {
      kind: "tone",
      bus: "voice",
      delay: 0.13,
      duration: 0.2,
      attack: 0.008,
      gain: 0.13,
      wave: "sawtooth",
      freq: 420,
      freqEnd: 360,
    },
  ],
  ump_ball: [
    {
      kind: "tone",
      bus: "voice",
      duration: 0.18,
      attack: 0.01,
      gain: 0.09,
      wave: "sawtooth",
      freq: 240,
      freqEnd: 200,
    },
  ],
  ump_out: [
    {
      kind: "tone",
      bus: "voice",
      duration: 0.1,
      attack: 0.006,
      gain: 0.15,
      wave: "sawtooth",
      freq: 260,
      freqEnd: 230,
    },
    {
      kind: "tone",
      bus: "voice",
      delay: 0.13,
      duration: 0.18,
      attack: 0.006,
      gain: 0.15,
      wave: "sawtooth",
      freq: 230,
      freqEnd: 170,
    },
  ],
  ump_safe: [
    {
      kind: "tone",
      bus: "voice",
      duration: 0.12,
      attack: 0.008,
      gain: 0.12,
      wave: "sawtooth",
      freq: 360,
      freqEnd: 300,
    },
    {
      kind: "tone",
      bus: "voice",
      delay: 0.14,
      duration: 0.26,
      attack: 0.008,
      gain: 0.12,
      wave: "sawtooth",
      freq: 300,
      freqEnd: 300,
    },
  ],
  ump_strikeout: [
    {
      kind: "tone",
      bus: "voice",
      duration: 0.14,
      attack: 0.008,
      gain: 0.15,
      wave: "sawtooth",
      freq: 320,
      freqEnd: 460,
    },
    {
      kind: "tone",
      bus: "voice",
      delay: 0.16,
      duration: 0.14,
      attack: 0.008,
      gain: 0.15,
      wave: "sawtooth",
      freq: 460,
      freqEnd: 400,
    },
    {
      kind: "tone",
      bus: "voice",
      delay: 0.34,
      duration: 0.3,
      attack: 0.008,
      gain: 0.15,
      wave: "sawtooth",
      freq: 260,
      freqEnd: 180,
    },
  ],
  timeout_call: [
    {
      kind: "tone",
      duration: 0.5,
      attack: 0.01,
      gain: 0.08,
      wave: "sine",
      freq: 2900,
      freqEnd: 2700,
    },
    {
      kind: "tone",
      duration: 0.5,
      attack: 0.01,
      gain: 0.05,
      wave: "square",
      freq: 2950,
      freqEnd: 2750,
    },
  ],
};

const CROWD_PATCHES: Record<CrowdReaction, Layer[]> = {
  rise: [
    {
      kind: "noise",
      bus: "crowd",
      duration: 1.3,
      attack: 0.9,
      gain: 0.22,
      filter: "bandpass",
      freq: 420,
      freqEnd: 1300,
      q: 0.6,
    },
  ],
  cheer: [
    {
      kind: "noise",
      bus: "crowd",
      duration: 2.2,
      attack: 0.12,
      gain: 0.34,
      filter: "bandpass",
      freq: 950,
      q: 0.55,
    },
    {
      kind: "noise",
      bus: "crowd",
      duration: 1.6,
      attack: 0.1,
      gain: 0.1,
      filter: "highpass",
      freq: 3200,
    },
  ],
  roar: [
    {
      kind: "noise",
      bus: "crowd",
      duration: 3.6,
      attack: 0.15,
      gain: 0.48,
      filter: "bandpass",
      freq: 850,
      q: 0.45,
    },
    {
      kind: "noise",
      bus: "crowd",
      duration: 3.2,
      attack: 0.2,
      gain: 0.22,
      filter: "lowpass",
      freq: 320,
    },
    {
      kind: "noise",
      bus: "crowd",
      duration: 2.4,
      attack: 0.1,
      gain: 0.12,
      filter: "highpass",
      freq: 3400,
    },
  ],
  groan: [
    {
      kind: "noise",
      bus: "crowd",
      duration: 1.5,
      attack: 0.1,
      gain: 0.26,
      filter: "lowpass",
      freq: 950,
      freqEnd: 240,
    },
  ],
  gasp: [
    {
      kind: "noise",
      bus: "crowd",
      duration: 0.6,
      attack: 0.06,
      gain: 0.18,
      filter: "bandpass",
      freq: 1250,
      q: 0.8,
    },
  ],
};

/** Whistles scattered through cheers so a crowd never sounds like plain noise. */
const CHEER_WHISTLES: Record<CrowdReaction, number> = {
  rise: 0,
  cheer: 2,
  roar: 5,
  groan: 0,
  gasp: 0,
};

const AMBIENCE = {
  minGain: 0.035,
  tensionGain: 0.07,
  minFreq: 520,
  tensionFreq: 420,
  driftMs: 1_800,
  driftDepth: 0.18,
};

const HEARTBEAT = {
  minBpm: 62,
  tensionBpm: 42,
  gain: 0.2,
  minTensionShare: 0.35,
  dubDelay: 0.19,
};

const DUCK = { depth: 0.55, release: 0.35 };

function midiToHz(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

export class SoundscapeEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly buses: Record<SoundBus, GainNode>;
  private readonly crowdDuck: GainNode;
  private readonly noise: AudioBuffer;
  private ambienceGain: GainNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private tension = 0;
  private heartbeat = false;

  static create(): SoundscapeEngine | null {
    if (typeof window === "undefined" || !window.AudioContext) return null;
    return new SoundscapeEngine(new window.AudioContext());
  }

  private constructor(context: AudioContext) {
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    this.crowdDuck = context.createGain();
    this.crowdDuck.connect(this.master);
    this.buses = {
      sfx: context.createGain(),
      crowd: context.createGain(),
      music: context.createGain(),
      voice: context.createGain(),
    };
    this.buses.voice.connect(this.master);
    this.buses.sfx.connect(this.master);
    this.buses.music.connect(this.master);
    this.buses.crowd.connect(this.crowdDuck);
    this.noise = this.createNoiseBuffer();
    this.startAmbience();
  }

  resume() {
    if (this.context.state === "suspended") void this.context.resume();
  }

  suspend() {
    if (this.context.state === "running") void this.context.suspend();
  }

  close() {
    if (this.driftTimer) clearInterval(this.driftTimer);
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.ambienceSource?.stop();
    void this.context.close();
  }

  setMix(mix: SoundMix) {
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(mix.muted ? 0 : mix.master, now, 0.05);
    this.buses.sfx.gain.setTargetAtTime(mix.sfx, now, 0.05);
    this.buses.crowd.gain.setTargetAtTime(mix.crowd, now, 0.05);
    this.buses.music.gain.setTargetAtTime(mix.music, now, 0.05);
    this.buses.voice.gain.setTargetAtTime(mix.voice, now, 0.05);
  }

  setTension(value: number) {
    this.tension = Math.min(1, Math.max(0, value));
    this.applyAmbience(1);
  }

  setHeartbeat(active: boolean) {
    if (active === this.heartbeat) return;
    this.heartbeat = active;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (active) this.scheduleHeartbeat();
  }

  play(cue: SoundCue) {
    this.resume();
    this.duckCrowd();
    for (const layer of SFX_PATCHES[cue]) this.playLayer(layer);
  }

  crowd(reaction: CrowdReaction) {
    this.resume();
    for (const layer of CROWD_PATCHES[reaction]) this.playLayer(layer);
    for (let index = 0; index < CHEER_WHISTLES[reaction]; index += 1) {
      this.playLayer({
        kind: "tone",
        bus: "crowd",
        delay: 0.15 + Math.random() * 1.4,
        duration: 0.25 + Math.random() * 0.3,
        attack: 0.03,
        gain: 0.025,
        wave: "sine",
        freq: 2300 + Math.random() * 1200,
        freqEnd: 2600 + Math.random() * 1200,
      });
    }
  }

  private createNoiseBuffer() {
    const seconds = 2;
    const buffer = this.context.createBuffer(
      1,
      this.context.sampleRate * seconds,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private startAmbience() {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.7;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2800;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source
      .connect(filter)
      .connect(lowpass)
      .connect(gain)
      .connect(this.buses.crowd);
    source.start();
    this.ambienceSource = source;
    this.ambienceFilter = filter;
    this.ambienceGain = gain;
    this.applyAmbience(1);
    this.driftTimer = setInterval(() => {
      const drift = 1 + (Math.random() * 2 - 1) * AMBIENCE.driftDepth;
      this.applyAmbience(drift);
    }, AMBIENCE.driftMs);
  }

  private applyAmbience(drift: number) {
    if (!this.ambienceGain || !this.ambienceFilter) return;
    const now = this.context.currentTime;
    const gain =
      (AMBIENCE.minGain + AMBIENCE.tensionGain * this.tension) * drift;
    this.ambienceGain.gain.setTargetAtTime(gain, now, 0.6);
    this.ambienceFilter.frequency.setTargetAtTime(
      AMBIENCE.minFreq + AMBIENCE.tensionFreq * this.tension,
      now,
      0.8,
    );
  }

  private scheduleHeartbeat() {
    if (!this.heartbeat) return;
    const level =
      HEARTBEAT.gain *
      (HEARTBEAT.minTensionShare +
        (1 - HEARTBEAT.minTensionShare) * this.tension);
    this.playLayer({
      kind: "tone",
      bus: "music",
      duration: 0.1,
      attack: 0.004,
      gain: level,
      wave: "sine",
      freq: 58,
      freqEnd: 44,
    });
    this.playLayer({
      kind: "tone",
      bus: "music",
      delay: HEARTBEAT.dubDelay,
      duration: 0.09,
      attack: 0.004,
      gain: level * 0.7,
      wave: "sine",
      freq: 52,
      freqEnd: 40,
    });
    const bpm = HEARTBEAT.minBpm + HEARTBEAT.tensionBpm * this.tension;
    this.heartbeatTimer = setTimeout(
      () => this.scheduleHeartbeat(),
      60_000 / bpm,
    );
  }

  private duckCrowd() {
    const now = this.context.currentTime;
    const gain = this.crowdDuck.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(DUCK.depth, now + 0.02);
    gain.setTargetAtTime(1, now + 0.12, DUCK.release);
  }

  private playLayer(layer: Layer) {
    if (layer.kind === "organ") {
      layer.notes.forEach((note, index) => {
        const last = index === layer.notes.length - 1;
        this.playOrganNote(
          midiToHz(note),
          index * layer.step,
          last ? layer.hold : layer.step * 1.1,
          layer.gain,
        );
      });
      return;
    }
    const start = this.context.currentTime + (layer.delay ?? 0);
    const end = start + layer.duration;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      layer.gain,
      start + layer.attack,
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(this.buses[layer.bus ?? "sfx"]);

    if (layer.kind === "noise") {
      const source = this.context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = layer.filter;
      filter.Q.value = layer.q ?? 0.7;
      filter.frequency.setValueAtTime(layer.freq, start);
      if (layer.freqEnd) {
        filter.frequency.exponentialRampToValueAtTime(layer.freqEnd, end);
      }
      source.connect(filter).connect(envelope);
      source.start(start, Math.random() * 1.5);
      source.stop(end + 0.05);
      return;
    }
    const oscillator = this.context.createOscillator();
    oscillator.type = layer.wave;
    oscillator.frequency.setValueAtTime(layer.freq, start);
    if (layer.freqEnd) {
      oscillator.frequency.exponentialRampToValueAtTime(layer.freqEnd, end);
    }
    oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  }

  /** Drawbar-style organ: fundamental plus two quieter harmonics. */
  private playOrganNote(hz: number, delay: number, hold: number, gain: number) {
    for (const [ratio, share] of [
      [1, 1],
      [2, 0.45],
      [3, 0.2],
    ] as const) {
      this.playLayer({
        kind: "tone",
        bus: "music",
        delay,
        duration: hold,
        attack: 0.012,
        gain: gain * share,
        wave: "sine",
        freq: hz * ratio,
      });
    }
  }
}
