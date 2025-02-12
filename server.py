from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit
import time

app = Flask(__name__, static_url_path='', static_folder='static')
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

# Dictionary to hold player data. Each player gets a sequential number.
players = {}
player_count = 0

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@socketio.on('connect')
def on_connect():
    global player_count
    print('Client connected:', request.sid)
    player_count += 1
    # Initialize player with starting position, health, alive state, etc.
    players[request.sid] = {
        'x': 100,
        'y': 100,
        'block': False,
        'lastShot': 0,
        'health': 100,
        'alive': True,
        'number': player_count,  # player number shown on-screen
        'upgrade': 0           # weapon upgrade level (0 = basic)
    }
    emit('currentPlayers', players, broadcast=True)

@socketio.on('disconnect')
def on_disconnect():
    global player_count
    print('Client disconnected:', request.sid)
    if request.sid in players:
        del players[request.sid]
        # Recalculate player_count or leave as is; here we just update the count.
        player_count = len(players)
    emit('playerDisconnected', request.sid, broadcast=True)

@socketio.on('playerMovement')
def on_player_movement(data):
    if request.sid in players and players[request.sid]['alive']:
        players[request.sid]['x'] = data['x']
        players[request.sid]['y'] = data['y']
        players[request.sid]['block'] = data.get('block', False)
    emit('playerMoved', {
        'id': request.sid,
        'x': data['x'],
        'y': data['y'],
        'block': data.get('block', False)
    }, broadcast=True)

@socketio.on('shoot')
def on_shoot(data):
    data['shooter'] = request.sid
    data['timestamp'] = time.time()
    emit('bulletShot', data, broadcast=True)

@socketio.on('playerHit')
def on_player_hit(data):
    target_id = data.get('target')
    damage = data.get('damage', 0)
    shooter = data.get('shooter')
    if target_id in players and players[target_id]['alive']:
        players[target_id]['health'] -= damage
        if players[target_id]['health'] <= 0:
            players[target_id]['alive'] = False
            emit('playerDied', target_id, broadcast=True)
            check_game_over()
        else:
            emit('updateHealth', {'id': target_id, 'health': players[target_id]['health']}, broadcast=True)

def check_game_over():
    alive_players = [pid for pid, p in players.items() if p.get('alive')]
    if len(alive_players) == 1:
        winner = alive_players[0]
        emit('gameOver', winner, broadcast=True)

@socketio.on('restartGame')
def on_restart_game():
    # Reset game state for all players
    for pid in players:
        players[pid]['health'] = 100
        players[pid]['alive'] = True
        players[pid]['x'] = 100
        players[pid]['y'] = 100
        # Optionally reset upgrades here if needed
    emit('gameRestarted', players, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001)
