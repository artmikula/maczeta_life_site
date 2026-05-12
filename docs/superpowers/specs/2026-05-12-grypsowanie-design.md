# Grypsowanie — Shoutbox Design

**Date:** 2026-05-12
**Status:** Approved

## Overview

A lightweight anonymous shoutbox called "Grypsowanie" added as a footer section on the Maczeta Life single-page site. Users pick a nickname and post short messages. No accounts, no threads. Rate-limited to 1 post per minute per IP.

## Architecture

**Storage: Cloudflare KV ring buffer**

- New KV namespace binding `GRYPS` added to `wrangler.toml`
- `gryps:list` — JSON array of the last 50 messages (newest first)
- `gryps:rl:{ip}` — rate-limit sentinel key, written with 60-second TTL on each successful post; presence blocks further posts from that IP within the window

No Cloudflare D1 or external database needed.

## API

**File:** `functions/api/grypsowanie.js`

### GET /api/grypsowanie
- Returns `{ messages: [...] }` — the full list, newest first
- No authentication required
- Cache-control: no-store

### POST /api/grypsowanie
Request body: `{ nick: string, text: string }`

Validation:
- `nick`: 1–20 characters, letters (including Polish: ąćęłńóśźż), digits, hyphens, underscores only
- `text`: 1–280 characters, any content
- If either fails validation → 400 with `{ error: "..." }`

Rate limiting:
- Read IP from `request.headers.get('CF-Connecting-IP')` (standard in Pages Functions)
- Check `gryps:rl:{ip}` in KV — if present → 429 with `{ error: "Chwila oddechu — 1 post na minutę." }`
- On success → write sentinel key with `expirationTtl: 60`

Storage:
- Prepend new message `{ nick, text, ts }` to existing list
- Trim list to 50 entries
- Write back to `gryps:list`

Response: `{ ok: true, message: { nick, text, ts } }`

**Message shape:**
```json
{ "nick": "Zbyszek", "text": "kiedy nowy drop?", "ts": "2026-05-12T18:00:00.000Z" }
```

## Frontend

**Placement:** New `<section class="grypsowanie" id="grypsowanie">` added at the bottom of `index.html`, above the existing footer/nav, below the merch section.

**Section structure:**
- Label: `/ Grypsowanie` (matches existing section label style)
- Message list: last 50 posts, newest at top, nick in blood-red, timestamp as relative time (e.g. "2m temu")
- Input row: nick field (saved to `localStorage` as `gryps_nick`), message field, submit button
- Status line: shows rate-limit error or success confirmation, clears after 3 seconds

**Polling:** `setInterval` every 30 seconds fetches GET /api/grypsowanie and re-renders the list.

**i18n keys (pl/en):**
- `gryps.label` — "Grypsowanie" / "Grypsowanie"
- `gryps.title` — "Gadaj." / "Talk."
- `gryps.nick_placeholder` — "ksywka" / "nickname"
- `gryps.msg_placeholder` — "napisz coś..." / "say something..."
- `gryps.submit` — "Wyślij" / "Send"
- `gryps.rate_limit` — "Chwila oddechu — 1 post na minutę." / "Slow down — 1 post per minute."
- `gryps.empty` — "Jeszcze nikt nie gada. Zacznij." / "Nobody's talking yet. Start."

**CSS:** Matches existing site aesthetic — dark background (`#0d0d0d`), blood-red nicks and label (`var(--blood)`), cream text (`var(--cream)`), same input style as the waitlist form.

## Constraints

- Max 50 messages stored; older ones are dropped
- Nick persists in `localStorage` across page loads
- No moderation UI in this version
- Works with existing Cloudflare Pages + Workers setup, no new services

## Out of Scope

- Message deletion / moderation panel
- Reactions or replies
- User registration or persistent identity
- Profanity filtering
