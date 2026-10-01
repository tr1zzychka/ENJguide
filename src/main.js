import { Engine } from './physics/engine.js';
import { FuelSystem } from './subsystems/fuel.js';
import { OilSystem } from './subsystems/oil.js';
import { WearSystem } from './subsystems/wear.js';
import { EngineAudio } from './audio/engine-audio.js';
import { Scene3D } from './render/scene.js';
import { Dashboard } from './ui/dashboard.js';
import { Loop } from './loop.js';
import * as C from './constants.js';

// ─── Создаём все модули ───
const engine = new Engine();
const fuel   = new FuelSystem();
const oil    = new OilSystem();
const wear   = new WearSystem();
const audio  = new EngineAudio();

const stage = document.getElementById('stage');
const scene = new Scene3D(stage);

const dash = new Dashboard(engine, oil, fuel, wear, engine.cyl);

// ─── Аудио должно быть создано после первого клика (политика браузеров) ───
const unlockAudio = async () => {
  await audio.init();
  audio.resume();
  removeEventListener('click', unlockAudio);
  removeEventListener('keydown', unlockAudio);
};
addEventListener('click', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });

// ─── Кнопка старта ───
const origClick = dash.bigBtn.onclick;
dash.bigBtn.onclick = async (e) => {
  if (audio.started) audio.resume();
  else await audio.init();
  origClick.call(dash.bigBtn, e);
};

// ─── Пробел = старт/стоп ───
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); dash.bigBtn.click(); }
});

// ─── Запускаем главный цикл ───
const loop = new Loop({ engine, cylinder: engine.cyl, fuel, oil, wear, audio, scene, dashboard: dash });
loop.start();