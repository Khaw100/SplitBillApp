import base64
import json
import os
from io import BytesIO

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from PIL import Image

from modules.data.receipt_data import ItemData, ReceiptData
from modules.utils import AIError, SettingsError

from .base import AIModel

MODEL_NAME = "gemini-2.5-flash"

PROMPT = """
You are given an image of a receipt. Please read the content into JSON format:

```
{
    "menus": [
        {
            "name": <item_name>,
            "count": <purchased_count>,
            "price": <total_price_for_this_item> 
        },
        ...
    ],
    "total": <total_price_in_receipt>
}
```

For price/total: do not use comma or point separator, just bare number, except for decimal
For count: assume 1 if no count number is found in the receipt
Note that no need to give unit price

return only in JSON format
"""


class GeminiModel(AIModel):
    """Receipt reader based on Gemini model API."""

    def __init__(self) -> None:
        """Initialize the model."""
        if "GOOGLE_API_KEY" not in os.environ or os.environ["GOOGLE_API_KEY"] == "":
            raise SettingsError(
                "No Google API key has been set. Please set it when using Gemini."
            )
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)

    def run(self, image: Image.Image) -> ReceiptData:
        """Retrieve data from the receipt.

        Args:
            image (Image.Image): the receipt photo image

        Returns:
            ReceiptData: parsed receipt data
        """
        image_b64 = self._encode_image(image)
        message = HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": PROMPT,
                },
                {
                    "type": "image_url",
                    "image_url": f"data:image/png;base64,{image_b64}",
                },
            ]
        )
        response = self.llm.invoke([message]).content
        if not isinstance(response, str):
            raise AIError(f"Gemini does not response with string, get: {response}")
        try:
            return self._format_response(response)
        except Exception as err:
            raise AIError(f"Unable to parse Gemini response: {response}") from err

    def _encode_image(self, image: Image.Image) -> str:
        """Encode image to base64 for Gemini request.

        Args:
            image (Image.Image): image data

        Returns:
            str: encoded image
        """
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        img_bytes = buffer.getvalue()
        return base64.b64encode(img_bytes).decode("utf-8")

    def _format_response(self, response: str) -> ReceiptData:
        """Parse Gemini response into app receipt data.

        Args:
            response (str): Gemini response text raw

        Returns:
            ReceiptData: the parsed data
        """
        dict_data = self._parse_response_to_dict(response)
        total = dict_data["total"]
        menus_list = dict_data["menus"]
        items: list[ItemData] = []
        for item in menus_list:
            items.append(
                ItemData(
                    name=str(item["name"]),
                    count=int(item["count"]),
                    total_price=float(item["price"]),
                )
            )
        return ReceiptData(items={it.id: it for it in items}, total=float(total))

    def _parse_response_to_dict(self, response: str) -> dict:
        """Parse Gemini response text to data in dictionary format.

        Args:
            response (str): raw Gemini response

        Returns:
            dict: parsed dictionary
        """
        clean_json_str = response.replace("```json", "").replace("```", "")
        return json.loads(clean_json_str)
