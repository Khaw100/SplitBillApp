"""SplitBill v2 API — FastAPI.

Auth via signed cookie; receipt parsing delegated to the vision LLM whose
config is fetched from Wipiii Hub (project-scoped). Bills + shares in SQLite.

Single-user app: the owner keeps their name / phone / payment accounts in
`settings`. A bill records who the host is (defaults to the owner); the host's
bank details are only exposed on pay pages when the host *is* the owner.
"""

import base64
import json
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
  recipient_id TEXT,                 -- legacy
  host_name TEXT,
  host_is_owner INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'view',   -- 'view' | 'pay'
  participant TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  items_json TEXT NOT NULL,            -- [{id,qty}]
  total REAL NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Wipiii',
  phone TEXT NOT NULL DEFAULT '',
  accounts_json TEXT NOT NULL DEFAULT '[]'
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


# ── Settings (owner profile: name, phone, payment accounts) ───────────────────


def hub_app_config() -> dict:
    """Fetch this project's generic app config from Wipiii Hub.

    Central store for app-level settings (owner name / phone / accounts), so the
    app doesn't need its own secrets or a separate config UI to boot.
    """
    import httpx

    project_key = os.environ.get("HUB_PROJECT_API_KEY", "")
    if not project_key:
        return {}
    try:
        r = httpx.get(
            f"{HUB_BASE}/projects/{HUB_PROJECT_ID}/app-config",
            headers={"Authorization": f"Bearer {project_key}"},
            timeout=10,
        )
        if r.status_code != 200:
            return {}
        return r.json().get("config", {})
    except Exception:
        return {}


def normalize_account(a: dict) -> dict:
    """Accept both {type,name,number,holder} (legacy) and {label,number,holder}."""
    return {
        "label": (a.get("label") or a.get("name") or a.get("type") or "").strip(),
        "number": (a.get("number") or "").strip(),
        "holder": (a.get("holder") or "").strip(),
    }


def read_settings() -> dict:
    with get_db() as db:
        row = db.execute("SELECT name,phone,accounts_json FROM settings WHERE id=1").fetchone()
    if not row:
        return {"name": "Wipiii", "phone": "", "accounts": []}
    accounts = [normalize_account(a) for a in json.loads(row["accounts_json"] or "[]")]
    return {"name": row["name"], "phone": row["phone"], "accounts": accounts}


def seed_settings() -> None:
    """First boot: seed the owner profile from Hub app-config (or env)."""
    with get_db() as db:
        row = db.execute("SELECT id FROM settings WHERE id=1").fetchone()
        if row:
            return
        cfg = hub_app_config()
        name = cfg.get("recipient_name") or os.environ.get("OWNER_NAME") or "Wipiii"
        phone = cfg.get("recipient_phone") or os.environ.get("OWNER_PHONE") or ""
        accounts = [normalize_account(a) for a in (cfg.get("recipient_accounts") or [])]
        db.execute(
            "INSERT INTO settings (id,name,phone,accounts_json) VALUES (1,?,?,?)",
            (name, phone, json.dumps(accounts)),
        )


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as db:
        db.executescript(SCHEMA)
        # Migrate existing bills table (SQLite lacks ADD COLUMN IF NOT EXISTS pre-3.35)
        cols = {r[1] for r in db.execute("PRAGMA table_info(bills)")}
        if "host_name" not in cols:
            db.execute("ALTER TABLE bills ADD COLUMN host_name TEXT")
        if "host_is_owner" not in cols:
            db.execute("ALTER TABLE bills ADD COLUMN host_is_owner INTEGER NOT NULL DEFAULT 1")
        cols = {r[1] for r in db.execute("PRAGMA table_info(shares)")}
        if "kind" not in cols:
            db.execute("ALTER TABLE shares ADD COLUMN kind TEXT NOT NULL DEFAULT 'view'")
        if "participant" not in cols:
            db.execute("ALTER TABLE shares ADD COLUMN participant TEXT")


init_db()
seed_settings()

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


# ── Settings endpoints ────────────────────────────────────────────────────────


@app.get("/settings")
async def get_settings(user: str = Depends(require_user)):
    return read_settings()


@app.put("/settings")
async def put_settings(request: Request, user: str = Depends(require_user)):
    body = await request.json()
    name = (body.get("name") or "").strip() or "Wipiii"
    phone = (body.get("phone") or "").strip()
    accounts = [normalize_account(a) for a in (body.get("accounts") or []) if (a.get("number") or "").strip()]
    with get_db() as db:
        db.execute(
            "UPDATE settings SET name=?, phone=?, accounts_json=? WHERE id=1",
            (name, phone, json.dumps(accounts)),
        )
    return read_settings()


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
- qty = pack quantity if item sold per-pack
- If not a receipt at all: {"is_receipt": false}
- Copy item names as printed (keep original language)
- Copy the signed price EXACTLY as printed. A line showing (10,100) or -10,100 is a
  DISCOUNT/VOUCHER line: keep it as a negative price, do NOT drop it and do NOT merge
  its amount into another item's price. Discount lines keep their printed name.
