const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Audio context for sound effects
let audioCtx = null;

// Initialize audio context (needs user interaction)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Generate shooting sound
function playShootSound() {
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.1);
}

// Generate explosion sound
function playExplosionSound() {
  if (!audioCtx) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
  const noiseSource = audioCtx.createBufferSource();

  // Create noise
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  noiseSource.buffer = noiseBuffer;
  noiseSource.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  noiseSource.start(audioCtx.currentTime);
  noiseSource.stop(audioCtx.currentTime + 0.3);
}

// Game state
let score = 0;
let keys = {};
let lastShotTime = 0;
let isGameOver = false;

const bullets = [];
const enemies = [];
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
  ZIGZAG: 'zigzag'
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
  // Initialize audio on first user interaction
  initAudio();

  keys[e.key] = true;
  keys[e.code] = true;

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

  updateStars(delta);
  drawStars();

  if (!isGameOver) {
    updatePlayer();
    handleShooting();
    updateBullets();
    handleEnemySpawning();
    updateEnemies();
    updatePowerUps();
    handlePowerUpCollection();
    handleCollisions();
  }

  drawPlayer();
  drawBullets();
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

  // Draw a simple spaceship shape using triangles
  ctx.fillStyle = player.color;

  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  // Main body (triangle pointing up)
  ctx.beginPath();
  ctx.moveTo(centerX, player.y); // Top point
  ctx.lineTo(player.x + 10, player.y + player.height); // Bottom left
  ctx.lineTo(player.x + player.width - 10, player.y + player.height); // Bottom right
  ctx.closePath();
  ctx.fill();

  // Wings
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
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, player.width, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBullets() {
  bullets.forEach((bullet) => {
    // Draw bullets as glowing circles
    const centerX = bullet.x + bullet.width / 2;
    const centerY = bullet.y + bullet.height / 2;
    const radius = bullet.width / 2;

    // Outer glow
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.fill();

    // Inner bullet
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = bullet.color;
    ctx.fill();
  });
}

function handleEnemySpawning() {
  const now = Date.now();
  const spawnInterval = getCurrentSpawnInterval();
  if (now - lastEnemySpawnTime < spawnInterval) {
    return;
  }

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
  lastEnemySpawnTime = now;
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    // Move enemy down
    enemy.y += enemy.speed;

    // Handle different enemy types
    if (enemy.type === ENEMY_TYPES.ZIGZAG) {
      enemy.zigzagTimer += 1;

      // Change direction every 30 frames (approximately 0.5 seconds at 60fps)
      if (enemy.zigzagTimer % 30 === 0) {
        enemy.zigzagDirection *= -1;
      }

      // Move horizontally
      enemy.x += enemy.zigzagDirection * enemy.horizontalSpeed;

      // Keep enemy within screen bounds
      if (enemy.x <= 0 || enemy.x >= canvas.width - enemy.width) {
        enemy.zigzagDirection *= -1;
        enemy.x = Math.max(0, Math.min(canvas.width - enemy.width, enemy.x));
      }
    }

    // Remove enemies that are off screen
    if (enemy.y > canvas.height) {
      enemies.splice(i, 1);
    }
  }
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    // Draw enemies as menacing shapes
    ctx.fillStyle = enemy.color;

    const centerX = enemy.x + enemy.width / 2;
    const centerY = enemy.y + enemy.height / 2;

    if (enemy.type === ENEMY_TYPES.ZIGZAG) {
      // Draw zigzag enemies as diamonds
      ctx.beginPath();
      ctx.moveTo(centerX, enemy.y); // Top
      ctx.lineTo(enemy.x + enemy.width, centerY); // Right
      ctx.lineTo(centerX, enemy.y + enemy.height); // Bottom
      ctx.lineTo(enemy.x, centerY); // Left
      ctx.closePath();
      ctx.fill();

      // Distinct outline for zigzag enemies
      ctx.strokeStyle = '#4a0080';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Main body (hexagon-like shape) for normal enemies
      ctx.beginPath();
      ctx.moveTo(centerX, enemy.y); // Top
      ctx.lineTo(enemy.x + enemy.width - 5, enemy.y + 10); // Top right
      ctx.lineTo(enemy.x + enemy.width, centerY); // Middle right
      ctx.lineTo(enemy.x + enemy.width - 5, enemy.y + enemy.height - 10); // Bottom right
      ctx.lineTo(centerX, enemy.y + enemy.height); // Bottom
      ctx.lineTo(enemy.x + 5, enemy.y + enemy.height - 10); // Bottom left
      ctx.lineTo(enemy.x, centerY); // Middle left
      ctx.lineTo(enemy.x + 5, enemy.y + 10); // Top left
      ctx.closePath();
      ctx.fill();

      // Dark outline
      ctx.strokeStyle = '#800000';
      ctx.lineWidth = 2;
      ctx.stroke();
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

function handleCollisions() {
  const now = Date.now();

  // Bullet vs enemy
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    let enemyDestroyed = false;

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];

      if (rectsIntersect(enemy, bullet)) {
        enemies.splice(i, 1);
        bullets.splice(j, 1);
        score += 100;
        enemyDestroyed = true;
        playExplosionSound();
        maybeSpawnPowerUp(enemy);
        break;
      }
    }

    if (enemyDestroyed) {
      continue;
    }

    // Player vs enemy
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

      if (player.lives <= 0) {
        isGameOver = true;
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

  const now = Date.now();
  let statusY = 90;

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
  ctx.textAlign = 'left'; // Reset alignment
}

function restartGame() {
  score = 0;
  player.x = initialPlayerState.x;
  player.y = initialPlayerState.y;
  player.lives = PLAYER_MAX_LIVES;
  player.invulnerableUntil = 0;
  player.shieldUntil = 0;
  player.rapidFireUntil = 0;
  bullets.length = 0;
  enemies.length = 0;
  powerUps.length = 0;
  isGameOver = false;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
  keys = {};
  gameStartTimestamp = Date.now();
  lastFrameTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
}

initStars();

// Start the game loop
gameLoop();
