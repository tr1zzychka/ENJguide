import * as C from '../constants.js';

/**
 * Топливная система.
 * Игрок задаёт: цель AFR, длительность впрыска.
 * Система вычисляет: массу топлива, реальный AFR, обогащение.
 */
export class FuelSystem {
  constructor() {
    this.targetAFR = 14.7;
    this.injectorDur = 0.008;   // с
    this.pressure = 3.5e5;       // Па (3.5 бар)
    this.lastAirMass = 0;        // из предыдущего цикла
    this.usedFuel = 0;           // суммарный расход, кг
    this.usedAir = 0;
    this.afrActual = 0;
    this.ethanol = 0;            // доля этанола (резерв)
  }

  /** Расчёт расхода топлива, кг/с, при текущем dt и оборотах */
  computeInjectRate(cyl, omega, dt) {
    // Оценка массового расхода воздуха из последнего наполнения
    const airMassPerCycle = Math.max(cyl.m - cyl.mFuel, 0);
    const cyclesPerSec = Math.abs(omega) * C.RPM_FACTOR / 2 / 60; // 4-тактный
    const airRate = airMassPerCycle * cyclesPerSec;

    // Нужно топливо: m_f = m_air / AFR
    const fuelRate = airRate / this.targetAFR;

    // Ограничение давлением и временем открытия
    // Форсунка даёт: m = Cd·A·√(2·ρ·ΔP)·t
    const rho = 740; // кг/м³
    const dP = Math.max(1e4, this.pressure);
        // Реальная форсунка ~200 см³/мин при 3 барах → ~0.0025 кг/с
    const nominalRate = 200e-6 / 60 * rho;                     // кг/с при 3 бар
    const flowPerSecond = nominalRate * Math.sqrt(dP / 3e5);   // поправка на давление
    const maxRate = flowPerSecond * (this.injectorDur / 0.008);

    // Если реальный AFR был слишком бедный — даём больше, богатый — меньше
    const correction = this.afrActual > 0 && this.afrActual > this.targetAFR * 1.05 ? 1.15 : 1;

    this.usedFuel += fuelRate * correction * dt;

    return Math.min(fuelRate * correction, maxRate);
  }

  updateActualAFR(cyl) {
    if (cyl.mFuel > 1e-9) {
      this.afrActual = (cyl.m - cyl.mFuel) / cyl.mFuel;
    }
  }
}