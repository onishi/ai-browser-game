const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Audio context for sound effects
let audioCtx = null;
let bgmNode = null; // Holds active BGM oscillators
let currentBgmMode = null;

// Initialize audio context (needs user interaction)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    ensureBGM(currentStageTheme?.bgmMode || 'stage0');
  }
}

// Generate shooting sound
function playShootSound() {
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.1);
}

// Generate explosion sound
function playExplosionSound() {
  if (!audioCtx) return;

  const gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);

  const noiseSource = audioCtx.createBufferSource();
  const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  noiseSource.buffer = noiseBuffer;
  noiseSource.connect(gainNode);

  gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  noiseSource.start(audioCtx.currentTime);
  noiseSource.stop(audioCtx.currentTime + 0.3);
}

// Generate power-up sound
function playPowerUpSound() {
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.2);

  gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.2);
}

const BGM_SETTINGS = {
  stage0: {
    volume: 0.09,
    melody: [330, 392, 440, 392, 494, 440, 392, 330],
    tempo: 400,
    bassFreq: 55,
    bassType: 'sine',
    leadType: 'triangle'
  },
  stage1: {
    volume: 0.1,
    melody: [349, 392, 466, 523, 466, 392, 349, 330],
    tempo: 340,
    bassFreq: 65,
    bassType: 'triangle',
    leadType: 'sawtooth'
  },
  stage2: {
    volume: 0.12,
    melody: [440, 494, 523, 587, 659, 587, 523, 494],
    tempo: 300,
    bassFreq: 82,
    bassType: 'square',
    leadType: 'square'
  },
  boss: {
    volume: 0.14,
    melody: [392, 392, 523, 466, 466, 523, 587, 523],
    tempo: 220,
    bassFreq: 98,
    bassType: 'sawtooth',
    leadType: 'sawtooth'
  }
};

function startBGM(mode = 'stage0') {
  if (!audioCtx) return;
  if (currentBgmMode === mode && bgmNode) return;

  stopBGM();

  const settings = BGM_SETTINGS[mode] || BGM_SETTINGS.stage0;
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(settings.volume, audioCtx.currentTime);
  gainNode.connect(audioCtx.destination);

  const bass = audioCtx.createOscillator();
  bass.type = settings.bassType;
  bass.frequency.value = settings.bassFreq;
  bass.connect(gainNode);
  bass.start();

  const lead = audioCtx.createOscillator();
  lead.type = settings.leadType;
  lead.connect(gainNode);
  lead.start();

  const melody = settings.melody;
  let noteIndex = 0;
  const intervalId = setInterval(() => {
    const freq = melody[noteIndex % melody.length];
    lead.frequency.setValueAtTime(freq, audioCtx.currentTime);
    bass.frequency.setValueAtTime(settings.bassFreq + (freq / 6), audioCtx.currentTime);
    noteIndex++;
  }, settings.tempo);

  bgmNode = { bass, lead, gain: gainNode, intervalId };
  currentBgmMode = mode;
}

function ensureBGM(mode = 'stage0') {
  if (!audioCtx) return;
  startBGM(mode);
}

function stopBGM() {
  if (bgmNode) {
    clearInterval(bgmNode.intervalId);
    bgmNode.bass.stop();
    bgmNode.lead.stop();
    bgmNode.gain.disconnect();
    bgmNode = null;
  }
  currentBgmMode = null;
}

// Game state
let score = 0;
let keys = {};
let lastShotTime = 0;
let isGameOver = false;
let isPaused = false;

// Score combo system
let comboCount = 0;
let scoreMultiplier = 1;
const MAX_MULTIPLIER = 8;
const COMBO_THRESHOLD = 5; // enemies needed for next multiplier level

// Wave system
let currentWave = 1;
let waveEnemiesSpawned = 0;
let waveEnemiesDestroyed = 0;
let isWaveActive = false;
let waveStartTime = 0;
const ENEMIES_PER_WAVE = 8;
const WAVE_SPAWN_INTERVAL = 300; // ms between enemies in a wave
const BREAK_BETWEEN_WAVES = 3000; // ms break between waves

const bullets = [];
const enemies = [];
const enemyBullets = [];
const powerUps = [];
const stars = [];
const explosions = [];

const BULLET_WIDTH = 6;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 8;
const BASE_SHOT_COOLDOWN = 200; // milliseconds
const RAPID_FIRE_COOLDOWN = 80; // milliseconds
const LASER_COOLDOWN = 280;
const MISSILE_COOLDOWN = 450;

const LASER_BULLET_HEIGHT = 60;
const LASER_PIERCE_COUNT = 3;
const LASER_BULLET_SPEED = 18;
const MISSILE_SPEED = 5;
const MISSILE_STEER_FACTOR = 0.12;
const MISSILE_MAX_STEER = 3;
const MISSILE_EXPLOSION_RADIUS = 110;

const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 40;
const ENEMY_SPEED = 2.5;
const ENEMY_SPAWN_INTERVAL = 1000; // milliseconds

const PLAYER_MAX_LIVES = 3;
const PLAYER_INVULNERABLE_TIME = 1500; // milliseconds

const POWERUP_TYPES = {
  RAPID_FIRE: 'rapidFire',
  SHIELD: 'shield',
  LIFE: 'life',
  LASER: 'laserWeapon',
  MISSILE: 'missileWeapon'
};

const POWERUP_DROP_CHANCE = 0.25;
const POWERUP_FALL_SPEED = 2.5;
const POWERUP_SIZE = 26;

const POWERUP_DURATION = {
  [POWERUP_TYPES.RAPID_FIRE]: 6000,
  [POWERUP_TYPES.SHIELD]: 5000,
  [POWERUP_TYPES.LASER]: 6000,
  [POWERUP_TYPES.MISSILE]: 6500
};

