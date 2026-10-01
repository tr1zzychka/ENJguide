import * as C from '../constants.js';

/**
 * Панель управления и диагностики.
 * Все значения берутся из физических модулей.
 */
export class Dashboard {
  constructor(engine, oil, fuel, wear, cyl) {
    this.engine = engine;
    this.oil = oil;
    this.fuel = fuel;
    this.wear = wear;
    this.cyl = cyl;
    this.attach();
    this.buildDiagGrid();
  }

  attach() {
    // ─── Большая кнопка ───
    this.bigBtn = document.getElementById('bigBtn');
    this.bigLabel = document.getElementById('bigLabel');
    this.bigState = document.getElementById('bigState');

    this.bigBtn.onclick = () => {
      if (this.engine.state === 'RUNNING' || this.engine.state === 'STARTING') {
        this.engine.stop();
      } else if (this.engine.state === 'STOPPED' || this.engine.state === 'FAILED') {
        if (this.engine.state === 'FAILED') this.engine.repair();
        this.engine.start();
      }
    };

    // ─── Слайдеры ───
    const bind = (id, valId, fmt, set) => {
      const el = document.getElementById(id);
      const vl = document.getElementById(valId);
      const upd = () => { const v = +el.value; vl.textContent = fmt(v); set(v); };
      el.addEventListener('input', upd); upd();
    };
    bind('throttle',  'thrVal',    v => v + '%',    v => this.engine.throttle = v / 100);
    bind('afrTarget', 'afrVal',    v => v.toFixed(1), v => this.fuel.targetAFR = v);
    bind('sparkAdv',  'sparkVal',  v => v + '°',    v => this.engine.sparkAdvDeg = v);
    bind('injDur',    'injVal',    v => v + 'мс',   v => this.fuel.injectorDur = v / 1000);
    bind('oilLevel',  'oilLvlVal', v => v + '%',    v => this.oil.level = v / 100);
    bind('oilVisc',   'oilVisVal', v => v,          v => this.oil.viscositySAE = v);

    // ─── Кнопки ───
    document.getElementById('resetBtn').onclick = () => {
      this.engine.repair();
      this.wear.repair();
      this.oil.temperature = C.T_AMBIENT;
      this.oil.degradation = 0;
      this.oil.quality = 1;
      this.cyl.cycles = 0;
      this.cyl.misfires = 0;
      this.fuel.usedFuel = 0;
    };
    document.getElementById('clearWear').onclick = () => this.wear.repair();

    // ─── График ───
    this.pvCanvas = document.getElementById('pvCanvas');
    this.pvCtx = this.pvCanvas.getContext('2d');
  }

  buildDiagGrid() {
    const grid = document.getElementById('diagGrid');
    const params = [
      ['rpm',    'RPM',          ''],
      ['torque', 'МОМЕНТ',       'Нм'],
      ['power',  'МОЩНОСТЬ',     'кВт'],
      ['P_cyl',  'ДАВЛЕНИЕ',     'бар'],
      ['T_cyl',  'Т ЦИЛИНДРА',   '°C'],
      ['T_oil',  'Т МАСЛА',      '°C'],
      ['P_oil',  'P МАСЛА',      'бар'],
      ['afr',    'AFR',          ''],
      ['fuel',   'РАСХОД ТОПЛ',  'г/с'],
      ['air',    'РАСХОД ВОЗД',  'г/с'],
      ['lift',   'ПОДЪЁМ КЛ.',   'мм'],
      ['wear',   'ИЗНОС',        '%'],
      ['vib',    'ВИБРАЦИЯ',     ''],
      ['state',  'СОСТОЯНИЕ',    ''],
    ];
    grid.innerHTML = '';
    this.cells = {};
    for (const [key, label, unit] of params) {
      const d = document.createElement('div');
      d.className = 'dcell';
      d.innerHTML = `<div class="k">${label}</div><div class="v"><span>0</span><span class="u">${unit}</span></div>`;
      grid.appendChild(d);
      this.cells[key] = d;
    }
  }

