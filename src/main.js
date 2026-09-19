// AUTUMN DRIVE - Pseudo-3D Driving Game
// Architecture: Road segments, curvature, lanes, traffic, intersections, player vehicle, camera

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ============ CONFIG ============
const CONFIG = {
    roadWidth: 2000,
    laneWidth: 1000,
    segmentLength: 200,
    drawDistance: 50,
    fogDensity: 0.03,
    cameraHeight: 1000,
    cameraDepth: 0.84,
    playerZ: 0,
    maxSpeed: 12000,
    accel: 150,
    decel: 100,
    brake: 300,
    turnSpeed: 0.003,
    centrifugal: 0.00002,
    offRoadDecel: 0.98,
    skyOffset: 0,
    resolution: 2,
};

// ============ STATE ============
const state = {
    speed: 0,
    playerX: 0,
    playerZ: 0,
    position: 0,
    segments: [],
    cars: [],
    roadsideObjects: [],
    keys: {
        ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
        w: false, s: false, a: false, d: false, W: false, S: false, A: false, D: false
    },
    lastTime: 0,
    skyOffset: 0,
};

// ============ ROAD SEGMENT ============
class RoadSegment {
    constructor(index, curve = 0, y = 0) {
        this.index = index;
        this.p1 = { world: { x: 0, y: y, z: index * CONFIG.segmentLength }, camera: {}, screen: {} };
        this.p2 = { world: { x: 0, y: y, z: (index + 1) * CONFIG.segmentLength }, camera: {}, screen: {} };
        this.curve = curve;
        this.color = Math.floor(index / 3) % 2 ? 
            { road: '#2a2a2a', grass: '#1a1a1a', rumble: '#cc3333', lane: '#ffffff' } :
            { road: '#262626', grass: '#161616', rumble: '#aa1111', lane: '#dddddd' };
        this.sprites = [];
    }
}

// ============ ROAD GENERATION ============
function createRoad() {
    state.segments = [];
    
    const roadPatterns = [
        { type: 'straight', length: 50 },
        { type: 'curve', curve: -2, length: 40 },
        { type: 'straight', length: 30 },
        { type: 'curve', curve: 2, length: 40 },
        { type: 'straight', length: 50 },
        { type: 'curve', curve: -1.5, length: 60 },
        { type: 'straight', length: 40 },
        { type: 'curve', curve: 1.5, length: 60 },
        { type: 'straight', length: 100 },
        { type: 'intersection', length: 1 },
        { type: 'straight', length: 80 },
        { type: 'curve', curve: -2.5, length: 50 },
        { type: 'straight', length: 60 },
    ];
    
    let index = 0;
    let y = 0;
    
    roadPatterns.forEach(pattern => {
        for (let i = 0; i < pattern.length; i++) {
            let curve = 0;
            if (pattern.type === 'curve') {
                const progress = i / pattern.length;
                if (progress < 0.1) curve = pattern.curve * (progress * 10);
                else if (progress > 0.9) curve = pattern.curve * ((1 - progress) * 10);
                else curve = pattern.curve;
            }
            
            if (pattern.type === 'straight' || pattern.type === 'curve') {
                y = Math.sin(index * 0.05) * 500;
            }
            
            const segment = new RoadSegment(index, curve, y);
            
            if (pattern.type !== 'intersection' && i % 5 === 0 && i > 0) {
                segment.sprites.push({ type: 'tree', offset: -2 - Math.random(), z: 0 });
                segment.sprites.push({ type: 'tree', offset: 2 + Math.random(), z: 0 });
            }
            
            state.segments.push(segment);
            index++;
        }
    });
    
    state.totalSegments = state.segments.length;
}

// ============ TRAFFIC ============
function createTraffic() {
    state.cars = [];
    const carColors = ['#cc3333', '#3366cc', '#33aa33', '#ccaa33', '#6633cc'];
    
    for (let i = 100; i < state.segments.length - 100; i += 30 + Math.random() * 20) {
        const lane = Math.random() > 0.5 ? -0.5 : 0.5;
        const speed = CONFIG.maxSpeed * 0.3 + Math.random() * CONFIG.maxSpeed * 0.3;
        const color = carColors[Math.floor(Math.random() * carColors.length)];
        
        state.cars.push({
            z: i * CONFIG.segmentLength,
            x: lane * CONFIG.roadWidth * 0.5,
            speed: speed,
            color: color,
            offset: lane,
            segmentIndex: i
        });
    }
}

// ============ PROJECTION ============
function project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    
    if (p.camera.z <= 0) {
        p.screen.scale = 0;
        return;
    }
    
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round((p.screen.scale * roadWidth * width / 2));
}

// ============ RENDER HELPERS ============
function renderPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
}

