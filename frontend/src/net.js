// frontend/src/net.js
export function createNet({
  backendUrl,
  onServerInfo,
  onSnapshot,
  onPlayerJoined,
  onPlayerLeft,
  onPlayerMoved,
  onChat
}) {
  const socket = io(backendUrl, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2500,
    timeout: 8000
  });

  function sysLog(msg) {
    onChat?.({ name: "⚡ Sistema", msg });
  }

  socket.on("connect", () => {
    console.log("✅ connected", socket.id);
    sysLog("Conectado.");
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ disconnected:", reason);
    sysLog("Conexão perdida... tentando reconectar.");
  });

  socket.on("connect_error", (err) => {
    console.warn("❌ connect_error:", err?.message || err);
    sysLog("Erro ao conectar no servidor.");
  });

  socket.io.on("reconnect", () => sysLog("Reconectado!"));

  socket.on("server_info", (d) => onServerInfo?.(d));
  socket.on("room_snapshot", (d) => onSnapshot?.(d));
  socket.on("player_joined", (d) => onPlayerJoined?.(d));
  socket.on("player_left", (d) => onPlayerLeft?.(d));
  socket.on("player_moved", (d) => onPlayerMoved?.(d));
  socket.on("chat_msg", (d) => onChat?.(d));

  return {
    socket,

    join(name, monster) {
      if (!socket.connected) {
        sysLog("Sem conexão, aguardando reconectar...");
        socket.once("connect", () => socket.emit("join_room", { name, monster }));
        return;
      }
      socket.emit("join_room", { name, monster });
    },

    moveTo(x, y) {
      if (!socket.connected) return;
      socket.emit("move_to", { x, y });
    },

    chat(msg) {
      if (!socket.connected) {
        sysLog("Você está offline no momento.");
        return;
      }
      socket.emit("chat", { msg });
    }
  };
}