const POWERUP_SPAWN_TABLE = [
  POWERUP_TYPES.RAPID_FIRE,
  POWERUP_TYPES.RAPID_FIRE,
  POWERUP_TYPES.SHIELD,
  POWERUP_TYPES.LIFE,
  POWERUP_TYPES.LASER,
  POWERUP_TYPES.MISSILE
];

const WEAPON_MODES = {
  DEFAULT: 'default',
  LASER: 'laser',
  MISSILE: 'missile'
};

const STAGE_THEMES = [
  {
    name: 'Nebula Dawn',
    gradient: ['#050510', '#0f1834', '#1d2846'],
    stars: [
      { count: 55, speed: 0.05, size: 2.4, color: 'rgba(255, 255, 255, 0.9)' },
      { count: 42, speed: 0.08, size: 1.7, color: 'rgba(180, 200, 255, 0.65)' },
      { count: 30, speed: 0.12, size: 1.1, color: 'rgba(255, 220, 180, 0.55)' }
    ],
    bgmMode: 'stage0'
  },
  {
    name: 'Viridian Rift',
    gradient: ['#04100f', '#0d1f26', '#143145'],
    stars: [
      { count: 60, speed: 0.06, size: 2.2, color: 'rgba(180, 255, 220, 0.75)' },
      { count: 44, speed: 0.09, size: 1.6, color: 'rgba(120, 220, 255, 0.6)' },
      { count: 32, speed: 0.14, size: 1.2, color: 'rgba(90, 200, 255, 0.45)' }
    ],
    bgmMode: 'stage1'
  },
  {
    name: 'Crimson Eclipse',
    gradient: ['#14030b', '#200819', '#3a1028'],
    stars: [
      { count: 65, speed: 0.07, size: 2.3, color: 'rgba(255, 180, 200, 0.75)' },
      { count: 48, speed: 0.11, size: 1.7, color: 'rgba(255, 140, 160, 0.58)' },
      { count: 36, speed: 0.16, size: 1.3, color: 'rgba(255, 200, 120, 0.45)' }
    ],
    bgmMode: 'stage2'
  }
];

const MIN_SPAWN_INTERVAL = 320;

let lastFrameTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
let gameStartTimestamp = Date.now();
let currentStageThemeIndex = 0;
let currentStageTheme = STAGE_THEMES[0];
let stageGradient = null;
let activeStageIndex = 0;
let isBossPhase = false;

// Enemy types
const ENEMY_TYPES = {
  NORMAL: 'normal',
  ZIGZAG: 'zigzag',
  ARC: 'arc',
  TRACKER: 'tracker',
  BOSS: 'boss'
};

let lastEnemySpawnTime = 0;

// Player
const player = {
  x: canvas.width / 2,
  y: canvas.height - 50,
  width: 50,
  height: 50,
  color: 'blue',
  speed: 5,
  lives: PLAYER_MAX_LIVES,
  invulnerableUntil: 0,
  shieldUntil: 0,
  rapidFireUntil: 0,
  weapon: WEAPON_MODES.DEFAULT,
  weaponUntil: 0
};

const initialPlayerState = { ...player };

function isShieldActive() {
  return Date.now() < player.shieldUntil;
}

function isRapidFireActive() {
  return Date.now() < player.rapidFireUntil;
}

function isPlayerInvulnerable() {
  return Date.now() < player.invulnerableUntil;
}

function initStars(theme = currentStageTheme) {
  stars.length = 0;
  const layers = theme?.stars || [];
  layers.forEach((layer) => {
    for (let i = 0; i < layer.count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: layer.speed,
        size: layer.size,
        color: layer.color
      });
    }
  });
}

function updateStars(delta) {
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    star.y += star.speed * delta;

    if (star.y > canvas.height + star.size) {
      star.y = -star.size;
      star.x = Math.random() * canvas.width;
    }
  }
}

