// frontend/src/game.js
import { TILE_W, TILE_H, gridToScreen, screenToGrid, depthKey } from "./iso.js";
import { createNet } from "./net.js";

/**
 * DEFINIÇÕES DOS MONSTROS
 * - wolf/vampire/mummy: 32x48, 4x4 (16 frames), linhas = s,w,e,n
 * - imp: 64x64, 4x4 (16 frames), linhas = s,w,e,n (assumindo)
 * - goblin: 64x64, 11x5, usa linhas 0..3 e frames 0..5
 * - golem: 64x64, 7x4, usa linhas 0..3 e frames 0..6
 */
const MONSTER_DEFS = {
  wolf:    { key: "wolf",    frameW: 32, frameH: 48, cols: 4,  rows: 4,  rowDir: { s:0,w:1,e:2,n:3 }, walkCount: 4 },
  vampire: { key: "vampire", frameW: 32, frameH: 48, cols: 4,  rows: 4,  rowDir: { s:0,w:1,e:2,n:3 }, walkCount: 4 },
  mummy:   { key: "mummy",   frameW: 32, frameH: 48, cols: 4,  rows: 4,  rowDir: { s:0,w:1,e:2,n:3 }, walkCount: 4 },

  imp:     { key: "imp",     frameW: 64, frameH: 64, cols: 4,  rows: 4,  rowDir: { s:0,w:1,e:2,n:3 }, walkCount: 4 },
  goblin:  { key: "goblin",  frameW: 64, frameH: 64, cols: 11, rows: 5,  rowDir: { s:0,w:1,e:2,n:3 }, walkCount: 6 },
  golem:   { key: "golem",   frameW: 64, frameH: 64, cols: 7,  rows: 4,  rowDir: { s:0,w:1,e:2,n:3 }, walkCount: 7 },
};

const ALL_MONSTERS = Object.keys(MONSTER_DEFS);

let __game = null;
let __net = null;
let __onResize = null;

// ✅ handlers globais (pra não duplicar)
let __chatCaptureHandler = null;
let __chatFocusHandler = null;
let __chatBlurHandler = null;
let __uiStopHandlers = null;

function logLine(text) {
  const el = document.getElementById("log");
  if (!el) return;
  const p = document.createElement("div");
  p.textContent = text;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function makeAnimKey(monster, dir) {
  return `${monster}_walk_${dir}`;
}

function buildAnimFrames(def, dir) {
  const row = def.rowDir[dir] ?? 0;
  const frames = [];
  for (let i = 0; i < def.walkCount; i++) frames.push(row * def.cols + i);
  return frames;
}

// cria tile iso de grama a partir de uma textura grande (grass.png)
function createIsoTileFromPattern(scene, patternKey, outKey, outW = 256, outH = 128) {
  if (scene.textures.exists(outKey)) return;

  const src = scene.textures.get(patternKey)?.getSourceImage?.();
  if (!src) return;

  const canvasTex = scene.textures.createCanvas(outKey, outW, outH);
  const ctx = canvasTex.getContext();

  const pat = ctx.createPattern(src, "repeat");
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, outW, outH);

  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.moveTo(outW / 2, 0);
  ctx.lineTo(outW, outH / 2);
  ctx.lineTo(outW / 2, outH);
  ctx.lineTo(0, outH / 2);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  canvasTex.refresh();
}

