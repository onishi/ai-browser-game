const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Audio context for sound effects
let audioCtx = null;
let bgmNode = null; // To hold the BGM oscillator

// Initialize audio context (needs user interaction)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    startBGM();
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

// Procedural BGM
function startBGM() {
  if (!audioCtx || bgmNode) return;

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.connect(audioCtx.destination);

  bgmNode = {
    bass: audioCtx.createOscillator(),
    lead: audioCtx.createOscillator(),
    gain: gainNode,
    intervalId: null
  };

  // Bassline
  bgmNode.bass.type = 'sine';
  bgmNode.bass.frequency.value = 55; // A1
  bgmNode.bass.connect(gainNode);
  bgmNode.bass.start();

  // Lead melody
  bgmNode.lead.type = 'triangle';
  bgmNode.lead.connect(gainNode);
  bgmNode.lead.start();

  const melody = [330, 392, 440, 392, 494, 440, 392, 330]; // E4, G4, A4, G4, B4, A4, G4, E4
  let noteIndex = 0;

  bgmNode.intervalId = setInterval(() => {
    const freq = melody[noteIndex % melody.length];
    bgmNode.lead.frequency.setValueAtTime(freq, audioCtx.currentTime);
    bgmNode.bass.frequency.setValueAtTime(freq / 4, audioCtx.currentTime);
    noteIndex++;
  }, 400);
}

