# 🎣 Open Fishing Game

An open-source, real-time multiplayer fishing/exploration game that runs **directly in the browser** — no app store, no install. Share a link, open it on iPhone or Android, and play instantly.

Inspired by the general concept of mobile fishing-adventure games, built from scratch with an open web stack.

## Tech stack

- **Client**: [Phaser 3](https://phaser.io/) (2D game engine) + [Vite](https://vitejs.dev/), all graphics drawn procedurally so there are zero external art dependencies to start
- **Server**: Node.js + [Socket.IO](https://socket.io/) for real-time multiplayer sync (authoritative server decides catch results)
- **Hosting**: client → GitHub Pages (free, static), server → Render or Fly.io (free tier, needs to run continuously for websockets)

## Project structure

```
open-fishing-game/
├── client/     # Phaser game — deployed to GitHub Pages
├── server/     # Socket.IO game server — deployed to Render/Fly.io
└── .github/workflows/deploy.yml   # auto-deploys client on push
```

## Run locally

**Server:**
```bash
cd server
npm install
npm start
# -> listening on :3001
```

**Client (separate terminal):**
```bash
cd client
npm install
npm run dev
# -> open the printed http://localhost:5173 URL, works in your phone browser too
#    if your phone is on the same wifi, use http://<your-computer-ip>:5173
```

## Deploy so it's shareable via a link

### 1. Deploy the server (do this first)
1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo.
3. Set **Root Directory** to `server`, build command `npm install`, start command `npm start`.
4. Deploy. Copy the public URL Render gives you (e.g. `https://your-app.onrender.com`).

*(Fly.io works the same way if you prefer it — see their Node.js quickstart.)*

### 2. Point the client at your server
Edit `client/src/config.js`:
```js
export const SERVER_URL = "https://your-app.onrender.com";
```
Commit and push this change.

### 3. Deploy the client to GitHub Pages
1. In your repo: **Settings → Pages → Source: GitHub Actions**.
2. Push to `main` — the included workflow (`.github/workflows/deploy.yml`) builds and deploys `client/` automatically.
3. Your game is now live at `https://<your-username>.github.io/<repo-name>/`.

Share that link — anyone opening it on iPhone Safari or Android Chrome plays immediately, and can "Add to Home Screen" for an app-like icon (it's a PWA).

## How it works

- Movement: tap/drag anywhere in the water to move your boat toward that point (touch and mouse both work).
- Fishing: tap "Cast Line", then tap again when the marker sweeps into the green zone — accuracy determines catch size/rarity.
- The server is authoritative: it decides what fish you actually get based on the timing accuracy you report, so it can't be cheated by editing client code.
- All other connected players are visible moving around in real time, with a shared chat/event log.

## Extending it

Natural next steps if you want to build this out further (all straightforward additions to the existing architecture):
- More fish species / rarity tiers in `server/index.js` (`FISH_SPECIES`)
- Persistent accounts (swap the in-memory `players` Map for a database)
- Multiple fishing zones/maps
- Clans, tournaments, daily quests — all just additional Socket.IO events + server-side state
- Real sprite art instead of procedural shapes (drop images into `client/public/` and load in `preload()`)

## License

MIT — see [LICENSE](./LICENSE). Contributions welcome.
