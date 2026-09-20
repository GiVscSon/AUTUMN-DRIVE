import "./style.css";

const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");
const speedReadout = document.querySelector("#speed");

const keys = new Set();
let width = 0;
let height = 0;
let dpr = 1;

const car = {
  lateral: 0,
  lateralVelocity: 0,
  speed: 0,
  heading: 0,
  targetHeading: 0,
  steerVisual: 0,
  slip: 0,
};

const camera = {
  x: 0,
  y: 0,
  roll: 0,
  lookAhead: 0,
  speedZoom: 0,
  shakeX: 0,
  shakeY: 0,
};

const world = {
  distance: 0,
  road: {
    segmentLength: 1,
    laneWidth: 1,
    segments: [
      { length: 2.4, curve: 0.0, width: 1.0 },
      { length: 1.8, curve: 0.16, width: 1.0 },
      { length: 2.1, curve: 0.28, width: 1.0 },
      { length: 1.6, curve: -0.12, width: 1.0 },
      { length: 2.0, curve: -0.3, width: 1.0 },
      { length: 2.4, curve: 0.0, width: 1.0 },
      { length: 1.5, curve: 0.0, width: 1.15, intersection: true },
      { length: 1.7, curve: 0.0, width: 1.0 },
      { length: 2.0, curve: -0.22, width: 1.0 },
      { length: 2.2, curve: 0.2, width: 1.0 },
    ],
  },
  roadCenter: 0,
  curve: 0,
  traffic: [
    { z: 0.34, lane: -0.34, routeLane: -0.34, speed: 62, color: "#596267" },
    { z: 0.62, lane: 0.38, routeLane: 0.38, speed: 48, color: "#7c4630" },
    { z: 0.82, lane: -0.18, routeLane: -0.18, speed: 76, color: "#a08a57" },
    { z: 0.48, lane: 0.34, routeLane: 0.34, speed: 57, color: "#4f5d60" },
  ],
  roadside: [
    { z: 0.22, side: -1, type: "sign" },
    { z: 0.44, side: 1, type: "sign" },
    { z: 0.69, side: -1, type: "barrier" },
    { z: 0.88, side: 1, type: "barrier" },
  ],
};

window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function pressed(...names) {
  return names.some((name) => keys.has(name));
}

function roadSample(distance) {
  const loopLength = world.road.segments.reduce((sum, segment) => sum + segment.length, 0);
  let d = ((distance % loopLength) + loopLength) % loopLength;
  let offset = 0;
  let curve = 0;
  let widthScale = 1;
  let intersection = false;
  let segmentIndex = 0;

  for (let i = 0; i < world.road.segments.length; i++) {
    const segment = world.road.segments[i];
    if (d <= offset + segment.length) {
      const local = (d - offset) / segment.length;
      const smooth = local * local * (3 - 2 * local);
      curve = segment.curve * smooth;
      widthScale = segment.width;
      intersection = Boolean(segment.intersection);
      segmentIndex = i;
      break;
    }
    offset += segment.length;
  }

  return { curve, widthScale, intersection, segmentIndex, loopLength };
}

function routeForTraffic(other, dt) {
  if (!other.routeState) {
    other.routeState = "straight";
    other.routeTargetLane = other.routeLane;
  }

  const sample = roadSample(world.distance + (0.82 - other.z) * 8);
  if (sample.intersection && !other.routeChosen) {
    other.routeChosen = true;
    if (Math.abs(other.routeLane) > 0.2 && Math.random() < 0.32) {
      other.routeState = other.routeLane < 0 ? "left" : "right";
      other.routeTargetLane = other.routeLane < 0 ? -0.62 : 0.62;
    }
  }

  if (!sample.intersection) {
    other.routeChosen = false;
  }

  other.lane += (other.routeTargetLane - other.lane) * Math.min(1, dt * 1.8);
}

const touchInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
};

