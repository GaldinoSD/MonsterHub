// frontend/src/iso.js
export const TILE_W = 64;
export const TILE_H = 32;

export function gridToScreen(x, y, originX, originY) {
  return {
    x: (x - y) * (TILE_W / 2) + originX,
    y: (x + y) * (TILE_H / 2) + originY
  };
}

// screen -> grid estável
export function screenToGrid(sx, sy, originX, originY) {
  const dx = sx - originX;
  const dy = sy - originY;

  const gx = (dy / (TILE_H / 2) + dx / (TILE_W / 2)) / 2;
  const gy = (dy / (TILE_H / 2) - dx / (TILE_W / 2)) / 2;

  return { x: Math.floor(gx + 0.5), y: Math.floor(gy + 0.5) };
}

export function depthKey(x, y) {
  return x + y;
}
