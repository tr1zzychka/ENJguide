import * as C from '../constants.js';

/**
 * Главный цикл: физика — рендер — звук — UI.
 * Физика всегда подшаговывается для стабильности.
 */
export class Loop {
  constructor({ engine, cylinder, fuel, oil, wear, audio, scene, dashboard }) {
    this.engine = engine;
    this.cyl = cylinder;
    this.fuel = fuel;
    this.oil = oil;
    this.wear = wear;
    this.audio = audio;
    this.scene = scene;
    this.dashboard = dashboard;

    this.last = performance.now();
    this.audioPhase = 0;   // накопленный угол между вспышками
    this.lastFireAngle = 0;
  }

  tick = (now) => {
    requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 0.033);
    this.last = now;

    // ─── Физика (подшаговка ×4) ───
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.stepPhysics(h);

    // ─── Трение от масла → в двигатель ───
    this.engine.oilFrictionMul = this.oil.frictionMultiplier();
    this.engine.mechWearMul = 1 + this.wear.overall * 3;

    // ─── Износ (за реальный dt, а не за h) ───
    const T_wall = C.T_COOLANT + (this.cyl.T - C.T_COOLANT) * 0.15;
    this.wear.update(dt, this.cyl.P, this.cyl.T,
                     this.engine.omega * C.RPM_FACTOR, this.oil, T_wall);

    // ─── Крах при разрушении ───
    if (this.wear.broken && this.engine.state !== 'FAILED') {
      this.engine.fail(this.wear.broken);
    }

    // ─── Масло ───
    this.oil.updatePressure(this.engine.omega, dt);
    const frictionPower = Math.abs(this.engine.torque * this.engine.omega) * 0.1;
    this.oil.updateTemp(dt, frictionPower, C.T_AMBIENT + this.wear.overall * 30);
    this.oil.updateDegradation(dt);

    // ─── Топливо (AFR) ───
    this.fuel.updateActualAFR(this.cyl);

    // ─── Впрыск (если работает) ───
    if (this.engine.state === 'RUNNING' || this.engine.state === 'STARTING') {
      this.engine.injectRate = this.fuel.computeInjectRate(this.cyl, this.engine.omega, dt);
    } else {
      this.engine.injectRate = 0;
    }

    // ─── Обнаружение вспышек для звука ───
    this.detectFires();

    // ─── Звук ───
    this.audio.update(this.engine, this.oil, this.fuel, this.wear);

    // ─── 3D ───
    this.scene.update(this.engine);

    // ─── UI (троттлим) ───
    this.uiAcc = (this.uiAcc || 0) + dt;
    if (this.uiAcc > 0.06) { this.dashboard.update(); this.uiAcc = 0; }
  };

  stepPhysics(dt) {
    // Газовый момент приходит из engine.step (внутри вызывает cylinder.step)
    this.engine.step(dt);
  }

  /** Следим за переходом burnFrac 0→>0 — это вспышка */
  detectFires() {
    const cyl = this.cyl;
    if (cyl.combusting && cyl.burnFrac < 0.1 && !cyl._wasCombusting) {
      // Вспышка — играем звук и "стук" при детонации
      this.audio.fire(this.engine.throttle);
      if (cyl.P > 55e5) this.audio.knock(1);
    }
    // Отскок клапанов
    if (this.engine.intake.rebound) this.audio.knock(0.4);
    if (this.engine.exhaust.rebound) this.audio.knock(0.4);
    cyl._wasCombusting = cyl.combusting;
  }

  start() {
    requestAnimationFrame(this.tick);
  }
}