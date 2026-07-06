# Focuss Tweaks License Bot

A Discord bot + HTTPS validation API that acts as the license key system for
the Focuss Tweaks desktop app.

- **Bot**: discord.js v14, slash commands, long-lived gateway connection.
- **API**: Express, running in the same Node process on its own port.
- **Database**: Supabase (Postgres), accessed only with the service-role key,
  only from this bot's process.

## Commands

| Command | Who | Description |
|---|---|---|
| `/genkey duration amount note` | Admin role | Generate 1–50 keys |
| `/redeem key` | Anyone | Redeem a key, get the Premium role |
| `/revokekey key` | Admin role | Revoke a key immediately |
| `/banuser user reason` | Admin role | Ban a user, revoke their keys |
| `/lookup key` | Admin role | Inspect a key's full status |
| `/mykeys` | Anyone | See your own redeemed keys |

A background job runs every 15 minutes to expire keys whose `expires_at`
has passed and strip the Premium role from their holders.

## 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Add Bot**. Copy the token → this is `DISCORD_TOKEN`.
3. Under **Privileged Gateway Intents**, enable **Server Members Intent**
   (required to fetch members for role add/remove).
4. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Roles`, `Send Messages`, `View Channels`,
     `Read Message History` (add more if your server needs them)
5. Open the generated URL, invite the bot to your server.
6. Grab your **Application (Client) ID** → `DISCORD_CLIENT_ID`.
7. Grab your **Server ID** (right-click server icon, Copy Server ID, dev
   mode must be on) → `GUILD_ID`.
8. Make sure the bot's role in Server Settings → Roles sits **above** the
   Premium role it needs to assign/remove.

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → paste and run `supabase-schema.sql`.
3. Project Settings → API → copy:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (never share
     this key or ship it in the Electron app)

## 3. Configure environment

```bash
cp .env.example .env
```

Fill in every value. `VALIDATION_API_KEY` can be any long random string,
e.g. generated with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The Electron app should call `POST http://<host>:<PORT>/api/validate`
with header `x-api-key: <VALIDATION_API_KEY>` and body
`{ "key": "FOCUSS-XXXX-XXXX-XXXX", "hwid": "optional-hardware-id" }`.
It should never hold or use the Supabase service-role key.

## 4. Run locally

```bash
npm install
npm run deploy-commands   # registers slash commands to your GUILD_ID
npm start
```

You should see `✅ Logged in as ...` and `✅ Validation API listening on port ...`.

## 5. Deploy for 24/7 uptime

Gateway bots hold an open websocket connection to Discord. **Serverless
platforms that sleep after inactivity (most free tiers of Vercel, Netlify
Functions, etc.) will not work** — the process needs to stay running
continuously, not spin up per-request.

### Option A: Oracle Cloud Always Free (ARM VM)

1. Create an **Always Free** Ampere A1 (ARM) VM instance (Ubuntu 22.04+).
2. SSH in, install Node.js 18+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Copy the project to the VM (git clone or `scp`), then:
   ```bash
   cd focuss-tweaks-bot
   npm install
   cp .env.example .env   # fill in real values
   npm run deploy-commands
   ```
4. Keep it running with `pm2` (survives SSH disconnect and reboots):
   ```bash
   sudo npm install -g pm2
   pm2 start src/index.js --name focuss-license-bot
   pm2 save
   pm2 startup   # follow the printed command to enable on boot
   ```
5. Open the port you set in `PORT` in the VM's security list / firewall
   (Oracle Cloud → VCN → Security Lists, plus `ufw allow <PORT>` on the
   VM itself) if the Electron app needs to reach the API from outside.
   Put it behind Nginx + TLS (e.g. via Let's Encrypt/Certbot) rather than
   exposing raw HTTP if the app connects over the public internet.

### Option B: Railway (simpler fallback)

1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub repo.
3. Add all `.env` variables under the project's **Variables** tab.
4. Set the start command to `npm start` (Railway detects `package.json`
   automatically). Railway's standard service plans run persistent
   processes, not sleep-after-inactivity functions, so the gateway
   connection stays alive.
5. Railway assigns a public domain/port automatically for the `/api/validate`
   endpoint — use that as the base URL in the Electron app.

## Security notes

- The Supabase service-role key lives only in this bot's `.env`. RLS is
  enabled on both tables with zero policies, so nothing can read/write
  them without that key.
- The Electron app only ever calls this bot's `/api/validate` endpoint
  with the shared `VALIDATION_API_KEY` header — it never touches Supabase.
- Consider putting the API behind HTTPS (Nginx/Caddy reverse proxy with
  Let's Encrypt) if it's reachable from the public internet, since the
  API key is sent as a plain header.
