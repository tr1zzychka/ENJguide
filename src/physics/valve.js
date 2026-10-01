import * as C from '../constants.js';

/**
 * Клапан как тело с массой на пружине + жёсткий двусторонний контакт с кулачком.
 * Положение вычисляется из: F = F_spring + F_damper + F_cam_contact + F_gas
 * Никакой синхронизации с коленвалом — только физика.
 */
export class Valve {
  constructor(name, openAngle, closeAngle, seatDia = 0.030) {
    this.name = name;
    this.x = 0;                  // текущий подъём, м
    this.v = 0;                  // скорость, м/с
    this.a = 0;                  // ускорение, м/с²
    this.seatDia = seatDia;
    this.areaMax = Math.PI * seatDia * seatDia / 4;
    this.openAngle = openAngle;
    this.closeAngle = closeAngle;
    this.touchingCam = false;
    this.contactForce = 0;
    this.rebound = false;        // отскок от седла
  }

  /** Профиль кулачка — требуемый подъём при данном угле (град) */
  camLift(crankDeg) {
    let dur = this.closeAngle - this.openAngle;
    while (dur < 0) dur += 720;
    let a = crankDeg - this.openAngle;
    while (a < 0) a += 720;
    while (a >= 720) a -= 720;
    if (a > dur) return 0;
    const t = a / dur;
    // raised cosine — гладкая функция с нулевой производной на концах
    return C.VALVE_MAX_LIFT * 0.5 * (1 - Math.cos(2 * Math.PI * t));
  }

  /** Эффективная площадь проходного сечения — зависит от x, а не от угла */
  flowArea() {
    if (this.x <= 1e-5) return 0;
    const curtain = Math.PI * this.seatDia * this.x;
    return Math.min(curtain, this.areaMax);
  }

  step(dt, crankDeg, gasForce = 0) {
    const cam = this.camLift(crankDeg);

    // Пружина: сила = -k·x - preload (пружина всегда поджата)
    let F = -C.VALVE_SPRING_K * this.x - C.VALVE_SPRING_PRELOAD;
    // Демпфер
    F -= C.VALVE_DAMPING * this.v;
    // Давление газов на тарелку
    F += gasForce;

    // ── Кулачок: жёсткий двусторонний контакт ──
    // Клапан должен "прилипать" к позиции кулачка,
    // но при этом не проваливаться сквозь него.
    const camPen = cam - this.x;              // + если клапан ниже кулачка
    F += C.VALVE_CONTACT_K * camPen;          // пружина-связь с кулачком
    this.touchingCam = Math.abs(camPen) < 1e-5;
    this.contactForce = Math.abs(C.VALVE_CONTACT_K * camPen);

    this.a = F / C.VALVE_MASS;
    this.v += this.a * dt;
    this.x += this.v * dt;

    // ── Нижняя граница: седло клапана ──
    if (this.x < 0) {
      this.rebound = this.v < -0.5;
      this.x = 0;
      if (this.v < 0) this.v = -this.v * 0.15;
    } else {
      this.rebound = false;
    }
  }
}