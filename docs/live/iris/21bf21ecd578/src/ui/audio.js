/**
 * Tiny generated sound cues. No audio files, no network calls, and no sound
 * until the first user gesture unlocks the audio context.
 */

const CUES = Object.freeze({
  rotate: [[392, 0.05, "sine", 0.02]],
  dye: [
    [523.25, 0.07, "sine", 0.018],
    [659.25, 0.09, "sine", 0.016],
  ],
  hint: [
    [880, 0.06, "triangle", 0.016],
    [1174.66, 0.14, "sine", 0.014],
  ],
  charge: [
    [523.25, 0.09, "sine", 0.022],
    [783.99, 0.12, "sine", 0.02],
  ],
  uncharge: [
    [392, 0.08, "triangle", 0.018],
    [311.13, 0.16, "triangle", 0.016],
  ],
  win: [
    [523.25, 0.1, "sine", 0.024],
    [659.25, 0.1, "sine", 0.024],
    [783.99, 0.1, "sine", 0.024],
    [1046.5, 0.24, "sine", 0.02],
  ],
});

export function createAudio(scope = globalThis) {
  let context = null;
  let muted = false;
  const voices = new Set();

  function ensureContext() {
    if (context) {
      return context;
    }
    const AudioContextClass = scope.AudioContext ?? scope.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    try {
      context = new AudioContextClass();
    } catch {
      context = null;
    }
    return context;
  }

  function unlock() {
    const ctx = ensureContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return Boolean(ctx);
  }

  function stopVoice(voice) {
    if (!voices.delete(voice)) {
      return;
    }
    try {
      voice.oscillator.stop();
    } catch {
      // The voice may already have stopped on its own schedule.
    }
    try {
      voice.oscillator.disconnect();
    } catch {
      // A disconnected node is already silent.
    }
    try {
      voice.amplifier.disconnect();
    } catch {
      // A disconnected node is already silent.
    }
  }

  function stopVoices() {
    for (const voice of [...voices]) {
      stopVoice(voice);
    }
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (muted) {
      stopVoices();
    }
  }

  function isMuted() {
    return muted;
  }

  function tone(frequency, duration, type, gain, startAt) {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    const oscillator = ctx.createOscillator();
    const amplifier = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    amplifier.gain.setValueAtTime(0.0001, startAt);
    amplifier.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
    amplifier.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(amplifier);
    amplifier.connect(ctx.destination);
    const voice = { oscillator, amplifier };
    voices.add(voice);
    oscillator.onended = () => {
      voices.delete(voice);
    };
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function play(name) {
    if (muted) {
      return false;
    }
    const cue = CUES[name];
    if (!cue) {
      return false;
    }
    const ctx = ensureContext();
    if (!ctx) {
      return false;
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    let offset = 0;
    for (const [frequency, duration, type, gain] of cue) {
      tone(frequency, duration, type, gain, ctx.currentTime + offset);
      offset += duration * 0.7;
    }
    return true;
  }

  return { unlock, setMuted, isMuted, stop: stopVoices, play };
}
