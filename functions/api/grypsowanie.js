const LIST_KEY = 'gryps:list';
const MAX_MESSAGES = 50;
const NICK_RE = /^[\w\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]{1,20}$/u;

export async function onRequestGet({ env }) {
  if (!env.GRYPS) return json({ error: 'GRYPS KV not configured.' }, 500);
  const messages = (await env.GRYPS.get(LIST_KEY, 'json')) ?? [];
  return json({ messages });
}

export async function onRequestPost({ env, request }) {
  if (!env.GRYPS) return json({ error: 'GRYPS KV not configured.' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid body.' }, 400); }

  const nick = String(body?.nick ?? '').trim();
  const text = String(body?.text ?? '').trim();

  if (!NICK_RE.test(nick)) return json({ error: 'Nieprawidłowa ksywka (1–20 znaków, litery/cyfry/myślnik).' }, 400);
  if (!text || text.length > 280) return json({ error: 'Wiadomość 1–280 znaków.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rlKey = `gryps:rl:${ip}`;
  const limited = await env.GRYPS.get(rlKey);
  if (limited) return json({ error: 'Chwila oddechu — 1 post na minutę.' }, 429);

  const ts = new Date().toISOString();
  const message = { nick, text, ts };

  const messages = (await env.GRYPS.get(LIST_KEY, 'json')) ?? [];
  messages.unshift(message);
  if (messages.length > MAX_MESSAGES) messages.length = MAX_MESSAGES;

  await Promise.all([
    env.GRYPS.put(LIST_KEY, JSON.stringify(messages)),
    env.GRYPS.put(rlKey, '1', { expirationTtl: 60 }),
  ]);

  return json({ ok: true, message });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
