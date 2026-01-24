from typing import Generic

import streamlit as st
from PIL import Image
from typing_extensions import TypeVar

from modules.models.base import AIModel
from modules.models.loader import ModelNames

from .assignment_data import GroupData, SplitManager
from .receipt_data import ReceiptData
from .report_data import ReportData

T = TypeVar("T")
V = TypeVar("V", default=None)


class SessionDataManager(Generic[T, V]):
    """Helper class to interact with a streamlit session state."""

    _model_state = "model"

    def __init__(self, state_name: str, default: V = None) -> None:
        """Create new session state.

        Args:
            state_name (str): the state name
            default (V, optional): The default value of the state.
                Defaults to None.
        """
        self.state_name = state_name
        self.default = default

    def get(self) -> T | V:
        """Get the state value.

        Returns:
            T | V: current state value
        """
        if self.state_name not in st.session_state:
            st.session_state[self.state_name] = self.default
        return st.session_state[self.state_name]

    def set(self, value: T) -> None:
        """Set the state value.

        Args:
            value (T): the new state value
        """
        st.session_state[self.state_name] = value

    def reset(self) -> None:
        """Reset the state value to default."""
        st.session_state[self.state_name] = None

    def get_once(self) -> T | V:
        """Get the state value and reset.

        Returns:
            T | V: current state value
        """
        ret = self.get()
        self.reset()
        return ret


model = SessionDataManager[AIModel]("model")
model_name = SessionDataManager[ModelNames, ModelNames]("model_name", ModelNames.GEMINI)
currency = SessionDataManager[str, str]("currency", "IDR")
image = SessionDataManager[Image.Image]("image")
receipt_data = SessionDataManager[ReceiptData]("receipt_data")
group_data = SessionDataManager[GroupData, GroupData]("group_data", GroupData())
current_page = SessionDataManager[int, int]("current_page", 1)
split_manager = SessionDataManager[SplitManager]("split_manager")
report = SessionDataManager[ReportData]("report")
view1_model_result = SessionDataManager[ReceiptData]("view1_model_result")
view1_auto_next_page = SessionDataManager[bool, bool]("view1_auto_next_page", False)


def reset_receipt_data() -> None:
    """Reset the receipt data to reset the user progress."""
    receipt_data.reset()
    split_manager.reset()
    view1_model_result.reset()
