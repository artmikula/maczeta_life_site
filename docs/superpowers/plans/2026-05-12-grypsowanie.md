# Grypsowanie Shoutbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an anonymous nickname-based shoutbox ("Grypsowanie") as a footer section, backed by Cloudflare KV, rate-limited to 1 post/minute per IP.

**Architecture:** Cloudflare Pages Function at `/api/grypsowanie` handles GET (return last 50 messages) and POST (validate, rate-limit, store). Messages are stored as a JSON array in a single KV key (`gryps:list`), newest first, capped at 50 entries. Rate-limit sentinels use KV TTL. Frontend polls every 30 seconds and saves the nick to localStorage.

**Tech Stack:** Cloudflare Pages Functions (ES modules), Cloudflare KV, vanilla JS, single-file HTML/CSS/JS site.

---

### Task 1: Create the GRYPS KV namespace

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Create the KV namespace**

```bash
npx wrangler kv namespace create GRYPS
```

Expected output (ID will differ):
```
🌀 Creating namespace with title "maczetalife-GRYPS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "GRYPS", id = "abc123..." }
```

Copy the `id` value from the output.

- [ ] **Step 2: Add the binding to wrangler.toml**

Append after the existing `[[kv_namespaces]]` blocks — replace `<ID_FROM_STEP_1>` with the actual ID:

```toml
[[kv_namespaces]]
binding = "GRYPS"
id = "<ID_FROM_STEP_1>"
```

- [ ] **Step 3: Commit**

```bash
git add wrangler.toml
git commit -m "chore: add GRYPS KV namespace for grypsowanie shoutbox"
```

---

### Task 2: Create the API function

**Files:**
- Create: `functions/api/grypsowanie.js`

- [ ] **Step 1: Create the file**

```js
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
```

- [ ] **Step 2: Start local dev server and verify GET returns empty list**

```bash
npx wrangler pages dev . --kv GRYPS
```

In a second terminal:
```bash
curl -s http://localhost:8788/api/grypsowanie | python3 -m json.tool
```

Expected:
```json
{ "messages": [] }
```

- [ ] **Step 3: Verify POST stores a message**

```bash
curl -s -X POST http://localhost:8788/api/grypsowanie \
  -H "content-type: application/json" \
  -d '{"nick":"Zbyszek","text":"hej maczetalife"}' | python3 -m json.tool
```

Expected:
```json
{ "ok": true, "message": { "nick": "Zbyszek", "text": "hej maczetalife", "ts": "..." } }
```

Then verify it appears in GET:
```bash
curl -s http://localhost:8788/api/grypsowanie | python3 -m json.tool
```

Expected: `messages` array with one entry.

- [ ] **Step 4: Verify nick validation rejects bad input**

```bash
curl -s -X POST http://localhost:8788/api/grypsowanie \
  -H "content-type: application/json" \
  -d '{"nick":"a b c","text":"test"}' | python3 -m json.tool
```

Expected: `400` with `{ "error": "Nieprawidłowa ksywka..." }`

- [ ] **Step 5: Stop the dev server (Ctrl+C), commit**

```bash
git add functions/api/grypsowanie.js
git commit -m "feat: add /api/grypsowanie GET + POST with KV ring buffer and rate limiting"
```

---

### Task 3: Add CSS for the Grypsowanie section

**Files:**
- Modify: `index.html` — add CSS before the closing `</style>` tag (around line 1377)

- [ ] **Step 1: Find the closing `</style>` tag**

```bash
grep -n "</style>" index.html
```

Note the line number — there should be one main `</style>`. Insert the following CSS block immediately before it:

