"""
TrOCR-based receipt reader.

Pipeline:
  1. _crop_receipt()      — detect & crop receipt from background (OpenCV contours)
  2. _deskew()            — straighten tilted receipt
  3. _preprocess_image()  — contrast stretch + sharpen + 2× upscale
  4. _slice_into_lines()  — row-projection → horizontal strips
  5. _ocr_strips()        — TrOCR on each strip
  6. _parse_lines()       — regex → ReceiptData

Model: microsoft/trocr-large-printed
Install: pip install transformers torch pillow numpy opencv-python
"""

import logging
import re

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

from modules.data.receipt_data import ItemData, ReceiptData
from modules.utils import AIError

from .base import AIModel

logger = logging.getLogger(__name__)
MODEL_NAME = "microsoft/trocr-large-printed"

# ── Item patterns ─────────────────────────────────────────────────────────────
_PRICE_RE = r"\$?(?P<price>\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)"

_ITEM_COUNT_FIRST = re.compile(
    rf"^(?P<count>\d{{1,3}})\s+(?P<name>[A-Za-z][\w\s\-/&'.{{}}]{{2,}}?)\s+{_PRICE_RE}\s*$",
    re.IGNORECASE,
)
_ITEM_COUNT_MID = re.compile(
    rf"^(?P<name>[A-Za-z][\w\s\-/&'.{{}}]{{2,}}?)\s+(?P<count>\d{{1,3}})\s+{_PRICE_RE}\s*$",
    re.IGNORECASE,
)
_ITEM_NO_COUNT = re.compile(
    rf"^(?P<name>[A-Za-z][\w\s\-/&'.{{}}]{{2,}}?)\s+{_PRICE_RE}\s*$",
    re.IGNORECASE,
)

_TOTAL_PATTERN = re.compile(
    r"^(?:grand\s*)?(?:total|sub\s*total|subtotal|jumlah|tagihan)[:\s]+\$?(?P<total>[\d,.]+)",
    re.IGNORECASE,
)
_TAX_PATTERN      = re.compile(r"^(?:tax|pajak|ppn)[:\s]+\$?(?P<tax>[\d,.]+)", re.IGNORECASE)
_SERVICE_PATTERN  = re.compile(r"^(?:service(?:\s*charge)?)[:\s]+\$?(?P<service>[\d,.]+)", re.IGNORECASE)
_DISCOUNT_PATTERN = re.compile(r"^(?:discount|diskon)[:\s]+\$?(?P<discount>[\d,.]+)", re.IGNORECASE)

_SKIP_RE = re.compile(
    r"(?:trace\s*#?|batch\s*#?|appr\s*#?|visa\b|mastercard|amex|"
    r"sale\b|approved|thank\s*you|customer\s*copy|tip\b|"
    r"\d{1,2}/\d{1,2}/\d{4}|\d{1,2}:\d{2}\s*(?:am|pm)|"
    r"[A-Z]{2,}\s+\d{4,})",
    re.IGNORECASE,
)


