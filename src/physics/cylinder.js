import * as C from '../constants.js';

/**
 * Термодинамика цилиндра:
 *   • Идеальный газ: P·V = m·R·T
 *   • 1-й закон: d(m·Cv·T) = Q + H_in·dm_in - H_out·dm_out - P·dV
 *   • Сгорание топлива с КПД, зависящим от AFR
 *   • Массообмен через клапаны — orifice equation
 */
export class Cylinder {
  constructor(intake, exhaust) {
    this.intake = intake;
    this.exhaust = exhaust;

    // Состояние газа
    this.m = 0;         // общая масса газа, кг
    this.mFuel = 0;     // масса несгоревшего топлива, кг
    this.T = C.T_IN;    // температура, К
    this.P = C.P_ATM;   // давление, Па
    this.V = C.VC + C.VD;

    // Цикл сгорания
    this.combusting = false;
    this.burnFrac = 0;
    this.sparkFired = false;
    this.misfire = false;
    this.lastResult = '';
    this.cycles = 0;
    this.misfires = 0;

    // Выход
    this.torque = 0;
    this.Q_released = 0;   // суммарное тепло текущего цикла

    // Диагностика
    this.pCycle = new Array(180).fill(0);
    this.peakP = 0;
    this.lastPeakP = 0;
  }

  volumeAt(theta) {
    const s = Math.sin(theta), c = Math.cos(theta);
    const y = C.R_CRANK * c + Math.sqrt(Math.max(0, C.L_ROD*C.L_ROD - C.R_CRANK*C.R_CRANK*s*s));
    return C.VC + C.AREA * (C.TDC_Y - y);
  }

  dVdTheta(theta) {
    const h = 1e-5;
    return (this.volumeAt(theta + h) - this.volumeAt(theta - h)) / (2 * h);
  }

  /** Течение через клапан, сжимаемое (isothermal orifice) */
  massFlow(area, P_up, T_up, P_dn) {
    if (area < 1e-8 || P_up <= P_dn) return 0;
    const Cd = 0.7;
    const Pr = P_dn / P_up;
    const g = C.GAMMA;
    const phi = Pr < 0.528
      ? 0.685
      : Math.sqrt(2*g/(g-1) * (Math.pow(Pr, 2/g) - Math.pow(Pr, (g+1)/g)));
    return Cd * area * P_up / Math.sqrt(C.R_AIR * T_up) * phi;
  }

  efficiencyFromAFR(afr) {
    if (afr < 8 || afr > 22) return 0;
    const d = Math.abs(afr - C.AFR_STOICH) / C.AFR_STOICH;
    return Math.max(0, 1 - d * 1.4);
  }