```css
/* ===== GRYPSOWANIE SHOUTBOX ===== */
.grypsowanie {
  padding: 80px 0 60px;
  text-align: center;
}
.gryps-box {
  max-width: 680px;
  margin: 32px auto 0;
  background: #0d0d0d;
  border: 1px solid #222;
  border-top: 2px solid var(--blood);
}
.gryps-messages {
  min-height: 120px;
  max-height: 340px;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gryps-messages::-webkit-scrollbar { width: 4px; }
.gryps-messages::-webkit-scrollbar-track { background: #111; }
.gryps-messages::-webkit-scrollbar-thumb { background: var(--blood); }
.gryps-msg-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  text-align: left;
}
.gryps-nick-display {
  color: var(--blood);
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  min-width: 70px;
  flex-shrink: 0;
}
.gryps-text {
  color: var(--cream);
  font-size: 14px;
  line-height: 1.4;
  flex: 1;
  word-break: break-word;
}
.gryps-time {
  color: #444;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
}
.gryps-empty {
  color: #444;
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
  margin: 0;
}
.gryps-form {
  display: flex;
  gap: 0;
  border-top: 1px solid #1e1e1e;
}
.gryps-nick {
  width: 120px;
  flex-shrink: 0;
  background: #111;
  border: none;
  border-right: 1px solid #222;
  color: var(--cream);
  padding: 12px 14px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.gryps-nick::placeholder { color: #444; }
.gryps-msg-input {
  flex: 1;
  background: #111;
  border: none;
  border-right: 1px solid #222;
  color: var(--cream);
  padding: 12px 14px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.gryps-msg-input::placeholder { color: #444; }
.gryps-submit {
  background: transparent;
  border: none;
  color: var(--blood);
  padding: 12px 18px;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, color 0.2s;
}
.gryps-submit:hover { background: var(--blood); color: var(--cream); }
.gryps-status {
  min-height: 28px;
  padding: 4px 20px;
  font-size: 12px;
  text-align: left;
}
.gryps-status-ok { color: #5a9; }
.gryps-status-error { color: var(--blood); }
@media (max-width: 600px) {
  .gryps-nick { width: 80px; }
  .gryps-box { margin: 24px 16px 0; }
}
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add CSS for grypsowanie shoutbox section"
```

---

### Task 4: Add the HTML section and nav link

**Files:**
- Modify: `index.html` — add section after line 1628 (end of `</section>` closing merch), add nav link at line 1388

- [ ] **Step 1: Add the nav link**

Find this line in the nav (around line 1388):
```html
    <li><a href="#merch" data-i18n="nav.merch">Ubrania</a></li>
```

Add immediately after it:
```html
    <li><a href="#grypsowanie" data-i18n="nav.gryps">Gadka</a></li>
```

- [ ] **Step 2: Add the section**

Find this comment (around line 1630):
```html
<!-- =================== FLOATING GAME CTA =================== -->
```

Insert the following block immediately before it:

```html
<!-- =================== GRYPSOWANIE =================== -->
<section class="grypsowanie" id="grypsowanie">
  <div class="section-edge reveal"></div>
  <div class="reveal">
    <div class="section-label" data-i18n="gryps.label">Grypsowanie</div>
    <h2 class="section-title" data-i18n="gryps.title">Gadaj.</h2>
  </div>
  <div class="gryps-box reveal">
    <div class="gryps-messages" id="gryps-messages">
      <p class="gryps-empty" data-i18n="gryps.empty">Jeszcze nikt nie gada. Zacznij.</p>
    </div>
    <form class="gryps-form" id="gryps-form">
      <input class="gryps-nick" id="gryps-nick" type="text" maxlength="20" placeholder="ksywka" autocomplete="off">
      <input class="gryps-msg-input" id="gryps-msg" type="text" maxlength="280" placeholder="napisz coś..." autocomplete="off">
      <button type="submit" class="gryps-submit" data-i18n="gryps.submit">Wyślij</button>
    </form>
    <div class="gryps-status" id="gryps-status"></div>
  </div>
</section>

```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add grypsowanie section HTML and nav link"
```

---

### Task 5: Add i18n keys

**Files:**
- Modify: `index.html` — both `pl` and `en` objects inside the `dict` constant (~line 2182)

- [ ] **Step 1: Add Polish keys**

Find this line in the `pl` object:
```js
    "waitlist.success": "✓ Zapisano. Będziemy w kontakcie.",
```

Add the following immediately before it:
```js
    "nav.gryps": "Gadka",
    "gryps.label": "Grypsowanie",
    "gryps.title": "Gadaj.",
    "gryps.submit": "Wyślij",
    "gryps.rate_limit": "Chwila oddechu — 1 post na minutę.",
    "gryps.empty": "Jeszcze nikt nie gada. Zacznij.",
```

- [ ] **Step 2: Add English keys**

Find this line in the `en` object:
```js
    "waitlist.success": "✓ You're in. We'll be in touch.",
