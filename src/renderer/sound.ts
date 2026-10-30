// Короткий мягкий сигнал окончания интервала (WebAudio, без файлов).
let ctx: AudioContext | null = null;

/** Синус 880 Гц, 150 мс, плавное затухание. Ошибки звука не мешают сессии. */
export function playChime(): void {
  tone(880, 0.15, 0.15, 0);
}

/** Отсчёт последних 5 секунд интервала (звучит раз в секунду): тихий низкий тон с мягкой атакой, не резкий. */
export function playWarning(): void {
  tone(523, 0.07, 0.45, 0.04);
}

function tone(freq: number, volume: number, durSec: number, attackSec: number): void {
  try {
    ctx ??= new AudioContext();
    // Политика автозапуска может оставить контекст приостановленным.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    if (attackSec > 0) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + attackSec);
    } else {
      gain.gain.setValueAtTime(volume, t);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durSec);
  } catch {
    // Нет звукового устройства — молчим.
  }
}