// ✅ instala o fix de chat UMA vez por startGame (limpa antes)
function installChatFix({ inputChat, btnSend, leaveBtn, getScene }) {
  // remove capture antigo
  if (__chatCaptureHandler) {
    document.removeEventListener("keydown", __chatCaptureHandler, true);
    __chatCaptureHandler = null;
  }

  // remove focus/blur antigos
  if (__chatFocusHandler) inputChat.removeEventListener("focus", __chatFocusHandler);
  if (__chatBlurHandler) inputChat.removeEventListener("blur", __chatBlurHandler);
  __chatFocusHandler = null;
  __chatBlurHandler = null;

  // remove stopPropagation antigos
  if (__uiStopHandlers) {
    const { els, fns } = __uiStopHandlers;
    for (let i = 0; i < els.length; i++) {
      for (const ev of ["pointerdown", "mousedown", "click", "touchstart"]) {
        els[i].removeEventListener(ev, fns[i]);
      }
    }
    __uiStopHandlers = null;
  }

  // ✅ 1) capture: se chat está focado, Phaser NÃO recebe teclado
  __chatCaptureHandler = (e) => {
    if (document.activeElement === inputChat) {
      e.stopPropagation(); // não deixa subir pro Phaser
    }
  };
  document.addEventListener("keydown", __chatCaptureHandler, true);

  // ✅ 2) ao focar chat: desliga teclado do Phaser
  __chatFocusHandler = () => {
    const scene = getScene();
    const kb = scene?.input?.keyboard;
    if (kb) {
      kb.enabled = false;
      kb.disableGlobalCapture?.();
      kb.clearCaptures?.();
    }
  };

  // ✅ 3) ao sair do chat: liga teclado do Phaser
  __chatBlurHandler = () => {
    const scene = getScene();
    const kb = scene?.input?.keyboard;
    if (kb) kb.enabled = true;
  };

  inputChat.addEventListener("focus", __chatFocusHandler);
  inputChat.addEventListener("blur", __chatBlurHandler);

  // ✅ 4) evita clique no UI “vazar” pro pointerdown do Phaser
  const els = [inputChat, btnSend, leaveBtn].filter(Boolean);
  const fns = els.map(() => (e) => e.stopPropagation());
  for (let i = 0; i < els.length; i++) {
    for (const ev of ["pointerdown", "mousedown", "click", "touchstart"]) {
      els[i].addEventListener(ev, fns[i], { passive: true });
    }
  }
  __uiStopHandlers = { els, fns };
}

