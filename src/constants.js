// ─── Геометрия ───
export const BORE = 0.080;
export const STROKE = 0.080;
export const R_CRANK = STROKE / 2;
export const L_ROD = 0.140;
export const AREA = Math.PI * BORE * BORE / 4;
export const VD = AREA * STROKE;
export const CR = 9;
export const VC = VD / (CR - 1);
export const TDC_Y = R_CRANK + L_ROD;

// ─── Газы, физика ───
export const P_ATM = 101325;
export const P_MANIFOLD = 0.92 * P_ATM;
export const P_EXHAUST = 1.05 * P_ATM;
export const R_AIR = 287;
export const GAMMA = 1.4;
export const CV = 717.5;
export const CP = 1004.5;
export const T_IN = 300;
export const T_AMBIENT = 293;
export const LHV = 44e6;
export const AFR_STOICH = 14.7;

// ─── Коленвал ───
export const I_FLY = 0.18;
export const FRIC_BASE = 1.2;
export const FRIC_VISC = 0.006;
export const FRIC_AERO = 8e-6;

// ─── Клапаны ───
export const VALVE_MASS = 0.06;
export const VALVE_SPRING_K = 30000;
export const VALVE_SPRING_PRELOAD = 200;
export const VALVE_DAMPING = 3.0;
export const VALVE_MAX_LIFT = 0.010;
export const VALVE_CONTACT_K = 2e6;

// Фазы в градусах угла коленвала, 0° = TDC начала впуска
export const IVO = 710;  // -10° до TDC
export const IVC = 230;
export const EVO = 490;
export const EVC = 10;

// ─── Общие ───
export const DEG = Math.PI / 180;
export const RPM_FACTOR = 60 / (2 * Math.PI);
export const RPM_LIMIT = 8500;

// ─── Масло / температура ───
export const T_COOLANT = 363;      // 90°C
export const T_OIL_MAX = 423;      // 150°C
export const OIL_HEAT_CAP = 2000;  // Дж/К (условный объём)
export const OIL_COOLING = 12;     // Вт/К — теплоотвод через радиатор