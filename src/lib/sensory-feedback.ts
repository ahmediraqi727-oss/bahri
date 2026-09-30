/**
 * sensory-feedback.ts
 *
 * Sensory Feedback Engine (Web Audio API Synthesizer & Haptic Vibration)
 * for Barcode & QR Code Recognition in Ahmed Bahri Store.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Triggers sensory feedback (custom sound + haptic vibration) upon successful barcode / QR scan.
 */
export function triggerSuccessSensoryFeedback(enabled = true) {
  if (!enabled) return;

  // 1. Audio Feedback: Melodic POS crystal double-chime (B5: 987.77Hz -> E6: 1318.51Hz)
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(987.77, now);
      osc.frequency.setValueAtTime(1318.51, now + 0.05);

      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch {
    // Audio context may be restricted before user gesture
  }

  // 2. Haptic Vibration Feedback: Crisp POS double pulse (60ms vibration, 30ms pause, 70ms vibration)
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([60, 30, 70]);
    }
  } catch {
    // Vibration API not supported on this device/browser
  }
}

/**
 * Subtle feedback when toggling sound/vibration ON.
 */
export function triggerToggleFeedback() {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1046.5, now); // C6 note
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch {}

  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(40);
    }
  } catch {}
}
