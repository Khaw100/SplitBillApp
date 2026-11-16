# SplitBill v2 — Payment Confirmation Feature (Croco-style)

## Goal
Add the payment-confirmation flow shown in the reference screenshot to splitbill-v2:
each participant opens their own link → sees "Bagian kamu" (their share), the
recipient's transfer accounts with copy buttons, checks which items they cover,
adjusts quantity, and confirms payment. Plus a general link. Web stays mobile-first.

## What exists today
- `web` (Next.js :3200) + `api` (FastAPI :8300), SQLite at /data/app.db.
- Flow: login → `/new` (upload+parse receipt) → `/new/assign` (add participants,
  assign items) → `/bill/[id]` (report) → share link `/s/[id]` (read-only snapshot).
- No recipient accounts, no per-participant links, no confirm-payment.

## New data model (SQLite)
```
recipients (
  id TEXT PK, name TEXT, accounts_json TEXT   -- [{type,name,number,holder}]
)
bills  + recipient_id TEXT NULL               -- who to pay
payments (
  id TEXT PK, bill_id TEXT, participant TEXT,
  items_json TEXT, total REAL, paid_at TEXT NULL
)
```
- Seed one recipient = wipiii with his accounts (GoPay/Mandiri/Jago) on first boot.
- `payments` records each participant's confirmed share (items + total + paid_at).

## Backend endpoints (api/main.py)
```
GET  /recipients                     -- list recipients (for create-bill picker)
POST /bills                          -- accept recipient_id
GET  /bills/:id/paylink/:participant  -- per-participant tokenized link (new share row)
GET  /pay/:token                     -- public: {bill, participant, items, recipient accounts, my_total}
POST /pay/:token/confirm             -- public: {items:[{id,qty}], total} -> mark paid
GET  /bills/:id/status               -- auth: per-participant paid/unpaid
```
- Per-participant link = new `shares` row with `kind='pay'` + `participant` + token.
- Confirm recomputes total server-side from items (never trust client total).

## Frontend pages (web/app)
1. `/new/assign` — add "Bayar ke siapa" recipient picker (default wipiii). After
   save, show per-participant pay links + general link to copy.
2. `/pay/[token]` — the Croco screen (mobile-first, dark theme):
   - Header: bill title + back/share.
   - "Bagian kamu: Rp X" + recipient accounts (GoPay/Mandiri/Jago) each with
     **Salin** (copy) button.
   - "Centang yang kamu tanggung" — checkbox per item, "Bagi per porsi" badge,
     qty +/- selector, live total.
   - Footer: "Keluar dari Bill" (red) + "✓ Pembayaran sudah selesai" (green) →
     POST confirm → success state.
3. `/bill/[id]` — add payment status column (who paid / not) + copy pay links.
4. `/s/[id]` — general read-only link stays; add paid/unpaid badges.

## Mobile-first
- All new pages use `max-w-xl mx-auto px-4`, large touch targets, sticky footer
  with the confirm button, `viewport-fit=cover`. Already dark Hub theme.

## Deployment
- Same docker-compose (web :3200, api :8300). New tables auto-created on boot
  (schema.sql pattern already in main.py). Rebuild + `docker compose up -d`.
- CF tunnel splitbill.rakhawiratama.com already points at :3200.

## Out of scope
- Multi-user accounts (single user wipiii as before).
- Real payment processing (copy-account + manual confirm only, like the reference).
- Recipient management UI (seeded from .env; edit later if needed).

## Verification checklist
- [ ] Create bill → pick recipient → per-participant pay links generated
- [ ] Open `/pay/[token]` logged-out → shows my share + accounts + copy works
- [ ] Check/uncheck items + qty +/- → total updates correctly
- [ ] Confirm → marked paid; re-open shows paid state
- [ ] `/bill/[id]` shows paid/unpaid per participant
- [ ] General `/s/[id]` link still works, shows badges
- [ ] Mobile view (narrow width) renders cleanly
