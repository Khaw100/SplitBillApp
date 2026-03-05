"""
EasyOCR-based receipt reader.

EasyOCR returns bounding boxes (bbox) per detected text token. On receipts,
item names and prices are in SEPARATE columns, so EasyOCR may return them as
separate tokens with different X positions but the same Y position.

Key insight: we use each token's Y-coordinate (vertical center of bbox) to
GROUP tokens that belong to the same physical row, then parse name + price
per row. This is far more robust than trying to parse a flat list of tokens.

Model: easyocr (JaidedAI)
- Free, no API key needed  
- Supports Indonesian + English
- Install: pip install easyocr numpy
"""

import logging
import re

import numpy as np
from PIL import Image

from modules.data.receipt_data import ItemData, ReceiptData
from modules.utils import AIError

from .base import AIModel

logger = logging.getLogger(__name__)
LANGUAGES = ["en", "id"]

# Pixel tolerance: tokens within this many pixels vertically = same row
Y_ROW_TOLERANCE = 12

# ── Classifier patterns ────────────────────────────────────────────────────────
_PRICE_RE  = re.compile(r"^\$?(\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d{2})$")
_COUNT_RE  = re.compile(r"^\d{1,3}$")
_NAME_RE   = re.compile(r"^[A-Za-z][A-Za-z\s\-/&'.]{2,}$")

# ── Total / subtotal row ──────────────────────────────────────────────────────
_TOTAL_RE = re.compile(
    r"(?:grand\s*)?(?:total|subtotal|sub\s*total|jumlah|tagihan)[:\s]+\$?(?P<total>[\d,.]+)",
    re.IGNORECASE,
)

# ── Lines / rows to skip entirely ─────────────────────────────────────────────
_SKIP_RE = re.compile(
    r"(?:trace\s*#?|batch\s*#?|appr\s*#?|visa\b|mastercard|amex|"
    r"sale\b|approved|thank\s*you|customer\s*copy|"
    r"\d{1,2}/\d{1,2}/\d{4}|\d{1,2}:\d{2}\s*(?:am|pm)|"
    r"chicago|blvd|ave\b|street\b|tip\b)",
    re.IGNORECASE,
)


