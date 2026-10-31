import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleUpdate } from './worker.mjs';

test('webhook rejects missing or incorrect secrets before processing', async () => {
  for (const secret of ['', 'wrong']) {
    const response = await worker.fetch(new Request('https://example.com/webhook', {
      method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: '{}'
    }), { BOT_TOKEN: 'test', WEBHOOK_SECRET: 'correct' });
    assert.equal(response.status, 401);
  }
});

test('unauthorized users cannot trigger copying', async () => {
  const calls = [];
  await handleUpdate({ message: { chat: { id: 5, type: 'private' }, from: { id: 5 }, text: 'https://t.me/channel/12' } },
    { ALLOWED_USERS: '42' }, async (_, method, body) => calls.push({ method, body }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'sendMessage');
  assert.match(calls[0].body.text, /Unauthorized/);
});

test('allowed username maps a public link to copyMessage', async () => {
  const calls = [];
  await handleUpdate({ message: { chat: { id: 5, type: 'private' }, from: { id: 5, username: 'Alice' }, text: 'https://t.me/channel/12?single' } },
    { ALLOWED_USERS: '@alice' }, async (_, method, body) => calls.push({ method, body }));
  assert.deepEqual(calls, [{ method: 'copyMessage', body: { chat_id: 5, from_chat_id: '@channel', message_id: 12 } }]);
});

test('private links never trigger copying', async () => {
  const calls = [];
  await handleUpdate({ message: { chat: { id: 5, type: 'private' }, from: { id: 5 }, text: 'https://t.me/c/123/12' } },
    {}, async (_, method) => calls.push(method));
  assert.deepEqual(calls, ['sendMessage']);
});
