# backend/app.py
from flask import Flask, request
from flask_socketio import SocketIO, join_room, leave_room, emit
from rooms import RoomState
from map_data import W, H, TILES, OBJECTS, is_walkable

ROOM_ID = "lobby"

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

rooms = {ROOM_ID: RoomState()}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


@app.get("/health")
def health():
    return {"ok": True}


@socketio.on("connect")
def on_connect():
    emit("server_info", {
        "room": ROOM_ID,
        "map": {"w": W, "h": H, "tiles": TILES, "objects": OBJECTS}
    })


@socketio.on("join_room")
def on_join(data):
    name = (data or {}).get("name", "Player")[:20]
    monster = (data or {}).get("monster", "wolf")[:20].lower()

    # spawn seguro
    x, y = 2, 2
    if not is_walkable(x, y):
        x, y = 1, 1

    state = rooms[ROOM_ID]
    state.add_player(request.sid, name, monster, x, y)

    join_room(ROOM_ID)

    emit("room_snapshot", {
        "you": request.sid,
        "players": state.snapshot(),
        "map": {"w": W, "h": H, "tiles": TILES, "objects": OBJECTS},
        "room": ROOM_ID
    })

    emit("player_joined", state.players[request.sid].to_dict(
    ), to=ROOM_ID, include_self=False)


@socketio.on("move_to")
def on_move_to(data):
    try:
        x = int((data or {}).get("x"))
        y = int((data or {}).get("y"))
    except Exception:
        return

    x = clamp(x, 0, W - 1)
    y = clamp(y, 0, H - 1)

    if not is_walkable(x, y):
        return

    state = rooms[ROOM_ID]
    p = state.move_player(request.sid, x, y)
    if not p:
        return

    emit("player_moved", {"sid": p.sid, "x": p.x, "y": p.y}, to=ROOM_ID)


@socketio.on("chat")
def on_chat(data):
    msg = ((data or {}).get("msg") or "").strip()
    if not msg:
        return
    msg = msg[:160]

    state = rooms[ROOM_ID]
    p = state.players.get(request.sid)
    if not p:
        return

    emit("chat_msg", {"sid": p.sid, "name": p.name, "msg": msg}, to=ROOM_ID)


@socketio.on("disconnect")
def on_disconnect():
    state = rooms[ROOM_ID]
    if request.sid in state.players:
        leave_room(ROOM_ID)
        state.remove_player(request.sid)
        emit("player_left", {"sid": request.sid}, to=ROOM_ID)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5001, debug=True)
