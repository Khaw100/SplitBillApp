# SplitBill v2 — receipt splitter (full LLM, Hub-managed keys)
![SplitBillApp companion](https://terrarium.rakhawiratama.com/api/creature.svg?user=Khaw100&repo=SplitBillApp)
Upload a receipt photo → vision LLM reads it → assign friends to items → get
per-person totals with tax/service split proportionally → export or share.

## Stack
- **web/** Next.js 16 (App Router, Tailwind, standalone build) on :3200
- **api/** FastAPI + SQLite on :8300
- **LLM:** gpt-4o-mini via Wipiii Hub (`GET /api/v1/projects/{id}/llm-config`).
  This app holds NO LLM API keys. Provider/model is managed in the Hub UI
  (Settings → Providers; per-project model pinning in project settings).

## Flow
1. `/login` — bcrypt-checked credentials from .env
2. `/new` — upload image → `POST /api/parse` → review/edit parsed JSON
3. `/new/assign` — add participants, toggle which items each person ordered
   (items shared by multiple people are auto-split)
4. `/bill/[id]` — report: summary cards, copy text, CSV download, share link
5. `/s/[id]` — public read-only snapshot (no login)

## Dev notes
- Next.js rewrites bake API_INTERNAL_URL at BUILD time — change it in
  docker-compose build args and rebuild.
- SQLite lives in ./data/app.db (bind mount).
- The API trusts X-Forwarded-* only via uvicorn proxy headers defaults; fine
  behind the Cloudflare tunnel.
