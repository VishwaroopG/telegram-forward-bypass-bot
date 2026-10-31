import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { telegram } from '../src/worker.mjs';

// Load only the bot settings from the existing Python environment file.
const values = {};
for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (!match) continue;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  values[match[1]] = value;
}
const secrets = {
  BOT_TOKEN: process.env.BOT_TOKEN || values.BOT_TOKEN,
  ALLOWED_USERS: process.env.ALLOWED_USERS ?? values.ALLOWED_USERS ?? '',
  WEBHOOK_SECRET: randomBytes(32).toString('hex')
};
if (!secrets.BOT_TOKEN) throw new Error('BOT_TOKEN is missing from .env');
// Validate the token before changing the deployment. Never print it.
try { await telegram(secrets, 'getMe', {}); }
catch { throw new Error('Unable to validate the Telegram bot token. Check the token and network connection.'); }
const filename = '.deploy-secrets.json';
let output;
try {
  await writeFile(filename, JSON.stringify(secrets), { mode: 0o600 });
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--secrets-file', filename], {
    encoding: 'utf8', env: process.env, maxBuffer: 4 * 1024 * 1024
  });
  output = `${result.stdout || ''}\n${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.status !== 0) throw new Error('Cloudflare deployment failed. Run npx wrangler login if authentication is required.');
} finally {
  await unlink(filename).catch(() => {});
}
const url = output.match(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev\b/)?.[0];
if (!url) throw new Error('Worker deployed but its URL was not found. Webhook was not changed.');
try {
  await telegram(secrets, 'setWebhook', { url: `${url}/webhook`, secret_token: secrets.WEBHOOK_SECRET, allowed_updates: ['message'] });
  const info = await telegram(secrets, 'getWebhookInfo', {});
  if (info.url !== `${url}/webhook`) throw new Error('Webhook URL mismatch');
  const health = await fetch(url);
  if (!health.ok) throw new Error('Health check failed');
  console.log(`Deployment verified: ${url}\nTelegram webhook registered. Send /start to your bot to test a real message.`);
} catch {
  throw new Error('Worker deployed, but webhook setup or verification failed. Run npm run deploy again to retry.');
}
