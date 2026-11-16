"""SplitBill v2 API — FastAPI.

Auth via signed cookie; receipt parsing delegated to the vision LLM whose
config is fetched from Wipiii Hub (project-scoped). Bills + shares in SQLite.

Single-user app: the owner keeps their name / phone / payment accounts in
`settings`. A bill records who the host is (defaults to the owner); the host's
bank details are only exposed on pay pages when the host *is* the owner.
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

_CFG_CACHE = {"data": None, "at": 0.0}
_CFG_TTL = 60

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
CREATE TABLE IF NOT EXISTS claims (
  bill_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  items_json TEXT NOT NULL,            -- {item_id: qty}
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bill_id, participant)
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


def hub_app_config(force: bool = False) -> dict:
    """This project's generic app config from Wipiii Hub (source of truth).

    Owner profile (name / phone / payout accounts) lives in the Hub project's
    App Config JSON, edited from the Hub project page. Cached briefly so a bill
    page with several participants does not hammer the Hub API.
    """
    import time

    import httpx

    now = time.time()
    if not force and _CFG_CACHE["data"] is not None and now - _CFG_CACHE["at"] < _CFG_TTL:
        return _CFG_CACHE["data"]

    project_key = os.environ.get("HUB_PROJECT_API_KEY", "")
    if not project_key:
        return {}
    cfg: dict = {}
    try:
        r = httpx.get(
            f"{HUB_BASE}/projects/{HUB_PROJECT_ID}/app-config",
            headers={"Authorization": f"Bearer {project_key}"},
            timeout=8,
        )
        if r.status_code == 200:
            cfg = r.json().get("config", {}) or {}
    except Exception:
        cfg = {}
    if cfg:
        _CFG_CACHE["data"] = cfg
        _CFG_CACHE["at"] = now
    return cfg


def normalize_account(a: dict) -> dict:
    """Accept both {type,name,number,holder} (legacy) and {label,number,holder}."""
    return {
        "label": (a.get("label") or a.get("name") or a.get("type") or "").strip(),
        "number": (a.get("number") or "").strip(),
        "holder": (a.get("holder") or "").strip(),
    }


# ── Hub common codes (payout accounts) ───────────────────────────────────────
_SA_TOKEN = {"value": None, "exp": 0.0}
_ACCT_CACHE = {"data": None, "at": 0.0}


def hub_service_token(force: bool = False) -> str:
    """Access token for the Hub service account scoped to the accounts code."""
    import time

    import httpx

    cid = os.environ.get("HUB_SA_CLIENT_ID", "")
    secret = os.environ.get("HUB_SA_CLIENT_SECRET", "")
    if not cid or not secret:
        return ""
    now = time.time()
    if not force and _SA_TOKEN["value"] and _SA_TOKEN["exp"] > now:
        return _SA_TOKEN["value"] or ""
    try:
        r = httpx.post(
            f"{HUB_BASE}/common/token",
            json={"client_id": cid, "client_secret": secret},
            timeout=8,
        )
        if r.status_code != 200:
            return ""
        d = r.json()
        _SA_TOKEN["value"] = d.get("access_token")
        _SA_TOKEN["exp"] = now + int(d.get("expires_in") or 3600) - 120
        return _SA_TOKEN["value"] or ""
    except Exception:
        return ""


def hub_common_accounts(force: bool = False) -> list[dict]:
    """Owner payout accounts from a Hub common-code group (e.g. `personal-data`).

    Wipiii keeps his bank/e-wallet rows in Hub → Common Codes, so client apps read
    them with the service-account token instead of duplicating them in app config.
    detail.attr1 = account number, attr2 = optional account holder.
    """
    import time

    import httpx

    key = os.environ.get("HUB_ACCOUNTS_CODE", "")
    if not key:
        return []
    now = time.time()
    if not force and _ACCT_CACHE["data"] is not None and now - _ACCT_CACHE["at"] < _CFG_TTL:
        return _ACCT_CACHE["data"] or []

    token = hub_service_token()
    if not token:
        return []
    try:
        r = httpx.get(
            f"{HUB_BASE}/common/{key}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=8,
        )
        if r.status_code != 200:
            return []
        rows = []
        for d in r.json().get("details", []):
            number = (d.get("attr1") or "").strip()
            if not number:
                continue
            rows.append(
                {
                    "label": (d.get("name") or "").strip(),
                    "number": number,
                    "holder": (d.get("attr2") or "").strip(),
                }
            )
    except Exception:
        return []
    _ACCT_CACHE["data"] = rows
    _ACCT_CACHE["at"] = now
    return rows


def read_settings() -> dict:
    """Owner profile: Hub common codes for accounts, Hub app config for name/phone."""
    cfg = hub_app_config()
    name = (cfg.get("owner_name") or cfg.get("recipient_name") or "").strip()
    phone = (cfg.get("owner_phone") or cfg.get("recipient_phone") or "").strip()

    # Payout accounts live in Hub → Common Codes (group key from HUB_ACCOUNTS_CODE).
    accounts = hub_common_accounts()
    if not accounts:
        raw_accounts = cfg.get("owner_accounts") or cfg.get("recipient_accounts") or []
        accounts = [normalize_account(a) for a in raw_accounts if (a.get("number") or "").strip()]

    if not name and not phone and not accounts:
        with get_db() as db:
            row = db.execute(
                "SELECT name,phone,accounts_json FROM settings WHERE id=1"
            ).fetchone()
        if row:
            name = row["name"] or ""
            phone = row["phone"] or ""
            accounts = [normalize_account(a) for a in json.loads(row["accounts_json"] or "[]")]

    # A phone-number based e-wallet row doubles as the WhatsApp/contact number.
    if not phone:
        for a in accounts:
            digits = "".join(ch for ch in a["number"] if ch.isdigit())
            if digits.startswith("08") and 10 <= len(digits) <= 14:
                phone = a["number"]
                break

    if not name:
        name = os.environ.get("OWNER_NAME") or "Wipiii"
    return {"name": name, "phone": phone, "accounts": accounts}


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
    """Read-only: the owner profile is managed in Wipiii Hub (project App Config)."""
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
- price is the UNIT price (price for 1 qty). If the receipt only prints the line
  total for a qty > 1 line, divide it by qty.
- qty = pack quantity if item sold per-pack
- If not a receipt at all: {"is_receipt": false}
- Copy item names as printed (keep original language)
- Copy the signed price EXACTLY as printed. A line showing (10,100) or -10,100 is a
  DISCOUNT/VOUCHER line: keep it as a negative price, do NOT drop it and do NOT merge
  its amount into another item's price. Discount lines keep their printed name.
- Do NOT include payment/tender lines as items: skip KEMBALI / CHANGE / TUNAI / CASH /
  BAYAR / DEBIT / CREDIT / QRIS / E-WALLET, and tax (PPN/DPP) summary lines.
- One item per printed product line. Do not rename, split, or combine lines.
- CHECK YOUR MATH: sum(item.price * item.qty) must equal subtotal. If it does not, you misread a
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
    validate_bill_body(body)
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
                json.dumps(body.get("assignments") or {}),
                json.dumps(body["participants"]),
                host_name,
                1 if host_is_owner else 0,
            ),
        )
    return {"id": bill_id}


def validate_bill_body(body: dict) -> None:
    items = body.get("items")
    participants = body.get("participants")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=422, detail="Bill needs at least one item")
    if not all(isinstance(i, dict) and isinstance(i.get("id"), str) for i in items):
        raise HTTPException(status_code=422, detail="Invalid items")
    if not isinstance(participants, list) or not participants:
        raise HTTPException(status_code=422, detail="Bill needs at least one participant")
    if not isinstance(body.get("assignments", {}), dict):
        raise HTTPException(status_code=422, detail="Invalid assignments")
    try:
        total = float(body.get("total") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid total")
    if total <= 0:
        raise HTTPException(status_code=422, detail="Total must be greater than 0")


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
    result, unclaimed = _bill_result(d)
    claims = _claims_for(bill_id)
    return {
        "result": result,
        "host": _host_of(d),
        "unclaimed": unclaimed,
        "chosen": sorted(claims.keys()),
        "participants": json.loads(d["participants_json"]),
    }


@app.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        cur = db.execute("DELETE FROM bills WHERE id=?", (bill_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Bill not found")
        # Pay links and self-reported data must die with the bill.
        db.execute("DELETE FROM shares WHERE bill_id=?", (bill_id,))
        db.execute("DELETE FROM claims WHERE bill_id=?", (bill_id,))
        db.execute("DELETE FROM payments WHERE bill_id=?", (bill_id,))
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


def _items_total(snap: dict) -> float:
    """What the printed items add up to, before tax/service/discount."""
    return float(sum(i["price"] * i["qty"] for i in snap["items"]))


def _fee_ratio(snap: dict) -> float:
    """How much tax/service/discount scales every item line (1.0 = none)."""
    base = _items_total(snap)
    return (float(snap["total"]) / base) if base else 1.0


def _unit_scale(item: dict, claimed_units: int) -> float:
    """Fraction of the printed unit price a claimer actually pays.

    Claims are in printed units, so one claimant of one unit pays the unit price.
    Only when people over-claim (more units claimed than printed) does the cost
    get scaled down so the bill is never over-collected.
    """
    qty = max(1, int(item["qty"]))
    if claimed_units <= qty:
        return 1.0
    return qty / claimed_units


def _split_result(snap: dict) -> list[dict]:
    """Per-participant totals, computed server-side.

    Tax/service/discount is spread proportionally over what was actually
    assigned (never over the stored subtotal, which can disagree with the line
    items on edited receipts), so the parts always add up to the bill total.
    """
    items_by_id = {i["id"]: i for i in snap["items"]}
    assignments = {name: list(dict.fromkeys(ids)) for name, ids in snap["assignments"].items()}
    share_count = {
        iid: sum(1 for ids in assignments.values() if iid in ids) for iid in items_by_id
    }
    raw: list[dict] = []
    for name, item_ids in assignments.items():
        lines, sub = [], 0.0
        for iid in item_ids:
            it = items_by_id.get(iid)
            if not it:
                continue
            sc = max(1, share_count.get(iid, 1))
            line_total = it["price"] * it["qty"] / sc
            sub += line_total
            lines.append({**it, "line_total": round(line_total), "shared_by": sc})
        raw.append({"name": name, "lines": lines, "exact": sub, "subtotal": round(sub)})

    # Largest-remainder rounding so the per-person totals add up to the bill
    # total exactly (plain round() can drift by a few rupiah).
    assigned = sum(p["exact"] for p in raw)
    grand = round(float(snap["total"]))
    exact = [p["exact"] / assigned * grand if assigned else 0.0 for p in raw]
    totals = [math.floor(x) for x in exact]
    leftover = grand - sum(totals)
    for i in sorted(range(len(raw)), key=lambda i: exact[i] - totals[i], reverse=True)[: max(0, leftover)]:
        totals[i] += 1
    return [
        {"name": p["name"], "lines": p["lines"], "subtotal": p["subtotal"],
         "total": totals[i], "others": totals[i] - p["subtotal"]}
        for i, p in enumerate(raw)
    ]


def _claims_for(bill_id: str) -> dict[str, dict[str, int]]:
    """{participant: {item_id: qty}} as picked by the participants themselves."""
    with get_db() as db:
        rows = db.execute(
            "SELECT participant,items_json FROM claims WHERE bill_id=?", (bill_id,)
        ).fetchall()
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        try:
            raw = json.loads(r["items_json"] or "{}")
        except json.JSONDecodeError:
            raw = {}
        picked = {}
        for k, v in raw.items():
            try:
                if int(v) > 0:
                    picked[k] = int(v)
            except (TypeError, ValueError):
                continue
        # An empty checklist means "hasn't picked yet", not "picked nothing".
        if picked:
            out[r["participant"]] = picked
    return out


def _result_from_claims(snap: dict, claims: dict[str, dict[str, int]]) -> tuple[list[dict], int]:
    """Per-participant totals from self-service checklists.

    Each participant ticks the printed units they took, so a 2x35.000 line ticked
    once costs 35.000. Over-claiming (more units ticked than printed) scales the
    unit price down so the bill is never over-collected; under-claiming leaves the
    remainder with the host ("bagianmu"). Tax/service/discount then scales every
    line by the same ratio.
    """
    items_by_id = {i["id"]: i for i in snap["items"]}
    ratio = _fee_ratio(snap)

    claimed_units: dict[str, int] = {}
    for its in claims.values():
        for iid, q in its.items():
            claimed_units[iid] = claimed_units.get(iid, 0) + q

    raw: list[dict] = []
    for name, its in claims.items():
        lines, sub = [], 0.0
        for iid, q in its.items():
            it = items_by_id.get(iid)
            if not it:
                continue
            scale = _unit_scale(it, claimed_units.get(iid, q))
            line_total = it["price"] * q * scale
            sub += line_total
            lines.append(
                {**it, "qty": q, "units": max(it["qty"], claimed_units.get(iid, q)),
                 "line_total": round(line_total)}
            )
        raw.append({"name": name, "lines": lines, "subtotal": round(sub)})

    result = []
    for p in raw:
        total = round(p["subtotal"] * ratio)
        result.append({**p, "total": total, "others": total - p["subtotal"]})

    # Whatever the participants did not pick stays with the host.
    unclaimed = round(float(snap["total"]) - sum(p["total"] for p in result))
    return result, unclaimed


def _bill_result(bill: dict) -> tuple[list[dict], int]:
    """Dispatcher: legacy hand-assigned bills keep their old math, new bills use claims."""
    snap = _bill_snapshot(bill)
    if snap["assignments"]:
        return _split_result(snap), 0
    claims = _claims_for(bill["id"])
    return _result_from_claims(snap, claims)


@app.post("/bills/{bill_id}/share")
async def share_bill(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    snapshot = _bill_snapshot(dict(row))
    with get_db() as db:
        # Bills are immutable: reuse the existing view link instead of piling up rows.
        existing = db.execute(
            "SELECT id FROM shares WHERE bill_id=? AND kind='view' ORDER BY created_at DESC LIMIT 1",
            (bill_id,),
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
        row = db.execute(
            "SELECT bill_id,snapshot_json,created_at FROM shares WHERE id=?", (share_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Share not found")
    snap = json.loads(row["snapshot_json"])
    snap["created_at"] = row["created_at"]
    snap["host"] = _snapshot_host(snap)
    with get_db() as db:
        bill = db.execute("SELECT * FROM bills WHERE id=?", (row["bill_id"],)).fetchone()
    if not bill:
        raise HTTPException(status_code=404, detail="Share not found")
    result, unclaimed = _bill_result(dict(bill))
    snap["result"] = result
    snap["unclaimed"] = unclaimed
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
        alive = (
            db.execute("SELECT id FROM bills WHERE id=?", (row["bill_id"],)).fetchone()
            if row
            else None
        )
    if not row or not alive:
        raise HTTPException(status_code=404, detail="Pay link not found")
    snap = json.loads(row["snapshot_json"])
    participant = row["participant"]
    host = _snapshot_host(snap)
    ratio = _fee_ratio(snap)
    claims = _claims_for(row["bill_id"])
    mine = claims.get(participant, {})
    claimed_units: dict[str, int] = {}
    for its in claims.values():
        for iid, q in its.items():
            claimed_units[iid] = claimed_units.get(iid, 0) + q

    items = []
    for it in snap["items"]:
        scale = _unit_scale(it, claimed_units.get(it["id"], 0))
        my_q = mine.get(it["id"], 0)
        items.append(
            {
                **it,
                "unit_scale": round(scale, 4),
                "claimed_by_others": sum(
                    1 for p, its in claims.items() if p != participant and it["id"] in its
                ),
                "my_qty": my_q,
                "line_total": round(it["price"] * my_q * scale * ratio),
            }
        )

    my_total = round(sum(it["price"] * it["my_qty"] * it["unit_scale"] for it in items) * ratio)

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
        "items": items,
        "subtotal": snap["subtotal"],
        "total": snap["total"],
        "my_total": my_total,
        "chosen": bool(mine),
        "host": host,
        "recipient": None,
        "fee_ratio": ratio,
        "paid": dict(pay) if pay else None,
    }


def _clean_claim(snap: dict, chosen: list[dict]) -> dict[str, int]:
    valid = {i["id"]: i for i in snap["items"]}
    out: dict[str, int] = {}
    for c in chosen:
        iid = c.get("id")
        if not isinstance(iid, str) or iid not in valid:
            continue
        try:
            qty = int(c.get("qty", 0))
        except (TypeError, ValueError):
            continue
        cap = max(1, int(valid[iid]["qty"]))
        if qty > 0:
            out[iid] = min(qty, cap)
    return out


def _claim_total(bill_id: str, snap: dict, participant: str, mine: dict[str, int]) -> int:
    """Total for one participant, with everyone else's current picks included."""
    claims = _claims_for(bill_id)
    claims[participant] = mine
    result, _ = _result_from_claims(snap, claims)
    for p in result:
        if p["name"] == participant:
            return p["total"]
    return 0