function renderSegment(ctx, width, lanes, x1, y1, w1, x2, y2, w2, color, fog) {
    const r1 = w1 / Math.max(6, 2 * lanes);
    const r2 = w2 / Math.max(6, 2 * lanes);
    const l1 = w1 / Math.max(6, 2 * lanes);
    const l2 = w2 / Math.max(6, 2 * lanes);
    
    ctx.fillStyle = color.grass;
    ctx.fillRect(0, y2, width, y1 - y2);
    
    renderPolygon(ctx, x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, color.rumble);
    renderPolygon(ctx, x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, color.rumble);
    
    renderPolygon(ctx, x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, color.road);
    
    if (color.lane) {
        const lanew1 = w1 * 2 / lanes;
        const lanew2 = w2 * 2 / lanes;
        let lanex1 = x1 - w1 + lanew1;
        let lanex2 = x2 - w2 + lanew2;
        
        for (let lane = 1; lane < lanes; lane++) {
            renderPolygon(ctx, lanex1 - l1/2, y1, lanex1 + l1/2, y1, lanex2 + l2/2, y2, lanex2 - l2/2, y2, color.lane);
            lanex1 += lanew1;
            lanex2 += lanew2;
        }
    }
    
    if (fog < 1) {
        ctx.fillStyle = `rgba(100, 110, 120, ${1 - fog})`;
        ctx.fillRect(0, y2, width, y1 - y2);
    }
}

function renderPlayer(ctx, width, height, steer, updown) {
    const carWidth = width * 0.15;
    const carHeight = height * 0.08;
    const carX = width / 2 - carWidth / 2;
    const carY = height - carHeight - 20;
    
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(carX, carY + carHeight * 0.3, carWidth, carHeight * 0.7);
    
    ctx.fillStyle = '#16213e';
    ctx.fillRect(carX + carWidth * 0.15, carY, carWidth * 0.7, carHeight * 0.35);
    
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(carX + carWidth * 0.2, carY + carHeight * 0.05, carWidth * 0.6, carHeight * 0.25);
    
    ctx.fillStyle = '#e94560';
    ctx.fillRect(carX + carWidth * 0.1, carY + carHeight * 0.5, carWidth * 0.2, carHeight * 0.15);
    ctx.fillRect(carX + carWidth * 0.7, carY + carHeight * 0.5, carWidth * 0.2, carHeight * 0.15);
    
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(carX + carWidth * 0.4, carY + carHeight * 0.55, carWidth * 0.2, carHeight * 0.1);
    
    ctx.fillStyle = 'rgba(20, 20, 30, 0.5)';
    ctx.fillRect(carX - 5, carY + carHeight, carWidth + 10, 10);
}

function renderTrafficCar(ctx, car, width, height, segment) {
    if (!segment || !segment.p1.screen.scale || segment.p1.screen.scale <= 0) return;
    
    const scale = segment.p1.screen.scale;
    const carW = 400 * scale * width / 2;
    const carH = 200 * scale * height / 2;
    const carX = segment.p1.screen.x - carW / 2;
    const carY = segment.p1.screen.y - carH;
    
    if (carW < 1 || carH < 1) return;
    
    ctx.fillStyle = car.color;
    ctx.fillRect(carX, carY + carH * 0.4, carW, carH * 0.6);
    
    ctx.fillStyle = adjustColor(car.color, -30);
    ctx.fillRect(carX + carW * 0.15, carY, carW * 0.7, carH * 0.4);
    
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(carX + carW * 0.2, carY + carH * 0.05, carW * 0.6, carH * 0.3);
    
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(carX + carW * 0.05, carY + carH * 0.5, carW * 0.2, carH * 0.2);
    ctx.fillRect(carX + carW * 0.75, carY + carH * 0.5, carW * 0.2, carH * 0.2);
}