export function startGame({ name, monster } = {}) {
  const gameRoot = document.getElementById("gameRoot");
  const inputChat = document.getElementById("chat");
  const btnSend = document.getElementById("send");
  const leaveBtn = document.getElementById("leaveBtn");

  gameRoot.innerHTML = "";

  // mata jogo anterior
  if (__game) { try { __game.destroy(true); } catch {} __game = null; }
  if (__net)  { try { __net.socket?.disconnect(); } catch {} __net = null; }

  if (__onResize) {
    window.removeEventListener("resize", __onResize);
    __onResize = null;
  }

  const backendUrl = `${location.protocol}//${location.hostname}:5001`;

  let mapW = 12, mapH = 12;
  let mapTiles = null;    // 2D tiles (0/1)
  let mapObjects = [];    // árvores

  let originX = Math.floor(window.innerWidth / 2);
  let originY = 120;

  const players = new Map();

  let tileLayer = null;   // container
  let objLayer = null;    // container

  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: gameRoot,
    backgroundColor: "#0b1020",
    scene: {
      preload() {
        // monsters
        ALL_MONSTERS.forEach((k) => {
          const def = MONSTER_DEFS[k];
          this.load.spritesheet(def.key, `./assets/monsters/${def.key}.png`, {
            frameWidth: def.frameW,
            frameHeight: def.frameH
          });
        });

        // tiles/objects
        this.load.image("tile_dirt", "./assets/tiles/dirt.png");
        this.load.image("grass_pattern", "./assets/tiles/grass.png");
        this.load.image("tree", "./assets/tiles/tree.png");
      },

      create() {
        const scene = this;

        // ✅ muito importante: não capturar teclado globalmente
        if (scene.input && scene.input.keyboard) {
          scene.input.keyboard.disableGlobalCapture();
          scene.input.keyboard.clearCaptures();
        }

        // evita canvas pegando foco
        scene.game.canvas.setAttribute("tabindex", "-1");

        // cria tile iso de grama em runtime
        scene.events.once("postupdate", () => {
          createIsoTileFromPattern(scene, "grass_pattern", "tile_grass_iso", 256, 128);
        });

        // animações por definição
        ALL_MONSTERS.forEach((m) => {
          const def = MONSTER_DEFS[m];
          ["s","w","e","n"].forEach((dir) => {
            const key = makeAnimKey(m, dir);
            if (scene.anims.exists(key)) return;

            const frames = buildAnimFrames(def, dir);
            scene.anims.create({
              key,
              frames: frames.map((f) => ({ key: def.key, frame: f })),
              frameRate: 10,
              repeat: -1
            });
          });
        });

        tileLayer = scene.add.container(0, 0);
        objLayer = scene.add.container(0, 0);

        function drawMap() {
          if (!tileLayer || !objLayer) return;

          tileLayer.removeAll(true);
          objLayer.removeAll(true);

          if (!mapTiles) {
            mapW = mapW || 12;
            mapH = mapH || 12;
            mapTiles = Array.from({ length: mapH }, () => Array.from({ length: mapW }, () => 0));
          }

          for (let y = 0; y < mapH; y++) {
            for (let x = 0; x < mapW; x++) {
              const t = mapTiles[y]?.[x] ?? 0;
              const { x: sx, y: sy } = gridToScreen(x, y, originX, originY);

              if (t === 0) {
                const img = scene.add.image(sx, sy, "tile_dirt");
                img.setOrigin(0.5, 0);
                img.setScale(0.25);
                img.setDepth(depthKey(x, y));
                tileLayer.add(img);
              } else {
                const img = scene.add.image(sx, sy, "tile_grass_iso");
                img.setOrigin(0.5, 0);
                img.setScale(0.25);
                img.setDepth(depthKey(x, y));
                tileLayer.add(img);
              }
            }
          }

          for (const o of (mapObjects || [])) {
            if (o.type !== "tree") continue;
            const { x: sx, y: sy } = gridToScreen(o.x, o.y, originX, originY);

            const tree = scene.add.image(sx, sy + TILE_H, "tree");
            tree.setOrigin(0.5, 1);
            tree.setScale(1);
            tree.setDepth(depthKey(o.x, o.y) + 900);
            objLayer.add(tree);
          }
        }

        // clique pra mover
        scene.input.on("pointerdown", (pointer) => {
          // ✅ se clicou em UI HTML, não move
          const target = pointer?.event?.target;
          if (target && (target.id === "chat" || target.id === "send" || target.id === "leaveBtn")) return;

          if (!mapW || !mapH) return;

          const g = screenToGrid(pointer.x, pointer.y, originX, originY);
          const tx = clamp(g.x, 0, mapW - 1);
          const ty = clamp(g.y, 0, mapH - 1);

          if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;

          __net?.moveTo(tx, ty);
        });

        __onResize = () => {
          if (!scene.sys.isActive()) return;
          scene.scale.resize(window.innerWidth, window.innerHeight);
          originX = Math.floor(window.innerWidth / 2);
          originY = 120;
          drawMap();
        };
        window.addEventListener("resize", __onResize);

        scene.events.once("shutdown", () => {
          if (__onResize) window.removeEventListener("resize", __onResize);
          __onResize = null;
        });

        drawMap();
        scene.__drawMap = drawMap;
      },

      update(_, dt) {
        const speed = 6;
        const step = (dt / 1000) * speed;
        if (!Number.isFinite(step)) return;

        players.forEach((p) => {
          if (!p?.sprite) return;

          if (![p.x, p.y, p.targetX, p.targetY].every(Number.isFinite)) {
            p.x = 2; p.y = 2; p.targetX = 2; p.targetY = 2;
          }

          const dx = p.targetX - p.x;
          const dy = p.targetY - p.y;

          const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;

          if (!moving) {
            p.x = p.targetX;
            p.y = p.targetY;
          } else {
            p.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
            p.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
          }

          const { x: sx, y: sy } = gridToScreen(p.x, p.y, originX, originY);
          p.sprite.x = sx;
          p.sprite.y = sy + 6;
          p.sprite.setDepth(depthKey(p.x, p.y) + 1000);

          if (p.isSprite) {
            let dir = p.lastDir || "s";

            const curS = gridToScreen(p.x, p.y, originX, originY);
            const tgtS = gridToScreen(p.targetX, p.targetY, originX, originY);
            const sdx = tgtS.x - curS.x;
            const sdy = tgtS.y - curS.y;

            if (moving) {
              if (Math.abs(sdx) > Math.abs(sdy)) dir = sdx > 0 ? "e" : "w";
              else dir = sdy > 0 ? "s" : "n";
            }

            const animKey = makeAnimKey(p.monster, dir);

            if (moving) {
              if (p.sprite.anims?.currentAnim?.key !== animKey) {
                p.sprite.play(animKey, true);
              }
            } else {
              p.sprite.stop();

              const def = MONSTER_DEFS[p.monster] || MONSTER_DEFS.wolf;
              const row = def.rowDir[dir] ?? 0;
              const idleFrame = row * def.cols + 0;
              p.sprite.setFrame(idleFrame);
            }

            p.lastDir = dir;
          }
        });
      }
    }
  };

  __game = new Phaser.Game(config);

  function getScene() {
    return __game?.scene?.getScenes(true)[0];
  }

  // ✅ instala o fix do chat (agora que getScene existe)
  installChatFix({ inputChat, btnSend, leaveBtn, getScene });

  function upsertPlayer(sid, pl) {
    const scene = getScene();
    if (!scene) return;

    const monsterKey = (pl.monster || "wolf").toLowerCase();
    const validMonster = MONSTER_DEFS[monsterKey] ? monsterKey : "wolf";

    if (!players.has(sid)) {
      const sprite = scene.add.sprite(0, 0, validMonster, 0);
      sprite.setOrigin(0.5, 1);

      players.set(sid, {
        x: Number(pl.x) || 2,
        y: Number(pl.y) || 2,
        targetX: Number(pl.x) || 2,
        targetY: Number(pl.y) || 2,
        sprite,
        name: pl.name || "Player",
        monster: validMonster,
        isSprite: true,
        lastDir: "s"
      });
    } else {
      const p = players.get(sid);
      p.targetX = Number(pl.x);
      p.targetY = Number(pl.y);
      p.name = pl.name || p.name;

      const next = validMonster;
      if (p.monster !== next) {
        p.sprite.destroy();
        const sprite = scene.add.sprite(0, 0, next, 0);
        sprite.setOrigin(0.5, 1);
        p.sprite = sprite;
        p.monster = next;
        p.lastDir = "s";
      }
    }
  }

  function removePlayer(sid) {
    const p = players.get(sid);
    if (!p) return;
    p.sprite.destroy();
    players.delete(sid);
  }

  __net = createNet({
    backendUrl,
    onServerInfo: (d) => {
      if (d?.map) {
        mapW = d.map.w;
        mapH = d.map.h;
        mapTiles = d.map.tiles || null;
        mapObjects = d.map.objects || [];
      }
      const scene = getScene();
      if (scene?.__drawMap) scene.__drawMap();
    },
    onSnapshot: (snap) => {
      logLine(`Entrou na sala: ${snap.room}`);

      mapW = snap.map.w;
      mapH = snap.map.h;
      mapTiles = snap.map.tiles || null;
      mapObjects = snap.map.objects || [];

      Object.values(snap.players).forEach((pl) => upsertPlayer(pl.sid, pl));

      const scene = getScene();
      if (scene?.__drawMap) scene.__drawMap();
    },
    onPlayerJoined: (pl) => {
      upsertPlayer(pl.sid, pl);
      logLine(`${pl.name} entrou (${pl.monster})`);
    },
    onPlayerLeft: ({ sid }) => {
      removePlayer(sid);
      logLine(`Um player saiu`);
    },
    onPlayerMoved: ({ sid, x, y }) => {
      const p = players.get(sid);
      if (!p) return;

      const nx = Number(x);
      const ny = Number(y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;

      p.targetX = nx;
      p.targetY = ny;
    },
    onChat: ({ name, msg }) => logLine(`${name}: ${msg}`)
  });

  btnSend.onclick = () => {
    const msg = (inputChat.value || "").trim();
    if (!msg) return;
    __net.chat(msg);
    inputChat.value = "";
    inputChat.focus(); // ✅ continua focado
  };

  inputChat.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnSend.click();
    }
  };

  const safeName = (name || localStorage.getItem("mh_name") || "Player").trim() || "Player";
  const safeMonster = (monster || localStorage.getItem("mh_monster") || "wolf").toLowerCase();
  __net.join(safeName, safeMonster);

  leaveBtn.onclick = () => {
    // ✅ limpa capture global
    if (__chatCaptureHandler) {
      document.removeEventListener("keydown", __chatCaptureHandler, true);
      __chatCaptureHandler = null;
    }

    try { __net?.socket?.disconnect(); } catch {}
    __net = null;

    players.forEach((p) => p?.sprite?.destroy?.());
    players.clear();

    if (__onResize) {
      window.removeEventListener("resize", __onResize);
      __onResize = null;
    }

    try { __game?.destroy(true); } catch {}
    __game = null;

    const logEl = document.getElementById("log");
    if (logEl) logEl.innerHTML = "";
    inputChat.value = "";

    document.body.classList.remove("in-game");
    document.getElementById("loginOverlay").style.display = "flex";
  };
}
