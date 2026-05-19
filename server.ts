import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";
import { nanoid } from "nanoid";
import fs from "node:fs";

const PORT = 3000;
const DB_FILE = "db.json";

// Shared Types (would be better in a separate file but for simplicity in server.ts for now)
interface GameState {
  players: { [id: string]: { name: string; ready: boolean; isAi?: boolean; ships: any[]; shots: any[] } };
  spectators: { [id: string]: { name: string } };
  turn: string | null;
  turnStartedAt: number | null;
  winner: string | null;
  status: 'lobby' | 'placing' | 'playing' | 'finished';
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  settings: {
    gridSize: number;
    turnTimeLimit: number;
    showShipHealth: boolean;
    combatIntensity: string;
    gameMode: string;
    maxPlayers: number;
    salvoMode: boolean;
    soundEnabled: boolean;
    powerUpsEnabled: boolean;
    theme: string;
    aiDifficulty: 'easy' | 'medium' | 'hard';
  };
  state: GameState;
}

const rooms: { [id: string]: Room } = {};

function handlePlayerExit(io: Server, socketId: string) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.state.players[socketId] || room.state.spectators[socketId]) {
      if (room.state.players[socketId]) {
        delete room.state.players[socketId];
        // If players empty, room dead
        if (Object.keys(room.state.players).length === 0) {
          delete rooms[roomId];
          continue;
        }
        // If host leaves
        if (room.hostId === socketId) {
          room.hostId = Object.keys(room.state.players)[0];
        }
        room.state.status = 'lobby';
        room.state.winner = null;
      } else {
        delete room.state.spectators[socketId];
      }
      io.to(roomId).emit("room-updated", room);
    }
  }
}

function checkGameFinish(room: Room): string | null {
  const playerIds = Object.keys(room.state.players);
  const playersWithShipsLeft = playerIds.filter(pid => {
    const p = room.state.players[pid];
    const totalHitsOnMe = playerIds.reduce((sum, otherPid) => {
      return sum + room.state.players[otherPid].shots.filter((s: any) => s.hit && s.targetId === pid).length;
    }, 0);
    const totalShipCells = p.ships.flatMap(s => s.positions).length;
    return totalShipCells > 0 && totalHitsOnMe < totalShipCells;
  });

  if (playersWithShipsLeft.length === 1 && room.state.status === 'playing') {
    return playersWithShipsLeft[0];
  }
  return null;
}

function switchTurn(room: Room, currentId: string, hit: boolean) {
  const playerIds = Object.keys(room.state.players);
  const playersWithShipsLeft = playerIds.filter(pid => {
    const p = room.state.players[pid];
    const totalHitsOnMe = playerIds.reduce((sum, otherPid) => {
      return sum + room.state.players[otherPid].shots.filter((s: any) => s.hit && s.targetId === pid).length;
    }, 0);
    const totalShipCells = p.ships.flatMap(s => s.positions).length;
    return totalShipCells > 0 && totalHitsOnMe < totalShipCells;
  });

  if (hit && room.settings.gameMode === 'rapid') {
    room.state.turnStartedAt = Date.now();
  } else {
    let nextIndex = (playerIds.indexOf(currentId) + 1) % playerIds.length;
    let attempts = 0;
    while (!playersWithShipsLeft.includes(playerIds[nextIndex]) && attempts < playerIds.length) {
      nextIndex = (nextIndex + 1) % playerIds.length;
      attempts++;
    }
    room.state.turn = playerIds[nextIndex];
    room.state.turnStartedAt = Date.now();
  }
}