function drawStageBackdrop() {
  if (!currentStageTheme) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  if (!stageGradient) {
    stageGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const stops = currentStageTheme.gradient.length - 1;
    currentStageTheme.gradient.forEach((color, index) => {
      const position = stops === 0 ? 0 : index / stops;
      stageGradient.addColorStop(position, color);
    });
  }

  ctx.fillStyle = stageGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawStars() {
  stars.forEach((star) => {
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
}

function applyStageTheme(index) {
  currentStageThemeIndex = index % STAGE_THEMES.length;
  currentStageTheme = STAGE_THEMES[currentStageThemeIndex];
  stageGradient = null;
  initStars(currentStageTheme);
  ensureBGM(currentStageTheme.bgmMode);
}

function getStageIndexForWave(wave) {
  return Math.floor((wave - 1) / 3);
}

function getElapsedSeconds() {
  return (Date.now() - gameStartTimestamp) / 1000;
}

function getDifficultyLevel() {
  const elapsed = getElapsedSeconds();
  const scoreFactor = Math.min(score / 2500, 1.5);
  return 1 + elapsed / 45 + scoreFactor * 0.8;
}

function getCurrentSpawnInterval() {
  const level = getDifficultyLevel();
  const dynamicInterval = ENEMY_SPAWN_INTERVAL / (1 + level * 0.3) - score * 0.02;
  return Math.max(MIN_SPAWN_INTERVAL, dynamicInterval);
}

function getCurrentEnemySpeed() {
  const level = getDifficultyLevel();
  const speedBonus = Math.min(4, level * 0.8);
  return ENEMY_SPEED + speedBonus;
}

function getZigzagHorizontalSpeed(level) {
  return 2 + Math.min(3, level * 0.4);
}

// Input handling
document.addEventListener('keydown', (e) => {
  initAudio();

  keys[e.key] = true;
  keys[e.code] = true;

  if (e.key === 'p' || e.key === 'P') {
    if (!isGameOver) {
      isPaused = !isPaused;
    }
  }

  if (isGameOver && (e.key === 'r' || e.key === 'R')) {
    restartGame();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
  keys[e.code] = false;
});

// Update player position
function updatePlayer() {
  if (keys['ArrowLeft'] && player.x > 0) {
    player.x -= player.speed;
  }
  if (keys['ArrowRight'] && player.x < canvas.width - player.width) {
    player.x += player.speed;
  }
  if (keys['ArrowUp'] && player.y > 0) {
    player.y -= player.speed;
  }
  if (keys['ArrowDown'] && player.y < canvas.height - player.height) {
    player.y += player.speed;
  }
}

function handleShooting() {
  const now = Date.now();

  if (player.weapon !== WEAPON_MODES.DEFAULT && now > player.weaponUntil) {
    player.weapon = WEAPON_MODES.DEFAULT;
  }

  const isShooting = keys[' '] || keys['Space'];
  if (!isShooting) {
    return;
  }

  if (player.weapon === WEAPON_MODES.LASER) {
    if (now - lastShotTime >= LASER_COOLDOWN) {
      bullets.push({
        type: 'laser',
        x: player.x + player.width / 2 - 6,
        y: player.y - LASER_BULLET_HEIGHT,
        width: 12,
        height: LASER_BULLET_HEIGHT,
        speed: LASER_BULLET_SPEED,
        color: '#8cfff6',
        pierceRemaining: LASER_PIERCE_COUNT
      });
      lastShotTime = now;
      playShootSound();
    }
    return;
  }

  if (player.weapon === WEAPON_MODES.MISSILE) {
    if (now - lastShotTime >= MISSILE_COOLDOWN) {
      bullets.push({
        type: 'missile',
        x: player.x + player.width / 2 - 6,
        y: player.y - 24,
        width: 12,
        height: 24,
        speed: MISSILE_SPEED,
        color: '#ff9955',
        vx: 0
      });
      lastShotTime = now;
      playShootSound();
    }
    return;
  }

  const cooldown = isRapidFireActive() ? RAPID_FIRE_COOLDOWN : BASE_SHOT_COOLDOWN;
  if (now - lastShotTime >= cooldown) {
    bullets.push({
      type: 'normal',
      x: player.x + player.width / 2 - BULLET_WIDTH / 2,
      y: player.y - BULLET_HEIGHT,
      width: BULLET_WIDTH,
      height: BULLET_HEIGHT,
      speed: BULLET_SPEED,
      color: 'yellow'
    });
    lastShotTime = now;
    playShootSound();
  }
}

function updateBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    if (bullet.type === 'missile') {
      const target = findNearestEnemy(bullet);
      if (target) {
        const bulletCenter = bullet.x + bullet.width / 2;
        const targetCenter = target.x + target.width / 2;
        const steer = Math.max(-MISSILE_MAX_STEER, Math.min(MISSILE_MAX_STEER, (targetCenter - bulletCenter) * MISSILE_STEER_FACTOR));
        bullet.vx = (bullet.vx || 0) + steer;
        bullet.vx = Math.max(-MISSILE_MAX_STEER, Math.min(MISSILE_MAX_STEER, bullet.vx));
        bullet.x += bullet.vx;
        bullet.x = Math.max(0, Math.min(canvas.width - bullet.width, bullet.x));
      }
      bullet.y -= bullet.speed;
    } else {
      bullet.y -= bullet.speed;
    }

    if (bullet.y + bullet.height < -50 || bullet.x < -50 || bullet.x > canvas.width + 50) {
      bullets.splice(i, 1);
    }
  }
}

function findNearestEnemy(reference) {
  if (!enemies.length) {
    return null;
  }

  const refX = reference.x + (reference.width || 0) / 2;
  const refY = reference.y + (reference.height || 0) / 2;
  let closestEnemy = null;
  let minDistance = Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.type === ENEMY_TYPES.BOSS) {
      continue; // prefer smaller targets first
    }
    const enemyX = enemy.x + enemy.width / 2;
    const enemyY = enemy.y + enemy.height / 2;
    const distance = Math.hypot(enemyX - refX, enemyY - refY);
    if (distance < minDistance) {
      minDistance = distance;
      closestEnemy = enemy;
    }
  }

  if (closestEnemy) {
    return closestEnemy;
  }

  // Fall back to boss if present
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.type === ENEMY_TYPES.BOSS) {
      return enemy;
    }
  }

  return null;
}

function updatePowerUps() {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    powerUp.y += POWERUP_FALL_SPEED;
    powerUp.rotation += powerUp.rotationSpeed;

    if (powerUp.y - powerUp.size / 2 > canvas.height) {
      powerUps.splice(i, 1);
    }
  }
}

function handlePowerUpCollection() {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    const bounds = {
      x: powerUp.x - powerUp.size / 2,
      y: powerUp.y - powerUp.size / 2,
      width: powerUp.size,
      height: powerUp.size
    };

    if (rectsIntersect(bounds, player)) {
      applyPowerUp(powerUp.type);
      powerUps.splice(i, 1);
      playPowerUpSound();
    }
  }
}

