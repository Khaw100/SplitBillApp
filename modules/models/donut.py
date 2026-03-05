import re
import logging

import torch
from PIL import Image
from transformers import AutoModelForVision2Seq, AutoProcessor

from modules.data.receipt_data import ItemData, ReceiptData
from modules.utils import AIError

from .base import AIModel

logger = logging.getLogger(__name__)
MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"

_MENU_BLOCK_RE = re.compile(r"<s_menu>(.*?)</s_menu>", re.DOTALL)
_SEP_RE        = re.compile(r"<sep/>")
_TOTAL_RE      = re.compile(
    r"<s_total>.*?<s_total_price>\s*(?P<total>[^<]+?)\s*</", re.DOTALL
)

# Names that are receipt header/metadata — never real menu items.
# Uses "word\b.*" so even short codes like "TRACE #: 9" are caught.
_JUNK_NAME_RE = re.compile(
    r"^\s*(?:"
    r"trace\b.*|batch\b.*|appr\b.*|"
    r"visa\b.*|mastercard\b.*|amex\b.*|discover\b.*|"
    r"sale\b|approved\b|"
    r"thank\s*you.*|customer\s*copy.*|"
    r"subtotal\b.*|tax\b.*|tip\b.*|total\b.*|"
    r"\d{1,2}/\d{1,2}/\d{2,4}.*|"
    r"\d{1,2}:\d{2}\s*(?:am|pm).*|"
    r"[A-Z]{2,}[\s\w]*#[\s:]*[\w\d]+"
    r")\s*$",
    re.IGNORECASE,
)

# Looks like a menu item name: starts with letter, mostly letters/spaces, min 3 chars
_ITEM_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z\s\-/&'.]{2,}$")


def _extract_tag(text: str, tag: str) -> str | None:
    """Extract value of first opening <tag>, ignoring mismatched closing tag."""
    m = re.compile(
        rf"<{re.escape(tag)}>\s*(?P<value>.*?)\s*</[^>]+>", re.DOTALL
    ).search(text)
    return m.group("value").strip() if m else None


def _extract_all_tags(text: str, tag: str) -> list[str]:
    """Extract ALL occurrences of opening <tag> values."""
    return [
        m.group("value").strip()
        for m in re.compile(
            rf"<{re.escape(tag)}>\s*(?P<value>.*?)\s*</[^>]+>", re.DOTALL
        ).finditer(text)
    ]


def _is_junk_name(name: str) -> bool:
    """True if name looks like receipt metadata (not a real menu item)."""
    if not name or len(name.strip()) < 2:
        return True
    return bool(_JUNK_NAME_RE.match(name.strip()))


def _is_item_name(s: str) -> bool:
    """True if string looks like a menu item name."""
    return bool(_ITEM_NAME_RE.match(s.strip())) and not _is_junk_name(s)


def _has_price(s: str) -> bool:
    # Matches: $14.98  OR  59,000  OR  302,016  (Indonesian thousand-separator format)
    return bool(re.search(r"\$?\d[\d.,]+", s))


def _parse_menu_entries(raw: str) -> list[dict]:
    """Extract item entries from raw Donut output.

    Two key strategies over the naive approach:

    1. ORPHAN PRICE: When a junk chunk (e.g. TRACE #: 9) has a valid price
       assigned to it by Donut, that price actually belongs to the NEXT real
       item. We save it as an "orphan price" and assign it to the next item.

    2. HIDDEN ITEM in s_unitprice: Donut sometimes puts a second item name
       inside <s_unitprice> of the previous chunk. We detect this and create
       a separate entry for it, using the chunk's s_price as its price.
    """
    menu_match = _MENU_BLOCK_RE.search(raw)
    if not menu_match:
        logger.debug("[Donut] No <s_menu> block found.")
        return []

    chunks = _SEP_RE.split(menu_match.group(1))
    orphan_prices: list[float] = []
    entries: list[dict] = []

    for i, chunk in enumerate(chunks):
        chunk = chunk.strip()
        if not chunk:
            continue

        nm         = _extract_tag(chunk, "s_nm") or ""
        price_str  = _extract_tag(chunk, "s_price") or ""
        cnt_str    = _extract_tag(chunk, "s_cnt") or "1"
        unitprices = _extract_all_tags(chunk, "s_unitprice")

        logger.debug(
            f"[Donut] chunk {i}: nm={nm!r}  price={price_str!r}  "
            f"cnt={cnt_str!r}  unitprices={unitprices}"
        )
        print(
            f"[Donut] chunk {i}: nm={nm!r:30s}  price={price_str!r:10s}  "
            f"unitprices={unitprices}"
        )

        if _is_junk_name(nm):
            # Junk chunk — but save its price if valid (it belongs to next item)
            if _has_price(price_str):
                orphan = _to_float(price_str)
                orphan_prices.append(orphan)
                print(f"  → SKIP junk, save orphan price ${orphan}")
            else:
                print(f"  → SKIP junk, no valid price")
            # Also check if any unitprice holds a real item name (unlikely here)
            continue

        # Real item name — determine its price
        if orphan_prices:
            # Use the orphan price from the junk chunk that preceded this item
            item_price = orphan_prices.pop(0)
            print(f"  → ITEM {nm!r} ← orphan price ${item_price}")
        elif _has_price(price_str):
            item_price = _to_float(price_str)
            print(f"  → ITEM {nm!r} price=${item_price}")
        else:
            item_price = None
            print(f"  → ITEM {nm!r} no price — skipped")

        count = int(cnt_str) if re.fullmatch(r"\d+", cnt_str.strip()) else 1

        if item_price is not None:
            entries.append({
                "s_nm": nm, "s_cnt": str(count), "s_price": str(item_price)
            })

        # Check s_unitprice for hidden item names (Donut puts 2nd item here)
        for up in unitprices:
            if _is_item_name(up):
                # This unitprice IS a menu item name
                # Its price is the chunk's s_price (original, not orphan)
                if _has_price(price_str):
                    hidden_price = _to_float(price_str)
                    print(f"  → HIDDEN ITEM in unitprice: {up!r} price=${hidden_price}")
                    entries.append({
                        "s_nm": up, "s_cnt": "1", "s_price": str(hidden_price)
                    })
                else:
                    print(f"  → HIDDEN ITEM {up!r} but no price")

    return entries


