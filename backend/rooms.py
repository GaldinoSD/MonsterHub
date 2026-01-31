# backend/rooms.py
import time
from dataclasses import dataclass, asdict


@dataclass
class Player:
    sid: str
    name: str
    monster: str
    x: int
    y: int
    updated_at: float

    def to_dict(self):
        return asdict(self)


class RoomState:
    def __init__(self):
        self.players = {}  # sid -> Player

    def add_player(self, sid: str, name: str, monster: str, x: int, y: int):
        self.players[sid] = Player(
            sid=sid, name=name, monster=monster, x=x, y=y, updated_at=time.time()
        )

    def remove_player(self, sid: str):
        if sid in self.players:
            del self.players[sid]

    def move_player(self, sid: str, x: int, y: int):
        p = self.players.get(sid)
        if not p:
            return None
        p.x, p.y = x, y
        p.updated_at = time.time()
        return p

    def snapshot(self):
        return {sid: p.to_dict() for sid, p in self.players.items()}
