import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { nanoid } from "nanoid";

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.get("/", (_req, res) => res.send("Open Fishing Game server is running."));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// ---- Game data ----------------------------------------------------------

const FISH_SPECIES = [
  { id: "sardine", name: "Sardine", rarity: "common", minSize: 10, maxSize: 20, weight: 60 },
  { id: "bass", name: "Sea Bass", rarity: "common", minSize: 20, maxSize: 45, weight: 45 },
  { id: "tuna", name: "Bluefin Tuna", rarity: "uncommon", minSize: 60, maxSize: 150, weight: 20 },
  { id: "swordfish", name: "Swordfish", rarity: "rare", minSize: 100, maxSize: 250, weight: 8 },
  { id: "kraken_spawn", name: "Kraken Spawn", rarity: "legendary", minSize: 30, maxSize: 60, weight: 1 },
];

function pickSpecies() {
  const totalWeight = FISH_SPECIES.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * totalWeight;
  for (const f of FISH_SPECIES) {
    if (r < f.weight) return f;
    r -= f.weight;
  }
  return FISH_SPECIES[0];
}

const WORLD_SIZE = 1000;
const MAX_HP = 100;
const SHOT_RANGE = 260;
const SHOT_ARC_DEGREES = 22; // half-angle tolerance for a "hit"
const SHOT_DAMAGE = 20;
const SHOT_COOLDOWN_MS = 500;
const RESPAWN_MS = 3000;
const MAX_COINS = 25;
const COIN_VALUE = 5;
const COIN_PICKUP_RADIUS = 28;

/** players: id -> { id, name, x, y, color, isFishing, catches, hp, coins, alive, lastShotAt } */
const players = new Map();

/** coins: id -> { id, x, y } */
const coins = new Map();

function randPos() {
  return { x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE };
}

function spawnCoin() {
  const id = nanoid(8);
  const pos = randPos();
  coins.set(id, { id, x: pos.x, y: pos.y });
  return coins.get(id);
}

function ensureCoinSupply() {
  while (coins.size < MAX_COINS) spawnCoin();
}

function publicPlayer(p) {
  const { id, name, x, y, color, isFishing, hp, coins: coinCount, alive } = p;
  return { id, name, x, y, color, isFishing, hp, coins: coinCount, alive };
}

function broadcastPlayerList() {
  io.emit("players:update", Array.from(players.values()).map(publicPlayer));
}

const COLORS = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#1a936f", "#f4a259", "#a06cd5", "#5390d9"];

