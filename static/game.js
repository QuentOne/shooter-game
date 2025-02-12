// Set up canvas
var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Connect to the server
var socket = io("https://your-flask-app.herokuapp.com");

// Game state objects
var players = {};
var bullets = [];
var localPlayerId = null;
var localPlayer = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    speed: 5,
    block: false,
    blockingStart: 0,
    blockCooldown: 0,
    lastShotTime: 0,
    health: 100,
    alive: true,
    number: 0,
    upgrade: 0 // upgrade level (affects damage, fire rate, etc.)
};

// Keyboard input tracking
var keys = {};
document.addEventListener('keydown', function(e) {
    // Store key state (but note: we reserve the "a" key for shooting)
    if (e.key !== 'a') {
        keys[e.key] = true;
    }
    if (e.key === 'Shift') {
        if (!localPlayer.block && (Date.now() - localPlayer.blockCooldown >= 5000)) {
            localPlayer.block = true;
            localPlayer.blockingStart = Date.now();
        }
    }
});
document.addEventListener('keyup', function(e) {
    if (e.key !== 'a') {
        keys[e.key] = false;
    }
    if (e.key === 'Shift') {
        localPlayer.block = false;
        localPlayer.blockCooldown = Date.now();
    }
});

// Function to shoot (usable for both mouse click and "a" key)
function shootAt(targetX, targetY) {
    var now = Date.now();
    if (now - localPlayer.lastShotTime >= 500 && localPlayer.alive) {
        var angle = Math.atan2(targetY - localPlayer.y, targetX - localPlayer.x);
        var bulletSpeed = 10;
        var bullet = {
            x: localPlayer.x,
            y: localPlayer.y,
            vx: bulletSpeed * Math.cos(angle),
            vy: bulletSpeed * Math.sin(angle),
            shooter: localPlayerId,
            timestamp: now,
            damage: 10 * (1 + localPlayer.upgrade * 0.1) // base damage boosted by upgrade level
        };
        bullets.push(bullet);
        localPlayer.lastShotTime = now;
        socket.emit('shoot', {
            x: localPlayer.x,
            y: localPlayer.y,
            vx: bullet.vx,
            vy: bullet.vy,
            damage: bullet.damage
        });
    }
}

// Mouse click to shoot
canvas.addEventListener('click', function(e) {
    var rect = canvas.getBoundingClientRect();
    var targetX = e.clientX - rect.left;
    var targetY = e.clientY - rect.top;
    shootAt(targetX, targetY);
});

// Pressing "a" also shoots
document.addEventListener('keydown', function(e) {
    if (e.key === 'a' && localPlayer.alive) {
        // Shoot to the right as a default direction
        shootAt(localPlayer.x + 100, localPlayer.y);
    }
});

