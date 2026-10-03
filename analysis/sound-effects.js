/**
 * Synthesized Chess Sound Effects for Diverge Studio
 * 100% Web Audio API based - zero external assets, zero latency, offline-ready.
 * Generates natural wooden chess piece acoustics: move, capture, castle, check, promote.
 */

export class SoundEffects {
  constructor() {
    this.audioCtx = null;
    this._enabled = true;
    this.volume = 0.65;

    // Load persisted user preference
    try {
      const saved = localStorage.getItem('diverge_sound_enabled');
      if (saved !== null) {
        this._enabled = saved === 'true';
      }
    } catch (e) {}
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(val) {
    this._enabled = Boolean(val);
    try {
      localStorage.setItem('diverge_sound_enabled', String(this._enabled));
    } catch (e) {}
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  _initContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Synthesize a natural wooden chess move sound:
   * 1. High transient impact click (rapid pitch drop 950Hz -> 140Hz in 16ms)
   * 2. Resonant board thump (triangle wave 180Hz -> 110Hz decaying exponentially in 65ms)
   * 3. Acoustic texture noise burst (bandpass filtered noise at 900Hz decaying in 25ms)
   */
  playMove(volumeScale = 1.0) {
    if (!this._enabled) return;
    const ctx = this._initContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * volumeScale, t);
      masterGain.connect(ctx.destination);

      // 1. Transient click (wood piece hitting surface)
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'sine';
      clickOsc.frequency.setValueAtTime(950, t);
      clickOsc.frequency.exponentialRampToValueAtTime(140, t + 0.016);
      clickGain.gain.setValueAtTime(0.7, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
      clickOsc.connect(clickGain);
      clickGain.connect(masterGain);
      clickOsc.start(t);
      clickOsc.stop(t + 0.02);

      // 2. Resonant wooden board body thump
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(180, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(110, t + 0.065);
      bodyGain.gain.setValueAtTime(0.55, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(masterGain);
      bodyOsc.start(t);
      bodyOsc.stop(t + 0.075);

      // 3. Tactile friction noise burst
      this._playNoise(ctx, masterGain, t, 0.025, 900, 2.5, 0.35);
    } catch (e) {
      console.warn('[SoundEffects] playMove failed:', e);
    }
  }

  /**
   * Synthesize a capture sound: heavier double impact with secondary strike
   */
  playCapture() {
    if (!this._enabled) return;
    const ctx = this._initContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 1.15, t);
      masterGain.connect(ctx.destination);

      // Primary strike
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(1400, t);
      clickOsc.frequency.exponentialRampToValueAtTime(220, t + 0.022);
      clickGain.gain.setValueAtTime(0.85, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      clickOsc.connect(clickGain);
      clickGain.connect(masterGain);
      clickOsc.start(t);
      clickOsc.stop(t + 0.028);

      // Heavier body
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(220, t);
      bodyOsc.frequency.exponentialRampToValueAtTime(130, t + 0.08);
      bodyGain.gain.setValueAtTime(0.65, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(masterGain);
      bodyOsc.start(t);
      bodyOsc.stop(t + 0.09);

      // Noise burst with higher cutoff
      this._playNoise(ctx, masterGain, t, 0.035, 1500, 2.0, 0.55);

      // Micro secondary knock 22ms later (captured piece displacement)
      const t2 = t + 0.022;
      const secOsc = ctx.createOscillator();
      const secGain = ctx.createGain();
      secOsc.type = 'triangle';
      secOsc.frequency.setValueAtTime(280, t2);
      secOsc.frequency.exponentialRampToValueAtTime(160, t2 + 0.04);
      secGain.gain.setValueAtTime(0.4, t2);
      secGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
      secOsc.connect(secGain);
      secGain.connect(masterGain);
      secOsc.start(t2);
      secOsc.stop(t2 + 0.05);
    } catch (e) {
      console.warn('[SoundEffects] playCapture failed:', e);
    }
  }

  /**
   * Synthesize castling sound (two piece slide / tap in rapid succession)
   */
  playCastle() {
    if (!this._enabled) return;
    this.playMove(0.7);
    setTimeout(() => {
      this.playMove(0.9);
    }, 110);
  }

  /**
   * Synthesize check sound (solid piece move + elegant alert chime)
   */
  playCheck() {
    if (!this._enabled) return;
    this.playMove(1.0);

    const ctx = this._initContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(987.77, t); // B5 note
      chimeOsc.frequency.exponentialRampToValueAtTime(880, t + 0.16);
      chimeGain.gain.setValueAtTime(0.28 * this.volume, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chimeOsc.start(t);
      chimeOsc.stop(t + 0.2);
    } catch (e) {}
  }

  /**
   * Synthesize promotion sound (move + rising chord)
   */
  playPromote() {
    if (!this._enabled) return;
    this.playMove(0.9);

    const ctx = this._initContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;
      [659.25, 880, 1046.5].forEach((freq, i) => {
        const noteTime = t + i * 0.04;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);
        gain.gain.setValueAtTime(0.2 * this.volume, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteTime);
        osc.stop(noteTime + 0.15);
      });
    } catch (e) {}
  }

  /**
   * Noise generator helper for textured acoustic wood impact
   */
  _playNoise(ctx, destination, startTime, duration, centerFreq, q, gainAmount) {
    try {
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(centerFreq, startTime);
      filter.Q.setValueAtTime(q, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainAmount, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      noiseSource.start(startTime);
      noiseSource.stop(startTime + duration);
    } catch (e) {}
  }

  /**
   * Play appropriate sound for a SAN move string
   */
  playSoundForMove(san) {
    if (!san || !this._enabled) return;
    const clean = String(san).trim();
    if (clean.includes('#') || clean.includes('+')) {
      this.playCheck();
    } else if (clean.startsWith('O-O') || clean.startsWith('0-0')) {
      this.playCastle();
    } else if (clean.includes('=')) {
      this.playPromote();
    } else if (clean.includes('x')) {
      this.playCapture();
    } else {
      this.playMove();
    }
  }
}

export const soundEffects = new SoundEffects();