```

Add the following immediately before it:
```js
    "nav.gryps": "Talk",
    "gryps.label": "Grypsowanie",
    "gryps.title": "Talk.",
    "gryps.submit": "Send",
    "gryps.rate_limit": "Slow down — 1 post per minute.",
    "gryps.empty": "Nobody's talking yet. Start.",
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add grypsowanie i18n keys for pl and en"
```

---

### Task 6: Add the frontend JavaScript

**Files:**
- Modify: `index.html` — add JS block before the closing `</script>` tag (before line ~2433)

- [ ] **Step 1: Find the closing `</script>` tag**

```bash
grep -n "</script>" index.html
```

Note the line number. Insert the following block immediately before it:

```js
// =====================================================
// GRYPSOWANIE SHOUTBOX
// =====================================================
(function() {
  const form = document.getElementById('gryps-form');
  const nickInput = document.getElementById('gryps-nick');
  const msgInput = document.getElementById('gryps-msg');
  const messagesEl = document.getElementById('gryps-messages');
  const statusEl = document.getElementById('gryps-status');
  if (!form) return;

  let statusTimer = null;

  try { nickInput.value = localStorage.getItem('gryps_nick') || ''; } catch(e) {}

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function relTime(ts) {
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return diff + 's';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  }

  function renderMessages(messages) {
    if (!messages.length) {
      messagesEl.innerHTML = '<p class="gryps-empty">' + (dict[currentLang]['gryps.empty'] || 'Jeszcze nikt nie gada. Zacznij.') + '</p>';
      return;
    }
    messagesEl.innerHTML = messages.map(function(m) {
      return '<div class="gryps-msg-row">' +
        '<span class="gryps-nick-display">' + escHtml(m.nick) + '</span>' +
        '<span class="gryps-text">' + escHtml(m.text) + '</span>' +
        '<span class="gryps-time">' + relTime(m.ts) + '</span>' +
        '</div>';
    }).join('');
  }

  function showStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'gryps-status ' + (isError ? 'gryps-status-error' : 'gryps-status-ok');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function() {
      statusEl.textContent = '';
      statusEl.className = 'gryps-status';
    }, 3000);
  }

  async function loadMessages() {
    try {
      const res = await fetch('/api/grypsowanie');
      if (!res.ok) return;
      const data = await res.json();
      renderMessages(data.messages || []);
    } catch(e) {}
  }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const nick = nickInput.value.trim();
    const text = msgInput.value.trim();
    if (!nick || !text) return;
    try { localStorage.setItem('gryps_nick', nick); } catch(e) {}
    try {
      const res = await fetch('/api/grypsowanie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nick: nick, text: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        showStatus(data.error || dict[currentLang]['gryps.rate_limit'], true);
        return;
      }
      msgInput.value = '';
      await loadMessages();
    } catch(e) {
      showStatus('Błąd połączenia.', true);
    }
  });

  loadMessages();
  setInterval(loadMessages, 30000);
})();
```

- [ ] **Step 2: Start local dev and do a full manual test**

```bash
npx wrangler pages dev . --kv GRYPS
```

Open `http://localhost:8788` in a browser. Scroll to the bottom — you should see the Grypsowanie section with the empty state message. Type a nickname and a message, submit. It should appear in the list. Submit again within 60 seconds — you should see the rate-limit error in red.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add grypsowanie frontend JS — fetch, poll, post, localStorage nick"
```

---

### Task 7: Deploy and verify live

- [ ] **Step 1: Deploy to Cloudflare Pages**

```bash
npx wrangler pages deploy . --project-name=maczetalife --branch=main
```

Expected: `✨ Deployment complete!` with a `*.pages.dev` URL.

- [ ] **Step 2: Verify the live API**

```bash
curl -s https://maczetalife.com/api/grypsowanie | python3 -m json.tool
```

Expected: `{ "messages": [] }` (or existing messages if any were posted during dev).

- [ ] **Step 3: Post a test message live**

```bash
curl -s -X POST https://maczetalife.com/api/grypsowanie \
  -H "content-type: application/json" \
  -d '{"nick":"Test","text":"Grypsowanie działa!"}' | python3 -m json.tool
```

Expected: `{ "ok": true, "message": { ... } }`

- [ ] **Step 4: Verify it appears in GET**

```bash
curl -s https://maczetalife.com/api/grypsowanie | python3 -m json.tool
```

Expected: `messages` array with the test message.

- [ ] **Step 5: Push to GitHub**

```bash
git push
```
