/* Shared by the page, computation worker and dependency-free Node tests. */
(function (root) {
  'use strict';
  const K = 8.9875517923e9;
  const LIMITS = Object.freeze({ charges: 200, coordinate: 1e9, charge: 1e6 });
  function fieldAt(x, y, charges) {
    let scale = 0;
    for (const c of charges) scale = Math.max(scale, Math.abs(c.q));
    if (!scale) return { x: 0, y: 0, magnitude: 0, dx: 0, dy: 0, singular: false };
    let vx = 0, vy = 0, weights = 0;
    for (const c of charges) {
      if (!c.q) continue;
      const rx = x - c.x, ry = y - c.y, r = Math.hypot(rx, ry);
      if (r === 0) return { x: NaN, y: NaN, magnitude: Infinity, dx: 0, dy: 0, singular: true };
      const strength = (c.q / scale) / r / r;
      vx += strength * (rx / r); vy += strength * (ry / r); weights += Math.abs(strength);
    }
    const norm = Math.hypot(vx, vy);
    // Relative cancellation test preserves direction for arbitrarily small charges.
    const stable = norm > weights * 1e-12 && Number.isFinite(norm);
    return { x: K * scale * vx, y: K * scale * vy, magnitude: K * scale * norm,
      dx: stable ? vx / norm : 0, dy: stable ? vy / norm : 0, singular: false };
  }
  function screenToWorld(x, y, view, width, height) {
    return { x: view.x + (x - width / 2) / view.scale, y: view.y - (y - height / 2) / view.scale };
  }
  function worldToScreen(x, y, view, width, height) {
    return { x: width / 2 + (x - view.x) * view.scale, y: height / 2 - (y - view.y) * view.scale };
  }
  function zoomAt(view, factor, sx, sy, width, height) {
    const before = screenToWorld(sx, sy, view, width, height);
    const scale = Math.max(1e-9, Math.min(1000000, view.scale * factor));
    return { scale, x: before.x - (sx - width / 2) / scale, y: before.y + (sy - height / 2) / scale };
  }
  function parseNumber(value, max, name) {
    const raw = String(value).trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) throw new Error(`${name}: 올바른 숫자 또는 과학적 표기법을 입력하세요.`);
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.abs(n) > max) throw new Error(`${name}: 절댓값 ${max.toExponential()} 이하의 유한한 값이 필요합니다.`);
    if (n === 0 && /[1-9]/.test(raw.split(/e/i)[0])) throw new Error(`${name}: 표현 가능한 수보다 작은 값입니다.`);
    return n;
  }
  // Display names are metadata. Internal IDs remain the identity for all operations.
  function nameKey(name) { return name.normalize('NFC').toLowerCase(); }
  function validateName(value, charges = [], excludeId = null) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('이름은 한 줄의 텍스트로 입력하세요.');
    const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('전하 이름을 입력하세요.');
    if (Array.from(name).length > 40) throw new Error('전하 이름은 40자 이하여야 합니다.');
    if (charges.some(c => c.id !== excludeId && nameKey(c.name) === nameKey(name))) throw new Error('이미 사용 중인 전하 이름입니다. 다른 이름을 입력하세요.');
    return name;
  }
  function nextChargeName(charges) {
    const used = new Set(charges.map(c => nameKey(c.name)));
    let number = 1; while (used.has(nameKey(`Q${number}`))) number++;
    return `Q${number}`;
  }
  const DEFAULTS = Object.freeze({ lineDensity: 32, arrowDensity: 1, lineWidth: 1.2, arrowSize: 5, showArrows: true, showGrid: true, showFieldControls: true });
  function validateScene(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.charges) || data.charges.length > LIMITS.charges) throw new Error('지원하는 배치 JSON(version 1, 전하 최대 200개)이 아닙니다.');
    const reserved = [], usedIds = new Set();
    // Reserve explicit names before assigning names to older nameless records.
    const names = data.charges.map(c => {
      if (!c || c.name === undefined) return undefined;
      const name = validateName(c.name, reserved); reserved.push({name}); return name;
    });
    for (const c of data.charges) if (c && c.id !== undefined) {
      if (!Number.isSafeInteger(c.id) || c.id <= 0 || c.id > Number.MAX_SAFE_INTEGER - LIMITS.charges - 1 || usedIds.has(c.id)) throw new Error('전하 ID는 서로 다른 양의 안전한 정수여야 합니다.');
      usedIds.add(c.id);
    }
    let nextId = 1;
    const charges = data.charges.map((c, i) => {
      if (!c || ['x','y','q'].some(k => typeof c[k] !== 'number')) throw new Error('전하의 x, y, q는 숫자여야 합니다.');
      let name = names[i];
      if (name === undefined) { name = nextChargeName(reserved); reserved.push({name}); }
      while (usedIds.has(nextId)) nextId++;
      const id = c.id === undefined ? nextId : c.id; usedIds.add(id);
      return { id, name, x: parseNumber(c.x, LIMITS.coordinate, 'X'), y: parseNumber(c.y, LIMITS.coordinate, 'Y'), q: parseNumber(c.q, LIMITS.charge, '전하량') };
    });
    if (!data.view || !['x','y','scale'].every(k => typeof data.view[k] === 'number' && Number.isFinite(data.view[k])) || data.view.scale < 1e-9 || data.view.scale > 1e6 || Math.abs(data.view.x) > LIMITS.coordinate || Math.abs(data.view.y) > LIMITS.coordinate) throw new Error('화면 좌표 또는 확대 비율이 잘못되었습니다.');
    const settings = { ...DEFAULTS }, ranges = { lineDensity:[8,64], arrowDensity:[.4,2], lineWidth:[.5,3], arrowSize:[3,9] };
    for (const [key,[min,max]] of Object.entries(ranges)) if (data.settings && key in data.settings) {
      const n=data.settings[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n<min || n>max) throw new Error(`시각화 설정 ${key} 범위가 잘못되었습니다.`); settings[key]=n;
    }
    for (const key of ['showArrows','showGrid','showFieldControls']) if (data.settings && key in data.settings) {
      if (typeof data.settings[key] !== 'boolean') throw new Error('표시 설정이 잘못되었습니다.'); settings[key]=data.settings[key];
    }
    return { charges, view: { x:data.view.x, y:data.view.y, scale:data.view.scale }, settings };
  }
  const api = { K, LIMITS, DEFAULTS, fieldAt, screenToWorld, worldToScreen, zoomAt, parseNumber, validateScene, validateName, nextChargeName };
  root.EFPhysics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
