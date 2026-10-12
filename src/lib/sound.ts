/**
 * Web Audio API synthesizer for kitchen chime.
 * Complies with browser autoplay policies using explicit user interaction unlock.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

/**
 * Unlocks the Web Audio Context upon user interaction (button tap)
 */
export async function unlockAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx.state === "running";
}

/**
 * Plays a pleasant, high-contrast two-tone kitchen notification chime.
 * Tone 1: 587.33 Hz (D5) -> Tone 2: 880 Hz (A5)
 */
export function playKitchenChime(): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;

  try {
    const now = ctx.currentTime;

    // First Bell Tone (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.28, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.45);

    // Second Bell Tone (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);

    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.32, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.12);
    osc2.stop(now + 0.7);
  } catch (err) {
    console.warn("Could not play kitchen chime:", err);
  }
}
