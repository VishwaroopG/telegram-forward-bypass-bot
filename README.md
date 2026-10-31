# Telegram bot on Cloudflare Workers

The Worker uses Telegram's HTTP Bot API and webhooks. It accepts public message
links and copies messages the bot can access. Source membership and Telegram's
content restrictions still apply; this deployment does not promise restricted
content extraction. Private `/c/` links are unsupported.

## Deploy

1. Install Node.js 22 or newer and run `npm install`.
2. Run `npx wrangler login` to authorize your Cloudflare account.
3. Keep `BOT_TOKEN` and optional comma-separated `ALLOWED_USERS` in `.env`.
   User IDs and usernames are accepted. An empty list allows everyone, matching
   the original bot's behavior.
4. Run `npm run deploy`.

The script validates the bot token, uploads secrets with the Worker, registers
the protected `/webhook` endpoint, and checks the public health endpoint.
The existing API_ID, API_HASH, and Pyrogram session are not needed by the Worker.
Secret files and session files are excluded from Git. Do not run the Python bot
at the same time as the Worker.

`GET /` checks Worker availability and configuration only. Send `/start` and an
accessible message link to verify Telegram delivery. Telegram can retry updates;
in rare ambiguous network failures a reply or copied message may be duplicated.

The old `bot.py` remains available for reference. Cloudflare uses
`src/worker.mjs` via `wrangler.jsonc`.

## Persistent Python deployment

`Dockerfile` packages the Pyrogram bot for a persistent container host using
Python 3.11. Only source and requirements enter the image; `.env` and session
files are excluded. Supply BOT_TOKEN, API_ID, API_HASH, and optional ALLOWED_USERS
through the host's secret settings. The bot uses an in-memory bot session and
authenticates again when restarted, so it needs no persistent session disk.

The health endpoint on port 8080 reports Telegram connection status. Keep one
instance running; multiple replicas may produce duplicate responses. Test the
Python service before retiring the Worker. When cutting over, remove Telegram's
HTTP webhook without dropping pending updates, then stop the old Worker from
handling bot updates. Never run both implementations as active responders.

Reading a protected post with Pyrogram does not prove all media can be copied.
Verify an actual reply after deployment. Container build and runtime have not
yet been validated locally because Docker is not installed here.
