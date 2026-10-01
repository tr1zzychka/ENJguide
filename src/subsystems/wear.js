import * as C from '../constants.js';

/**
 * Накопительный износ. Не вероятностный — детерминированный.
 * Считаем отдельно для:
 *   • поршневых колец
 *   • вкладышей коленвала
 *   • тарелок клапанов
 *   • стенок цилиндра
 * Каждый компонент: damage 0..1. При 1.0 — деталь разрушена.
 */
export class WearSystem {
  constructor() {
    this.rings = 0;
    this.bearings = 0;
    this.valves = 0;
    this.bore = 0;
    this.turbulence = 0;      // накопленный ущерб от перегрева
    this.broken = null;       // какая деталь сломалась
    this.blowby = 0;          // прорыв газов через кольца (0..1)
    this.oilConsumption = 0;  // расход масла на угар, л/1000 км (условно)
  }

  /**
   * @param dt              шаг, с
   * @param P_cyl           давление в цилиндре, Па
   * @param T_cyl           температура цилиндра, К
   * @param rpm             обороты
   * @param oil             OilSystem
   * @param T_wall          температура стенки цилиндра, К
   */
  update(dt, P_cyl, T_cyl, rpm, oil, T_wall) {
    // Кольца: износ от давления, температуры и отсутствия смазки
    const ringStress = (P_cyl / 4e6) * (T_cyl / 1200) * (1 + this.rings * 3);
    const ringWear = ringStress * 4e-5 * dt * (1 / Math.max(oil.quality, 0.1));
    this.rings = Math.min(1, this.rings + ringWear);

    // Вкладыши: зависят в основном от давления масла и оборотов
    const oilStarved = oil.pressure < 5e4 ? (5e4 - oil.pressure) / 5e4 : 0;
    const load = Math.abs(rpm) / 6000;
    const bearingWear = load * (1 + oilStarved * 4) * 3e-5 * dt;
    this.bearings = Math.min(1, this.bearings + bearingWear);

    // Клапаны: износ седел от высокой температуры выхлопа
    const valveWear = (T_cyl / 1500) * 2e-5 * dt;
    this.valves = Math.min(1, this.valves + valveWear);

    // Стенка цилиндра — от перегрева
    const overheat = Math.max(0, T_wall - 500) / 200;
    this.bore = Math.min(1, this.bore + overheat * 1e-4 * dt);

    // Прорыв газов через кольца
    this.blowby = Math.min(1, this.rings * 1.5);

    // Проверка на разрушение
    if (this.rings >= 1 && !this.broken) this.broken = 'Кольца разрушены';
    if (this.bearings >= 1 && !this.broken) this.broken = 'Вкладыши провернуло';
    if (this.valves >= 1 && !this.broken) this.broken = 'Клапан прогорел';
    if (this.bore >= 1 && !this.broken) this.broken = 'Зеркало цилиндра разрушено';
  }

  /** Общий износ 0..1 — для HUD */
  get overall() {
    return Math.max(this.rings, this.bearings, this.valves, this.bore);
  }

  repair() {
    this.rings = this.bearings = this.valves = this.bore = 0;
    this.turbulence = 0;
    this.broken = null;
    this.blowby = 0;
  }
}