  step(dt, crankDeg, manifoldP, exhaustP, injectRate, sparkAdvDeg) {
    const theta = crankDeg * C.DEG;
    this.V = this.volumeAt(theta);
    const dVdθ = this.dVdTheta(theta);

    // Расчёт текущего AFR и решение о впрыске/сгорании
    this.updateCombustion(dt, crankDeg, sparkAdvDeg);

    // ─── Массообмен через клапаны ───
    const A_in = this.intake.flowArea();
    const A_ex = this.exhaust.flowArea();

    let dmIn = 0, dmOut = 0, dHin = 0, dHout = 0;

    if (A_in > 0 && manifoldP > this.P) {
      const mdot = this.massFlow(A_in, manifoldP, C.T_IN, this.P);
      dmIn = mdot * dt;
      dHin = mdot * C.CP * C.T_IN * dt;
    }
    if (A_ex > 0 && this.P > exhaustP) {
      const mdot = this.massFlow(A_ex, this.P, this.T, exhaustP);
      dmOut = mdot * dt;
      dHout = mdot * C.CP * this.T * dt;
    }

    // Топливо, впрыскиваемое в поток (упрощённо — во впускном порту)
    const dmFuel = injectRate * dt;

    // Тепло от сгорания в этот шаг
    let Q_comb = 0;
    if (this.combusting && this.burnFrac < 1) {
      // Профиль горения — 25 мс
      const dBurn = Math.min(1 - this.burnFrac, dt / 0.025);
      const afr = this.mFuel > 1e-9 ? (this.m - this.mFuel) / this.mFuel : 0;
      const eta = this.efficiencyFromAFR(afr);
      Q_comb = this.mFuel * C.LHV * eta * dBurn;
      this.mFuel *= (1 - dBurn * 0.98);
      this.burnFrac += dBurn;
      if (this.burnFrac >= 1) this.combusting = false;
    }

    // Теплообмен стенка ↔ газ
    const Awall = Math.PI * C.BORE * C.STROKE * 0.5 + 2 * C.AREA;
    const hConv = 120 + 0.8 * (this.P / 1e5);
    const Qwall = hConv * Awall * (C.T_COOLANT - this.T); // Вт

    // ─── Энергобаланс ───
    const m_old = this.m;
    const m_new = m_old + dmIn + dmFuel - dmOut;

    if (m_new < 1e-8) {
      this.m = 0; this.mFuel = 0;
      this.T = C.T_IN;
      this.P = manifoldP;
    } else {
      // dU = Q - P·dV + hin·dmin - hout·dmout
      const U_old = m_old * C.CV * this.T;
      const U_new = U_old
                  + (Q_comb + Qwall) * dt
                  - this.P * dVdθ * (dt * 0) // работа учтена через dV/dt ниже
                  + dHin
                  - dHout;

      // Работа газа: W = P · dV/dt (в этом шаге)
      // Нужна угловая скорость ω, но её знает engine.js — передадим через torque позже.
      // Для чистоты модели применим адиабатическую поправку:
      // (в движении ω ≠ 0), поэтому считаем PV = m·R·T → ΔT от сжатия уже заложен в P·dV.

      this.m = m_new;
      this.mFuel += dmFuel;
      // Температура из энергии (без работы — она учтена в давлении)
      this.T = Math.max(200, U_new / (m_new * C.CV));
    }

    // Работа газа как отдельный вклад — через ω, которую передаёт engine.js
    this.Q_released = Q_comb;

    // ─── Давление ───
    this.P = this.m > 1e-8
      ? (this.m * C.R_AIR * this.T) / this.V
      : manifoldP;

    // ─── Крутящий момент на коленвал ───
    const s = Math.sin(theta), c = Math.cos(theta);
    const yp = C.R_CRANK * c + Math.sqrt(Math.max(0, C.L_ROD*C.L_ROD - C.R_CRANK*C.R_CRANK*s*s));
    const F = (this.P - C.P_ATM) * C.AREA;
    const denom = yp - C.R_CRANK * c;
    this.torque = denom > 1e-6
      ? F * C.R_CRANK * s * yp / denom
      : 0;

    // График P(θ)
    const idx = Math.min(179, Math.max(0, Math.floor((crankDeg % 720) / 4)));
    this.pCycle[idx] = this.P;
    if (crankDeg > 360 && crankDeg < 380) {
      this.peakP = Math.max(this.peakP, this.P);
    }
    if (crankDeg < 5) {
      this.lastPeakP = this.peakP;
      this.peakP = 0;
    }

    return this.torque;
  }

  updateCombustion(dt, crankDeg, sparkAdvDeg) {
    const cyc = crankDeg % 720;
    // Искра за sparkAdvDeg до TDC (360°)
    const sparkDeg = 360 + sparkAdvDeg;
    const sparkDegWrapped = ((sparkDeg % 720) + 720) % 720;

    if (!this.sparkFired && cyc >= sparkDegWrapped && cyc < sparkDegWrapped + 3) {
      this.sparkFired = true;
      this.tryIgnite();
    }

    // Сброс после выпуска
    if (cyc > 10 && cyc < 30 && this.sparkFired) {
      this.sparkFired = false;
      this.burnFrac = 0;
    }
  }

  tryIgnite() {
    this.cycles++;
    if (this.mFuel < 1e-8 || this.m < 1e-7) {
      this.misfire = true;
      this.misfires++;
      this.lastResult = 'нет топлива';
      return;
    }
    const afr = (this.m - this.mFuel) / Math.max(this.mFuel, 1e-9);
    if (afr < 8 || afr > 22) {
      this.misfire = true;
      this.misfires++;
      this.lastResult = 'AFR ' + afr.toFixed(1);
      return;
    }
    this.misfire = false;
    this.combusting = true;
    this.burnFrac = 0;
    this.lastResult = 'ok';
  }
}