io.on("connection", (socket) => {
  socket.on("player:join", (name) => {
    const safeName = (name || "Angler").toString().slice(0, 16);
    const spawn = randPos();
    const player = {
      id: socket.id,
      name: safeName,
      x: spawn.x,
      y: spawn.y,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      isFishing: false,
      catches: [],
      hp: MAX_HP,
      coins: 0,
      alive: true,
      lastShotAt: 0,
    };
    players.set(socket.id, player);
    ensureCoinSupply();

    socket.emit("world:init", {
      selfId: socket.id,
      worldSize: WORLD_SIZE,
      maxHp: MAX_HP,
      players: Array.from(players.values()).map(publicPlayer),
      coins: Array.from(coins.values()),
      leaderboard: getLeaderboard(),
    });

    broadcastPlayerList();
    io.emit("chat:system", `${safeName} joined the waters.`);
  });

  socket.on("player:move", (pos) => {
    const p = players.get(socket.id);
    if (!p || !p.alive) return;
    if (typeof pos?.x !== "number" || typeof pos?.y !== "number") return;
    p.x = Math.max(0, Math.min(WORLD_SIZE, pos.x));
    p.y = Math.max(0, Math.min(WORLD_SIZE, pos.y));
    socket.broadcast.emit("player:moved", { id: socket.id, x: p.x, y: p.y });

    // Coin pickup check (server-authoritative)
    for (const coin of coins.values()) {
      const dx = coin.x - p.x;
      const dy = coin.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < COIN_PICKUP_RADIUS) {
        coins.delete(coin.id);
        p.coins += COIN_VALUE;
        io.emit("coin:collected", { coinId: coin.id, by: p.id, coins: p.coins });
        const fresh = spawnCoin();
        io.emit("coin:spawned", fresh);
      }
    }
  });

  socket.on("fish:cast", () => {
    const p = players.get(socket.id);
    if (!p || !p.alive) return;
    p.isFishing = true;
    io.emit("fish:casting", { id: socket.id });
  });

  socket.on("fish:reel", (accuracy) => {
    const p = players.get(socket.id);
    if (!p) return;
    p.isFishing = false;

    const clamped = Math.max(0, Math.min(1, Number(accuracy) || 0));
    const success = clamped > 0.35;

    if (!success) {
      socket.emit("fish:result", { success: false });
      io.emit("fish:done", { id: socket.id });
      return;
    }

    const species = pickSpecies();
    const size = Math.round(
      species.minSize + (species.maxSize - species.minSize) * clamped
    );
    const catchRecord = { speciesId: species.id, name: species.name, rarity: species.rarity, size, ts: Date.now() };
    p.catches.push(catchRecord);

    socket.emit("fish:result", { success: true, catch: catchRecord });
    io.emit("chat:system", `${p.name} caught a ${size}cm ${species.name}!`);
    io.emit("fish:done", { id: socket.id });
    io.emit("leaderboard:update", getLeaderboard());
  });

  // angle in radians, measured from shooter's position
  socket.on("player:shoot", (angle) => {
    const shooter = players.get(socket.id);
    if (!shooter || !shooter.alive) return;
    if (typeof angle !== "number" || Number.isNaN(angle)) return;

    const now = Date.now();
    if (now - shooter.lastShotAt < SHOT_COOLDOWN_MS) return;
    shooter.lastShotAt = now;

    io.emit("player:shotFired", { id: shooter.id, angle });

    // Find nearest alive target within range and within the firing arc
    let hitTarget = null;
    let hitDist = Infinity;
    for (const target of players.values()) {
      if (target.id === shooter.id || !target.alive) continue;
      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SHOT_RANGE) continue;

      const targetAngle = Math.atan2(dy, dx);
      let diff = Math.abs(targetAngle - angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > (SHOT_ARC_DEGREES * Math.PI) / 180) continue;

      if (dist < hitDist) {
        hitDist = dist;
        hitTarget = target;
      }
    }

    if (!hitTarget) return;

    hitTarget.hp = Math.max(0, hitTarget.hp - SHOT_DAMAGE);
    io.emit("player:hit", { id: hitTarget.id, hp: hitTarget.hp, by: shooter.id });

    if (hitTarget.hp <= 0 && hitTarget.alive) {
      hitTarget.alive = false;
      io.emit("player:eliminated", { id: hitTarget.id, by: shooter.id, name: hitTarget.name });
      io.emit("chat:system", `${hitTarget.name} was sunk by ${shooter.name}!`);

      setTimeout(() => {
        const stillHere = players.get(hitTarget.id);
        if (!stillHere) return;
        const spawn = randPos();
        stillHere.x = spawn.x;
        stillHere.y = spawn.y;
        stillHere.hp = MAX_HP;
        stillHere.alive = true;
        io.emit("player:respawned", publicPlayer(stillHere));
      }, RESPAWN_MS);
    }
  });

  socket.on("chat:message", (text) => {
    const p = players.get(socket.id);
    if (!p || !text) return;
    io.emit("chat:message", { name: p.name, text: text.toString().slice(0, 200) });
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    players.delete(socket.id);
    if (p) {
      io.emit("chat:system", `${p.name} left the waters.`);
      io.emit("player:left", { id: socket.id });
      broadcastPlayerList();
    }
  });
});

function getLeaderboard() {
  return Array.from(players.values())
    .map((p) => ({
      name: p.name,
      totalCatches: p.catches.length,
      biggest: p.catches.reduce((max, c) => Math.max(max, c.size), 0),
      coins: p.coins,
    }))
    .sort((a, b) => b.biggest - a.biggest)
    .slice(0, 10);
}

server.listen(PORT, () => {
  console.log(`Open Fishing Game server listening on :${PORT}`);
});
