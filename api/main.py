"""SplitBill v2 API — FastAPI.

Auth via signed cookie; receipt parsing delegated to the vision LLM whose
config is fetched from Wipiii Hub (project-scoped). Bills + shares in SQLite.
"""

import base64
import json
import math
import os
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, TimestampSigner

DB_PATH = Path(os.environ.get("SB_DB", "/data/app.db"))
DATA_DIR = DB_PATH.parent
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me")
COOKIE_NAME = "sb_session"
HUB_BASE = os.environ.get("HUB_API_BASE", "http://127.0.0.1:8002/api/v1")
HUB_PROJECT_ID = int(os.environ.get("HUB_PROJECT_ID", "2"))
APP_USERNAME = os.environ.get("APP_USERNAME", "wipiii")

app = FastAPI(title="SplitBill v2", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("PUBLIC_ORIGIN", "*")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

signer = TimestampSigner(SECRET_KEY)

# ── DB ────────────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Receipt',
  currency TEXT NOT NULL DEFAULT 'Rp',
  items_json TEXT NOT NULL,          -- [{id,name,qty,price}]
  subtotal REAL NOT NULL,
  total REAL NOT NULL,
  assignments_json TEXT NOT NULL,    -- {participant:[item_id,...]}
  participants_json TEXT NOT NULL,   -- [names]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as db:
        db.executescript(SCHEMA)


init_db()

# ── Auth ──────────────────────────────────────────────────────────────────────


def current_user(request: Request) -> str | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        return signer.unsign(token.encode(), max_age=60 * 60 * 24 * 14).decode()
    except BadSignature:
        return None


def require_user(request: Request) -> str:
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@app.post("/auth/login")
async def login(request: Request):
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    import bcrypt

    expected_hash = os.environ.get("APP_PASSWORD_BCRYPT", "")
    ok = False
    if username == APP_USERNAME and expected_hash:
        try:
            ok = bcrypt.checkpw(password.encode(), expected_hash.encode())
        except ValueError:
            ok = False
    if not ok:
        raise HTTPException(status_code=401, detail="Wrong username or password")
    token = signer.sign(username.encode()).decode()
    resp = JSONResponse({"ok": True, "username": username})
    resp.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax",
        secure=os.environ.get("PUBLIC_ORIGIN", "").startswith("https"),
        max_age=60 * 60 * 24 * 14,
    )
    return resp


@app.post("/auth/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(COOKIE_NAME)
    return resp


@app.get("/me")
async def me(user: str = Depends(require_user)):
    return {"username": user}


# ── Hub integration ───────────────────────────────────────────────────────────


def get_llm_config() -> dict:
    """Fetch vision-LLM config from Wipiii Hub (project-scoped)."""
    import httpx

    project_key = os.environ.get("HUB_PROJECT_API_KEY", "")
    if not project_key:
        raise HTTPException(status_code=500, detail="Hub project key not configured")
    r = httpx.get(
        f"{HUB_BASE}/projects/{HUB_PROJECT_ID}/llm-config",
        headers={"Authorization": f"Bearer {project_key}"},
        timeout=10,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Hub config error: {r.text[:120]}")
    return r.json()


# ── Parse ─────────────────────────────────────────────────────────────────────

PARSE_PROMPT = """You are a receipt parser. Extract data from this receipt image.
Return STRICT JSON only, no markdown fences:
{
  "is_receipt": true/false,
  "title": "store name or short title",
  "currency": "Rp",
  "items": [{"name": "...", "qty": 1, "price": 25000}],
  "subtotal": 30000,
  "total": 35000,
  "tax_service_others": 5000
}
Rules:
- price/subtotal/total are integers in smallest displayed unit (no decimals for Rp)
- price is the UNIT price (price per 1 qty). If the receipt only prints the line
  total, divide it by qty.
- qty = pack quantity if item sold per-pack
- Do not list tax, service charge, rounding or discounts as items
- If not a receipt at all: {"is_receipt": false}
- Copy item names as printed (keep original language)
"""


@app.post("/parse")
async def parse_receipt(image: UploadFile = File(...), user: str = Depends(require_user)):
    raw = await image.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 12MB)")

    cfg = get_llm_config()
    b64 = base64.b64encode(raw).decode()
    data_url = f"data:{image.content_type or 'image/jpeg'};base64,{b64}"

    import httpx

    payload = {
        "model": cfg["model"],
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PARSE_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {cfg['api_key']}"}

    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.post(f"{cfg['base_url']}/chat/completions",
                              json=payload, headers=headers)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LLM error {r.status_code}: {r.text[:200]}")

    content = r.json()["choices"][0]["message"]["content"]
    # strip accidental fences
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="LLM returned invalid JSON")

    if not parsed.get("is_receipt", True):
        raise HTTPException(status_code=422, detail="Image doesn't look like a receipt")
    return parsed


# ── Bills CRUD ────────────────────────────────────────────────────────────────


# ── Split math ────────────────────────────────────────────────────────────────


def compute_result(items: list, assignments: dict, total: float) -> list:
    """Per-participant totals.

    Shared items are divided evenly between everyone who ticked them. The
    grand total (incl. tax/service/discount) is distributed proportionally to
    each person's item subtotal, using the *assigned items sum* as base so the
    per-person totals always add up exactly to the grand total (largest
    remainder rounding).
    """
    items_by_id = {i["id"]: i for i in items}
    share_count: dict[str, int] = {}
    for ids in assignments.values():
        for iid in set(ids):
            share_count[iid] = share_count.get(iid, 0) + 1

    people = []
    for name, ids in assignments.items():
        lines, sub = [], 0.0
        for iid in dict.fromkeys(ids):  # dedupe, keep order
            it = items_by_id.get(iid)
            if not it:
                continue
            n = share_count[iid]
            line_total = float(it.get("price") or 0) * float(it.get("qty") or 0) / n
            sub += line_total
            lines.append({**it, "line_total": round(line_total), "shared_by": n})
        people.append((name, lines, sub))

    assigned_sum = sum(p[2] for p in people)
    grand = round(float(total or 0))
    raw = [p[2] / assigned_sum * grand if assigned_sum else 0.0 for p in people]
    totals = [math.floor(r) for r in raw]
    leftover = grand - sum(totals)
    order = sorted(range(len(raw)), key=lambda i: raw[i] - totals[i], reverse=True)
    for i in order[: max(0, leftover)]:
        totals[i] += 1

    return [
        {
            "name": name,
            "lines": lines,
            "subtotal": round(sub),
            "total": totals[idx],
            "others": totals[idx] - round(sub),
        }
        for idx, (name, lines, sub) in enumerate(people)
    ]


def validate_bill_body(body: dict) -> None:
    items = body.get("items")
    participants = body.get("participants")
    assignments = body.get("assignments")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=422, detail="Bill needs at least one item")
    if not isinstance(participants, list) or not participants:
        raise HTTPException(status_code=422, detail="Bill needs at least one participant")
    if not isinstance(assignments, dict):
        raise HTTPException(status_code=422, detail="Invalid assignments")
    try:
        if float(body.get("total") or 0) <= 0:
            raise HTTPException(status_code=422, detail="Total must be greater than 0")
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid total")