- Do NOT include payment/tender lines as items: skip KEMBALI / CHANGE / TUNAI / CASH /
  BAYAR / DEBIT / CREDIT / QRIS / E-WALLET, and tax (PPN/DPP) summary lines.
- One item per printed product line. Do not rename, split, or combine lines.
- CHECK YOUR MATH: sum(item.price) must equal subtotal. If it does not, you misread a
  line — re-read the price column before answering.
- tax_service_others = tax + service + other fees added on top of subtotal (0 if none).
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


@app.get("/bills")
async def list_bills(user: str = Depends(require_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id,title,currency,total,host_name,host_is_owner,created_at "
            "FROM bills ORDER BY created_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def _host_of(d: dict) -> dict:
    s = read_settings()
    is_owner = bool(d.get("host_is_owner", 1))
    name = (d.get("host_name") or "").strip() or s["name"]
    return {
        "name": s["name"] if is_owner else name,
        "is_owner": is_owner,
        # Bank details are private to the owner: only exposed when they host.
        "phone": s["phone"] if is_owner else "",
        "accounts": s["accounts"] if is_owner else [],
    }


@app.post("/bills")
async def create_bill(request: Request, user: str = Depends(require_user)):
    body = await request.json()
    s = read_settings()
    host_is_owner = bool(body.get("host_is_owner", True))
    host_name = (body.get("host_name") or "").strip() or (s["name"] if host_is_owner else "")
    bill_id = uuid.uuid4().hex[:12]
    with get_db() as db:
        db.execute(
            "INSERT INTO bills (id,title,currency,items_json,subtotal,total,assignments_json,"
            "participants_json,host_name,host_is_owner) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                bill_id,
                body.get("title") or "Receipt",
                body.get("currency") or "Rp",
                json.dumps(body["items"]),
                float(body.get("subtotal") or 0),
                float(body.get("total") or 0),
                json.dumps(body["assignments"]),
                json.dumps(body["participants"]),
                host_name,
                1 if host_is_owner else 0,
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
    d["host"] = _host_of(d)
    return d


@app.get("/bills/{bill_id}/result")
async def bill_result(bill_id: str, user: str = Depends(require_user)):
    """Per-participant totals for the owner view (no share row created)."""
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    d = dict(row)
    snap = _bill_snapshot(d)
    return {"result": _split_result(snap), "host": _host_of(d)}


@app.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        cur = db.execute("DELETE FROM bills WHERE id=?", (bill_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Bill not found")
    return {"ok": True}


# ── Shares ────────────────────────────────────────────────────────────────────


def _bill_snapshot(d: dict) -> dict:
    return {
        "title": d["title"],
        "currency": d["currency"],
        "items": json.loads(d["items_json"]),
        "subtotal": d["subtotal"],
        "total": d["total"],
        "assignments": json.loads(d["assignments_json"]),
        "participants": json.loads(d["participants_json"]),
        "host_name": d.get("host_name"),
        "host_is_owner": d.get("host_is_owner", 1),
    }


def _snapshot_host(snap: dict) -> dict:
    return _host_of(
        {"host_name": snap.get("host_name"), "host_is_owner": snap.get("host_is_owner", 1)}
    )


def _assigned_total(snap: dict) -> float:
    """Sum of the line totals actually covered by participants (items total)."""
    items_by_id = {i["id"]: i for i in snap["items"]}
    seen = {iid for ids in snap["assignments"].values() for iid in ids}
    return float(sum(items_by_id[i]["price"] * items_by_id[i]["qty"] for i in seen if i in items_by_id))


def _fee_ratio(snap: dict) -> float:
    """How much tax/service/discount scales each assigned line (1.0 = none)."""
    base = _assigned_total(snap)
    return (float(snap["total"]) / base) if base else 1.0


def _split_result(snap: dict) -> list[dict]:
    """Per-participant totals, computed server-side.

    Tax/service/discount is spread proportionally over what was actually
    assigned (never over the stored subtotal, which can disagree with the line
    items on edited receipts), so the parts always add up to the bill total.
    """
    items_by_id = {i["id"]: i for i in snap["items"]}
    share_count = {
        iid: sum(1 for ids in snap["assignments"].values() if iid in ids)
        for iid in items_by_id
    }
    raw: list[dict] = []
    for name, item_ids in snap["assignments"].items():
        lines, sub = [], 0.0
        for iid in item_ids:
            it = items_by_id.get(iid)
            if not it:
                continue
            sc = max(1, share_count.get(iid, 1))
            line_total = it["price"] * it["qty"] / sc
            sub += line_total
            lines.append({**it, "line_total": round(line_total), "shared_by": sc})
        raw.append({"name": name, "lines": lines, "subtotal": round(sub)})

    assigned_total = sum(p["subtotal"] for p in raw)
    extra = float(snap["total"]) - assigned_total
    result = []
    for p in raw:
        share = (p["subtotal"] / assigned_total) if assigned_total else 0
        fee = round(extra * share)
        total = p["subtotal"] + fee
        result.append({**p, "total": total, "others": fee})
    return result


@app.post("/bills/{bill_id}/share")
async def share_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    snapshot = _bill_snapshot(dict(row))
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
        row = db.execute(
            "SELECT snapshot_json,created_at FROM shares WHERE id=?", (share_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Share not found")
    snap = json.loads(row["snapshot_json"])
    snap["created_at"] = row["created_at"]
    snap["host"] = _snapshot_host(snap)
    snap["result"] = _split_result(snap)
    return snap


# ── Per-participant pay links ─────────────────────────────────────────────────


@app.post("/bills/{bill_id}/paylink/{participant}")
async def create_paylink(bill_id: str, participant: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    d = dict(row)
    if participant not in json.loads(d["participants_json"]):
        raise HTTPException(status_code=404, detail="Participant not in bill")
    # Idempotent: reuse an existing pay link for this participant.
    with get_db() as db:
        ex = db.execute(
            "SELECT id FROM shares WHERE bill_id=? AND kind='pay' AND participant=? "
            "ORDER BY created_at DESC LIMIT 1",
            (bill_id, participant),
        ).fetchone()
        if ex:
            token = ex["id"]
        else:
            token = uuid.uuid4().hex[:12]
            db.execute(
                "INSERT INTO shares (id,bill_id,snapshot_json,kind,participant) VALUES (?,?,?,?,?)",
                (token, bill_id, json.dumps(_bill_snapshot(d)), "pay", participant),
            )
    return {"token": token, "url": f"/pay/{token}"}


@app.get("/pay/{token}")
async def get_pay(token: str):
    with get_db() as db:
        row = db.execute(
            "SELECT bill_id,snapshot_json,participant FROM shares WHERE id=? AND kind='pay'",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pay link not found")
    snap = json.loads(row["snapshot_json"])
    participant = row["participant"]
    host = _snapshot_host(snap)
    ratio = _fee_ratio(snap)

    items_by_id = {i["id"]: i for i in snap["items"]}
    my_ids = snap["assignments"].get(participant, [])
    lines = []
    for iid in my_ids:
        it = items_by_id.get(iid)
        if not it:
            continue
        share_count = sum(1 for ids in snap["assignments"].values() if iid in ids)
        lines.append({**it, "shared_by": share_count, "line_total": round(it["price"] * it["qty"] / max(1, share_count) * ratio)})

    with get_db() as db:
        pay = db.execute(
            "SELECT total,paid_at FROM payments WHERE bill_id=? AND participant=? "
            "ORDER BY paid_at DESC LIMIT 1",
            (row["bill_id"], participant),
        ).fetchone()

    return {
        "title": snap["title"],
        "currency": snap["currency"],
        "participant": participant,
        "items": lines,
        "subtotal": snap["subtotal"],
        "total": snap["total"],
        "host": host,
        "recipient": None,
        "fee_ratio": ratio,
        "paid": dict(pay) if pay else None,
    }


@app.post("/pay/{token}/confirm")
async def confirm_pay(token: str, request: Request):
    with get_db() as db:
        row = db.execute(
            "SELECT bill_id,snapshot_json,participant FROM shares WHERE id=? AND kind='pay'",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pay link not found")
    snap = json.loads(row["snapshot_json"])
    participant = row["participant"]
    body = await request.json()
    chosen = body.get("items", [])  # [{id, qty}]

    items_by_id = {i["id"]: i for i in snap["items"]}
    allowed = set(snap["assignments"].get(participant, []))
    ratio = _fee_ratio(snap)
    total = 0.0
    for c in chosen:
        if c.get("id") not in allowed:
            continue
        it = items_by_id[c["id"]]
        qty = max(1, int(c.get("qty", 1)))
        share_count = sum(1 for ids in snap["assignments"].values() if c["id"] in ids)
        total += it["price"] * qty / max(1, share_count)
    total = round(total * ratio)

    with get_db() as db:
        db.execute(
            "INSERT INTO payments (id,bill_id,participant,items_json,total) VALUES (?,?,?,?,?)",
            (uuid.uuid4().hex[:12], row["bill_id"], participant, json.dumps(chosen), total),
        )
    return {"ok": True, "total": total}


@app.get("/bills/{bill_id}/status")
async def bill_status(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT participants_json FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    participants = json.loads(row["participants_json"])
    with get_db() as db:
        pays = db.execute(
            "SELECT participant,total,paid_at FROM payments WHERE bill_id=?", (bill_id,)
        ).fetchall()
    paid = {p["participant"]: dict(p) for p in pays}
    return {"participants": [{"name": p, "paid": paid.get(p)} for p in participants]}
