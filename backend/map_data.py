# backend/map_data.py
# tiles:
# 0 = dirt (terra)
# 1 = grass (grama)

W, H = 18, 18

# mapa simples estilo “praça abandonada”
TILES = [[0 for _ in range(W)] for _ in range(H)]

# borda de grama e alguns blocos
for y in range(H):
    for x in range(W):
        if x in (0, W - 1) or y in (0, H - 1):
            TILES[y][x] = 1

# manchas de grama no centro
for y in range(4, 14):
    for x in range(4, 14):
        if (x + y) % 3 == 0:
            TILES[y][x] = 1

# objetos (árvores)
OBJECTS = [
    {"type": "tree", "x": 3, "y": 3},
    {"type": "tree", "x": 6, "y": 4},
    {"type": "tree", "x": 12, "y": 5},
    {"type": "tree", "x": 14, "y": 10},
    {"type": "tree", "x": 9, "y": 13},
]

BLOCKED_TILES = set()      # se quiser bloquear tipo: {2,3...}
BLOCKED_OBJECTS = {"tree"}  # árvore bloqueia andar


def in_bounds(x, y):
    return 0 <= x < W and 0 <= y < H


def tile_at(x, y):
    if not in_bounds(x, y):
        return 0
    return TILES[y][x]


def object_at(x, y):
    for o in OBJECTS:
        if o["x"] == x and o["y"] == y:
            return o
    return None


def is_walkable(x, y):
    if not in_bounds(x, y):
        return False
    if tile_at(x, y) in BLOCKED_TILES:
        return False
    obj = object_at(x, y)
    if obj and obj.get("type") in BLOCKED_OBJECTS:
        return False
    return True
