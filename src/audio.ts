export class DepartmentAudio {
  private context: AudioContext | null = null;
  private ambient: GainNode | null = null;
  quiet = false;
  start() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    try {
      this.context = new AudioContext();
      const c = this.context;
      const gain = c.createGain();
      gain.gain.value = this.quiet ? 0 : 0.018;
      gain.connect(c.destination);
      this.ambient = gain;
      for (const hz of [50, 99.7]) {
        const oscillator = c.createOscillator();
        oscillator.frequency.value = hz;
        oscillator.type = 'sine';
        oscillator.connect(gain);
        oscillator.start();
      }
      const length = c.sampleRate * 2,
        buffer = c.createBuffer(1, length, c.sampleRate),
        channel = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
        channel[i] = last * 2;
      }
      const noise = c.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      noise.connect(filter);
      filter.connect(gain);
      noise.start();
    } catch {
      /* Audio is optional: the installation remains operable. */
    }
  }
  setQuiet(quiet: boolean) {
    this.quiet = quiet;
    if (this.context && this.ambient)
      this.ambient.gain.setTargetAtTime(quiet ? 0 : 0.018, this.context.currentTime, 0.2);
  }
  beep(error = false) {
    if (!this.context || this.quiet) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(error ? 135 : 580, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(error ? 80 : 270, c.currentTime + 0.09);
    g.gain.setValueAtTime(0.025, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.13);
  }
  step() {
    if (!this.context || this.quiet) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(80 + Math.random() * 30, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(28, c.currentTime + 0.09);
    g.gain.setValueAtTime(0.045, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.11);
  }
}
