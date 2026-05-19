# Ship War Multiplayer: Implementation Guide

This document explains how to set up, run, and deploy the **Ship War Multiplayer** app in various environments.

## 🚢 Overview

- **Frontend**: React (Vite) + Tailwind CSS + Framer Motion
- **Backend**: Node.js + Express.js
- **Real-time**: Socket.IO
- **Database**: Local JSON storage (`db.json`)

---

## 💻 Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file in the root:
   ```env
   GEMINI_API_KEY="your_api_key"
   NODE_ENV="development"
   ```

3. **Run the App**:
   ```bash
   npm run dev
   ```
   *Acccess the app at `http://localhost:3000`.*

---

## 🏢 VPS / Linux Server (Production)

If you are deploying to a VPS (Ubuntu, etc.):

1. **Build the Project**:
   ```bash
   npm run build
   ```
   This generates a `dist/` folder and a bundled `server.cjs` file.

2. **Setup Process Manager (PM2)**:
   It is recommended to use PM2 to keep the app running.
   ```bash
   npm install -g pm2
   pm2 start dist/server.cjs --name "ship-war"
   ```

3. **Nginx Reverse Proxy**:
   Point Nginx to port 3000:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
       }
   }
   ```

---

## ☁️ Cloud Run / Docker

1. **Build Docker Image**:
   Use the following multi-stage build:
   ```dockerfile
   FROM node:20-slim as builder
   WORKDIR /app
   COPY . .
   RUN npm install && npm run build

   FROM node:20-slim
   WORKDIR /app
   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/package.json ./package.json
   RUN npm install --production
   CMD ["npm", "start"]
   ```

2. **Deploy**:
   ```bash
   gcloud run deploy ship-war --source . --port 3000 --allow-unauthenticated
   ```

---

---

## 🎮 How to Play

1. **Create a Game**: Choose a name and create a room. You will receive a 6-character room code.
2. **Join a Game**: Share the code with a friend. They can enter the code to join your session.
3. **Placing Ships**: Both players must place 5 ships of varying lengths on their grid.
   - Use the **Rotate** button to switch between horizontal and vertical placement.
   - Highlighting will show green for valid spots and red for invalid/occupied ones.
   - Individual ship health bars are visible on your defense grid.
4. **Battle**: Once both are ready, the game begins.
   - Click cells on the **Target View** (opponent's board) to fire.
   - Red cells are hits, Grey cells are misses.
   - The game ends when one player's fleet (17 total segments) is destroyed.

## 🛠 Troubleshooting

- **Socket Connection Fails**: Ensure port 3000 is open and not blocked by a firewall.
- **HMR Issues**: If you see HMR errors in dev, note that this app uses a custom Express server. Ensure the proxy correctly handles WebSocket upgrades.
- **State Persistence**: The current implementation uses an in-memory `rooms` object. For persistent long-term storage, you can expand the `db.json` logic or migrate to a cloud database like Firestore.
