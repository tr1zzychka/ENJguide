import * as C from '../constants.js';

/**
 * Многослойный синтез звука двигателя.
 * Слои: combustion · intake · exhaust · mechanical · startup · faults.
 * Все параметры зависят от физического состояния.
 */
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.nodes = {};
  }

  async init() {
    if (this.started) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Мастер
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);

    // ─── Буфер белого шума (для слоёв потока) ───
    const bufLen = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;

    // ─── ВПУСК: белый шум через полосовой фильтр ───
    const intakeSrc = this.ctx.createBufferSource();
    intakeSrc.buffer = noiseBuf; intakeSrc.loop = true;
    const intakeBP = this.ctx.createBiquadFilter();
    intakeBP.type = 'bandpass';
    intakeBP.frequency.value = 700; intakeBP.Q.value = 1.5;
    const intakeGain = this.ctx.createGain();
    intakeGain.gain.value = 0;
    intakeSrc.connect(intakeBP).connect(intakeGain).connect(this.master);
    intakeSrc.start();
    this.nodes.intake = { gain: intakeGain, filter: intakeBP };

    // ─── ВЫХЛОП: шум через НЧ-фильтр ───
    const exhSrc = this.ctx.createBufferSource();
    exhSrc.buffer = noiseBuf; exhSrc.loop = true;
    const exhLP = this.ctx.createBiquadFilter();
    exhLP.type = 'lowpass'; exhLP.frequency.value = 300;
    const exhGain = this.ctx.createGain();
    exhGain.gain.value = 0;
    exhSrc.connect(exhLP).connect(exhGain).connect(this.master);
    exhSrc.start();
    this.nodes.exhaust = { gain: exhGain, filter: exhLP };

    // ─── МЕХАНИКА: пилообразный «гуд» от распредвала ───
    const mechOsc = this.ctx.createOscillator();
    mechOsc.type = 'sawtooth';
    mechOsc.frequency.value = 30;
    const mechLP = this.ctx.createBiquadFilter();
    mechLP.type = 'lowpass'; mechLP.frequency.value = 400;
    const mechGain = this.ctx.createGain();
    mechGain.gain.value = 0;
    mechOsc.connect(mechLP).connect(mechGain).connect(this.master);
    mechOsc.start();
    this.nodes.mech = { osc: mechOsc, gain: mechGain };

    // ─── ХОЛОСТОЙ ШУМ (фоновый шум подшипников) ───
    const whineSrc = this.ctx.createBufferSource();
    whineSrc.buffer = noiseBuf; whineSrc.loop = true;
    const whineHP = this.ctx.createBiquadFilter();
    whineHP.type = 'highpass'; whineHP.frequency.value = 3000;
    const whineGain = this.ctx.createGain();
    whineGain.gain.value = 0;
    whineSrc.connect(whineHP).connect(whineGain).connect(this.master);
    whineSrc.start();
    this.nodes.whine = { gain: whineGain };

    // ─── Сгорание: пойдёт через отдельные всплески ───
    this.noiseBuf = noiseBuf;

    // ─── Стартер: отдельный гул ───
    const stOsc = this.ctx.createOscillator();
    stOsc.type = 'square'; stOsc.frequency.value = 90;
    const stLP = this.ctx.createBiquadFilter();
    stLP.type = 'lowpass'; stLP.frequency.value = 500;
    const stGain = this.ctx.createGain();
    stGain.gain.value = 0;
    stOsc.connect(stLP).connect(stGain).connect(this.master);
    stOsc.start();
    this.nodes.starter = { osc: stOsc, gain: stGain, filter: stLP };

    // ─── Стук клапана при отскоке ───
    // (создаётся на лету в fire())

    this.started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Вспышка сгорания — короткий импульс через резонансный фильтр */
  fire(load) {
    if (!this.started) return;
    const ctx = this.ctx;

    // Комбинация шума и импульса — характерный «удар»
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 180 + Math.random() * 120;
    bp.Q.value = 2.5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.5 + load * 0.6, ctx.currentTime + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);

    src.connect(bp).connect(env).connect(this.master);
    src.start(ctx.currentTime);
    src.stop(ctx.currentTime + 0.1);
  }

  /** Стук (детонация, отскок клапана, износ) */
  knock(strength = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.25 * strength, ctx.currentTime + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    src.connect(bp).connect(env).connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.05);
  }

  /**
   * Обновление звука по физическому состоянию.
   * @param engine  — Engine
   * @param oil     — OilSystem
   * @param fuel    — FuelSystem
   * @param wear    — WearSystem
   */
  update(engine, oil, fuel, wear) {
    if (!this.started) return;
    const rpm = Math.abs(engine.omega * C.RPM_FACTOR);
    const load = engine.throttle;
    const state = engine.state;

    // Впуск: громкость ∝ потоку воздуха
    const airFlow = (engine.cyl.m - engine.cyl.mFuel) * Math.abs(engine.omega) * C.RPM_FACTOR / 120;
    const intakeVol = Math.min(0.35, airFlow * 1.5 + load * 0.2);
    this.nodes.intake.gain.gain.setTargetAtTime(
      state === 'RUNNING' ? intakeVol : 0, this.ctx.currentTime, 0.05);
    this.nodes.intake.filter.frequency.setTargetAtTime(
      500 + rpm * 0.15, this.ctx.currentTime, 0.05);

    // Выхлоп: громкость ∝ нагрузке и оборотам
    const exhVol = state === 'RUNNING' ? Math.min(0.35, load * 0.3 + rpm / 15000) : 0;
    this.nodes.exhaust.gain.gain.setTargetAtTime(exhVol, this.ctx.currentTime, 0.08);
    this.nodes.exhaust.filter.frequency.setTargetAtTime(
      200 + rpm * 0.1, this.ctx.currentTime, 0.1);

    // Механика: тон на частоте клапанного механизма
    const mechFreq = Math.max(20, rpm / 60); // обороты в Гц
    this.nodes.mech.osc.frequency.setTargetAtTime(mechFreq, this.ctx.currentTime, 0.05);
    const mechVol = state === 'RUNNING' ? 0.06 + wear.overall * 0.15 : 0;
    this.nodes.mech.gain.gain.setTargetAtTime(mechVol, this.ctx.currentTime, 0.1);

    // Подшипниковый шум: растёт с оборотами и износом
    const whineVol = state === 'RUNNING'
      ? (rpm / 12000) * 0.03 * (1 + wear.overall * 3)
      : 0;
    this.nodes.whine.gain.gain.setTargetAtTime(whineVol, this.ctx.currentTime, 0.15);

    // Стартер: звук, пока крутится
    if (state === 'STARTING') {
      const stVol = 0.15;
      this.nodes.starter.gain.gain.setTargetAtTime(stVol, this.ctx.currentTime, 0.05);
      this.nodes.starter.osc.frequency.setTargetAtTime(
        60 + Math.abs(engine.omega * C.RPM_FACTOR) * 0.5, this.ctx.currentTime, 0.1);
    } else {
      this.nodes.starter.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  /** Стоп — приглушить всё */
  silence() {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    for (const k of ['intake', 'exhaust', 'mech', 'whine', 'starter']) {
      if (this.nodes[k] && this.nodes[k].gain)
        this.nodes[k].gain.gain.setTargetAtTime(0, now, 0.1);
    }
  }
}