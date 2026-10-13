import type { SoundCue, UmpireCall } from "@/lib/baseball-game/audio/cues";

type Phrase = { text: string; rate: number; pitch: number };

// Rate and pitch shape each call: big calls are drawn out, routine ones clipped.
const PHRASES: Record<UmpireCall, Phrase> = {
  play_ball: { text: "플레이 볼!", rate: 1.05, pitch: 0.9 },
  strike: { text: "스트라이크!", rate: 1.15, pitch: 0.95 },
  strikeout: { text: "스트라이크 아웃!", rate: 1.0, pitch: 0.85 },
  ball: { text: "볼", rate: 1.2, pitch: 0.9 },
  walk: { text: "볼넷", rate: 1.05, pitch: 0.9 },
  hit_by_pitch: { text: "몸에 맞는 공", rate: 1.1, pitch: 0.9 },
  foul: { text: "파울", rate: 1.2, pitch: 1.0 },
  out: { text: "아웃!", rate: 1.1, pitch: 0.8 },
  safe: { text: "세이프!", rate: 1.05, pitch: 1.0 },
  home_run: { text: "홈런!", rate: 0.95, pitch: 1.05 },
  game_set: { text: "게임 셋!", rate: 1.0, pitch: 0.85 },
};

/** Synthesized stand-ins for devices without a Korean speech voice. */
export const FALLBACK_CALLS: Record<UmpireCall, SoundCue | null> = {
  play_ball: "ump_play",
  strike: "ump_strike",
  strikeout: "ump_strikeout",
  ball: "ump_ball",
  walk: "ump_ball",
  hit_by_pitch: "ump_ball",
  foul: null,
  out: "ump_out",
  safe: "ump_safe",
  home_run: null,
  game_set: null,
};

export function umpirePhrase(call: UmpireCall) {
  return PHRASES[call].text;
}

function pickKoreanVoice(voices: SpeechSynthesisVoice[]) {
  const korean = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith("ko"),
  );
  return korean.find((voice) => voice.localService) ?? korean[0] ?? null;
}

export class UmpireVoice {
  private voice: SpeechSynthesisVoice | null = null;

  static create(): UmpireVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return null;
    }
    return new UmpireVoice();
  }

  private constructor() {
    const load = () => {
      this.voice = pickKoreanVoice(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  get available() {
    return this.voice !== null;
  }

  /** Speaks the call now, cutting off a stale one. False when no voice. */
  speak(call: UmpireCall, volume: number) {
    if (!this.voice) return false;
    const phrase = PHRASES[call];
    const utterance = new SpeechSynthesisUtterance(phrase.text);
    utterance.voice = this.voice;
    utterance.lang = this.voice.lang;
    utterance.rate = phrase.rate;
    utterance.pitch = phrase.pitch;
    utterance.volume = Math.min(1, Math.max(0, volume));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  /**
   * iOS only lets speech start from a user gesture, so a silent utterance is
   * spoken while unlocking; later calls from scene beats are then allowed.
   */
  prime() {
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  }

  cancel() {
    window.speechSynthesis.cancel();
  }
}