class TrOCRModel(AIModel):
    """Receipt reader using Microsoft TrOCR (line-by-line OCR)."""

    def __init__(self) -> None:
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        except ImportError as e:
            raise ImportError(
                "transformers not installed. Run: pip install transformers torch"
            ) from e
        self.processor = TrOCRProcessor.from_pretrained(MODEL_NAME)
        self.model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)

    def run(self, image: Image.Image) -> ReceiptData:
        # ── Step 1: crop receipt from background (e.g. wooden table) ──────────
        image = self._crop_receipt(image)
        # ── Step 2: deskew — straighten tilted receipt ────────────────────────
        image = self._deskew(image)
        # ── Step 3: enhance contrast + sharpen + upscale ──────────────────────
        image = self._preprocess_image(image)
        # ── Step 4: slice into per-line strips ────────────────────────────────
        strips = self._slice_into_lines(image)
        # ── Step 5: OCR each strip ────────────────────────────────────────────
        lines = self._ocr_strips(strips)
        # ── Step 6: parse text → ReceiptData ─────────────────────────────────
        return self._parse_lines(lines)

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 1 — Crop receipt from background
    # ══════════════════════════════════════════════════════════════════════════

    def _crop_receipt(self, image: Image.Image) -> Image.Image:
        """
        Detect the receipt (white rectangle) and crop it from the background.

        Strategy:
          1. Convert to grayscale, blur, threshold → binary mask
          2. Find external contours, pick the largest quadrilateral
          3. Perspective-warp the quad to a flat rectangle (bird's-eye view)
          4. If no good quad found, fall back to the original image

        This removes wooden-table / coloured backgrounds that confuse
        the row-projection slicer.
        """
        img_cv = _pil_to_cv(image)
        gray   = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

        # Blur + adaptive threshold to handle uneven lighting
        blur   = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Morphological close to fill holes in receipt body
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            logger.debug("[TrOCR] crop: no contours found, using original")
            return image

        # Pick the largest contour (should be the receipt)
        largest = max(contours, key=cv2.contourArea)
        img_area = img_cv.shape[0] * img_cv.shape[1]

        # Only crop if contour covers at least 10% of the image
        if cv2.contourArea(largest) < img_area * 0.10:
            logger.debug("[TrOCR] crop: largest contour too small, using original")
            return image

        # Approximate contour to a polygon
        peri   = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)

        if len(approx) == 4:
            # Perfect quad → perspective warp
            pts = approx.reshape(4, 2).astype(np.float32)
            warped = _four_point_transform(img_cv, pts)
            logger.debug(f"[TrOCR] crop: perspective warp applied, shape={warped.shape}")
            return _cv_to_pil(warped)
        else:
            # Not a clean quad → use bounding rect crop instead
            x, y, w, h = cv2.boundingRect(largest)
            cropped = img_cv[y:y+h, x:x+w]
            logger.debug(f"[TrOCR] crop: bounding rect crop {x},{y} {w}×{h}")
            return _cv_to_pil(cropped)

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 2 — Deskew
    # ══════════════════════════════════════════════════════════════════════════

    def _deskew(self, image: Image.Image) -> Image.Image:
        """
        Straighten a slightly rotated receipt using the dominant text angle.

        Strategy:
          1. Threshold to binary
          2. Find all text pixel coordinates
          3. Use minAreaRect to get the dominant rotation angle
          4. Rotate image to correct the skew
          5. Skip if angle is already within ±0.5° (no-op)
        """
        img_cv = _pil_to_cv(image)
        gray   = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Coordinates of all dark (text) pixels
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 100:
            logger.debug("[TrOCR] deskew: not enough pixels, skipping")
            return image

        # minAreaRect returns angle in [-90, 0)
        rect  = cv2.minAreaRect(coords)
        angle = rect[-1]

        # Convert to a sensible rotation angle
        if angle < -45:
            angle = 90 + angle   # e.g. -80° → +10°

        if abs(angle) < 0.5:
            logger.debug(f"[TrOCR] deskew: angle={angle:.2f}° — skipping (within tolerance)")
            return image

        logger.debug(f"[TrOCR] deskew: rotating by {-angle:.2f}°")
        h, w   = img_cv.shape[:2]
        center = (w // 2, h // 2)
        M      = cv2.getRotationMatrix2D(center, angle, 1.0)

        # White background fill for rotated corners
        rotated = cv2.warpAffine(
            img_cv, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(255, 255, 255),
        )
        return _cv_to_pil(rotated)

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 3 — Full-image preprocessing
    # ══════════════════════════════════════════════════════════════════════════

    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Enhance receipt image quality before slicing and OCR:

          1. Grayscale          — strip colour noise
          2. Histogram stretch  — fix low-contrast thermal prints
                                  (maps p5→p95 range to 0→255)
          3. Sharpen            — crisp up blurry text edges
          4. 2× upscale         — TrOCR reads larger text more accurately
          5. RGB convert        — model expects 3-channel input
        """
        gray = image.convert("L")
        arr  = np.array(gray, dtype=np.float32)

        p5, p95 = np.percentile(arr, 5), np.percentile(arr, 95)
        logger.debug(f"[TrOCR] preprocess — p5={p5:.1f}  p95={p95:.1f}  range={p95-p5:.1f}")
        if p95 > p5:
            arr = np.clip((arr - p5) / (p95 - p5) * 255, 0, 255)
        enhanced = Image.fromarray(arr.astype(np.uint8), mode="L")

        enhanced = enhanced.filter(ImageFilter.SHARPEN)

        w, h = enhanced.size
        enhanced = enhanced.resize((w * 2, h * 2), Image.LANCZOS)
        logger.debug(f"[TrOCR] preprocess — upscaled to {w*2}×{h*2}")

        return enhanced.convert("RGB")

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 4 — Slice into line strips
    # ══════════════════════════════════════════════════════════════════════════

    def _slice_into_lines(self, image: Image.Image) -> list[Image.Image]:
        """Split receipt into horizontal line strips via row-darkness projection."""
        gray = np.array(image.convert("L"))
        h, w = gray.shape
        row_darkness = 255 - gray.mean(axis=1)

        threshold = max(4, row_darkness.max() * 0.03)
        has_text  = row_darkness > threshold
        logger.debug(f"[TrOCR] slice — threshold={threshold:.2f}  max_dark={row_darkness.max():.2f}")

        # Bridge gaps ≤3 px
        gap_close = 3
        closed = has_text.copy()
        for y in range(h):
            if has_text[y]:
                closed[max(0, y - gap_close): y + gap_close + 1] = True

        strips, in_text, start, padding = [], False, 0, 6
        for y in range(h):
            if closed[y] and not in_text:
                in_text, start = True, y
            elif not closed[y] and in_text:
                in_text = False
                if y - start >= 6:
                    strips.append(image.crop((0, max(0, start - padding), w, min(h, y + padding))))
        if in_text and h - start >= 6:
            strips.append(image.crop((0, max(0, start - padding), w, h)))

        logger.debug(f"[TrOCR] sliced into {len(strips)} strips")
        return strips if strips else [image]

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 5 — OCR each strip
    # ══════════════════════════════════════════════════════════════════════════

    def _preprocess_strip(self, strip: Image.Image) -> Image.Image:
        """Light contrast boost per strip — prevents TrOCR blank/garbage output."""
        return ImageEnhance.Contrast(strip.convert("RGB")).enhance(1.5)

    def _ocr_strips(self, strips: list[Image.Image]) -> list[str]:
        lines = []
        for i, strip in enumerate(strips):
            strip = self._preprocess_strip(strip)
            pv    = self.processor(strip, return_tensors="pt").pixel_values
            ids   = self.model.generate(pv)
            text  = self.processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            logger.debug(f"[TrOCR] strip {i:03d}: {text!r}")
            if text:
                lines.append(text)

        print("\n" + "="*60)
        print("[TrOCR] ALL OCR LINES:")
        for i, line in enumerate(lines):
            print(f"  [{i:03d}] {line!r}")
        print("="*60 + "\n")
        return lines

    # ══════════════════════════════════════════════════════════════════════════
    # STEP 6 — Parse text → ReceiptData
    # ══════════════════════════════════════════════════════════════════════════

    def _parse_lines(self, lines: list[str]) -> ReceiptData:
        items: list[ItemData] = []
        total    = subtotal = tax_sum = service = discount = 0.0

        for line in lines:
            if _SKIP_RE.search(line):
                logger.debug(f"[TrOCR] SKIP: {line!r}")
                continue
            if m := _SERVICE_PATTERN.match(line):
                service = _to_float(m.group("service")); continue
            if m := _DISCOUNT_PATTERN.match(line):
                discount = _to_float(m.group("discount")); continue
            if m := _TAX_PATTERN.match(line):
                tax_sum += _to_float(m.group("tax")); continue
            if m := _TOTAL_PATTERN.match(line):
                val = _to_float(m.group("total"))
                if "sub" in line.lower():
                    subtotal = val
                else:
                    total = val
                continue

            item = (
                _try_item(_ITEM_COUNT_FIRST, line)
                or _try_item(_ITEM_COUNT_MID, line)
                or _try_item(_ITEM_NO_COUNT,  line)
            )
            if item:
                logger.debug(f"[TrOCR] ITEM: {item.name!r}  x{item.count}  {item.total_price}")
                items.append(item)
            else:
                logger.debug(f"[TrOCR] NO MATCH: {line!r}")

        print("[TrOCR] PARSED ITEMS:")
        for it in items:
            print(f"  {it.name!r}  x{it.count}  {it.total_price}")
        print(f"[TrOCR] subtotal={subtotal}  tax={tax_sum}  service={service}  discount={discount}  total={total}\n")

        if not items:
            raise AIError(
                "TrOCR could not detect any menu items.\n"
                "Raw OCR lines:\n" + "\n".join(lines)
            )

        items_sum = sum(it.total_price for it in items)
        if total == 0.0:
            total = (subtotal + service + tax_sum - discount) if subtotal > 0 else items_sum
            print(f"[TrOCR] Reconstructed total: {total}")
        elif total > items_sum * 2.0:
            logger.warning(f"[TrOCR] total {total} > 2× items_sum {items_sum:.2f} — likely OCR error")
            total = (subtotal + service + tax_sum - discount) if subtotal > 0 else items_sum
            print(f"[TrOCR] Fallback total: {total}")

        return ReceiptData(items={it.id: it for it in items}, total=total)


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _pil_to_cv(image: Image.Image) -> np.ndarray:
    """PIL RGB → OpenCV BGR."""
    return cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)


def _cv_to_pil(img_cv: np.ndarray) -> Image.Image:
    """OpenCV BGR → PIL RGB."""
    return Image.fromarray(cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB))


def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """
    Perspective-warp a quadrilateral region to a flat rectangle.
    pts: 4 corner points in any order.
    """
    # Order points: top-left, top-right, bottom-right, bottom-left
    rect = _order_points(pts)
    tl, tr, br, bl = rect

    # Width = max of top-edge and bottom-edge lengths
    width = int(max(
        np.linalg.norm(br - bl),
        np.linalg.norm(tr - tl),
    ))
    # Height = max of left-edge and right-edge lengths
    height = int(max(
        np.linalg.norm(tr - br),
        np.linalg.norm(tl - bl),
    ))

    dst = np.array([
        [0,         0         ],
        [width - 1, 0         ],
        [width - 1, height - 1],
        [0,         height - 1],
    ], dtype=np.float32)

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (width, height))


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Return points ordered: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s    = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]     # top-left     (smallest x+y)
    rect[2] = pts[np.argmax(s)]     # bottom-right (largest  x+y)
    rect[1] = pts[np.argmin(diff)]  # top-right    (smallest x-y)
    rect[3] = pts[np.argmax(diff)]  # bottom-left  (largest  x-y)
    return rect


def _try_item(pattern: re.Pattern, line: str) -> "ItemData | None":
    from modules.data.receipt_data import ItemData
    m = pattern.match(line.strip())
    if not m:
        return None
    name  = m.group("name").strip()
    price = _to_float(m.group("price"))
    try:
        count = int(m.group("count"))
    except (IndexError, TypeError):
        count = 1
    return ItemData(name=name, count=count, total_price=price) if price > 0 else None


def _to_float(price_str: str) -> float:
    """
    Parse price strings in western and Indonesian formats:
      "14.98"    →  14.98
      "59,000"   →  59000.0   (comma = thousands separator)
      "302,016"  →  302016.0
      "1,234.56" →  1234.56
    """
    s = re.sub(r"[^\d.,]", "", price_str).strip()
    if not s:
        return 0.0

    dot_pos   = s.rfind(".")
    comma_pos = s.rfind(",")

    if dot_pos > comma_pos:
        s = s.replace(",", "")                          # "1,234.56" → "1234.56"
    elif comma_pos > dot_pos:
        after_comma = s[comma_pos + 1:]
        if len(after_comma) == 3 and dot_pos == -1:
            s = s.replace(",", "")                      # "59,000"   → "59000"
        elif len(after_comma) == 2:
            s = s.replace(".", "").replace(",", ".")    # "14,98"    → "14.98"
        else:
            s = s.replace(",", "")

    try:
        return float(s)
    except ValueError:
        return 0.0