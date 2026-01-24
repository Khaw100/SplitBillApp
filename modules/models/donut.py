import torch
import xmltodict
from PIL import Image
from transformers import AutoModelForVision2Seq, AutoProcessor

from modules.data.receipt_data import ItemData, ReceiptData

from .base import AIModel

MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"
