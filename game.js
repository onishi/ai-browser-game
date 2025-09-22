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

const BULLET_WIDTH = 6;
const BULLET_HEIGHT = 12;
const BULLET_SPEED = 8;
const SHOT_COOLDOWN = 200; // milliseconds

const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 40;
const ENEMY_SPEED = 2.5;
const ENEMY_SPAWN_INTERVAL = 1000; // milliseconds

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
  speed: 5
};

const initialPlayerState = { ...player };

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

  if (isShooting && now - lastShotTime >= SHOT_COOLDOWN) {
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

// Game loop
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!isGameOver) {
    // Update game state
    updatePlayer();
    handleShooting();
    updateBullets();
    handleEnemySpawning();
    updateEnemies();
    handleCollisions();

    // Draw everything
    drawPlayer();
    drawBullets();
    drawEnemies();
    drawHUD();
  } else {
    drawGameOver();
  }

  requestAnimationFrame(gameLoop);
}

function drawPlayer() {
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
  if (now - lastEnemySpawnTime < ENEMY_SPAWN_INTERVAL) {
    return;
  }

  // Randomly choose enemy type (70% normal, 30% zigzag)
  const enemyType = Math.random() < 0.7 ? ENEMY_TYPES.NORMAL : ENEMY_TYPES.ZIGZAG;

  const enemy = {
    x: Math.random() * (canvas.width - ENEMY_WIDTH),
    y: -ENEMY_HEIGHT,
    width: ENEMY_WIDTH,
    height: ENEMY_HEIGHT,
    speed: ENEMY_SPEED,
    type: enemyType,
    color: enemyType === ENEMY_TYPES.NORMAL ? 'red' : 'purple',
    zigzagTimer: 0,
    zigzagDirection: 1
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
      enemy.x += enemy.zigzagDirection * 2;

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
        break;
      }
    }

    if (enemyDestroyed) {
      continue;
    }

    // Player vs enemy
    if (rectsIntersect(enemy, player)) {
      isGameOver = true;
      break; // End collision check for this frame
    }
  }
}

function drawHUD() {
  ctx.fillStyle = '#000';
  ctx.font = '20px sans-serif';
  ctx.fillText(`Score: ${score}`, 10, 30);
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
  bullets.length = 0;
  enemies.length = 0;
  isGameOver = false;
  lastShotTime = 0;
  lastEnemySpawnTime = 0;
}

// Start the game loop
gameLoop();
