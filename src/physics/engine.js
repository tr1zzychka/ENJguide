import * as C from '../constants.js';
import { Valve } from './valve.js';
import { Cylinder } from './cylinder.js';

/**
 * Двигатель целиком — оркестратор:
 *   • коленвал: I·dω/dt = Στ  (газовый, стартер, трение)
 *   • вызывает cylinder.step и valve.step
 *   • принимает внешние модули трения (oil)
 */
export class Engine {
  constructor() {
    this.intake = new Valve('intake', C.IVO, C.IVC, 0.032);
    this.exhaust = new Valve('exhaust', C.EVO, C.EVC, 0.028);
    this.cyl = new Cylinder(this.intake, this.exhaust);

    this.theta = 0;       // угол коленвала, рад
    this.omega = 0;       // рад/с
    this.crankDeg = 0;    // 0..720

    this.starter = 0;     // остаток времени работы стартера, с
    this.starterTorque = 8;

    this.state = 'STOPPED';  // STOPPED | STARTING | RUNNING | STOPPING | FAILED
    this.failed = false;

    this.oilFrictionMul = 1;   // множитель трения (0.5 — хорошо смазано, 5 — плохо)
    this.mechWearMul = 1;      // множитель износа
    this.vibration = 0;
    this.misfire = false;

    this.manifoldP = C.P_MANIFOLD;
    this.exhaustP = C.P_EXHAUST;

    this.sparkAdvDeg = -15;    // угол опережения зажигания
    this.throttle = 0;         // 0..1
    this.injectRate = 0;       // кг/с

    // Давление масла и сигналы наружу
    this.oilPressure = 0;
    this.torque = 0;
    this.power = 0;
  }

  start() {
    if (this.failed) return;
    if (this.state === 'RUNNING' || this.state === 'STARTING') return;
    this.state = 'STARTING';
    this.starter = 1.6;
  }

  stop() {
    if (this.state === 'STOPPED' || this.state === 'STOPPING') return;
    this.state = 'STOPPING';
    this.throttle = 0;
    this.injectRate = 0;
  }

  fail(reason) {
    this.failed = true;
    this.state = 'FAILED';
    this.reason = reason;
  }

  repair() {
    this.failed = false;
    this.omega = 0;
    this.theta = 0;
    this.crankDeg = 0;
    this.cyl.m = 0;
    this.cyl.mFuel = 0;
    this.cyl.T = C.T_IN;
    this.cyl.P = C.P_ATM;
    this.cyl.misfire = false;
    this.cyl.combusting = false;
    this.state = 'STOPPED';
    this.starter = 0;
    this.throttle = 0;
  }

  step(dt) {
    // Фаза стартера
    let tauStarter = 0;
    if (this.starter > 0) {
      this.starter -= dt;
      if (this.omega < 8) tauStarter = this.starterTorque;
      // Если стартер не может провернуть (ω≈0 из-за заклинивания)
      if (this.starter < 0.4 && this.omega < 0.5 && !this.failed) {
        this.fail('стартер не крутит');
      }
    }

    // Переходы состояний
    const rpm = Math.abs(this.omega * C.RPM_FACTOR);
    if (this.state === 'STARTING' && rpm > 250 && this.cyl.combusting) {
      this.state = 'RUNNING';
    }
    if (this.state === 'STARTING' && this.starter <= 0 && rpm < 100) {
      this.state = 'STOPPED';
    }
    if (this.state === 'STOPPING' && rpm < 30) {
      this.state = 'STOPPED';
    }

    // Газовый момент из цилиндра
    const tauGas = this.cyl.step(
      dt, this.crankDeg,
      this.manifoldP, this.exhaustP,
      this.injectRate, this.sparkAdvDeg
    );
    this.torque = tauGas;

    // Мощность = τ·ω
    this.power = tauGas * this.omega;

    // Обновление угла поворота коленвала (в градусах цикла)
    this.theta += this.omega * dt;
    this.crankDeg = ((this.theta * 180 / Math.PI) % 720 + 720) % 720;

    // Ход клапанов — из физики, не из угла
    const valveForceScale = 30; // Н/бар × бар
    const F_intake = -(this.manifoldP - this.cyl.P) * this.intake.areaMax * 1;
    const F_exhaust = -(this.cyl.P - this.exhaustP) * this.exhaust.areaMax * 1;
    this.intake.step(dt, this.crankDeg, F_intake * 0 + 0);
    this.exhaust.step(dt, this.crankDeg, 0);

    // Трение (с учётом масла)
    const tauFric = -Math.sign(this.omega) * (
      C.FRIC_BASE * this.oilFrictionMul +
      C.FRIC_VISC * Math.abs(this.omega) * this.oilFrictionMul +
      C.FRIC_AERO * this.omega * this.omega
    );

    // Уравнение вращения
    const tauTotal = tauGas + tauStarter + tauFric;
    this.omega += tauTotal / C.I_FLY * dt;
    if (Math.abs(this.omega) < 0.3 && this.starter <= 0) this.omega = 0;

    // Ограничитель оборотов — отсечка
    if (rpm > C.RPM_LIMIT) {
      this.injectRate = 0;
    }

    // Вибрации — от дисбаланса и misfire
    this.vibration = 0.3 * Math.abs(tauGas / 100)
                   + (this.cyl.misfire ? 4 : 0)
                   + Math.abs(this.omega) * 0.02 * this.mechWearMul;
    this.misfire = this.cyl.misfire;
  }
}