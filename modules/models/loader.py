from enum import Enum
from typing import Type

from modules.models.gpt import GPTVisionModel
from modules.utils import SettingsError

from .base import AIModel
from .gemini import GeminiModel
from .donut import DonutModel

class ModelNames(Enum):
    """Available model names."""
    GEMINI = "Gemini"
    DONUT = "Donut"
    OPENAI_GPT_VISION = "OpenAI GPT Vision"


MODELS_LOADER: dict[ModelNames, Type[AIModel]] = {
    ModelNames.GEMINI: GeminiModel,
    ModelNames.DONUT: DonutModel,
    ModelNames.OPENAI_GPT_VISION: GPTVisionModel
}


def _load_model() -> AIModel:
    """Load new model.

    Raises:
        SettingsError: if the settings are not configured correctly
            and model loading failed.

    Returns:
        AIModel: loaded AI model.
    """
    from modules.data import session_data
    model_name = session_data.model_name.get()
    if model_name not in MODELS_LOADER:
        raise SettingsError(f"Model name is not recognized {model_name}")
    return MODELS_LOADER[model_name]()


def get_model() -> AIModel:
    """Get receipt reader model.

    Returns:
        AIModel: the loaded AI model
    """
    from modules.data import session_data
    model = session_data.model.get()
    if model is None:
        model = _load_model()
        session_data.model.set(model)
    return model