function update(dt) {
  const keyboardThrottle = pressed("w", "arrowup") ? 1 : 0;
  const keyboardBrake = pressed("s", "arrowdown") ? 1 : 0;
  const keyboardSteer =
    (pressed("d", "arrowright") ? 1 : 0) - (pressed("a", "arrowleft") ? 1 : 0);

  const throttle = Math.max(keyboardThrottle, touchInput.throttle);
  const brake = Math.max(keyboardBrake, touchInput.brake);
  const steer = keyboardSteer || touchInput.steer;

  // Progressive engine force: lively at low speed, softer near top speed.
  const speedRatio = car.speed / 150;
  const engineForce = 54 * Math.max(0.2, 1 - speedRatio * 0.72);
  car.speed += throttle * engineForce * dt;
  car.speed -= brake * (82 + car.speed * 0.08) * dt;

  // Rolling resistance + aero drag. Coasting now feels gradual instead of sticky.
  car.speed -= (0.7 + car.speed * 0.012 + car.speed * car.speed * 0.00011) * dt;
  car.speed = Math.max(0, Math.min(150, car.speed));

  const speedGrip = Math.min(1, car.speed / 32);
  const highSpeedCalm = 1 - Math.min(0.52, car.speed / 290);
  const maxHeading = 0.48 * highSpeedCalm;
  const steerRate = (1.5 + car.speed * 0.004) * speedGrip;

  car.targetHeading += steer * steerRate * dt;
  if (!steer) {
    // Self-centering steering prevents the car from continuing to turn after release.
    car.targetHeading *= Math.max(0, 1 - dt * (2.2 + car.speed * 0.006));
  }
  car.targetHeading = Math.max(-maxHeading, Math.min(maxHeading, car.targetHeading));
  car.heading += (car.targetHeading - car.heading) * Math.min(1, dt * (5.2 + speedGrip * 2.5));
  car.steerVisual += (steer - car.steerVisual) * Math.min(1, dt * 9);

  world.distance += car.speed * dt * 0.026;
  const sample = roadSample(world.distance);
  world.curve += (sample.curve - world.curve) * Math.min(1, dt * 3.2);

  // Simple bicycle-style lateral physics. Heading creates lateral velocity first,
  // then tyre grip damps it. This removes the old sideways "teleport" feeling.
  const desiredLateralVelocity = car.heading * car.speed * 0.0105;
  const curvePull = world.curve * car.speed * car.speed * 0.000018;
  const wetGrip = 4.8 - Math.min(1.45, car.speed / 105);
  car.lateralVelocity += (desiredLateralVelocity + curvePull - car.lateralVelocity) * Math.min(1, dt * wetGrip);
  car.lateral += car.lateralVelocity * dt;

  // Soft shoulder resistance and speed loss when leaving the useful road width.
  const shoulder = Math.max(0, Math.abs(car.lateral) - 0.72);
  if (shoulder > 0) {
    car.speed = Math.max(0, car.speed - shoulder * 52 * dt);
    car.lateralVelocity *= Math.max(0, 1 - dt * 3.5);
  }
  car.lateral = Math.max(-0.9, Math.min(0.9, car.lateral));

  // A small readable wet-road slip value for body lean/camera feel.
  car.slip += ((car.lateralVelocity * 0.55 - car.heading * 0.18) - car.slip) * Math.min(1, dt * 5);

  for (const other of world.traffic) {
    if (other.baseSpeed == null) other.baseSpeed = other.speed;

    let nearestAhead = null;
    let nearestGap = Infinity;
    for (const candidate of world.traffic) {
      if (candidate === other) continue;
      const sameLane = Math.abs(candidate.lane - other.lane) < 0.12;
      const gap = candidate.z - other.z;
      if (sameLane && gap > 0 && gap < nearestGap) {
        nearestGap = gap;
        nearestAhead = candidate;
      }
    }

    if (nearestAhead && nearestGap < 0.075) {
      const urgency = Math.max(0, (0.075 - nearestGap) / 0.075);
      const target = Math.min(other.baseSpeed, nearestAhead.speed - urgency * 10);
      other.speed += (Math.max(20, target) - other.speed) * Math.min(1, dt * 4.5);
    } else {
      other.speed += (other.baseSpeed - other.speed) * Math.min(1, dt * 0.8);
    }

    other.z += (car.speed - other.speed) * dt * 0.00075;
    if (other.z < 0.08) {
      other.z = 0.98;
      other.lane = other.routeLane;
      other.routeTargetLane = other.routeLane;
      other.routeChosen = false;
    }
    if (other.z > 1.02) other.z = 0.12;

    routeForTraffic(other, dt);
  }

  for (const other of world.traffic) {
    if (Math.abs(other.z - 0.82) < 0.075 && Math.abs(other.lane - car.lateral * 0.62) < 0.22) {
      car.speed = Math.min(car.speed, Math.max(10, other.speed * 0.78));
      car.lateralVelocity *= 0.72;
    }
  }

  // Chase-camera response. The horizon follows actual motion, not raw steering input.
  const speedNorm = Math.min(1, car.speed / 150);
  const targetCamX = -car.lateral * width * 0.055 - car.heading * width * 0.028;
  const targetRoll = -car.heading * 0.025 - car.slip * 0.018;
  const targetLookAhead = car.heading * width * (0.035 + speedNorm * 0.03);
  const targetZoom = speedNorm * 0.055;

  camera.x += (targetCamX - camera.x) * Math.min(1, dt * 4.2);
  camera.roll += (targetRoll - camera.roll) * Math.min(1, dt * 4.8);
  camera.lookAhead += (targetLookAhead - camera.lookAhead) * Math.min(1, dt * 3.2);
  camera.speedZoom += (targetZoom - camera.speedZoom) * Math.min(1, dt * 2.6);

  const roughness = speedNorm * speedNorm;
  const phase = world.distance * 18;
  camera.shakeX = Math.sin(phase * 0.73) * 1.2 * roughness;
  camera.shakeY = Math.sin(phase) * 0.85 * roughness;
}

