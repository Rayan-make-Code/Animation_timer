// Короткий мягкий сигнал окончания интервала (WebAudio, без файлов).
let ctx: AudioContext | null = null;

/** Синус 880 Гц, 150 мс, плавное затухание. Ошибки звука не мешают сессии. */
export function playChime(): void {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch {
    // Нет звукового устройства — молчим.
  }
}
