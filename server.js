// server.js

import WebSocket, { WebSocketServer } from "ws";

const PORT = 8005;
const wss = new WebSocketServer({ port: PORT });

console.log("✔ Multiplayer server running on ws://localhost:" + PORT);

let rooms = {}; 
// rooms = {
//   ROOM123: { host: "socketId", players: { "P1": ws, "P2": ws }, started: false }
// }

function createRoom() {
  return "ROOM-" + Math.floor(1000 + Math.random() * 9000);
}

wss.on("connection", (ws) => {
  ws.id = "S" + Math.floor(Math.random() * 999999);

  ws.on("message", (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    // ------------------- CREATE GAME --------------------
if (data.type === "create_game") {
  const roomId = createRoom();
  ws.roomId = roomId;
  ws.slot = "P1";

  rooms[roomId] = {
    host: ws.id,
    players: { P1: ws },
    started: false,
  };

  ws.send(JSON.stringify({
    type: "room_created",
    roomId,
    slot: "P1",
    players: 1
  }));

  return;
}


    // ------------------- JOIN GAME --------------------
if (data.type === "join_game") {
  const roomId = data.roomId;

  if (!rooms[roomId]) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
    return;
  }

  const room = rooms[roomId];

  if (Object.keys(room.players).length >= 20) {
    ws.send(JSON.stringify({ type: "error", message: "Room full" }));
    return;
  }

  const slot = room.players.P1 ? "P2" : "P1";
  room.players[slot] = ws;
  ws.roomId = roomId;
  ws.slot = slot;

  ws.send(JSON.stringify({
    type: "joined_room",
    roomId,
    slot,
    players: Object.keys(room.players).length
  }));

  Object.values(room.players).forEach((client) => {
    if (client !== ws) {
      client.send(JSON.stringify({
        type: "player_joined",
        players: Object.keys(room.players).length
      }));
    }
  });

  return;
}


    // ------------------- HOST STARTS MATCH --------------------
    if (data.type === "start_match") {
      const room = rooms[ws.roomId];
      if (!room) return;

      if (ws.id !== room.host) return; // only host can start

      if (Object.keys(room.players).length < 2) {
        ws.send(JSON.stringify({ type: "error", message: "Need 2 players" }));
        return;
      }

      room.started = true;

      // Send start to all players
      Object.values(room.players).forEach((client) => {
        client.send(JSON.stringify({
          type: "match_started"
        }));
      });
      return;
    }

// ------------------- POSITION SYNC --------------------
if (data.type === "state") {
  const roomId = ws.roomId;
  if (!roomId || !rooms[roomId]) return;

  const room = rooms[roomId];

  // broadcast to other players in the room (send slot so clients can map P1/P2)
  Object.values(room.players).forEach((clientSocket) => {
    if (clientSocket === ws) return;
    if (clientSocket.readyState !== WebSocket.OPEN) return;

    clientSocket.send(JSON.stringify({
      type: "state",
      id: ws.slot || null, // P1 or P2 (fall back to null if not set)
      x: data.x,
      y: data.y,
      z: data.z,
      rot: data.rot
    }));
  });
}



  });

  // ------------------- HANDLE PLAYER DISCONNECT --------------------
  ws.on("close", () => {
    const roomId = ws.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];

    // Remove leaving player
    Object.entries(room.players).forEach(([slot, socket]) => {
      if (socket === ws) delete room.players[slot];
    });

    // Notify remaining player
    Object.values(room.players).forEach((client) => {
      client.send(JSON.stringify({ type: "opponent_left" }));
    });

    // Remove room if empty
    if (Object.keys(room.players).length === 0) {
      delete rooms[roomId];
    }
  });
});