function project(depth, lane = 0) {
  const speedNorm = Math.min(1, car.speed / 150);
  const horizon = height * (0.405 - camera.speedZoom * 0.26);
  const p = Math.pow(depth, 1.72 - speedNorm * 0.08);
  const y = horizon + p * (height - horizon) + camera.shakeY * p;
  const roadHalf = width * (0.042 + p * (0.47 + camera.speedZoom * 0.42));
  const bend = world.curve * p * p * width * 0.39;
  const perspectiveFollow = camera.lookAhead * (0.25 + p * 0.75);
  const center = width / 2 + bend + camera.x + perspectiveFollow + camera.shakeX * p;
  const laneOffset = lane * roadHalf * world.road.laneWidth;
  return { x: center + laneOffset, y, roadHalf, center, p, horizon };
}

function drawSky() {
  const horizon = project(0, 0).horizon;
  const g = ctx.createLinearGradient(0, 0, 0, horizon + height * 0.15);
  g.addColorStop(0, "#62686b");
  g.addColorStop(0.55, "#858b8b");
  g.addColorStop(1, "#b8b09d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#eef0ea";
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(
      width * (0.12 + i * 0.16),
      height * (0.16 + (i % 3) * 0.035),
      width * 0.16,
      height * 0.045,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDistantForest() {
  const horizon = project(0, 0).horizon;
  ctx.fillStyle = "#303c36";
  ctx.fillRect(0, horizon - 28, width, 42);

  for (let i = 0; i < 75; i++) {
    const x = (i / 74) * width;
    const h = 18 + ((i * 37) % 41);
    ctx.fillStyle = i % 4 === 0 ? "#76523b" : "#46513f";
    ctx.beginPath();
    ctx.arc(x, horizon - h * 0.45, h * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoad() {
  const nearL = project(1, -1);
  const nearR = project(1, 1);
  const farL = project(0, -1);
  const farR = project(0, 1);
  const horizon = farL.horizon;

  ctx.fillStyle = "#313438";
  ctx.fillRect(0, horizon, width, height - horizon);

  ctx.beginPath();
  ctx.moveTo(farL.x, farL.y);
  ctx.lineTo(farR.x, farR.y);
  ctx.lineTo(nearR.x, nearR.y);
  ctx.lineTo(nearL.x, nearL.y);
  ctx.closePath();
  ctx.fillStyle = "#1d2122";
  ctx.fill();

  const wet = ctx.createLinearGradient(0, horizon, 0, height);
  wet.addColorStop(0, "rgba(210,205,184,.02)");
  wet.addColorStop(0.55, "rgba(191,150,92,.08)");
  wet.addColorStop(1, "rgba(235,194,118,.17)");
  ctx.fillStyle = wet;
  ctx.fill();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const d = i / 40;
      const p = project(d, side);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(224,215,190,.86)";
    ctx.lineWidth = 1.2 + 4 * Math.pow(0.5, 1 - 0.01);
    ctx.stroke();
  }

  // Dashed centre line flows toward the camera with world distance.
  const stripePhase = (world.distance * 0.34) % 1;
  for (let i = 0; i < 22; i++) {
    const raw = (i + stripePhase) / 22;
    const d = raw % 1;
    if (d < 0.045) continue;
    const p = project(d, 0);
    const d2 = Math.min(1, d + 0.026 + d * 0.032);
    const p2 = project(d2, 0);
    ctx.strokeStyle = "rgba(236,220,177,.94)";
    ctx.lineWidth = 1.1 + d * 5.8;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  const junction = roadSample(world.distance);
  if (junction.intersection) {
    const p = project(0.48, 0);
    ctx.fillStyle = "rgba(190,184,160,.12)";
    ctx.fillRect(p.x - p.roadHalf * 1.35, p.y - 8, p.roadHalf * 2.7, 16);
    ctx.strokeStyle = "rgba(220,214,190,.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - p.roadHalf * 0.85, p.y - 5);
    ctx.lineTo(p.x + p.roadHalf * 0.85, p.y - 5);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 16; i++) {
    const d = 0.08 + i / 20;
    const p = project(Math.min(1, d), i % 2 ? -0.48 : 0.48);
    ctx.strokeStyle = i % 3 === 0 ? "#b76d3e" : "#c7a65e";
    ctx.lineWidth = 1 + d * 6;
    ctx.beginPath();
    ctx.moveTo(p.x - p.roadHalf * 0.22, p.y);
    ctx.lineTo(p.x + p.roadHalf * 0.22, p.y + 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTree(side, depth, seed) {
  const p = project(depth, side * (1.18 + (seed % 4) * 0.07));
  const s = 8 + p.p * Math.min(width, height) * 0.095;
  const trunkH = s * 1.1;

  ctx.globalAlpha = 0.35 + p.p * 0.6;
  ctx.fillStyle = "#4a3427";
  ctx.fillRect(p.x - s * 0.07, p.y - trunkH, s * 0.14, trunkH);

  const colors = ["#9b4c27", "#b45b2c", "#c47a35", "#7d4429"];
  ctx.fillStyle = colors[seed % colors.length];
  ctx.beginPath();
  ctx.arc(p.x, p.y - trunkH - s * 0.55, s * 0.8, 0, Math.PI * 2);
  ctx.arc(p.x - s * 0.55, p.y - trunkH - s * 0.35, s * 0.6, 0, Math.PI * 2);
  ctx.arc(p.x + s * 0.55, p.y - trunkH - s * 0.3, s * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawForest() {
  for (let i = 28; i >= 1; i--) {
    const depth = i / 29;
    drawTree(-1, depth, i * 3 + 1);
    drawTree(1, depth, i * 5 + 2);
  }
}

function drawRoadsideObjects() {
  for (const obj of world.roadside) {
    const p = project(obj.z, obj.side * (1.12 + (roadSample(world.distance + obj.z * 2).intersection ? 0.18 : 0)));
    const s = 7 + p.p * Math.min(width, height) * 0.055;

    ctx.globalAlpha = 0.45 + p.p * 0.5;
    if (obj.type === "sign") {
      ctx.strokeStyle = "#3b3d39";
      ctx.lineWidth = Math.max(1, s * 0.11);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - s * 2.4);
      ctx.stroke();

      ctx.fillStyle = "#d4c8a7";
      ctx.fillRect(p.x - s * 0.62, p.y - s * 2.65, s * 1.24, s * 0.72);
      ctx.fillStyle = "#6e4b31";
      ctx.fillRect(p.x - s * 0.42, p.y - s * 2.45, s * 0.84, s * 0.1);
    } else {
      ctx.strokeStyle = "#b96531";
      ctx.lineWidth = Math.max(2, s * 0.24);
      ctx.beginPath();
      ctx.moveTo(p.x - s * 0.8, p.y - s * 0.25);
      ctx.lineTo(p.x + s * 0.8, p.y - s * 0.25);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawTraffic() {
  for (const other of world.traffic) {
    const p = project(other.z, other.lane);
    const s = 10 + p.p * Math.min(width, height) * 0.075;

    ctx.save();
    ctx.translate(p.x, p.y - s * 0.28);
    ctx.globalAlpha = 0.35 + p.p * 0.65;

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.38, s * 0.72, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = other.color;
    ctx.beginPath();
    ctx.roundRect(-s * 0.62, -s * 0.32, s * 1.24, s * 0.62, s * 0.12);
    ctx.fill();

    ctx.fillStyle = "#202527";
    ctx.fillRect(-s * 0.4, -s * 0.58, s * 0.8, s * 0.3);

    ctx.fillStyle = "#d9a14c";
    ctx.fillRect(-s * 0.48, s * 0.16, s * 0.18, s * 0.08);
    ctx.fillRect(s * 0.3, s * 0.16, s * 0.18, s * 0.08);
    ctx.restore();
  }
}

function drawCar() {
  const speedNorm = Math.min(1, car.speed / 150);
  const cx = width / 2 + car.lateral * width * 0.18 + camera.shakeX * 0.35;
  const cy = height * (0.79 + speedNorm * 0.012) + camera.shakeY * 0.28;
  const lean = car.heading * 0.09 + car.slip * 0.045 - camera.roll * 0.45;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(lean);

  ctx.fillStyle = "rgba(211,151,75,.17)";
  ctx.beginPath();
  ctx.ellipse(0, 58, 116, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,.52)";
  ctx.beginPath();
  ctx.ellipse(0, 28, 74, 23, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#3d4547";
  ctx.beginPath();
  ctx.roundRect(-52, -24, 104, 58, 12);
  ctx.fill();

  ctx.fillStyle = "#202528";
  ctx.beginPath();
  ctx.roundRect(-34, -48, 68, 35, 12);
  ctx.fill();

  ctx.fillStyle = "rgba(177,194,192,.55)";
  ctx.beginPath();
  ctx.moveTo(-27, -42);
  ctx.lineTo(-4, -43);
  ctx.lineTo(-4, -19);
  ctx.lineTo(-27, -19);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4, -43);
  ctx.lineTo(27, -42);
  ctx.lineTo(27, -19);
  ctx.lineTo(4, -19);
  ctx.closePath();
  ctx.fill();

  const bob = Math.sin(world.distance * 5.5) * Math.min(1.5, car.speed / 100);
  ctx.save();
  ctx.translate(0, -23 + bob);

  // сиденье
  ctx.fillStyle = "#1a1f22";
  ctx.fillRect(-12, 0, 24, 16);

  // спинка кресла, слегка наклонена вперёд (в сторону дороги)
  ctx.save();
  ctx.translate(0, -10);
  ctx.rotate(-0.15);
  ctx.fillStyle = "#22272a";
  ctx.fillRect(-10, -16, 20, 18);
  ctx.restore();

  // голова, немного сзади, смотрит к горизонту
  ctx.fillStyle = "#171b1d";
  ctx.beginPath();
  ctx.arc(0, -22, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eee9dc";
  ctx.beginPath();
  ctx.ellipse(0, -21, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // руль перед персонажем
  ctx.strokeStyle = "#171b1d";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -6, 7, Math.PI * 0.2, Math.PI * 1.8);
  ctx.stroke();

  // руки в профиль, тянутся к рулю, учитывая heading
  ctx.strokeStyle = "#171b1d";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.lineTo(-10, -8 - car.heading * 3);
  ctx.moveTo(4, -12);
  ctx.lineTo(10, -8 + car.heading * 3);
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = "#d6a34d";
  ctx.fillRect(-46, 20, 15, 5);
  ctx.fillRect(31, 20, 15, 5);
  ctx.fillStyle = "#b7372d";
  ctx.fillRect(-40, 29, 18, 4);
  ctx.fillRect(22, 29, 18, 4);

  ctx.restore();
}

function attachMobileControls() {
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");
  const btnThrottle = document.getElementById("btn-throttle");
  const btnBrake = document.getElementById("btn-brake");
  if (!btnLeft || !btnRight || !btnThrottle || !btnBrake) return;

  const start = (setter, value) => (e) => {
    e.preventDefault();
    setter(value);
  };
  const stop = (setter) => (e) => {
    e.preventDefault();
    setter(0);
  };

  const bindHold = (button, setter, value) => {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture?.(e.pointerId);
      setter(value);
      button.classList.add("active");
    });
    const release = (e) => {
      e.preventDefault();
      setter(0);
      button.classList.remove("active");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  };

  bindHold(btnLeft, (v) => (touchInput.steer = v), -1);
  bindHold(btnRight, (v) => (touchInput.steer = v), 1);
  bindHold(btnThrottle, (v) => (touchInput.throttle = v), 1);
  bindHold(btnBrake, (v) => (touchInput.brake = v), 1);
}

attachMobileControls();

function drawMotion() {
  const speedNorm = Math.min(1, car.speed / 150);
  if (speedNorm < 0.18) return;

  const amount = 0.025 + speedNorm * 0.11;
  ctx.globalAlpha = amount;
  const count = 8 + Math.floor(speedNorm * 18);
  for (let i = 0; i < count; i++) {
    const seed = (i * 37 + Math.floor(world.distance * 7)) % 101;
    const y = height * (0.47 + ((seed * 13) % 50) / 100);
    const x = ((seed * 73) % 100) / 100 * width;
    const len = 18 + car.speed * (0.22 + ((seed % 7) / 18));
    ctx.strokeStyle = i % 4 === 0 ? "#d4b16e" : "#9b9c91";
    ctx.lineWidth = 0.8 + speedNorm * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - camera.lookAhead * 0.018, y + len * 0.09);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const speedNorm = Math.min(1, car.speed / 150);
  const g = ctx.createRadialGradient(
    width / 2,
    height * 0.58,
    Math.min(width, height) * 0.18,
    width / 2,
    height * 0.58,
    Math.max(width, height) * 0.72
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.7, `rgba(0,0,0,${0.05 + speedNorm * 0.02})`);
  g.addColorStop(1, `rgba(0,0,0,${0.22 + speedNorm * 0.08})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;

  update(dt);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(camera.roll);
  ctx.translate(-width / 2, -height / 2);

  drawSky();
  drawDistantForest();
  drawRoad();
  drawForest();
  drawRoadsideObjects();
  drawTraffic();
  drawMotion();
  drawCar();
  ctx.restore();

  drawVignette();

  speedReadout.textContent = Math.round(car.speed) + " km/h";
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
