import "./style.css";

const canvas = document.querySelector("#scene");
const ctx = canvas.getContext("2d");
const speedReadout = document.querySelector("#speed");

const keys = new Set();
let width = 0;
let height = 0;
let dpr = 1;

const car = {
  x: 0,
  lateral: 0,
  speed: 0,
  heading: 0,
  targetHeading: 0,
};

const road = {
  curve: 0,
  distance: 0,
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

function update(dt) {
  const throttle = pressed("w", "arrowup") ? 1 : 0;
  const brake = pressed("s", "arrowdown") ? 1 : 0;
  const steer = (pressed("d", "arrowright") ? 1 : 0) - (pressed("a", "arrowleft") ? 1 : 0);

  car.speed += throttle * 32 * dt;
  car.speed -= brake * 52 * dt;
  car.speed -= car.speed * 0.65 * dt;
  car.speed = Math.max(0, Math.min(115, car.speed));

  const steeringAuthority = 0.00034 * car.speed;
  car.targetHeading += steer * steeringAuthority * 60 * dt;

  // Smooth actual heading. Steering never directly teleports the vehicle sideways.
  car.heading += (car.targetHeading - car.heading) * Math.min(1, dt * 7);

  car.lateral += steer * (0.55 + car.speed / 130) * dt;
  car.lateral *= Math.pow(0.86, dt * 60);
  car.lateral = Math.max(-1.05, Math.min(1.05, car.lateral));

  road.distance += car.speed * dt * 0.035;
  road.curve = Math.sin(road.distance * 0.75) * 0.22 + Math.sin(road.distance * 0.31) * 0.12;
}

function roadX(depth) {
  const bend = road.curve * depth * depth;
  return width / 2 + bend * width * 0.42;
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, height * 0.58);
  g.addColorStop(0, "#6d7274");
  g.addColorStop(0.55, "#9a9b96");
  g.addColorStop(1, "#c0b8a5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawTrees() {
  const horizon = height * 0.39;
  for (let side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const depth = i / 30;
      const y = horizon + Math.pow(depth, 1.7) * height * 0.5;
      const x = width / 2 + side * (width * 0.18 + depth * width * 0.48);
      const size = 8 + depth * 65;

      ctx.globalAlpha = 0.25 + depth * 0.55;
      ctx.fillStyle = i % 3 === 0 ? "#a34f25" : "#b7652e";
      ctx.beginPath();
      ctx.arc(x, y - size * 0.55, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#4a3325";
      ctx.fillRect(x - size * 0.08, y - size * 0.35, size * 0.16, size * 0.7);
    }
  }
  ctx.globalAlpha = 1;
}

function drawRoad() {
  const horizon = height * 0.39;

  ctx.fillStyle = "#303338";
  ctx.fillRect(0, horizon, width, height - horizon);

  // Perspective road surface.
  ctx.beginPath();
  ctx.moveTo(roadX(0), horizon);
  ctx.lineTo(roadX(0), horizon);
  ctx.lineTo(width * 0.93, height);
  ctx.lineTo(width * 0.07, height);
  ctx.closePath();
  ctx.fillStyle = "#202326";
  ctx.fill();

  // Wet reflection layer.
  const reflection = ctx.createLinearGradient(0, horizon, 0, height);
  reflection.addColorStop(0, "rgba(180,165,140,.04)");
  reflection.addColorStop(1, "rgba(230,185,110,.16)");
  ctx.fillStyle = reflection;
  ctx.fillRect(0, horizon, width, height - horizon);

  // Road lines.
  for (let i = 1; i < 18; i++) {
    const depth = i / 18;
    const y = horizon + Math.pow(depth, 1.65) * (height - horizon);
    const x = roadX(depth);
    const half = 3 + depth * width * 0.28;

    ctx.strokeStyle = "rgba(226,188,101,.88)";
    ctx.lineWidth = 1 + depth * 4;
    ctx.beginPath();
    ctx.moveTo(x - half * 0.02, y);
    ctx.lineTo(x + half * 0.02, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(214,211,198,.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.07, height);
  ctx.lineTo(width * 0.39, horizon);
  ctx.moveTo(width * 0.93, height);
  ctx.lineTo(width * 0.61, horizon);
  ctx.stroke();
}

function drawCar() {
  const cx = width / 2 + car.lateral * width * 0.16;
  const cy = height * 0.78;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(car.heading * 0.18);

  // Ground reflection.
  ctx.fillStyle = "rgba(190,128,64,.16)";
  ctx.beginPath();
  ctx.ellipse(0, 48, 105, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shadow.
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.beginPath();
  ctx.ellipse(0, 25, 68, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Car body.
  ctx.fillStyle = "#3b4144";
  ctx.beginPath();
  ctx.roundRect(-48, -24, 96, 55, 12);
  ctx.fill();

  ctx.fillStyle = "#1d2022";
  ctx.beginPath();
  ctx.roundRect(-32, -39, 64, 32, 10);
  ctx.fill();

  ctx.fillStyle = "rgba(210,216,214,.5)";
  ctx.beginPath();
  ctx.roundRect(-25, -34, 50, 18, 7);
  ctx.fill();

  ctx.fillStyle = "#d6a04c";
  ctx.fillRect(-43, 20, 14, 5);
  ctx.fillRect(29, 20, 14, 5);

  ctx.fillStyle = "#b7352d";
  ctx.fillRect(-38, 27, 18, 4);
  ctx.fillRect(20, 27, 18, 4);

  ctx.restore();
}

function drawMotion(dt) {
  const amount = Math.min(0.16, car.speed / 800);
  if (amount <= 0.01) return;

  ctx.fillStyle = `rgba(235,195,135,${amount})`;
  for (let i = 0; i < 10; i++) {
    const y = height * (0.48 + Math.random() * 0.5);
    const len = 20 + car.speed * (0.35 + Math.random() * 0.5);
    const x = Math.random() < 0.5 ? 0 : width;
    ctx.fillRect(x < width / 2 ? x : x - len, y, len, 1);
  }
}

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;

  update(dt);
  drawSky();
  drawTrees();
  drawRoad();
  drawMotion(dt);
  drawCar();

  speedReadout.textContent = `${Math.round(car.speed)} km/h`;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