  update() {
    const e = this.engine;
    const rpm = Math.abs(e.omega * C.RPM_FACTOR);

    // ─── Кнопка ───
    const stMap = {
      STOPPED:  ['START',  'STOPPED',  'stopped'],
      STARTING: ['STOP',   'STARTING', 'starting'],
      RUNNING:  ['STOP',   'RUNNING',  'running'],
      STOPPING: ['—',      'STOPPING', 'stopping'],
      FAILED:   ['RESET',  'FAILED',   'failed'],
    };
    const [lbl, stt, cls] = stMap[e.state] || stMap.STOPPED;
    this.bigLabel.textContent = lbl;
    this.bigState.textContent = stt;
    this.bigBtn.className = cls;

    // ─── Диагностика ───
    const c = (k, v, unit = '', cls = '') => {
      const cell = this.cells[k];
      if (!cell) return;
      const vEl = cell.querySelector('.v');
      vEl.innerHTML = `<span>${v}</span><span class="u">${unit}</span>`;
      cell.className = 'dcell ' + cls;
    };

    c('rpm',    rpm.toFixed(0),              '', rpm > 6500 ? 'bad' : rpm > 4000 ? 'warn' : '');
    c('torque', e.torque.toFixed(1),         'Нм');
    c('power',  (e.power / 1000).toFixed(2), 'кВт');
    c('P_cyl',  (e.cyl.P / 1e5).toFixed(2),  'бар', e.cyl.P > 60e5 ? 'bad' : '');
    c('T_cyl',  (e.cyl.T - 273).toFixed(0),  '°C',  e.cyl.T > 1500 ? 'bad' : '');
    c('T_oil',  (this.oil.temperature - 273).toFixed(0), '°C', this.oil.temperature > 393 ? 'bad' : this.oil.temperature > 373 ? 'warn' : '');
    c('P_oil',  (this.oil.pressure / 1e5).toFixed(2), 'бар', this.oil.pressure < 5e4 && rpm > 500 ? 'bad' : '');
    c('afr',    this.fuel.afrActual.toFixed(1), '', (this.fuel.afrActual < 10 || this.fuel.afrActual > 18) ? 'warn' : 'good');
    c('fuel',   (e.injectRate * 1000).toFixed(2), 'г/с');
    const airRate = (e.cyl.m - e.cyl.mFuel) * Math.abs(e.omega) * C.RPM_FACTOR / 120;
    c('air',    (airRate * 1000).toFixed(2), 'г/с');
    c('lift',   (Math.max(e.intake.x, e.exhaust.x) * 1000).toFixed(2), 'мм');
    c('wear',   (this.wear.overall * 100).toFixed(1), '%', this.wear.overall > 0.7 ? 'bad' : this.wear.overall > 0.4 ? 'warn' : 'good');
    c('vib',    e.vibration.toFixed(2), '', e.vibration > 3 ? 'bad' : e.vibration > 1.5 ? 'warn' : '');
    c('state',  this.wear.broken || e.state, '', this.wear.broken ? 'bad' : e.state === 'RUNNING' ? 'good' : '');

    // ─── График P(θ) ───
    this.drawPV();
  }

  drawPV() {
    const ctx = this.pvCtx;
    const w = this.pvCanvas.width, h = this.pvCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Фон сетки
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); ctx.stroke();
    }

    // Метки фаз (0°, 180°, 360°, 540°)
    const phases = ['ВПУСК', 'СЖАТ', 'РАБ', 'ВЫП'];
    ctx.fillStyle = '#c8c8c8';
    ctx.font = '8px system-ui';
    for (let i = 0; i < 4; i++) ctx.fillText(phases[i], i * w / 4 + 2, 9);

    // Кривая
    const pCycle = this.cyl.pCycle;
    const maxP = 60e5;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 180; i++) {
      const x = i / 179 * w;
      const y = h - Math.min(1, pCycle[i] / maxP) * (h - 12) - 4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Индикатор текущего угла
    const cx = (this.engine.crankDeg / 720) * w;
    ctx.strokeStyle = '#e5484d';
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  }
}