function promoteSpectators(room: Room) {
  if (room.state.status !== 'lobby') return;
  const spectatorIds = Object.keys(room.state.spectators);
  while (Object.keys(room.state.players).length < room.settings.maxPlayers && spectatorIds.length > 0) {
    const nextId = spectatorIds.shift()!;
    const spec = room.state.spectators[nextId];
    room.state.players[nextId] = { name: spec.name, ready: false, isAi: false, ships: [], shots: [] };
    delete room.state.spectators[nextId];
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("create-room", ({ roomName, playerName }) => {
      const roomId = nanoid(6).toUpperCase();
      rooms[roomId] = {
        id: roomId,
        name: roomName,
        hostId: socket.id,
        settings: {
          gridSize: 10,
          turnTimeLimit: 30,
          showShipHealth: true,
          combatIntensity: 'low',
          gameMode: 'standard',
          maxPlayers: 2,
          salvoMode: false,
          soundEnabled: true,
          powerUpsEnabled: false,
          theme: 'deep-sea',
          aiDifficulty: 'medium'
        },
        state: {
          players: {
            [socket.id]: { name: playerName, ready: false, ships: [], shots: [] }
          },
          spectators: {},
          turn: null,
          turnStartedAt: null,
          winner: null,
          status: 'lobby'
        }
      };
      socket.join(roomId);
      socket.emit("room-created", { roomId, roomName });
      io.to(roomId).emit("room-updated", rooms[roomId]);
      console.log(`Room created: ${roomId} by ${playerName}`);
    });

    socket.on("join-room", ({ roomId, playerName }) => {
      const room = rooms[roomId];
      if (room) {
        if (room.state.players[socket.id]) {
           // Already in
        } else if (Object.keys(room.state.players).length < room.settings.maxPlayers && room.state.status === 'lobby') {
          room.state.players[socket.id] = { name: playerName, ready: false, isAi: false, ships: [], shots: [] };
          console.log(`${playerName} joined as player in room: ${roomId}`);
        } else {
          room.state.spectators[socket.id] = { name: playerName };
          console.log(`${playerName} joined as spectator in room: ${roomId}`);
        }
        socket.join(roomId);
        io.to(roomId).emit("room-updated", room);
      } else {
        socket.emit("error-msg", "Room not found");
      }
    });

    socket.on("add-ai", ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.hostId === socket.id && Object.keys(room.state.players).length < room.settings.maxPlayers) {
        const aiId = `ai-${nanoid(4)}`;
        const aiNum = Object.values(room.state.players).filter(p => p.isAi).length + 1;
        room.state.players[aiId] = { name: `AI Admiral ${aiNum}`, ready: false, isAi: true, ships: [], shots: [] };
        io.to(roomId).emit("room-updated", room);
      }
    });

    socket.on("place-ships", ({ roomId, ships }) => {
      const room = rooms[roomId];
      if (room && room.state.players[socket.id]) {
        room.state.players[socket.id].ships = ships;
        room.state.players[socket.id].ready = true;

        const players = Object.values(room.state.players);
        const allReady = players.every(p => p.ready);
        if (allReady) {
          room.state.status = 'playing';
          room.state.turn = Object.keys(room.state.players)[0];
          room.state.turnStartedAt = Date.now();
        }
        
        io.to(roomId).emit("room-updated", room);
      }
    });

    socket.on("fire-shot", ({ roomId, x, y, targetId }) => {
      const room = rooms[roomId];
      if (room && room.state.status === 'playing' && room.state.turn === socket.id) {
        // In 2 player mode, targetId is the only other player
        // In 4 player mode, it's explicitly passed
        const playerIds = Object.keys(room.state.players);
        const opponentId = targetId || playerIds.find(id => id !== socket.id);
        if (!opponentId || !room.state.players[opponentId]) return;

        const opponent = room.state.players[opponentId];
        const player = room.state.players[socket.id];
        
        // In salvo mode, player can fire multiple shots?
        // Let's simplify: Turn switches after shot unless rapid mode
        
        // Check if already fired at THIS opponent at THESE coords
        if (player.shots.some(s => s.x === x && s.y === y && (room.settings.maxPlayers === 2 || s.targetId === opponentId))) return;

        let hit = false;
        opponent.ships.forEach(ship => {
          ship.positions.forEach((pos: any) => {
            if (pos.x === x && pos.y === y) hit = true;
          });
        });

        // track shot ...
        player.shots.push({ x, y, hit, targetId: opponentId } as any);

        const winner = checkGameFinish(room);
        if (winner) {
          room.state.status = 'finished';
          room.state.winner = winner;
          room.state.turnStartedAt = null;
        } else {
          switchTurn(room, socket.id, hit);
        }

        io.to(roomId).emit("room-updated", room);
      }
    });

    socket.on("leave-room", () => {
      handlePlayerExit(io, socket.id);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      handlePlayerExit(io, socket.id);
    });

    // Start placing ships
    socket.on("start-placing", ({ roomId }) => {
       const room = rooms[roomId];
       if (room && Object.keys(room.state.players).length >= 2) {
         if (room.hostId !== socket.id) {
           socket.emit("error-msg", "Only host can initiate battle");
           return;
         }
         room.state.status = 'placing';
         io.to(roomId).emit("room-updated", room);
       }
    });

    socket.on("update-settings", ({ roomId, settings }) => {
      const room = rooms[roomId];
      if (room && room.hostId === socket.id && room.state.status === 'lobby') {
        room.settings = settings;
        promoteSpectators(room);
        io.to(roomId).emit("room-updated", room);
      }
    });

    socket.on("play-again", ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.state.status === 'finished') {
        // Reset game state but keep players
        room.state.status = 'lobby';
        room.state.turn = null;
        room.state.turnStartedAt = null;
        room.state.winner = null;
        for (const pid in room.state.players) {
          room.state.players[pid].ready = false;
          room.state.players[pid].ships = [];
          room.state.players[pid].shots = [];
        }
        io.to(roomId).emit("room-updated", room);
      }
    });
  });

  // Room update loop for timers and AI logic
  setInterval(() => {
    const now = Date.now();
    for (const roomId in rooms) {
      const room = rooms[roomId];
      
      // AI Logic: Ship Placement
      if (room.state.status === 'placing') {
        for (const pid in room.state.players) {
          const p = room.state.players[pid];
          if (p.isAi && !p.ready) {
            // Randomly place ships for AI
            const SHIP_TYPES = [
              { name: 'Carrier', length: 5 },
              { name: 'Battleship', length: 4 },
              { name: 'Destroyer', length: 3 },
              { name: 'Submarine', length: 3 },
              { name: 'Patrol Boat', length: 2 },
            ];
            const ships: any[] = [];
            const occupied = new Set<string>();
            const GRID_SIZE = room.settings.gridSize || 10;

            SHIP_TYPES.forEach((type, idx) => {
              let placed = false;
              while (!placed) {
                const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
                const x = Math.floor(Math.random() * (orientation === 'horizontal' ? GRID_SIZE - type.length : GRID_SIZE));
                const y = Math.floor(Math.random() * (orientation === 'vertical' ? GRID_SIZE - type.length : GRID_SIZE));
                
                const positions: any[] = [];
                let collision = false;
                for (let i = 0; i < type.length; i++) {
                  const px = orientation === 'horizontal' ? x + i : x;
                  const py = orientation === 'vertical' ? y + i : y;
                  if (occupied.has(`${px},${py}`)) { collision = true; break; }
                  positions.push({ x: px, y: py });
                }

                if (!collision) {
                  positions.forEach(pos => occupied.add(`${pos.x},${pos.y}`));
                  ships.push({ id: `ai-ship-${idx}`, name: type.name, length: type.length, positions, placed: true, orientation });
                  placed = true;
                }
              }
            });
            p.ships = ships;
            p.ready = true;
            io.to(roomId).emit("room-updated", room);

            // Check if all players ready to start
            const players = Object.values(room.state.players);
            if (players.every(pl => pl.ready)) {
              room.state.status = 'playing';
              room.state.turn = Object.keys(room.state.players)[0];
              room.state.turnStartedAt = Date.now();
              io.to(roomId).emit("room-updated", room);
            }
          }
        }
      }

      // AI Logic: Firing Shots
      if (room.state.status === 'playing' && room.state.turn && room.state.players[room.state.turn]?.isAi) {
        const aiId = room.state.turn;
        const aiPlayer = room.state.players[aiId];
        const elapsedSinceTurn = (now - (room.state.turnStartedAt || now)) / 1000;
        
        // AI Wait a bit to simulate thinking
        if (elapsedSinceTurn > 1.5) {
          const playerIds = Object.keys(room.state.players);
          const aliveOpponents = playerIds.filter(pid => {
            if (pid === aiId) return false;
            const p = room.state.players[pid];
            const totalHitsOnOpp = playerIds.reduce((sum, otherPid) => {
              return sum + room.state.players[otherPid].shots.filter((s: any) => s.hit && s.targetId === pid).length;
            }, 0);
            return totalHitsOnOpp < p.ships.flatMap(s => s.positions).length;
          });

          if (aliveOpponents.length > 0) {
            const difficulty = room.settings.aiDifficulty || 'medium';
            const targetId = aliveOpponents[Math.floor(Math.random() * aliveOpponents.length)];
            const opponent = room.state.players[targetId];
            
            const GRID_SIZE = room.settings.gridSize || 10;
            let x: number = 0, y: number = 0;
            let alreadyShot = true;
            
            // AI Strategic logic
            const knownHits = aiPlayer.shots.filter((s: any) => s.hit && s.targetId === targetId);
            const sunkPositions = new Set<string>();
            
            opponent.ships.forEach((ship: any) => {
              const isSunk = ship.positions.every((pos: any) => 
                aiPlayer.shots.some((s: any) => s.x === pos.x && s.y === pos.y && s.targetId === targetId && s.hit)
              );
              if (isSunk) {
                ship.positions.forEach((pos: any) => sunkPositions.add(`${pos.x},${pos.y}`));
              }
            });

            const activeHits = knownHits.filter((s: any) => !sunkPositions.has(`${s.x},${s.y}`));

            if (difficulty !== 'easy' && activeHits.length > 0) {
              // Medium/Hard try to fire around active hits
              const randomHit = activeHits[Math.floor(Math.random() * activeHits.length)];
              const neighbors = [
                { x: randomHit.x + 1, y: randomHit.y },
                { x: randomHit.x - 1, y: randomHit.y },
                { x: randomHit.x, y: randomHit.y + 1 },
                { x: randomHit.x, y: randomHit.y - 1 },
              ].filter(n => n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE)
               .filter(n => !aiPlayer.shots.some((s: any) => s.x === n.x && s.y === n.y && s.targetId === targetId));

              if (neighbors.length > 0) {
                const targetPos = neighbors[Math.floor(Math.random() * neighbors.length)];
                x = targetPos.x;
                y = targetPos.y;
                alreadyShot = false;
              }
            }

            if (alreadyShot) {
              let attempts = 0;
              while (alreadyShot && attempts < 100) {
                x = Math.floor(Math.random() * GRID_SIZE);
                y = Math.floor(Math.random() * GRID_SIZE);
                alreadyShot = aiPlayer.shots.some(s => s.x === x && s.y === y && (room.settings.maxPlayers === 2 || s.targetId === targetId));
                attempts++;
              }
            }

            if (!alreadyShot) {
              // Same logic as fire-shot event
              let hit = false;
              opponent.ships.forEach(ship => {
                ship.positions.forEach((pos: any) => {
                  if (pos.x === x && pos.y === y) hit = true;
                });
              });

              aiPlayer.shots.push({ x, y, hit, targetId } as any);

              const winner = checkGameFinish(room);
              if (winner) {
                room.state.status = 'finished';
                room.state.winner = winner;
                room.state.turnStartedAt = null;
              } else {
                switchTurn(room, aiId, hit);
              }
              io.to(roomId).emit("room-updated", room);
            }
          }
        }
      }

      if (room.state.status === 'playing' && room.state.turn && room.state.turnStartedAt && room.settings.turnTimeLimit > 0) {
        const elapsed = (now - room.state.turnStartedAt) / 1000;
        if (elapsed >= room.settings.turnTimeLimit) {
          switchTurn(room, room.state.turn, false);
          io.to(roomId).emit("room-updated", room);
        }
      }
    }
  }, 1000);

  // API Route for health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