function drawPowerUps() {
  powerUps.forEach((powerUp) => {
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y);
    ctx.rotate(powerUp.rotation);

    switch (powerUp.type) {
      case POWERUP_TYPES.RAPID_FIRE:
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(0, -powerUp.size / 2);
        ctx.lineTo(powerUp.size / 2, 0);
        ctx.lineTo(0, powerUp.size / 2);
        ctx.lineTo(-powerUp.size / 2, 0);
        ctx.closePath();
        ctx.fill();
        break;
      case POWERUP_TYPES.LASER:
        ctx.fillStyle = '#8cfff6';
        ctx.beginPath();
        ctx.moveTo(0, -powerUp.size / 2);
        ctx.lineTo(powerUp.size / 3, 0);
        ctx.lineTo(0, powerUp.size / 2);
        ctx.lineTo(-powerUp.size / 3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2cd0ff';
        ctx.fillRect(-powerUp.size / 8, -powerUp.size / 2, powerUp.size / 4, powerUp.size);
        break;
      case POWERUP_TYPES.MISSILE:
        ctx.fillStyle = '#ff8844';
        ctx.fillRect(-powerUp.size / 6, -powerUp.size / 2.2, powerUp.size / 3, powerUp.size / 1.1);
        ctx.fillStyle = '#ffeeaa';
        ctx.beginPath();
        ctx.moveTo(0, -powerUp.size / 2.6);
        ctx.lineTo(powerUp.size / 4, -powerUp.size / 4);
        ctx.lineTo(-powerUp.size / 4, -powerUp.size / 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff5522';
        ctx.beginPath();
        ctx.moveTo(0, powerUp.size / 2);
        ctx.lineTo(powerUp.size / 4, powerUp.size / 3);
        ctx.lineTo(-powerUp.size / 4, powerUp.size / 3);
        ctx.closePath();
        ctx.fill();
        break;
      case POWERUP_TYPES.SHIELD:
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, powerUp.size / 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, powerUp.size / 4, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case POWERUP_TYPES.LIFE:
      default:
        ctx.fillStyle = '#ff6688';
        ctx.beginPath();
        const heartSize = powerUp.size / 3;
        ctx.moveTo(0, heartSize);
        ctx.bezierCurveTo(heartSize, heartSize * 2, powerUp.size / 2, heartSize, 0, -heartSize);
        ctx.bezierCurveTo(-powerUp.size / 2, heartSize, -heartSize, heartSize * 2, 0, heartSize);
        ctx.fill();
        break;
    }

    ctx.restore();
  });
}

function applyPowerUp(type) {
  const now = Date.now();

  playPowerUpSound();

  if (type === POWERUP_TYPES.RAPID_FIRE) {
    player.rapidFireUntil = Math.max(player.rapidFireUntil, now + POWERUP_DURATION[POWERUP_TYPES.RAPID_FIRE]);
    return;
  }

  if (type === POWERUP_TYPES.SHIELD) {
    player.shieldUntil = Math.max(player.shieldUntil, now + POWERUP_DURATION[POWERUP_TYPES.SHIELD]);
    player.invulnerableUntil = Math.max(player.invulnerableUntil, now + 250);
    return;
  }

  if (type === POWERUP_TYPES.LASER) {
    player.weapon = WEAPON_MODES.LASER;
    player.weaponUntil = Math.max(player.weaponUntil, now) + POWERUP_DURATION[POWERUP_TYPES.LASER];
    return;
  }

  if (type === POWERUP_TYPES.MISSILE) {
    player.weapon = WEAPON_MODES.MISSILE;
    player.weaponUntil = Math.max(player.weaponUntil, now) + POWERUP_DURATION[POWERUP_TYPES.MISSILE];
    return;
  }

  if (type === POWERUP_TYPES.LIFE) {
    if (player.lives < PLAYER_MAX_LIVES) {
      player.lives += 1;
    } else {
      score += 200;
    }
  }
}

function maybeSpawnPowerUp(enemy) {
  const dropChance = enemy.type === ENEMY_TYPES.BOSS ? 1 : POWERUP_DROP_CHANCE;
  if (Math.random() > dropChance) {
    return;
  }

  const pool = enemy.type === ENEMY_TYPES.BOSS
    ? [POWERUP_TYPES.LASER, POWERUP_TYPES.MISSILE, POWERUP_TYPES.SHIELD]
    : POWERUP_SPAWN_TABLE;

  const type = pool[Math.floor(Math.random() * pool.length)];

  powerUps.push({
    x: enemy.x + enemy.width / 2,
    y: enemy.y + enemy.height / 2,
    size: POWERUP_SIZE,
    type,
    rotation: 0,
    rotationSpeed: (Math.random() * 0.04 + 0.02) * (Math.random() < 0.5 ? -1 : 1)
  });
}

// Game loop
function gameLoop() {
  const frameNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const delta = frameNow - lastFrameTimestamp;
  lastFrameTimestamp = frameNow;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStageBackdrop();

  if (isPaused) {
    drawStars();
    drawExplosions();
    drawPlayer();
    drawBullets();
    drawEnemyBullets();
    drawEnemies();
    drawPowerUps();
    drawHUD();
    drawPaused();
    requestAnimationFrame(gameLoop);
    return;
  }

  updateStars(delta);
  drawStars();

  if (!isGameOver) {
    updatePlayer();
    handleShooting();
    updateBullets();
    updateEnemyBullets();
    handleWaveSystem();
    updateEnemies();
    updatePowerUps();
    handlePowerUpCollection();
    updateExplosions(delta);
    handleCollisions();
  } else {
    updateExplosions(delta);
  }

  drawPlayer();
  drawBullets();
  drawEnemyBullets();
  drawEnemies();
  drawPowerUps();
  drawExplosions();
  drawHUD();

  if (isGameOver) {
    drawGameOver();
  }

  requestAnimationFrame(gameLoop);
}

function drawPlayer() {
  const now = Date.now();

  if (!isGameOver && isPlayerInvulnerable() && Math.floor(now / 100) % 2 === 0) {
    return;
  }

  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.moveTo(centerX, player.y);
  ctx.lineTo(player.x + 10, player.y + player.height);
  ctx.lineTo(player.x + player.width - 10, player.y + player.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0066cc';
  ctx.beginPath();
  ctx.moveTo(player.x, player.y + player.height - 15);
  ctx.lineTo(player.x + 15, player.y + player.height - 5);
  ctx.lineTo(player.x + 5, player.y + player.height);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(player.x + player.width, player.y + player.height - 15);
  ctx.lineTo(player.x + player.width - 15, player.y + player.height - 5);
  ctx.lineTo(player.x + player.width - 5, player.y + player.height);
  ctx.closePath();
  ctx.fill();

  if (isShieldActive()) {
    const shieldRadius = player.width * (0.8 + Math.sin(now / 200) * 0.1);
    const gradient = ctx.createRadialGradient(centerX, centerY, shieldRadius * 0.7, centerX, centerY, shieldRadius);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0)');
    gradient.addColorStop(0.8, 'rgba(0, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(128, 255, 255, 0.8)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, shieldRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBullets() {
  bullets.forEach((bullet) => {
    const centerX = bullet.x + bullet.width / 2;
    const centerY = bullet.y + bullet.height / 2;

    if (bullet.type === 'laser') {
      const gradient = ctx.createLinearGradient(bullet.x, bullet.y, bullet.x, bullet.y + bullet.height);
      gradient.addColorStop(0, 'rgba(140, 255, 246, 0.9)');
      gradient.addColorStop(1, 'rgba(90, 200, 255, 0.15)');
      ctx.fillStyle = gradient;
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      return;
    }

    if (bullet.type === 'missile') {
      ctx.fillStyle = '#ff9955';
      ctx.fillRect(bullet.x + bullet.width * 0.2, bullet.y, bullet.width * 0.6, bullet.height);

      ctx.fillStyle = '#ffeecc';
      ctx.beginPath();
      ctx.moveTo(centerX, bullet.y - bullet.height * 0.35);
      ctx.lineTo(bullet.x + bullet.width, bullet.y);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ff5a1a';
      ctx.beginPath();
      ctx.moveTo(centerX, bullet.y + bullet.height);
      ctx.lineTo(bullet.x + bullet.width * 0.75, bullet.y + bullet.height + bullet.height * 0.25);
      ctx.lineTo(bullet.x + bullet.width * 0.25, bullet.y + bullet.height + bullet.height * 0.25);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const radius = bullet.width / 2;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 3);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function handleWaveSystem() {
  const now = Date.now();

  if (isBossPhase) {
    return;
  }

  // Start first wave immediately
  if (!isWaveActive && currentWave === 1 && waveStartTime === 0) {
    startNewWave();
    return;
  }

  // Check if current wave is complete
  if (isWaveActive &&
      waveEnemiesDestroyed >= ENEMIES_PER_WAVE &&
      enemies.every((enemy) => enemy.type === ENEMY_TYPES.BOSS)) {
    completeWave();
    return;
  }

  // Start next wave after break
  if (!isWaveActive && now - waveStartTime >= BREAK_BETWEEN_WAVES) {
    startNewWave();
    return;
  }

  // Spawn enemies during active wave
  if (isWaveActive &&
      waveEnemiesSpawned < ENEMIES_PER_WAVE &&
      now - lastEnemySpawnTime >= WAVE_SPAWN_INTERVAL) {
    spawnWaveEnemy();
  }
}

function startNewWave() {
  const now = Date.now();
  isWaveActive = true;
  waveEnemiesSpawned = 0;
  waveEnemiesDestroyed = 0;
  waveStartTime = now;
  lastEnemySpawnTime = now;
  isBossPhase = false;

  const stageIndex = getStageIndexForWave(currentWave);
  if (stageIndex !== activeStageIndex) {
    activeStageIndex = stageIndex;
    applyStageTheme(activeStageIndex);
  } else {
    ensureBGM(currentStageTheme.bgmMode);
  }
}

function completeWave() {
  isWaveActive = false;
  currentWave++;
  waveStartTime = Date.now();

  // Spawn boss every 3 waves
  if (currentWave % 3 === 1 && currentWave > 1) {
    spawnBoss();
  }
}

function spawnBoss() {
  const now = Date.now();
  isBossPhase = true;
  ensureBGM('boss');
  const boss = {
    x: canvas.width / 2 - 60,
    y: -80,
    width: 120,
    height: 80,
    speed: 1,
    type: ENEMY_TYPES.BOSS,
    color: 'orange',
    health: 5,
    maxHealth: 5,
    lastShot: 0,
    shootInterval: 1500,
    moveDirection: 1,
    moveTimer: 0,
    spawnedAt: now
  };

  enemies.push(boss);
}

function spawnWaveEnemy() {
  const now = Date.now();
  const level = getDifficultyLevel();
  const enemySpeed = getCurrentEnemySpeed() * (0.9 + Math.random() * 0.2);
  const zigzagChance = Math.min(0.55, 0.3 + level * 0.08);
  const stageIndex = getStageIndexForWave(currentWave);
  const roll = Math.random();

  let enemyType = ENEMY_TYPES.NORMAL;
  if (stageIndex >= 2 && roll < 0.18) {
    enemyType = ENEMY_TYPES.TRACKER;
  } else if (stageIndex >= 1 && roll < 0.36) {
    enemyType = ENEMY_TYPES.ARC;
  } else if (roll < zigzagChance) {
    enemyType = ENEMY_TYPES.ZIGZAG;
  }

  const enemy = {
    x: Math.random() * (canvas.width - ENEMY_WIDTH),
    y: -ENEMY_HEIGHT,
    width: ENEMY_WIDTH,
    height: ENEMY_HEIGHT,
    speed: enemySpeed,
    baseSpeed: enemySpeed,
    type: enemyType,
    color:
      enemyType === ENEMY_TYPES.NORMAL ? 'red' :
      enemyType === ENEMY_TYPES.ZIGZAG ? 'purple' :
      enemyType === ENEMY_TYPES.ARC ? '#ff8f3d' : '#44d06a',
    zigzagTimer: 0,
    zigzagDirection: 1,
    horizontalSpeed: enemyType === ENEMY_TYPES.ZIGZAG ? getZigzagHorizontalSpeed(level) : 0,
    spawnedAt: now,
    amplitude: enemyType === ENEMY_TYPES.ARC ? (80 + Math.random() * 50) : 0,
    baseX: 0,
    arcFrequency: enemyType === ENEMY_TYPES.ARC ? (0.002 + Math.random() * 0.002) : 0,
    trackingSpeed: enemyType === ENEMY_TYPES.TRACKER ? (1.3 + Math.random() * 0.8) : 0,
    fireInterval: enemyType === ENEMY_TYPES.TRACKER ? Math.max(1500, 2400 - stageIndex * 250) : 0,
    lastShot: now
  };

  if (enemyType === ENEMY_TYPES.ARC) {
    enemy.baseX = enemy.x;
  }

  enemies.push(enemy);
  waveEnemiesSpawned++;
  lastEnemySpawnTime = now;
}

function updateEnemies() {
  const now = Date.now();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    if (enemy.type === ENEMY_TYPES.BOSS) {
      updateBoss(enemy);
    } else {
      enemy.y += enemy.speed;

      if (enemy.type === ENEMY_TYPES.ZIGZAG) {
        enemy.zigzagTimer += 1;

        if (enemy.zigzagTimer % 30 === 0) {
          enemy.zigzagDirection *= -1;
        }

        enemy.x += enemy.zigzagDirection * enemy.horizontalSpeed;

        if (enemy.x <= 0 || enemy.x >= canvas.width - enemy.width) {
          enemy.zigzagDirection *= -1;
          enemy.x = Math.max(0, Math.min(canvas.width - enemy.width, enemy.x));
        }
      } else if (enemy.type === ENEMY_TYPES.ARC) {
        const elapsed = now - enemy.spawnedAt;
        enemy.x = enemy.baseX + Math.sin(elapsed * enemy.arcFrequency) * enemy.amplitude;
        enemy.x = Math.max(0, Math.min(canvas.width - enemy.width, enemy.x));
      } else if (enemy.type === ENEMY_TYPES.TRACKER) {
        const playerCenter = player.x + player.width / 2;
        const enemyCenter = enemy.x + enemy.width / 2;
        const direction = playerCenter > enemyCenter ? 1 : -1;
        enemy.x += direction * enemy.trackingSpeed;
        enemy.x = Math.max(0, Math.min(canvas.width - enemy.width, enemy.x));

        if (now - enemy.lastShot >= enemy.fireInterval) {
          enemy.lastShot = now;
          enemyBullets.push({
            type: 'homing',
            x: enemy.x + enemy.width / 2 - 4,
            y: enemy.y + enemy.height,
            width: 8,
            height: 10,
            speed: 3.2,
            vx: 0,
            vy: 1,
            turnRate: 0.06,
            color: '#44ff88'
          });
        }
      }
    }

    if (enemy.y > canvas.height) {
      enemies.splice(i, 1);
    }
  }
}

function updateBoss(boss) {
  const now = Date.now();

  // Move boss horizontally
  boss.moveTimer += 1;
  if (boss.moveTimer % 60 === 0) {
    boss.moveDirection *= -1;
  }

  boss.x += boss.moveDirection * 2;
  if (boss.x <= 0 || boss.x >= canvas.width - boss.width) {
    boss.moveDirection *= -1;
    boss.x = Math.max(0, Math.min(canvas.width - boss.width, boss.x));
  }

  // Move down slowly
  if (boss.y < 50) {
    boss.y += boss.speed;
  }

  // Boss shooting
  if (now - boss.lastShot >= boss.shootInterval) {
    boss.lastShot = now;

    // Shoot 3 bullets in spread pattern
    for (let i = -1; i <= 1; i++) {
      enemyBullets.push({
        type: 'spread',
        x: boss.x + boss.width / 2 - 3,
        y: boss.y + boss.height,
        width: 6,
        height: 8,
        speed: 3,
        direction: i * 0.3,
        color: 'red'
      });
    }
  }
}

function updateEnemyBullets() {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    if (bullet.type === 'homing') {
      const targetX = player.x + player.width / 2;
      const targetY = player.y + player.height / 2;
      const centerX = bullet.x + bullet.width / 2;
      const centerY = bullet.y + bullet.height / 2;
      const dx = targetX - centerX;
      const dy = targetY - centerY;
      const distance = Math.hypot(dx, dy) || 1;
      const steerX = (dx / distance) * bullet.turnRate;
      const steerY = (dy / distance) * bullet.turnRate;
      bullet.vx = (bullet.vx || 0) + steerX;
      bullet.vy = (bullet.vy || bullet.speed) + steerY;
      const velocityMag = Math.hypot(bullet.vx, bullet.vy) || 1;
      bullet.x += (bullet.vx / velocityMag) * bullet.speed;
      bullet.y += (bullet.vy / velocityMag) * bullet.speed;
    } else if (bullet.type === 'spread') {
      bullet.y += bullet.speed;
      bullet.x += bullet.direction * bullet.speed;
    } else {
      bullet.y += bullet.speed;
    }

    if (bullet.y > canvas.height + 40 || bullet.x < -40 || bullet.x > canvas.width + 40) {
      enemyBullets.splice(i, 1);
    }
  }
}

function updateExplosions(delta) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const explosion = explosions[i];
    explosion.elapsed += delta;
    if (explosion.elapsed >= explosion.duration) {
      explosions.splice(i, 1);
    }
  }
}

function drawExplosions() {
  explosions.forEach((explosion) => {
    const progress = Math.min(1, explosion.elapsed / explosion.duration);
    const currentRadius = explosion.radius * (0.7 + 0.3 * (1 - progress));
    const gradient = ctx.createRadialGradient(
      explosion.x,
      explosion.y,
      currentRadius * 0.2,
      explosion.x,
      explosion.y,
      currentRadius
    );
    gradient.addColorStop(0, `rgba(255, 220, 150, ${0.6 * (1 - progress)})`);
    gradient.addColorStop(1, 'rgba(255, 120, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, currentRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    ctx.fillStyle = enemy.color;

    const centerX = enemy.x + enemy.width / 2;
    const centerY = enemy.y + enemy.height / 2;

    if (enemy.type === ENEMY_TYPES.BOSS) {
      // Draw boss as large octagon
      ctx.beginPath();
      const sides = 8;
      const radius = enemy.width / 2;
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * (radius * 0.6);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      // Boss outline
      ctx.strokeStyle = '#cc6600';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Health bar
      const barWidth = enemy.width * 0.8;
      const barHeight = 6;
      const barX = enemy.x + (enemy.width - barWidth) / 2;
      const barY = enemy.y - 15;

      ctx.fillStyle = 'red';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      ctx.fillStyle = 'green';
      const healthPercent = enemy.health / enemy.maxHealth;
      ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    } else if (enemy.type === ENEMY_TYPES.ZIGZAG) {
      ctx.beginPath();
      ctx.moveTo(centerX, enemy.y);
      ctx.lineTo(enemy.x + enemy.width, centerY);
      ctx.lineTo(centerX, enemy.y + enemy.height);
      ctx.lineTo(enemy.x, centerY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#4a0080';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (enemy.type === ENEMY_TYPES.ARC) {
      ctx.beginPath();
      ctx.moveTo(centerX, enemy.y);
      ctx.bezierCurveTo(enemy.x + enemy.width * 1.1, centerY - 12, enemy.x + enemy.width * 0.9, centerY + 12, centerX, enemy.y + enemy.height);
      ctx.bezierCurveTo(enemy.x - enemy.width * 0.1, centerY + 12, enemy.x + enemy.width * 0.1, centerY - 12, centerX, enemy.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#ffb36a';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (enemy.type === ENEMY_TYPES.TRACKER) {
      ctx.beginPath();
      ctx.moveTo(centerX, enemy.y);
      ctx.lineTo(enemy.x + enemy.width, enemy.y + enemy.height * 0.45);
      ctx.lineTo(centerX + enemy.width * 0.2, enemy.y + enemy.height);
      ctx.lineTo(centerX - enemy.width * 0.2, enemy.y + enemy.height);
      ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.45);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#1d8f4a';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(centerX, enemy.y);
      ctx.lineTo(enemy.x + enemy.width - 5, enemy.y + 10);
      ctx.lineTo(enemy.x + enemy.width, centerY);
      ctx.lineTo(enemy.x + enemy.width - 5, enemy.y + enemy.height - 10);
      ctx.lineTo(centerX, enemy.y + enemy.height);
      ctx.lineTo(enemy.x + 5, enemy.y + enemy.height - 10);
      ctx.lineTo(enemy.x, centerY);
      ctx.lineTo(enemy.x + 5, enemy.y + 10);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#800000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function drawEnemyBullets() {
  enemyBullets.forEach((bullet) => {
    if (bullet.type === 'homing') {
      ctx.fillStyle = 'rgba(100, 255, 160, 0.8)';
      ctx.beginPath();
      ctx.ellipse(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2, bullet.width, bullet.height, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = bullet.color;
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    }
  });
}

function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function resetCombo() {
  comboCount = 0;
  scoreMultiplier = 1;
}

function registerKill(comboBonus = 1) {
  comboCount += comboBonus;
  while (comboCount >= COMBO_THRESHOLD) {
    if (scoreMultiplier < MAX_MULTIPLIER) {
      scoreMultiplier++;
      comboCount -= COMBO_THRESHOLD;
    } else {
      comboCount = COMBO_THRESHOLD - 1;
      break;
    }
  }
}

function onEnemyDestroyed(enemy, { baseScore = 100, comboBonus = 1, allowDrops = true, playSound = true } = {}) {
  const earnedScore = baseScore * scoreMultiplier;
  score += Math.round(earnedScore);
  registerKill(comboBonus);
  if (playSound) {
    playExplosionSound();
  }
  if (allowDrops) {
    maybeSpawnPowerUp(enemy);
  }
  if (enemy.type !== ENEMY_TYPES.BOSS && isWaveActive) {
    waveEnemiesDestroyed = Math.min(ENEMIES_PER_WAVE, waveEnemiesDestroyed + 1);
  }
}

function handleBossDefeat(enemy, index) {
  enemies.splice(index, 1);
  onEnemyDestroyed(enemy, { baseScore: 500, comboBonus: 3 });
  isBossPhase = false;
  waveStartTime = Date.now();
  ensureBGM(currentStageTheme.bgmMode);
  enemyBullets.length = 0;
}

function triggerMissileExplosion(centerX, centerY, { excludeIndex = null } = {}) {
  explosions.push({
    x: centerX,
    y: centerY,
    radius: MISSILE_EXPLOSION_RADIUS,
    elapsed: 0,
    duration: 520
  });

  let explosionSoundPlayed = false;

  for (let idx = enemies.length - 1; idx >= 0; idx--) {
    if (idx === excludeIndex) {
      continue;
    }

    const enemy = enemies[idx];
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;
    const distance = Math.hypot(enemyCenterX - centerX, enemyCenterY - centerY);

    if (distance <= MISSILE_EXPLOSION_RADIUS) {
      if (enemy.type === ENEMY_TYPES.BOSS) {
        enemy.health -= 2;
        if (enemy.health <= 0) {
          handleBossDefeat(enemy, idx);
        }
        if (!explosionSoundPlayed) {
          playExplosionSound();
          explosionSoundPlayed = true;
        }
        continue;
      }

      const removedEnemy = enemies.splice(idx, 1)[0];
      onEnemyDestroyed(removedEnemy, { baseScore: 150, comboBonus: 1, allowDrops: true, playSound: !explosionSoundPlayed });
      explosionSoundPlayed = true;
    }
  }

  if (!explosionSoundPlayed) {
    playExplosionSound();
  }
}

function handleCollisions() {
  const now = Date.now();

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    let enemyDestroyed = false;

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];
      const bulletType = bullet.type || 'normal';

      if (rectsIntersect(enemy, bullet)) {
        if (bulletType === 'missile') {
          bullets.splice(j, 1);

          if (enemy.type === ENEMY_TYPES.BOSS) {
            enemy.health -= 2;
            if (enemy.health <= 0) {
              handleBossDefeat(enemy, i);
              enemyDestroyed = true;
            }
            triggerMissileExplosion(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2, { excludeIndex: i });
          } else {
            const removedEnemy = enemies.splice(i, 1)[0];
            onEnemyDestroyed(removedEnemy, { baseScore: 150, comboBonus: 1, allowDrops: false, playSound: false });
            maybeSpawnPowerUp(removedEnemy);
            triggerMissileExplosion(bullet.x + bullet.width / 2, bullet.y + bullet.height / 2);
            enemyDestroyed = true;
          }
          break;
        }

        if (bulletType === 'laser') {
          bullet.pierceRemaining = (bullet.pierceRemaining || 1) - 1;
          if (bullet.pierceRemaining <= 0) {
            bullets.splice(j, 1);
          }

          if (enemy.type === ENEMY_TYPES.BOSS) {
            enemy.health -= 1;
            if (enemy.health <= 0) {
              handleBossDefeat(enemy, i);
              enemyDestroyed = true;
            }
          } else {
            enemies.splice(i, 1);
            onEnemyDestroyed(enemy, { baseScore: 120, comboBonus: 1 });
            enemyDestroyed = true;
          }

          if (enemyDestroyed) {
            break;
          }
          continue;
        }

        // Default projectile
        bullets.splice(j, 1);

        if (enemy.type === ENEMY_TYPES.BOSS) {
          enemy.health -= 1;
          if (enemy.health <= 0) {
            handleBossDefeat(enemy, i);
            enemyDestroyed = true;
          }
        } else {
          enemies.splice(i, 1);
          onEnemyDestroyed(enemy, { baseScore: 100, comboBonus: 1 });
          enemyDestroyed = true;
        }
        break;
      }
    }

    if (enemyDestroyed) {
      continue;
    }

    if (rectsIntersect(enemy, player)) {
      if (isShieldActive()) {
        enemies.splice(i, 1);
        onEnemyDestroyed(enemy, { baseScore: 120, comboBonus: 1 });
        continue;
      }

      if (isPlayerInvulnerable()) {
        continue;
      }

      enemies.splice(i, 1);
      player.lives -= 1;
      player.invulnerableUntil = now + PLAYER_INVULNERABLE_TIME;
      resetCombo();

      playExplosionSound();

      if (player.lives <= 0) {
        isGameOver = true;
        stopBGM();
        break;
      }
    }
  }

  // Check enemy bullet vs player collisions
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];

    if (rectsIntersect(bullet, player)) {
      if (isShieldActive()) {
        enemyBullets.splice(i, 1);
        continue;
      }

      if (isPlayerInvulnerable()) {
        continue;
      }

      enemyBullets.splice(i, 1);
      player.lives -= 1;
      player.invulnerableUntil = Date.now() + PLAYER_INVULNERABLE_TIME;

      resetCombo();

      playExplosionSound();

      if (player.lives <= 0) {
        isGameOver = true;
        stopBGM();
        break;
      }
    }
  }
}

function drawHUD() {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '20px sans-serif';
  ctx.fillText(`Score: ${score}`, 10, 30);

  ctx.fillText(`Lives: ${player.lives}`, 10, 60);

  // Show wave info
  ctx.fillStyle = '#88cc88';
  if (isBossPhase) {
    ctx.fillText(`Boss Battle`, 10, 90);
  } else if (isWaveActive) {
    ctx.fillText(`Wave ${currentWave} - ${waveEnemiesDestroyed}/${ENEMIES_PER_WAVE}`, 10, 90);
  } else {
    const timeLeft = Math.max(0, BREAK_BETWEEN_WAVES - (Date.now() - waveStartTime));
    ctx.fillText(`Next Wave in ${(timeLeft / 1000).toFixed(1)}s`, 10, 90);
  }

  // Show combo multiplier
  let statusY = 120;
  if (scoreMultiplier > 1) {
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(`Combo x${scoreMultiplier}`, 10, statusY);
    statusY += 26;
  }

  const now = Date.now();

  if (player.weapon !== WEAPON_MODES.DEFAULT) {
    const remaining = Math.max(0, (player.weaponUntil - now) / 1000).toFixed(1);
    ctx.fillStyle = player.weapon === WEAPON_MODES.LASER ? '#8cfff6' : '#ff9f66';
    const label = player.weapon === WEAPON_MODES.LASER ? 'Laser' : 'Missiles';
    ctx.fillText(`${label}: ${remaining}s`, 10, statusY);
    statusY += 26;
  }

  if (isRapidFireActive()) {
    const remaining = Math.max(0, (player.rapidFireUntil - now) / 1000).toFixed(1);
    ctx.fillStyle = '#ffcc66';
    ctx.fillText(`Rapid Fire: ${remaining}s`, 10, statusY);
    statusY += 26;
  }

  if (isShieldActive()) {
    const remaining = Math.max(0, (player.shieldUntil - now) / 1000).toFixed(1);
    ctx.fillStyle = '#7de0ff';
    ctx.fillText(`Shield: ${remaining}s`, 10, statusY);
    statusY += 26;
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.font = '60px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = '24px sans-serif';
  ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = '20px sans-serif';
  ctx.fillText("Press 'R' to Restart", canvas.width / 2, canvas.height / 2 + 70);
  ctx.textAlign = 'left';
}

function drawPaused() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.font = '50px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'left';
}

function restartGame() {
  stopBGM();
  score = 0;
  comboCount = 0;
  scoreMultiplier = 1;
  currentWave = 1;
  waveEnemiesSpawned = 0;
  waveEnemiesDestroyed = 0;
  isWaveActive = false;
  waveStartTime = 0;
  isBossPhase = false;
  player.x = initialPlayerState.x;
  player.y = initialPlayerState.y;
  player.lives = PLAYER_MAX_LIVES;
  player.invulnerableUntil = 0;
  player.shieldUntil = 0;
  player.rapidFireUntil = 0;
  player.weapon = WEAPON_MODES.DEFAULT;
  player.weaponUntil = 0;
  bullets.length = 0;
  enemies.length = 0;
  enemyBullets.length = 0;
  powerUps.length = 0;
  isGameOver = false;
  isPaused = false;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
  keys = {};
  gameStartTimestamp = Date.now();
  lastFrameTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  activeStageIndex = 0;
  applyStageTheme(activeStageIndex);
}
applyStageTheme(0);

gameLoop();