class DonutModel(AIModel):
    """Receipt reader using Donut (naver-clova-ix/donut-base-finetuned-cord-v2).

    Runs fully locally — no API key required.
    Parses raw Donut output with regex (not xmltodict) to handle mismatched tags.

    Key improvements over vanilla Donut:
    - Filters junk chunks (TRACE#, BATCH#, dates, etc.)
    - Recovers orphan prices from filtered junk chunks
    - Detects hidden item names in s_unitprice fields
    """

    def __init__(self):
        self.processor = AutoProcessor.from_pretrained(MODEL_NAME)
        self.model = AutoModelForVision2Seq.from_pretrained(MODEL_NAME)

    def run(self, image: Image.Image) -> ReceiptData:
        decoder_input_ids, pixel_values = self._preprocess(image)
        generation_output = self._inference(decoder_input_ids, pixel_values)
        raw = self._decode(generation_output)
        return self._parse(raw)

    def _preprocess(self, image: Image.Image):
        decoder_input_ids = self.processor.tokenizer(
            "<s_cord-v2>", add_special_tokens=False
        ).input_ids
        decoder_input_ids = torch.tensor(decoder_input_ids).unsqueeze(0)
        pixel_values = self.processor(image, return_tensors="pt").pixel_values
        return decoder_input_ids, pixel_values

    def _inference(self, decoder_input_ids, pixel_values):
        return self.model.generate(
            pixel_values,
            decoder_input_ids=decoder_input_ids,
            max_length=self.model.decoder.config.max_position_embeddings,
            pad_token_id=self.processor.tokenizer.pad_token_id,
            eos_token_id=self.processor.tokenizer.eos_token_id,
            use_cache=True,
            num_beams=1,
            bad_words_ids=[[self.processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )

    def _decode(self, generation_output) -> str:
        decoded = self.processor.batch_decode(
            generation_output.sequences, skip_special_tokens=False
        )[0]
        decoded = decoded.replace(self.processor.tokenizer.eos_token, "")
        decoded = decoded.replace(self.processor.tokenizer.pad_token, "")
        decoded = re.sub(r"<unk>", "", decoded).strip()
        print("\n" + "="*60)
        print("[Donut] RAW MODEL OUTPUT:")
        print(decoded)
        print("="*60 + "\n")
        return decoded

    def _parse(self, raw: str) -> ReceiptData:
        entries = _parse_menu_entries(raw)
        if not entries:
            raise AIError(
                "Donut could not detect any menu items.\n"
                f"Raw output:\n{raw}"
            )

        items: list[ItemData] = []
        for entry in entries:
            cnt_str = entry["s_cnt"].strip()
            count   = int(cnt_str) if re.fullmatch(r"\d+", cnt_str) else 1
            price   = _to_float(entry["s_price"])
            items.append(ItemData(name=entry["s_nm"], count=count, total_price=price))

        total_match = _TOTAL_RE.search(raw)
        total = _to_float(total_match.group("total")) if total_match \
            else sum(it.total_price for it in items)

        print("[Donut] PARSED ITEMS:")
        for it in items:
            print(f"  name={it.name!r:30s}  count={it.count}  price={it.total_price}")
        print(f"[Donut] TOTAL: {total}\n")

        return ReceiptData(items={it.id: it for it in items}, total=total)


def _to_float(price_str: str) -> float:
    cleaned = re.sub(r"[^\d.]", "", str(price_str).replace(",", ""))
    return float(cleaned) if cleaned else 0.0