class EasyOCRModel(AIModel):
    """Receipt reader using EasyOCR with bbox-based row grouping.

    Instead of parsing a flat list of text tokens, we:
    1. Detect all text bounding boxes with EasyOCR.
    2. Group tokens by their vertical (Y) position within a tolerance.
    3. Within each row, identify name (leftmost text), count, and price.
    4. Filter out header/metadata rows.

    This handles receipts where name and price are in separate columns.
    Supports Indonesian + English. No API key required.
    """

    def __init__(self) -> None:
        """Initialize EasyOCR (lazy import to prevent startup crash)."""
        try:
            import easyocr
        except ImportError as e:
            raise ImportError(
                "EasyOCR not installed. Run: pip install easyocr"
            ) from e
        self.reader = easyocr.Reader(LANGUAGES, gpu=False)

    def run(self, image: Image.Image) -> ReceiptData:
        if image.mode != "RGB":
            image = image.convert("RGB")
        raw_results = self._detect(image)
        rows = self._group_by_row(raw_results)
        return self._parse_rows(rows)

    # ── Step 1: detect ────────────────────────────────────────────────────────

    def _detect(self, image: Image.Image) -> list[tuple]:
        """Run EasyOCR and return list of (x_center, y_center, text) tuples."""
        results = self.reader.readtext(np.array(image))

        print("\n" + "="*60)
        print("[EasyOCR] RAW BOUNDING BOX RESULTS:")
        detected = []
        for bbox, text, conf in results:
            if not text.strip():
                continue
            # bbox = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
            x_center = (bbox[0][0] + bbox[2][0]) / 2
            y_center = (bbox[0][1] + bbox[2][1]) / 2
            print(f"  y={y_center:6.1f}  x={x_center:6.1f}  conf={conf:.2f}  text={text!r}")
            detected.append((x_center, y_center, text.strip()))
        print("="*60 + "\n")
        return detected

    # ── Step 2: group into rows ───────────────────────────────────────────────

    def _group_by_row(self, tokens: list[tuple]) -> list[list[tuple]]:
        """Group (x, y, text) tokens into rows by Y proximity.

        Tokens within Y_ROW_TOLERANCE pixels of each other are in the same row.
        Each row is returned as a list of (x, text) sorted left-to-right.

        Args:
            tokens: list of (x_center, y_center, text)

        Returns:
            List of rows, each row is list of (x, text) sorted by x
        """
        row_centers: list[float] = []
        row_tokens: dict[float, list] = {}

        for x, y, text in sorted(tokens, key=lambda t: t[1]):  # sort by y
            matched = None
            for rc in row_centers:
                if abs(rc - y) <= Y_ROW_TOLERANCE:
                    matched = rc
                    break
            if matched is None:
                matched = y
                row_centers.append(y)
                row_tokens[matched] = []
            row_tokens[matched].append((x, text))

        # Return rows sorted top-to-bottom, tokens sorted left-to-right
        rows = []
        for rc in sorted(row_centers):
            row = sorted(row_tokens[rc], key=lambda t: t[0])
            rows.append(row)
        return rows

    # ── Step 3: parse rows ────────────────────────────────────────────────────

    def _parse_rows(self, rows: list[list[tuple]]) -> ReceiptData:
        """Parse each row into items or total.

        For each row:
        - Join all tokens into a full-row string for total/skip detection.
        - Separately classify each token as name / count / price by position.

        Args:
            rows: list of rows, each row = list of (x, text) sorted left-to-right

        Returns:
            ReceiptData: parsed result
        """
        items: list[ItemData] = []
        total: float = 0.0

        for row in rows:
            # Full row text for pattern matching
            row_text = " ".join(text for _, text in row).strip()
            logger.debug(f"[EasyOCR] row: {row_text!r}")

            # Skip header / metadata rows
            if _SKIP_RE.search(row_text):
                logger.debug(f"[EasyOCR] SKIP header: {row_text!r}")
                continue

            # Check for total row BEFORE allcaps check.
            # "SUBTOTAL: $29.47".isupper() = True (Python counts only cased chars),
            # so total rows would be incorrectly skipped by the allcaps filter
            # if we don't check for total first.
            tm = _TOTAL_RE.search(row_text)
            if tm:
                total = _to_float(tm.group("total"))
                logger.debug(f"[EasyOCR] TOTAL: {total} from {row_text!r}")
                continue

            # All-caps rows with no price = store header (skip)
            if row_text.isupper() and not _PRICE_RE.search(row_text):
                logger.debug(f"[EasyOCR] SKIP all-caps: {row_text!r}")
                continue

            # Classify each token in this row
            row_name  = None
            row_price = None
            row_count = 1

            for x, tok in row:
                if _PRICE_RE.match(tok):
                    row_price = _to_float(tok)
                elif _COUNT_RE.match(tok):
                    row_count = int(tok)
                elif _NAME_RE.match(tok):
                    # Take the longest name-like token (handles multi-word names)
                    if row_name is None or len(tok) > len(row_name):
                        row_name = tok

            logger.debug(
                f"[EasyOCR] row parsed: name={row_name!r}  "
                f"count={row_count}  price={row_price}"
            )

            if row_name and row_price:
                items.append(ItemData(
                    name=row_name,
                    count=row_count,
                    total_price=row_price,
                ))

        print("[EasyOCR] PARSED ITEMS:")
        for it in items:
            print(f"  name={it.name!r:30s}  count={it.count}  price={it.total_price}")
        print(f"[EasyOCR] TOTAL: {total}\n")

        if not items:
            raise AIError(
                "EasyOCR could not detect any menu items.\n"
                "Raw lines: " + " ".join(
                    text for row in rows for _, text in row
                )
            )

        if total == 0.0:
            total = sum(it.total_price for it in items)

        return ReceiptData(items={it.id: it for it in items}, total=total)


def _to_float(price_str: str) -> float:
    """Convert price string to float, handling $ sign and separators."""
    s = re.sub(r"[^\d.,]", "", price_str)
    if "." in s and "," in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") \
            else s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    return float(s) if s else 0.0