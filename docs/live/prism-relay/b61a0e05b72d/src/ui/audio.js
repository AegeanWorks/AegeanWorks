let context = null;
let sfxEnabled = true;
let musicEnabled = true;
let musicPlaying = false;
let musicTimer = null;
let musicGain = null;
let musicFilter = null;
let padNodes = [];
let musicStep = 0;

const MUSIC_NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];

function ensureContext() {
  if (!context) {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    context = new AudioContextClass();
  }
  if (context.state === "suspended") {
    context.resume();
  }
  return context;
}

function outputGain(audio, gain, duration, start) {
  const envelope = audio.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  return envelope;
}

function tone(frequency, duration, type, gain, delay = 0) {
  if (!sfxEnabled) {
    return;
  }
  const audio = ensureContext();
  if (!audio) {
    return;
  }
  const oscillator = audio.createOscillator();
  const envelope = outputGain(audio, gain, duration, audio.currentTime + delay);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime + delay);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(audio.currentTime + delay);
  oscillator.stop(audio.currentTime + delay + duration + 0.02);
}

function schedulePad(audio) {
  musicFilter = audio.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.setValueAtTime(620, audio.currentTime);
  musicFilter.Q.setValueAtTime(0.7, audio.currentTime);
  musicFilter.connect(audio.destination);

  musicGain = audio.createGain();
  musicGain.gain.setValueAtTime(0.0001, audio.currentTime);
  musicGain.gain.exponentialRampToValueAtTime(0.05, audio.currentTime + 2.4);
  musicGain.connect(musicFilter);

  const voices = [
    { frequency: 110, type: "sine", gain: 0.45, detune: -4 },
    { frequency: 164.81, type: "triangle", gain: 0.28, detune: 3 },
    { frequency: 220, type: "sine", gain: 0.16, detune: 6 },
  ];
  for (const voice of voices) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = voice.type;
    oscillator.frequency.setValueAtTime(voice.frequency, audio.currentTime);
    oscillator.detune.setValueAtTime(voice.detune, audio.currentTime);
    gain.gain.setValueAtTime(voice.gain, audio.currentTime);
    oscillator.connect(gain).connect(musicGain);
    oscillator.start();
    padNodes.push(oscillator);
  }
}

function scheduleMusicStep() {
  if (!musicPlaying || !context || !musicGain) {
    return;
  }
  const frequency = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
  musicStep += 1;
  const oscillator = context.createOscillator();
  const envelope = outputGain(context, 0.018, 1.9, context.currentTime);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.connect(envelope).connect(musicGain);
  oscillator.start();
  oscillator.stop(context.currentTime + 1.95);
}

export function setEnabled(value) {
  sfxEnabled = Boolean(value);
}

export function isEnabled() {
  return sfxEnabled;
}

export function setMusicEnabled(value) {
  musicEnabled = Boolean(value);
  if (!musicEnabled) {
    stopMusic();
  }
}

export function isMusicEnabled() {
  return musicEnabled;
}

export function startMusic() {
  if (!musicEnabled || musicPlaying) {
    return;
  }
  const audio = ensureContext();
  if (!audio) {
    return;
  }
  musicPlaying = true;
  musicStep = 0;
  schedulePad(audio);
  scheduleMusicStep();
  musicTimer = setInterval(scheduleMusicStep, 2400);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  musicPlaying = false;
  const gain = musicGain;
  const filter = musicFilter;
  const nodes = padNodes;
  musicGain = null;
  musicFilter = null;
  padNodes = [];
  if (!gain || !context) {
    return;
  }
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  setTimeout(() => {
    for (const oscillator of nodes) {
      try {
        oscillator.stop();
      } catch {
        // already stopped
      }
    }
    gain.disconnect();
    filter?.disconnect();
  }, 700);
}

export function isMusicPlaying() {
  return musicPlaying;
}

export function playRotate() {
  tone(660, 0.08, "triangle", 0.035);
}

export function playSplit() {
  tone(520, 0.07, "triangle", 0.03);
  tone(780, 0.09, "sine", 0.025, 0.04);
}

export function playPortal() {
  tone(330, 0.16, "sine", 0.03);
  tone(660, 0.18, "sine", 0.022, 0.08);
}

export function playUi() {
  tone(440, 0.05, "sine", 0.022);
}

export function playError() {
  tone(180, 0.12, "sawtooth", 0.02);
}

export function playVictory() {
  tone(523.25, 0.16, "triangle", 0.035, 0);
  tone(659.25, 0.16, "triangle", 0.035, 0.1);
  tone(783.99, 0.2, "triangle", 0.04, 0.2);
  tone(1046.5, 0.32, "sine", 0.035, 0.32);
}
