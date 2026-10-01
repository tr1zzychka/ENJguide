import * as C from '../constants.js';

/**
 * Масляная система.
 * Игрок: уровень, вязкость.
 * Расчёт: давление, температура, эффективная вязкость, деградация.
 * Влияет на: трение, износ, температуры.
 */
export class OilSystem {
  constructor() {
    this.level = 0.8;         // 0..1
    this.viscositySAE = 30;
    this.temperature = C.T_AMBIENT;
    this.pressure = 0;
    this.degradation = 0;     // 0..1 — насколько масло "убито"
    this.quality = 1;         // 1 — новое, 0 — негодное
  }

  /** Вязкость при текущей температуре (эмпирика из ASTM D341) */
  viscosityAt() {
    const tC = this.temperature - 273;
    // Множитель: чем холоднее, тем гуще; чем горячее, тем жиже
    const baseVisc = this.viscositySAE * 1e-3;
    const tempFactor = Math.exp(1500 * (1/(tC + 273) - 1/373));
    return baseVisc * tempFactor * (1 + this.degradation * 2);
  }

  /** Давление в системе: зависит от оборотов и вязкости */
  updatePressure(omega, dt) {
    const rpm = Math.abs(omega * C.RPM_FACTOR);
    // Насос: производительность ∝ оборотам
    const pumpFlow = rpm * 1e-5 * Math.max(0.1, this.level);
    // Утечки через зазоры: ∝ 1/вязкость
    const visc = this.viscosityAt();
    const leaks = 3e-4 / Math.max(visc, 1e-4) * (1 + this.degradation * 3);
    this.pressure = Math.max(0, (pumpFlow - leaks)) * 1e5;
    if (rpm < 50) this.pressure = 0;
  }

  /** Коэффициент трения: чем лучше смазка, тем ниже */
  frictionMultiplier() {
    const visc = this.viscosityAt();
    // Оптимум вязкости — ~10 мПа·с
    const ideal = 0.010;
    const viscPenalty = 1 + Math.abs(visc - ideal) / ideal * 0.8;
    const levelPenalty = this.level < 0.3 ? (0.3 - this.level) * 5 : 0;
    const qualityPenalty = (1 - this.quality) * 2;
    return viscPenalty + levelPenalty + qualityPenalty;
  }

  /** Обновление температуры масла: нагрев от трения, охлаждение через радиатор */
  updateTemp(dt, frictionPower, ambientT = C.T_AMBIENT) {
    const heatIn = frictionPower * 0.6;      // 60% трения уходит в масло
    const heatOut = C.OIL_COOLING * (this.temperature - ambientT);
    const dT = (heatIn - heatOut) / C.OIL_HEAT_CAP * dt;
    this.temperature += dT;
    this.temperature = Math.max(ambientT, Math.min(this.temperature, C.T_OIL_MAX + 20));
  }

  /** Деградация масла от высокой температуры */
  updateDegradation(dt) {
    const tC = this.temperature - 273;
    if (tC > 130) {
      this.degradation += (tC - 130) / 100 * 2e-4 * dt;
    }
    this.degradation = Math.min(1, this.degradation);
    this.quality = 1 - this.degradation;
  }
}