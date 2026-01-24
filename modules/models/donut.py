import torch
import xmltodict
from PIL import Image
from transformers import AutoModelForVision2Seq, AutoProcessor

from modules.data.receipt_data import ItemData, ReceiptData

from .base import AIModel

MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"

class DonutModel(AIModel):

    def __init__(self):
        self.processor = AutoProcessor.from_pretrained(MODEL_NAME)
        self.model = AutoModelForVision2Seq.from_pretrained(MODEL_NAME)

    def run(self, image):
        decoder_input_ids, pixel_values = self._preprocess(image)
        generation_output = self._inference(decoder_input_ids, pixel_values)
        receipt_dict = self._postprocessing(generation_output)
        return self._formatting(receipt_dict)

    def _preprocess(self, image): 
        decoder_input_ids = self.processor.tokenizer(
            "<s_cord-v2>", add_special_tokens=False
        ).input_ids
        decoder_input_ids = torch.tensor(decoder_input_ids).unsqueeze(0)
        pixel_values = self.processor(image, return_tensors="pt").pixel_values
        return decoder_input_ids, pixel_values

    def _inference(self, decoder_input_ids, pixel_values): 
        generation_output = self.model.generate(
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
        return generation_output

    def _postprocessing(self, generation_output):
        decoded_sequence = self.processor.batch_decode(generation_output.sequences)[0]
        decoded_sequence = decoded_sequence.replace(self.processor.tokenizer.eos_token, "")
        decoded_sequence = decoded_sequence.replace(self.processor.tokenizer.pad_token, "")
        decoded_sequence += "</s_cord-v2>"
        decoded_sequence

        dict_ = xmltodict.parse(decoded_sequence)
        return dict_ 


    def _formatting(self, receipt_dict: dict) -> ReceiptData:
        """Parse dictionary data of model predictions.

        Args:
            receipt_dict (dict): prediction dictionary

        Returns:
            ReceiptData: parsed receipt data
        """
        data_dict = receipt_dict["s_cord-v2"]
        item_names = data_dict["s_menu"]["s_nm"]
        item_counts = data_dict["s_menu"]["s_cnt"]
        item_price = data_dict["s_menu"]["s_price"]
        items = [
            ItemData(
                name=name,
                count=int(count),
                total_price=_convert_price_str_to_float(price),
            )
            for name, count, price in zip(item_names, item_counts, item_price)
        ]
        total = _convert_price_str_to_float(data_dict["s_total"]["s_total_price"])
        return ReceiptData(items={it.id: it for it in items}, total=total)


def _convert_price_str_to_float(price_str: str) -> float:
    """Convert price formatted as text to float.

    In particular, handle the price separator

    Args:
        price_str (str): price as text

    Returns:
        float: parsed float price
    """
    return float(price_str.replace(",", ""))