function adjustColor(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function renderTree(ctx, x, y, scale) {
    const treeW = 300 * scale * 0.5;
    const treeH = 600 * scale * 0.5;
    
    if (treeW < 1 || treeH < 1) return;
    
    ctx.fillStyle = '#3d2817';
    ctx.fillRect(x - treeW * 0.1, y - treeH * 0.3, treeW * 0.2, treeH * 0.3);
    
    const colors = ['#cc5500', '#aa4400', '#883300', '#cc6600'];
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    
    ctx.beginPath();
    ctx.moveTo(x, y - treeH);
    ctx.lineTo(x - treeW * 0.5, y - treeH * 0.3);
    ctx.lineTo(x + treeW * 0.5, y - treeH * 0.3);
    ctx.closePath();
    ctx.fill();
}

// ============ UPDATE ============
function update(dt) {
    const playerSegment = findSegment(state.playerZ);
    const speedPercent = state.speed / CONFIG.maxSpeed;
    
    const up = state.keys.ArrowUp || state.keys.w || state.keys.W;
    const down = state.keys.ArrowDown || state.keys.s || state.keys.S;
    const left = state.keys.ArrowLeft || state.keys.a || state.keys.A;
    const right = state.keys.ArrowRight || state.keys.d || state.keys.D;
    
    if (up) state.speed = Math.min(CONFIG.maxSpeed, state.speed + CONFIG.accel);
    else if (down) state.speed = Math.max(0, state.speed - CONFIG.brake);
    else state.speed = Math.max(0, state.speed - CONFIG.decel);
    
    if ((state.playerX < -1 || state.playerX > 1) && state.speed > CONFIG.maxSpeed * 0.2) {
        state.speed *= CONFIG.offRoadDecel;
    }
    
    let steer = 0;
    if (left) steer = -1;
    if (right) steer = 1;
    
    state.playerX += steer * speedPercent * CONFIG.turnSpeed * dt * 60;
    state.playerX -= playerSegment.curve * speedPercent * CONFIG.centrifugal * dt * 60;
    state.playerZ += state.speed * dt;
    
    if (state.playerZ >= state.totalSegments * CONFIG.segmentLength) {
        state.playerZ -= state.totalSegments * CONFIG.segmentLength;
    }
    if (state.playerZ < 0) state.playerZ = 0;
    
    state.skyOffset += playerSegment.curve * speedPercent * 0.05;
    
    state.cars.forEach(car => {
        car.z += car.speed * dt;
        if (car.z >= state.totalSegments * CONFIG.segmentLength) {
            car.z -= state.totalSegments * CONFIG.segmentLength;
        }
        car.segmentIndex = Math.floor(car.z / CONFIG.segmentLength);
    });
}

function findSegment(z) {
    const index = Math.floor(z / CONFIG.segmentLength) % state.totalSegments;
    return state.segments[index];
}

// ============ RENDER ============
function render() {
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const gradient = ctx.createLinearGradient(0, 0, 0, height / 2);
    gradient.addColorStop(0, '#4a5568');
    gradient.addColorStop(1, '#718096');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height / 2);
    
    const baseSegment = findSegment(state.playerZ);
    const basePercent = (state.playerZ % CONFIG.segmentLength) / CONFIG.segmentLength;
    
    let dx = -(baseSegment.curve * basePercent);
    let x = 0;
    let maxY = height;
    
    for (let n = 0; n < CONFIG.drawDistance; n++) {
        const segment = state.segments[(baseSegment.index + n) % state.totalSegments];
        const looped = segment.index < baseSegment.index;
        
        let cameraZ = state.playerZ - (looped ? state.totalSegments * CONFIG.segmentLength : 0);
        
        project(
            segment.p1,
            (state.playerX * CONFIG.roadWidth) - x,
            CONFIG.cameraHeight + baseSegment.p1.world.y,
            cameraZ,
            CONFIG.cameraDepth,
            width,
            height,
            CONFIG.roadWidth
        );
        
        project(
            segment.p2,
            (state.playerX * CONFIG.roadWidth) - x - dx,
            CONFIG.cameraHeight + baseSegment.p1.world.y,
            cameraZ,
            CONFIG.cameraDepth,
            width,
            height,
            CONFIG.roadWidth
        );
        
        x += dx;
        dx += segment.curve;
        
        if (segment.p1.camera.z <= CONFIG.cameraDepth || 
            segment.p2.screen.y >= maxY || 
            segment.p2.screen.y >= segment.p1.screen.y) {
            continue;
        }
        
        const fog = Math.max(0, 1 - n / CONFIG.drawDistance);
        
        renderSegment(
            ctx, width, 2,
            segment.p1.screen.x, segment.p1.screen.y, segment.p1.screen.w,
            segment.p2.screen.x, segment.p2.screen.y, segment.p2.screen.w,
            segment.color,
            fog
        );
        
        maxY = segment.p1.screen.y;
        
        segment.sprites.forEach(sprite => {
            if (sprite.type === 'tree') {
                const spriteScale = segment.p1.screen.scale;
                const spriteX = segment.p1.screen.x + (spriteScale * sprite.offset * CONFIG.roadWidth * width / 2);
                const spriteY = segment.p1.screen.y;
                renderTree(ctx, spriteX, spriteY, spriteScale);
            }
        });
        
        state.cars.forEach(car => {
            if (car.segmentIndex === segment.index) {
                renderTrafficCar(ctx, car, width, height, segment);
            }
        });
    }
    
    renderPlayer(ctx, width, height, 0, 0);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, 150, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText(`Speed: ${Math.round(state.speed / 100)} km/h`, 20, 35);
    ctx.fillText(`Pos: ${Math.round(state.playerZ / 1000)}m`, 20, 55);
}

// ============ GAME LOOP ============
function gameLoop(time) {
    const dt = Math.min(1, (time - state.lastTime) / 1000);
    state.lastTime = time;
    
    update(dt);
    render();
    
    requestAnimationFrame(gameLoop);
}

// ============ INPUT ============
document.addEventListener('keydown', e => {
    if (state.keys.hasOwnProperty(e.key)) {
        state.keys[e.key] = true;
    }
});

document.addEventListener('keyup', e => {
    if (state.keys.hasOwnProperty(e.key)) {
        state.keys[e.key] = false;
    }
});

// ============ INIT ============
function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    createRoad();
    createTraffic();
    
    state.playerZ = 100 * CONFIG.segmentLength;
    state.lastTime = performance.now();
    
    requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

init();
