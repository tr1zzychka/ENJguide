import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as C from '../constants.js';

/**
 * 3D-сцена. Никакой собственной анимации —
 * все позиции берутся из Engine и Cylinder.
 */
export class Scene3D {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfafafa);

    this.camera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.01, 40);
    this.camera.position.set(0.52, 0.40, 0.64);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.145, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.22;
    this.controls.maxDistance = 2.2;
    this.controls.maxPolarAngle = Math.PI * 0.92;

    this.setupLights();
    this.setupEngine();
    this.setupFloor();

    addEventListener('resize', () => this.resize());
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 1.5));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.55, 1.0, 0.65);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 5
    });
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-0.6, 0.5, -0.4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(0.2, 0.4, -0.9);
    this.scene.add(rim);
  }

  setupFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.ShadowMaterial({ opacity: 0.10 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  setupEngine() {
    const M = {
      alu:    new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: .85, roughness: .35 }),
      steel:  new THREE.MeshStandardMaterial({ color: 0x8e949e, metalness: .94, roughness: .26 }),
      dark:   new THREE.MeshStandardMaterial({ color: 0x4a5058, metalness: .90, roughness: .30 }),
      piston: new THREE.MeshStandardMaterial({ color: 0xe0e4ea, metalness: .92, roughness: .18 }),
      rod:    new THREE.MeshStandardMaterial({ color: 0xb0b6c0, metalness: .92, roughness: .28 }),
      valve:  new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: .95, roughness: .22 }),
      cu:     new THREE.MeshStandardMaterial({ color: 0xc09060, metalness: 1,   roughness: .22 }),
    };

    const engine = new THREE.Group();
    this.scene.add(engine);
    this.engineGroup = engine;

    // Картер
    const crankcase = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.12), M.alu);
    b.position.y = -0.02; b.castShadow = b.receiveShadow = true;
    crankcase.add(b);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.025, 32), M.alu);
    collar.position.y = 0.055; collar.castShadow = collar.receiveShadow = true;
    crankcase.add(collar);
    engine.add(crankcase);

    // Коленвал
    const crankshaft = new THREE.Group();
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.14, 20), M.steel);
    j.rotation.z = Math.PI/2; j.castShadow = true; crankshaft.add(j);
    for (const x of [-0.048, 0.048]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.014, 28), M.dark);
      w.rotation.z = Math.PI/2; w.position.x = x; w.castShadow = true; crankshaft.add(w);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 16), M.steel);
    pin.rotation.z = Math.PI/2; pin.position.set(0, C.R_CRANK, 0); pin.castShadow = true;
    crankshaft.add(pin);
    engine.add(crankshaft);
    this.crankshaft = crankshaft;

    // Шатун
    const rod = new THREE.Group();
    const big = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0055, 12, 24), M.rod);
    big.rotation.y = Math.PI/2; big.castShadow = true; rod.add(big);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.013, C.L_ROD, 0.008), M.rod);
    shaft.position.y = C.L_ROD/2; shaft.castShadow = true; rod.add(shaft);
    const small = new THREE.Mesh(new THREE.TorusGeometry(0.010, 0.0045, 12, 20), M.rod);
    small.rotation.y = Math.PI/2; small.position.y = C.L_ROD; small.castShadow = true; rod.add(small);
    engine.add(rod);
    this.rod = rod;

    // Поршень
    const piston = new THREE.Group();
    const pbody = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.045, 32), M.piston);
    pbody.castShadow = true; piston.add(pbody);
    const pinHole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 16), M.dark);
    pinHole.rotation.z = Math.PI/2; piston.add(pinHole);
    engine.add(piston);
    this.piston = piston;

    // Кольца
    const rings = new THREE.Group();
    for (const y of [0.014, 0.006, -0.012]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.0018, 8, 32), M.dark);
      r.rotation.x = Math.PI/2; r.position.y = y; rings.add(r);
    }
    engine.add(rings);
    this.rings = rings;

    // Цилиндр (полупрозрачный)
    const cylinder = new THREE.Group();
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.13, 40, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xc4c8d0, metalness: .8, roughness: .3,
        transparent: true, opacity: .30, side: THREE.DoubleSide
      })
    );
    tube.position.y = 0.155; tube.castShadow = true; cylinder.add(tube);
    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.0022, 6, 40), M.alu);
      fin.rotation.x = Math.PI/2; fin.position.y = 0.105 + i*0.018; cylinder.add(fin);
    }
    engine.add(cylinder);

    // ГБЦ
    const head = new THREE.Group();
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.038, 0.10), M.alu);
    hm.position.y = 0.2295; hm.castShadow = hm.receiveShadow = true; head.add(hm);
    engine.add(head);

    // Клапаны — сохраним ссылки на меши отдельно, чтобы двигать их физикой
    const valves = new THREE.Group();
    this.valveMeshes = { intake: [], exhaust: [] };
    const intakeX = -0.018, exhaustX = 0.018;
    for (const [dx, name] of [[intakeX, 'intake'], [exhaustX, 'exhaust']]) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.045, 10), M.valve);
      stem.position.set(dx, 0.235, 0); valves.add(stem);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 20), M.valve);
      plate.position.set(dx, 0.2125, 0); valves.add(plate);
      this.valveMeshes[name].push({ stem, plate, baseY: { stem: 0.235, plate: 0.2125 } });
    }
    engine.add(valves);

    // Свеча
    const spark = new THREE.Group();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.030, 12), M.steel);
    s.position.y = 0.263; spark.add(s);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.010, 12), M.cu);
    cap.position.y = 0.281; spark.add(cap);
    engine.add(spark);

    // Маховик
    const flywheel = new THREE.Group();
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.011, 48), M.dark);
    f.rotation.z = Math.PI/2; f.position.x = 0.078; f.castShadow = true; flywheel.add(f);
    for (let i = 0; i < 40; i++) {
      const a = i/40 * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.004, 0.004), M.dark);
      t.position.set(0.078, Math.cos(a)*0.057, Math.sin(a)*0.057);
      t.rotation.x = -a; flywheel.add(t);
    }
    engine.add(flywheel);
    this.flywheel = flywheel;
  }

  /** Обновление 3D-сцены на основе физического состояния Engine */
  update(engine) {
    const theta = engine.theta;  // рад
    const s = Math.sin(theta), c = Math.cos(theta);

    // Коленвал и маховик — напрямую от theta
    this.crankshaft.rotation.x = theta;
    this.flywheel.rotation.x = theta;

    // Позиция поршня — из кинематики по theta
    const yp = C.R_CRANK * c + Math.sqrt(Math.max(0, C.L_ROD*C.L_ROD - C.R_CRANK*C.R_CRANK*s*s));
    this.piston.position.y = yp;
    this.rings.position.y = yp;

    // Шатун
    const pinY = C.R_CRANK * c;
    const pinZ = C.R_CRANK * s;
    this.rod.position.set(0, pinY, pinZ);
    const dy = yp - pinY;
    const dz = -pinZ;
    this.rod.rotation.x = Math.atan2(dz, dy);

    // Клапаны — их x берётся из физики, не из угла!
    const liftScale = 1.0;
    for (const name of ['intake', 'exhaust']) {
      const valve = name === 'intake' ? engine.intake : engine.exhaust;
      const meshes = this.valveMeshes[name];
      for (const { stem, plate, baseY } of meshes) {
        stem.position.y = baseY.stem - valve.x * liftScale;
        plate.position.y = baseY.plate - valve.x * liftScale;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}