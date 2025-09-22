const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game state
let score = 0;
let keys = {};
let lastShotTime = 0;

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

// Input handling
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  keys[e.code] = true;
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
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Update game state
  updatePlayer();
  handleShooting();
  updateBullets();
  handleEnemySpawning();
  updateEnemies();
  handleCollisions();

  // Draw player
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);

  // Draw bullets
  drawBullets();

  // Draw enemies
  drawEnemies();

  drawHUD();

  requestAnimationFrame(gameLoop);
}

function drawBullets() {
  bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.color;
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  });
}

function handleEnemySpawning() {
  const now = Date.now();
  if (now - lastEnemySpawnTime < ENEMY_SPAWN_INTERVAL) {
    return;
  }

  enemies.push({
    x: Math.random() * (canvas.width - ENEMY_WIDTH),
    y: -ENEMY_HEIGHT,
    width: ENEMY_WIDTH,
    height: ENEMY_HEIGHT,
    speed: ENEMY_SPEED,
    color: 'red'
  });

  lastEnemySpawnTime = now;
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.y += enemy.speed;

    if (enemy.y > canvas.height) {
      enemies.splice(i, 1);
    }
  }
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    ctx.fillStyle = enemy.color;
    ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
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
        break;
      }
    }

    if (enemyDestroyed) {
      continue;
    }

    if (rectsIntersect(enemy, player)) {
      enemies.splice(i, 1);
    }
  }
}

function drawHUD() {
  ctx.fillStyle = '#000';
  ctx.font = '20px sans-serif';
  ctx.fillText(`Score: ${score}`, 10, 30);
}

// Start the game loop
gameLoop();