function stopBGM() {
  if (bgmNode) {
    clearInterval(bgmNode.intervalId);
    bgmNode.bass.stop();
    bgmNode.lead.stop();
    bgmNode.gain.disconnect();
    bgmNode = null;
  }
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

const BULLET_WIDTH = 6;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 8;
const BASE_SHOT_COOLDOWN = 200; // milliseconds
const RAPID_FIRE_COOLDOWN = 80; // milliseconds

const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 40;
const ENEMY_SPEED = 2.5;
const ENEMY_SPAWN_INTERVAL = 1000; // milliseconds

const PLAYER_MAX_LIVES = 3;
const PLAYER_INVULNERABLE_TIME = 1500; // milliseconds

const POWERUP_TYPES = {
  RAPID_FIRE: 'rapidFire',
  SHIELD: 'shield',
  LIFE: 'life'
};

const POWERUP_DROP_CHANCE = 0.25;
const POWERUP_FALL_SPEED = 2.5;
const POWERUP_SIZE = 26;

const POWERUP_DURATION = {
  [POWERUP_TYPES.RAPID_FIRE]: 6000,
  [POWERUP_TYPES.SHIELD]: 5000
};

const STAR_LAYERS = [
  { count: 50, speed: 0.05, size: 2.5, color: 'rgba(255, 255, 255, 0.9)' },
  { count: 40, speed: 0.08, size: 1.8, color: 'rgba(180, 200, 255, 0.6)' },
  { count: 30, speed: 0.12, size: 1.2, color: 'rgba(255, 220, 180, 0.5)' }
];

const MIN_SPAWN_INTERVAL = 320;

let lastFrameTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
let gameStartTimestamp = Date.now();

// Enemy types
const ENEMY_TYPES = {
  NORMAL: 'normal',
  ZIGZAG: 'zigzag',
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
  rapidFireUntil: 0
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

function initStars() {
  stars.length = 0;
  STAR_LAYERS.forEach((layer) => {
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

function drawStars() {
  stars.forEach((star) => {
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
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
  const isShooting = keys[' '] || keys['Space'];
  const cooldown = isRapidFireActive() ? RAPID_FIRE_COOLDOWN : BASE_SHOT_COOLDOWN;

  if (isShooting && now - lastShotTime >= cooldown) {
    bullets.push({
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
    bullet.y -= bullet.speed;

    if (bullet.y + bullet.height < 0) {
      bullets.splice(i, 1);
    }
  }
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

  if (type === POWERUP_TYPES.RAPID_FIRE) {
    player.rapidFireUntil = Math.max(player.rapidFireUntil, now + POWERUP_DURATION[POWERUP_TYPES.RAPID_FIRE]);
    return;
  }

  if (type === POWERUP_TYPES.SHIELD) {
    player.shieldUntil = Math.max(player.shieldUntil, now + POWERUP_DURATION[POWERUP_TYPES.SHIELD]);
    player.invulnerableUntil = Math.max(player.invulnerableUntil, now + 250);
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
  if (Math.random() > POWERUP_DROP_CHANCE) {
    return;
  }

  const types = [
    POWERUP_TYPES.RAPID_FIRE,
    POWERUP_TYPES.SHIELD,
    POWERUP_TYPES.LIFE
  ];

  const type = types[Math.floor(Math.random() * types.length)];

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

  if (isPaused) {
    drawStars();
    drawPlayer();
    drawBullets();
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
    handleCollisions();
  }

  drawPlayer();
  drawBullets();
  drawEnemyBullets();
  drawEnemies();
  drawPowerUps();
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
    const radius = bullet.width / 2;

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 2);
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

  // Start first wave immediately
  if (!isWaveActive && currentWave === 1 && waveStartTime === 0) {
    startNewWave();
    return;
  }

  // Check if current wave is complete
  if (isWaveActive && waveEnemiesSpawned >= ENEMIES_PER_WAVE && enemies.length === 0) {
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
  const enemyType = Math.random() < zigzagChance ? ENEMY_TYPES.ZIGZAG : ENEMY_TYPES.NORMAL;

  const enemy = {
    x: Math.random() * (canvas.width - ENEMY_WIDTH),
    y: -ENEMY_HEIGHT,
    width: ENEMY_WIDTH,
    height: ENEMY_HEIGHT,
    speed: enemySpeed,
    baseSpeed: enemySpeed,
    type: enemyType,
    color: enemyType === ENEMY_TYPES.NORMAL ? 'red' : 'purple',
    zigzagTimer: 0,
    zigzagDirection: 1,
    horizontalSpeed: enemyType === ENEMY_TYPES.ZIGZAG ? getZigzagHorizontalSpeed(level) : 0,
    spawnedAt: now
  };

  enemies.push(enemy);
  waveEnemiesSpawned++;
  lastEnemySpawnTime = now;
}

function updateEnemies() {
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
    bullet.y += bullet.speed;
    bullet.x += bullet.direction * bullet.speed;

    if (bullet.y > canvas.height || bullet.x < 0 || bullet.x > canvas.width) {
      enemyBullets.splice(i, 1);
    }
  }
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
    ctx.fillStyle = bullet.color;
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
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

function handleCollisions() {
  const now = Date.now();

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    let enemyDestroyed = false;

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];

      if (rectsIntersect(enemy, bullet)) {
        bullets.splice(j, 1);

        if (enemy.type === ENEMY_TYPES.BOSS) {
          enemy.health--;
          if (enemy.health <= 0) {
            enemies.splice(i, 1);
            enemyDestroyed = true;

            // Boss gives more score
            const baseScore = 500;
            const earnedScore = baseScore * scoreMultiplier;
            score += earnedScore;

            // Update combo
            comboCount += 3; // Boss counts as 3 kills for combo
            if (comboCount >= COMBO_THRESHOLD && scoreMultiplier < MAX_MULTIPLIER) {
              scoreMultiplier++;
              comboCount = 0;
            }

            playExplosionSound();
            maybeSpawnPowerUp(enemy);
          }
        } else {
          enemies.splice(i, 1);
          enemyDestroyed = true;

          // Apply score with multiplier
          const baseScore = 100;
          const earnedScore = baseScore * scoreMultiplier;
          score += earnedScore;

          // Update combo
          comboCount++;
          if (comboCount >= COMBO_THRESHOLD && scoreMultiplier < MAX_MULTIPLIER) {
            scoreMultiplier++;
            comboCount = 0;
          }

          playExplosionSound();
          maybeSpawnPowerUp(enemy);
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
        playExplosionSound();
        maybeSpawnPowerUp(enemy);
        continue;
      }

      if (isPlayerInvulnerable()) {
        continue;
      }

      enemies.splice(i, 1);
      player.lives -= 1;
      player.invulnerableUntil = now + PLAYER_INVULNERABLE_TIME;

      // Reset combo on hit
      comboCount = 0;
      scoreMultiplier = 1;

      playExplosionSound(); // Play sound on player hit

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

      // Reset combo on hit
      comboCount = 0;
      scoreMultiplier = 1;

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
  if (isWaveActive) {
    ctx.fillText(`Wave ${currentWave} - ${waveEnemiesSpawned}/${ENEMIES_PER_WAVE}`, 10, 90);
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
  player.x = initialPlayerState.x;
  player.y = initialPlayerState.y;
  player.lives = PLAYER_MAX_LIVES;
  player.invulnerableUntil = 0;
  player.shieldUntil = 0;
  player.rapidFireUntil = 0;
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
  startBGM();
}

initStars();

gameLoop();
