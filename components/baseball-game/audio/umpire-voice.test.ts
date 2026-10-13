import { afterEach, describe, expect, it, vi } from "vitest";

import { FALLBACK_CALLS, UmpireVoice, umpirePhrase } from "./umpire-voice";

function installSpeech(voices: Array<Partial<SpeechSynthesisVoice>>) {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => voices,
    speak,
    cancel,
    addEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      text: string;
      voice: unknown = null;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  return { speak, cancel };
}

describe("umpire voice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("speaks a call with a Korean voice and cuts off the previous one", () => {
    const { speak, cancel } = installSpeech([
      { lang: "en-US", localService: true },
      { lang: "ko-KR", localService: true, name: "유나" },
    ]);
    const voice = UmpireVoice.create()!;
    expect(voice.available).toBe(true);
    expect(voice.speak("strikeout", 0.5)).toBe(true);
    expect(cancel).toHaveBeenCalled();
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toBe(umpirePhrase("strikeout"));
    expect(utterance.lang).toBe("ko-KR");
    expect(utterance.volume).toBe(0.5);
  });

  it("reports no voice so the synthesized call can stand in", () => {
    installSpeech([{ lang: "en-US", localService: true }]);
    const voice = UmpireVoice.create()!;
    expect(voice.speak("out", 1)).toBe(false);
    expect(FALLBACK_CALLS.out).toBe("ump_out");
  });
});
