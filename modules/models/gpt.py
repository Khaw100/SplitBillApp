import base64 
import json
import os
from io import BytesIO
from openai import OpenAI
from PIL import Image

from modules.data.receipt_data import ItemData, ReceiptData
from modules.utils import AIError, SettingsError

from .base import AIModel

MODEL_NAME = "gpt-4.1-mini"
PROMPT = """
You are given an image of a receipt.

Extract the receipt into the following JSON format ONLY:

{
  "menus": [
    {
      "name": string,
      "count": number,
      "price": number
    }
  ],
  "subtotal": number,
  "additional_fees": [
    {
      "name": string,
      "amount": number
    }
  ],
  "total": number
}

Rules:
- price, subtotal, total: use plain numbers (no comma, no currency symbol)
- count: assume 1 if not shown
- price is TOTAL price per item (not unit price)
- additional_fees includes tax, service charge, etc
- If a field is missing, use 0 or empty array
- Return ONLY valid JSON, no explanation

"""

class GPTVisionModel(AIModel):

    def __init__(self) -> None:
        if "OPENAI_API_KEY" not in os.environ or os.environ["OPENAI_API_KEY"] == "":
            raise SettingsError(
                "No OpenAI API key has been set. Please set it when using GPT-4 Vision."
            )
        self.client = OpenAI() 

    
    def run(self, image: Image.Image) -> ReceiptData:
        image_b64 = self._encode_image(image)
        response = self._call_gpt(image_b64)
        return self._format_response(response)
    
    # Function to encode image to base64 string
    def _encode_image(self, image: Image.Image) -> str:
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        img_bytes = buffered.getvalue()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        return img_b64
    
    # Function to call GPT-4 Vision API
    def _call_gpt(self, image_b64: str) -> str:
        response = self.client.chat.completions.create(
            model=MODEL_NAME,
            temperature=0.0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}"
                            },
                        },
                    ],
                }
            ],
        )
        content = response.choices[0].message.content
        if not isinstance(content, str):
            raise AIError(f"GPT-4 Vision did not return string content, got: {content}")
        return content
    
    # Function to format GPT response into ReceiptData
    def _format_response(self, response: str) -> ReceiptData:
        try:
            clean_json = response.replace("```json", "").replace("```", "")
            data = json.loads(clean_json)

            items = []
            for item in data.get("menus", []):
                items.append(
                    ItemData(
                        name=str(item.get("name", "")),
                        count=int(item.get("count", 1)),
                        total_price=float(item.get("price", 0)),
                    )
                )

            total = float(data.get("total", 0))

            return ReceiptData(
                items={it.id: it for it in items},
                total=total,
            )

        except Exception as err:
            raise AIError(f"Failed to parse GPT response: {response}") from err

