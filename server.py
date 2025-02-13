from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit
import time

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Dictionary to hold player data. Each player gets a sequential number.
players = {}
player_count = 0

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

def on_connect():
    global player_count
    print(f'Client connected: {request.sid}')
    player_count += 1
    players[request.sid] = {
        'x': 100,
        'y': 100,
        'block': False,
        'lastShot': 0,
        'health': 100,
        'alive': True,
        'number': player_count,
        'upgrade': 0
    }
    print("Sending player data:", players)
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
    # Change "127.0.0.1" to "0.0.0.0" to allow external connections
    host_ip = "0.0.0.0"  # This allows connections from other devices
    port = 5001  # Choose any port
    socketio.run(app, host=host_ip, port=port)