@app.post("/pay/{token}/claim")
async def save_claim(token: str, request: Request):
    """Save the checklist a participant ticked (no payment implied)."""
    with get_db() as db:
        row = db.execute(
            "SELECT bill_id,snapshot_json,participant FROM shares WHERE id=? AND kind='pay'",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Pay link not found")
    snap = json.loads(row["snapshot_json"])
    body = await request.json()
    mine = _clean_claim(snap, body.get("items", []))
    with get_db() as db:
        db.execute(
            "INSERT INTO claims (bill_id,participant,items_json,updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(bill_id,participant) DO UPDATE SET items_json=excluded.items_json, updated_at=datetime('now')",
            (row["bill_id"], row["participant"], json.dumps(mine)),
        )
    return {"ok": True, "items": mine, "total": _claim_total(row["bill_id"], snap, row["participant"], mine)}


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
    mine = _clean_claim(snap, body.get("items", []))

    with get_db() as db:
        db.execute(
            "INSERT INTO claims (bill_id,participant,items_json,updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(bill_id,participant) DO UPDATE SET items_json=excluded.items_json, updated_at=datetime('now')",
            (row["bill_id"], participant, json.dumps(mine)),
        )
    total = _claim_total(row["bill_id"], snap, participant, mine)
    with get_db() as db:
        db.execute(
            "INSERT INTO payments (id,bill_id,participant,items_json,total) VALUES (?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12],
                row["bill_id"],
                participant,
                json.dumps([{"id": k, "qty": v} for k, v in mine.items()]),
                total,
            ),
        )
    return {"ok": True, "total": total}


@app.get("/bills/{bill_id}/status")
async def bill_status(bill_id: str, user: str = Depends(require_user)):
    with get_db() as db:
        row = db.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bill not found")
    d = dict(row)
    participants = json.loads(d["participants_json"])
    result, unclaimed = _bill_result(d)
    totals = {p["name"]: p["total"] for p in result}
    with get_db() as db:
        pays = db.execute(
            "SELECT participant,total,paid_at FROM payments WHERE bill_id=?", (bill_id,)
        ).fetchall()
    paid = {p["participant"]: dict(p) for p in pays}
    return {
        "unclaimed": unclaimed,
        "participants": [
            {
                "name": p,
                "chosen": p in totals,
                "total": totals.get(p, 0),
                "paid": paid.get(p),
            }
            for p in participants
        ],
    }