// Update game logic
function update() {
    if (!localPlayer.alive) return; // Stop updates if dead

    // Use only arrow keys and WASD (except "a" which is reserved for shooting)
    if (keys['ArrowUp'] || keys['w']) localPlayer.y -= localPlayer.speed;
    if (keys['ArrowDown'] || keys['s']) localPlayer.y += localPlayer.speed;
    if (keys['ArrowLeft']) localPlayer.x -= localPlayer.speed;
    if (keys['ArrowRight'] || keys['d']) localPlayer.x += localPlayer.speed;
    
    // Constrain player to canvas boundaries
    localPlayer.x = Math.max(0, Math.min(canvas.width, localPlayer.x));
    localPlayer.y = Math.max(0, Math.min(canvas.height, localPlayer.y));

    // Manage blocking timeout
    if (localPlayer.block && Date.now() - localPlayer.blockingStart >= 2000) {
        localPlayer.block = false;
        localPlayer.blockCooldown = Date.now();
    }
    
    if (localPlayerId) {
        players[localPlayerId] = localPlayer;
    }
    
    socket.emit('playerMovement', {
        x: localPlayer.x,
        y: localPlayer.y,
        block: localPlayer.block
    });

    // Update bullets
    for (var i = bullets.length - 1; i >= 0; i--) {
        var b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        
        // Collision detection with players (skip shooter)
        for (var id in players) {
            if (id !== b.shooter && players[id].alive) {
                var p = players[id];
                var dx = b.x - p.x;
                var dy = b.y - p.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 20 + 5) { // 20: player radius, 5: bullet radius
                    if (!p.block) {
                        socket.emit('playerHit', {
                            target: id,
                            damage: b.damage,
                            shooter: b.shooter
                        });
                    }
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
        // Remove bullet if off-canvas
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
        }
    }
}

// Draw game elements
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw players
    for (var id in players) {
        var p = players[id];
        if (!p.alive) continue; // Skip dead players
        
        // Set color based on upgrade level
        var baseColor = 'grey';
        if (p.upgrade === 1) baseColor = 'red';
        else if (p.upgrade === 2) baseColor = 'blue';
        else if (p.upgrade === 3) baseColor = 'green';
        else if (p.upgrade === 4) baseColor = 'gold';
        else if (p.upgrade >= 5) baseColor = 'black';
        
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw player number
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.number, p.x, p.y + 5);
        
        // Draw health bar above player
        ctx.fillStyle = 'red';
        ctx.fillRect(p.x - 20, p.y - 30, 40, 5);
        ctx.fillStyle = 'green';
        var healthWidth = Math.max(0, 40 * (p.health / 100));
        ctx.fillRect(p.x - 20, p.y - 30, healthWidth, 5);
        
        // Draw blocking indicator if active
        if (p.block) {
            ctx.strokeStyle = '#ff0';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 25, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
    
    // Draw bullets
    ctx.fillStyle = '#fff';
    bullets.forEach(function(b) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, 2 * Math.PI);
        ctx.fill();
    });
    
    // Draw health bars for all players on bottom left
    var index = 0;
    for (var id in players) {
        var p = players[id];
        ctx.fillStyle = '#555';
        ctx.fillRect(10, canvas.height - 30 - index * 30, 100, 20);
        ctx.fillStyle = 'green';
        ctx.fillRect(10, canvas.height - 30 - index * 30, 100 * (p.health / 100), 20);
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText("Player " + p.number, 120, canvas.height - 15 - index * 30);
        index++;
    }
}

function gameLoop() {
    if (localPlayer.alive) {
        update();
    }
    draw();
    requestAnimationFrame(gameLoop);
}

// Socket.IO event handlers
socket.on('currentPlayers', function(serverPlayers) {
    players = serverPlayers;
    if (localPlayerId && players[localPlayerId]) {
        localPlayer = players[localPlayerId];
    }
});
socket.on('playerMoved', function(data) {
    if (!players[data.id]) players[data.id] = {};
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].block = data.block;
});
socket.on('playerDisconnected', function(id) {
    delete players[id];
});
socket.on('bulletShot', function(data) {
    if (data.shooter !== localPlayerId) {
        bullets.push({
            x: data.x,
            y: data.y,
            vx: data.vx,
            vy: data.vy,
            shooter: data.shooter,
            timestamp: data.timestamp,
            damage: data.damage
        });
    }
});
socket.on('updateHealth', function(data) {
    if (players[data.id]) {
        players[data.id].health = data.health;
    }
});
socket.on('playerDied', function(id) {
    if (players[id]) {
        players[id].alive = false;
        if (id === localPlayerId) {
            localPlayer.alive = false;
            showOverlay("You died. Waiting for others...");
        }
    }
});
socket.on('gameOver', function(winnerId) {
    var msg = (winnerId === localPlayerId)
        ? "You win!"
        : "Player " + players[winnerId].number + " wins!";
    showOverlay(msg, true);
});
socket.on('gameRestarted', function(serverPlayers) {
    players = serverPlayers;
    if (localPlayerId && players[localPlayerId]) {
        localPlayer = players[localPlayerId];
    }
    hideOverlay();
});
socket.on('connect', function() {
    localPlayerId = socket.id;
    players[localPlayerId] = localPlayer;
});

// Overlay functions for dead/game over states
var overlay = document.getElementById('overlay');
var messageDiv = document.getElementById('message');
var playAgainBtn = document.getElementById('playAgain');
function showOverlay(message, showButton) {
    overlay.style.display = 'block';
    messageDiv.innerText = message;
    playAgainBtn.style.display = showButton ? 'inline-block' : 'none';
}
function hideOverlay() {
    overlay.style.display = 'none';
}
playAgainBtn.addEventListener('click', function() {
    socket.emit('restartGame');
});

gameLoop();
