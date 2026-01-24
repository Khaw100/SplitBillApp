"""
Main application controller that control the whole app
"""

import functools
import time

import streamlit as st

from .data import session_data
from .data.report_data import ReportData
from .models.loader import get_model
from .utils import SettingsError
from .views import (
    view_1_receipt_upload,
    view_2_assign_participants,
    view_3_report,
    view_settings,
)


def is_receipt_uploaded() -> bool:
    """Check whether there is a receipt that has been uploaded

    Returns:
        bool: True if has been uploaded
    """
    return session_data.receipt_data.get() is not None


def is_report_created() -> bool:
    """Check whether there is a report that has been created

    Returns:
        bool: True if has been created
    """
    return session_data.report.get() is not None


def get_max_page() -> int:
    """Get page numbers based on user progress.

    Returns:
        int: Page numbers
    """
    max_page = 1
    if is_receipt_uploaded():
        max_page += 1
    if is_report_created():
        max_page += 1
    return max_page


def next_page() -> None:
    """Move to the next page."""
    current_page = session_data.current_page.get()
    session_data.current_page.set(min(get_max_page(), current_page + 1))
    st.rerun()


def prev_page() -> None:
    """Move to the previous page."""
    current_page = session_data.current_page.get()
    session_data.current_page.set(max(1, current_page - 1))
    st.rerun()


def section_selection_view() -> None:
    """Display of page selections."""
    current_page = session_data.current_page.get()
    page_title = {
        1: "Upload Your Bill",
        2: "Assign Participants",
        3: "Report",
    }[current_page]

    col1, col2, col3 = st.columns([0.5, 9, 0.5])
    with col1:
        go_prev = st.button(
            label="",
            key="prev_page",
            icon=":material/arrow_back_ios:",
            disabled=(current_page <= 1),
            type="tertiary",
        )
    with col2:
        st.markdown(
            f"""
            <div style="
                height: 53px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            ">
                <h5 style="margin: 0;">{page_title}</h5>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with col3:
        go_next = st.button(
            label="",
            key="next_page",
            icon=":material/arrow_forward_ios:",
            disabled=(current_page >= get_max_page()),
            type="tertiary",
        )

    if go_prev:
        prev_page()
    if go_next:
        next_page()


def view_2_done_func() -> None:
    """Callable to be call when user finished in page 2."""
    manager = session_data.split_manager.get()
    if manager is None:
        return
    session_data.report.set(ReportData.from_split_manager(manager))


def main_view() -> None:
    """Main page view."""
    model = get_model()
    section_selection_view()
    current_page = session_data.current_page.get()

    page_options = {
        1: functools.partial(view_1_receipt_upload.controller, model.run),
        2: view_2_assign_participants.controller,
        3: functools.partial(view_3_report.controller, session_data.report.get()),
    }
    done_funcs = {
        1: lambda: None,
        2: view_2_done_func,
        3: lambda: None,
    }

    should_go_next = page_options[current_page]()
    if should_go_next:
        done_funcs[current_page]()
        time.sleep(3)
        next_page()


def controller():
    """Application main function."""
    st.title("💵 Split Your Bill")
    author_col, settings_col = st.columns([5, 5])
    with author_col:
        st.markdown("###### Original Template By: Mukhlas Adib")
    with settings_col, st.container(horizontal_alignment="right"):
        st.button(
            label="",
            key="settings_button",
            icon=":material/settings:",
            on_click=view_settings.controller,
            type="tertiary",
        )

    try:
        main_view()
    except SettingsError as err:
        view_settings.controller(str(err))
