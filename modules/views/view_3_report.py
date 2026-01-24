import streamlit as st

from modules.data.report_data import ParticipantReportData, ReportData
from modules.utils import format_number_to_currency


def participant_view(participant_report: ParticipantReportData) -> None:
    """Element to show report of a participant.

    Args:
        participant_report (ParticipantReportData): the participant
            report data
    """
    with st.container(border=True):
        name_col, total_str_col, total_col = st.columns([7, 1, 2])
        with name_col:
            st.markdown(f"##### {participant_report.name}")
        with total_str_col:
            st.markdown("##### Total:")
        with total_col:
            total_str = format_number_to_currency(
                int(participant_report.purchased_total)
            )
            st.markdown(f"##### {total_str}")
        st.table(participant_report.to_dataframe_display(), border="horizontal")
        subtotal_str = format_number_to_currency(participant_report.purchased_subtotal)
        st.markdown(f"###### Subtotal: {subtotal_str}")
        total_str = format_number_to_currency(participant_report.purchased_others)
        st.markdown(f"###### Others\*: {total_str}")


def controller(report: ReportData | None) -> bool:
    """Main controller of page 3, report view.

    Returns:
        bool: always False, to prevent action to go to
        next page in main controller
    """
    if report is None:
        st.error("Please submit assignment first!")
        return False
    for participant_report in report.participants_reports:
        participant_view(participant_report)
    st.markdown("*\*tax, services, discount, etc.*")
    return False
