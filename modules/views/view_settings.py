import os
from dataclasses import dataclass, field

import streamlit as st
from babel.numbers import get_currency_name

from modules.data import session_data
from modules.models.loader import ModelNames
from modules.utils import CURRENCY_LIST


@dataclass
class SettingsData:
    """Class that contains all settings data."""

    currency: str = field(default_factory=session_data.currency.get)
    model_name: ModelNames = field(default_factory=session_data.model_name.get)

    gemini_api_key: str | None = field(
        default_factory=lambda: os.environ.get("GOOGLE_API_KEY")
    )
    openai_api_key: str | None = field(
        default_factory=lambda: os.environ.get("OPENAI_API_KEY")
    )

    def apply(self) -> None:
        """Apply the settings stored in this object."""
        session_data.currency.set(self.currency)

        if self.model_name != session_data.model_name.get():
            session_data.model.reset()

        session_data.model_name.set(self.model_name)

        if self.gemini_api_key:
            os.environ["GOOGLE_API_KEY"] = self.gemini_api_key

        if self.openai_api_key:
            os.environ["OPENAI_API_KEY"] = self.openai_api_key


def currency_settings_view(settings: SettingsData) -> SettingsData:
    """Element for currency settings input.

    Args:
        settings (SettingsData): the current settings data

    Returns:
        SettingsData: the updated settings data
    """
    currencies = list(CURRENCY_LIST.keys())
    current_idx = (
        currencies.index(settings.currency) if settings.currency in currencies else 0
    )
    selected_currency = st.selectbox(
        "Currency",
        list(CURRENCY_LIST.keys()),
        format_func=lambda x: f"{x}: {get_currency_name(x)}",
        index=current_idx,
    )
    settings.currency = selected_currency
    return settings


def model_selection_view(settings: SettingsData) -> SettingsData:
    """Element for model selection settings input.

    Args:
        settings (SettingsData): the current settings data

    Returns:
        SettingsData: the updated settings data
    """
    models_options = list(ModelNames)
    current_idx = (
        models_options.index(settings.model_name)
        if settings.model_name in models_options
        else 0
    )
    selected_model = st.selectbox(
        "AI Model",
        list(models_options),
        format_func=lambda x: x.value,
        index=current_idx,
    )

    # --- Models that need API keys ---
    if selected_model == ModelNames.GEMINI:
        google_key = st.text_input(
            "Google API Key", type="password", value=settings.gemini_api_key
        )
        settings.gemini_api_key = google_key

    elif selected_model == ModelNames.OPENAI_GPT_VISION:
        settings.openai_api_key = st.text_input(
            "OpenAI API Key",
            type="password",
            value=settings.openai_api_key,
        )

    # --- Free local models (no API key needed) ---
    elif selected_model == ModelNames.DONUT:
        st.info(
            "🍩 **Donut** runs locally — no API key required.\n\n"
            "Model: `naver-clova-ix/donut-base-finetuned-cord-v2`\n\n"
            "Best for printed receipts in English. "
            "First run will download ~1GB model weights."
        )

    elif selected_model == ModelNames.TROCR:
        st.info(
            "🔤 **TrOCR (Microsoft)** runs locally — no API key required.\n\n"
            "Model: `microsoft/trocr-large-printed`\n\n"
            "Extracts text line-by-line from printed receipts. "
            "First run will download model weights (~1.3GB)."
        )

    elif selected_model == ModelNames.EASYOCR:
        st.info(
            "🌏 **EasyOCR** runs locally — no API key required.\n\n"
            "Supports **Indonesian + English** receipts (80+ languages available).\n\n"
            "Good for Indonesian restaurant/cafe receipts. "
            "First run will download model weights (~100MB)."
        )

    settings.model_name = selected_model
    return settings


@st.dialog("Settings")
def controller(error_msg: str | None = None) -> None:
    """Controller of the settings page pop-up.

    Args:
        error_msg (str | None, optional): Error message to
            be shown, supposed to be explanation whether there
            is any misconfigured settings, if any. Defaults to None.
    """
    if error_msg is not None:
        st.error(error_msg)
    settings = SettingsData()
    settings = currency_settings_view(settings)
    settings = model_selection_view(settings)
    if st.button("Apply", key="settings_apply_button"):
        settings.apply()
        st.rerun()