@app.get("/bills")
async def list_bills(user: str = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id,title,currency,total,created_at,"
            "json_array_length(participants_json) AS people "
            "FROM bills ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/bills")
async def create_bill(request: Request, user: str = Depends(require_user)):
    body = await request.json()
    validate_bill_body(body)
    bill_id = uuid.uuid4().hex[:12]
    with get_db() as db:
        db.execute(
            "INSERT INTO bills (id,title,currency,items_json,subtotal,total,assignments_json,participants_json) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                bill_id,
                body.get("title") or "Receipt",
                body.get("currency") or "Rp",
                json.dumps(body["items"]),
                float(body.get("subtotal") or 0),
                float(body.get("total") or 0),
                json.dumps(body["assignments"]),
                json.dumps(body["participants"]),
            ),
        )
    return {"id": bill_id}


@app.get("/bills/{bill_id}")
async def get_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    d = dict(row)
    for k in ("items_json", "assignments_json", "participants_json"):
        d[k[:-5]] = json.loads(d.pop(k))
    d["result"] = compute_result(d["items"], d["assignments"], d["total"])
    return d


@app.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        cur = db.execute("DELETE FROM bills WHERE id=?", (bill_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Bill not found")
        # public share links of a deleted bill should stop working too
        db.execute("DELETE FROM shares WHERE bill_id=?", (bill_id,))
    return {"ok": True}


# ── Shares ────────────────────────────────────────────────────────────────────


@app.post("/bills/{bill_id}/share")
async def share_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    d = dict(row)
    snapshot = {
        "title": d["title"],
        "currency": d["currency"],
        "items": json.loads(d["items_json"]),
        "subtotal": d["subtotal"],
        "total": d["total"],
        "assignments": json.loads(d["assignments_json"]),
        "participants": json.loads(d["participants_json"]),
    }
    with get_db() as db:
        # bills are immutable → reuse an existing link instead of piling up rows
        existing = db.execute(
            "SELECT id FROM shares WHERE bill_id=? ORDER BY created_at DESC LIMIT 1", (bill_id,)
        ).fetchone()
    if existing:
        return {"share_id": existing["id"]}
    share_id = uuid.uuid4().hex[:10]
    with get_db() as db:
        db.execute(
            "INSERT INTO shares (id,bill_id,snapshot_json) VALUES (?,?,?)",
            (share_id, bill_id, json.dumps(snapshot)),
        )
    return {"share_id": share_id}


@app.get("/share/{share_id}")
async def get_share(share_id: str):
    with get_db() as db:
        row = db.execute("SELECT snapshot_json,created_at FROM shares WHERE id=?", (share_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Share not found")
    snap = json.loads(row["snapshot_json"])
    snap["created_at"] = row["created_at"]

    snap["result"] = compute_result(snap["items"], snap["assignments"], snap["total"])
    return snap
