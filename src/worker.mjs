export function authorized(user, allowed = '') {
  const entries = allowed.split(',').map(v => v.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  return entries.length === 0 || entries.includes(String(user?.id)) ||
    (Boolean(user?.username) && entries.includes(user.username.toLowerCase()));
}

export async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || 'Telegram request failed');
  return data.result;
}

export async function handleUpdate(update, env, api = telegram) {
  const message = update.message;
  if (message?.chat?.type !== 'private' || message.from?.is_bot) return;
  const send = text => api(env, 'sendMessage', { chat_id: message.chat.id, text });
  if (!authorized(message.from, env.ALLOWED_USERS)) {
    await send('⛔ Unauthorized access.');
    return;
  }
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(message.text || '')) {
    await send('Send a public Telegram message link, for example https://t.me/channelname/123. I can copy messages that Telegram allows this bot to access. Add the bot to the source channel or group if needed.');
    return;
  }
  const match = /(?:^|\s)(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z][a-zA-Z0-9_]*)\/(\d+)(?=$|[\s?#])/i.exec(message.text || '');
  if (!match) {
    await send('Please send a public message link such as https://t.me/channelname/123. Private invite links and /c/ links are not supported.');
    return;
  }
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id < 1) return;
  try {
    await api(env, 'copyMessage', { chat_id: message.chat.id, from_chat_id: `@${match[1]}`, message_id: id });
  } catch {
    await send('Could not copy that message. Check the link and source permissions. Telegram may prevent this bot from accessing or copying the message.');
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/') {
      return Response.json({ service: 'telegram-forward-bot', configured: Boolean(env.BOT_TOKEN && env.WEBHOOK_SECRET) });
    }
    if (path !== '/webhook') return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) return new Response('Not configured', { status: 503 });
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    let update;
    try { update = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
    if (!update || typeof update !== 'object') return new Response('Invalid update', { status: 400 });
    try {
      await handleUpdate(update, env);
      return new Response('OK');
    } catch {
      console.error('Telegram update processing failed');
      return new Response('Temporary failure', { status: 503 });
    }
  }
};
