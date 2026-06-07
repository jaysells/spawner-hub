# 🦴 Spawner Hub Bot — Setup Guide

## What this bot does
- `/stock` — Members view spawner stock + buy/sell prices (ephemeral, no chat clutter)
- `/updatestock` — Owners update stock count, sell price, buy price, and buy cap per spawner
- `/ticket` — Posts a ticket panel with 4 ticket types (Trade, Giveaway Claim, Digging, Support)
- `/giveaway` — Owners start a giveaway; members react 🎉 to enter; auto-picks winner
- `/reroll` — Owners pick a past giveaway and reroll a new winner

---

## Step 1 — Create your Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it (e.g. "Spawner Hub")
3. Go to **Bot** tab → click **Add Bot**
4. Under **Token** click **Reset Token** → copy it (this is your `DISCORD_TOKEN`)
5. Scroll down, enable:
   - **Message Content Intent**
   - **Server Members Intent**
   - **Presence Intent**
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Channels`, `Send Messages`, `Read Message History`, `Add Reactions`, `Manage Messages`, `View Channels`
7. Copy the URL and invite the bot to your server

---

## Step 2 — Get your IDs

In Discord, go to **Settings → Advanced → Enable Developer Mode**.

Then right-click:
- Your **server** → Copy Server ID → this is `GUILD_ID`
- Your **application** on https://discord.com/developers → Copy Application ID → this is `CLIENT_ID`
- The **category** where tickets should open → Copy ID → this is `TICKET_CATEGORY_ID`

Your owner role ID is already set: `1513271743513628763`

---

## Step 3 — Set up Upstash Redis

1. Go to https://console.upstash.com → sign up free
2. Create a new Redis database (any region, free tier is fine)
3. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN** from the dashboard

---

## Step 4 — Configure the bot

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
2. Fill in all values in `.env`:
   ```
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_id
   GUILD_ID=your_server_id
   TICKET_CATEGORY_ID=your_ticket_category_id
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

---

## Step 5 — Add custom emojis (optional but recommended)

In `utils/constants.js`, the `SPAWNERS` array has emoji for each spawner type.
To use your server's custom emojis:

1. Upload the emojis to your server (Server Settings → Emoji)
2. In any Discord chat, type `\:youremojiname:` and send — it shows the full ID like `<:skeleton:123456789>`
3. Replace the emoji field in `constants.js`:
   ```js
   { id: 'skeleton', label: 'Skeleton Spawner', emoji: '<:skeleton:123456789>' },
   ```

---

## Step 6 — Install and run

```bash
npm install
node deploy-commands.js   # deploys slash commands (run once)
node index.js             # starts the bot
```

---

## How to use

### Post the ticket panel
Run `/ticket` in the channel where you want the panel to appear.

### Update stock
Run `/updatestock` → choose spawner → fill in the modal with count, prices, and buy cap.

### Start a giveaway
Run `/giveaway prize:Skeleton Spawner x10 minutes:60`
Members react 🎉 to enter. Winner is announced automatically when time runs out.

### Reroll a giveaway
Run `/reroll` → pick the giveaway → new winner is announced.

---

## Adding more spawner types

In `utils/constants.js`, add to the `SPAWNERS` array:
```js
{ id: 'wither_skeleton', label: 'Wither Skeleton Spawner', emoji: '💀' },
```
That's it — it automatically appears in `/stock`, `/updatestock`, and trade tickets.

---

## Hosting (keep it online 24/7)

**Free options:**
- **Railway** (https://railway.app) — easiest, free tier available
- **Render** (https://render.com) — free tier, may sleep
- **Oracle Cloud Free Tier** — always-on VM

**Paid/reliable:**
- **DigitalOcean** $4/mo droplet
- **Hetzner** cheapest EU VPS

On any of these, just upload the folder, set the env variables in their dashboard, and run `node index.js`.
