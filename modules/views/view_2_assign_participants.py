import streamlit as st

from modules.data import session_data
from modules.data.assignment_data import (
    AssignedItemData,
    GroupData,
    ParticipantData,
    SplitManager,
)


def participant_data_view(participant: ParticipantData, manager: SplitManager) -> None:
    """Element to show a participant data.

    Args:
        participant (ParticipantData): the participant data
        manager (SplitManager): the split assignment manager
    """
    with st.container(border=True):
        col1, col2 = st.columns([9, 1])
        with col1:
            st.markdown(f"##### {participant.name}")
        with col2:
            delete_button = st.button(
                label="",
                key=f"delete_button_participant_{participant.id}",
                icon=":material/delete:",
                type="primary",
            )
        participant_detail_view(participant, manager)

    if delete_button:
        manager.remove_participant(participant.id)
        st.rerun()


def participant_detail_view(
    participant: ParticipantData, manager: SplitManager
) -> None:
    """Element for user to assign items to the participant.

    Args:
        participant (ParticipantData): the participant data
        manager (SplitManager): the split assignment manager
    """
    current_items = manager.get_participant_items_assignment_list(participant.id)
    items_to_delete = []
    for idx, item in enumerate(current_items):
        is_del = added_item_view(
            participant, item, manager.get_items_assignment_total(item.item.id)
        )
        if is_del:
            items_to_delete.append(idx)
    if len(items_to_delete) > 0:
        manager.remove_items_assignment(participant.id, items_to_delete)
        st.rerun()
    new_item_selection_view(participant, manager)


def added_item_view(
    participant: ParticipantData, item: AssignedItemData, current_assigned_total: int
) -> bool:
    """Element that shows and interact with item assigned to a participant.

    Args:
        participant (ParticipantData): the participant data
        item (AssignedItemData): the item assignment data
        current_assigned_total (int): the already assigned number of this
            particular item accross participants.

    Returns:
        bool: True if the user click delete of this item assignment
    """
    del_col, name_col, num_col, detail_col = st.columns([0.5, 4, 2, 3.5])
    with del_col:
        del_item = st.button(
            label="",
            key=f"del_item_{participant.id}_{item.id}",
            icon=":material/close:",
            type="tertiary",
        )
    with name_col:
        st.markdown(
            f"""
            <div style="margin-top: 1vh;">
                <p>{item.item.name}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with num_col:
        key_name = f"count_input_{participant.id}_{item.id}"
        st.number_input(
            f"Item count for {participant.id} {item.id}",
            value=item.assigned_count,
            step=1,
            min_value=0,
            label_visibility="collapsed",
            on_change=lambda: on_item_count_change(key_name, item),
            key=key_name,
        )
    with detail_col:
        difference = item.item.count - current_assigned_total
        if difference > 0:
            item_warning_sign(f"Unassigned: {difference}", color="#fffec8")
        elif difference < 0:
            item_warning_sign(f"Exceeding order by: {-difference}", color="#ff7074")
    return del_item


def on_item_count_change(key_name: str, item: AssignedItemData) -> None:
    """Callbacks to be called when user change count of the assigned item.

    Args:
        key_name (str): the count input element key name
        item (AssignedItemData): the item assignment data
    """
    new_val = st.session_state.get(key_name)
    if new_val is None:
        return
    item.set_count(new_val)


def item_warning_sign(text: str, color: str) -> None:
    """Warning notification to be shown related to item count.

    Args:
        text (str): the text to be shown
        color (str): the color of the text
    """
    st.markdown(
        f"""
        <div style="
            color: {color};
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            height: 38px;  
            overflow-y: auto;
            display: flex;
            align-items: center;
        ">
            <div> {warning_icon(color)} &nbsp; {text} </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def warning_icon(color: str) -> str:
    """Warning icon from material.

    Args:
        color (str): the color of the text

    Returns:
        str: the warning icon as string
    """
    return f"""
    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="{color}"><path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>
    """


def new_item_selection_view(
    participant: ParticipantData, manager: SplitManager
) -> None:
    """Eelement for user to add new item assigned to participant.

    Args:
        participant (ParticipantData): the participant data
        manager (SplitManager): the split assignment manager
    """
    _, item_col, add_col, _ = st.columns([0.5, 4, 2, 3.5])
    with item_col:
        selected_item = st.selectbox(
            "Purhcased item",
            manager.item_ids,
            index=None,
            placeholder="New item",
            label_visibility="collapsed",
            key=f"item_selection_{participant.id}",
            format_func=lambda x: manager.get_item(int(x)).name,
        )
    with add_col:
        add_item = st.button(
            label="",
            key=f"add_item_{participant.id}",
            icon=":material/add:",
        )
    if add_item and selected_item is not None:
        manager.add_item_assignment(participant.id, selected_item)
        st.rerun()


def warning_summary_view(manager: SplitManager) -> bool:
    """Element that shows uncomplete action that user need to take.

    It can be items that are not assigned yet or items that are
    over-assigned

    Args:
        manager (SplitManager): the split assignment manager

    Returns:
        bool: True if all items are assigned well, False otherwise
    """
    items = manager.get_all_items()
    unassigned_list = []
    over_list = []
    for item in items:
        current_assigned = manager.get_items_assignment_total(item.id)
        difference = item.count - current_assigned
        if difference > 0:
            unassigned_list.append(f"{item.name} ({difference})")
        if difference < 0:
            over_list.append(f"{item.name} ({-difference})")

    check_ok = True
    if len(unassigned_list) > 0:
        st.warning(
            f"Some of these items have not been assigned yet: {', '.join(unassigned_list)}"
        )
        check_ok = False
    if len(over_list):
        st.error(
            f"Some of these items are assigned more than in receipt: {', '.join(over_list)}"
        )
        check_ok = False
    return check_ok


def participant_adder_and_submit_view(group_data: GroupData, ready_next: bool) -> bool:
    """Eelement to add participant and submit final assignments button.

    Args:
        group_data (GroupData): participants group data
        ready_next (bool): whether the user has completed all assignments
            and should be able to submit the assignments

    Returns:
        bool: True if the submit button is pressed
    """
    if len(group_data) == 0:
        st.markdown("Enter a participant name here")
    col1, col2, _, col4 = st.columns([2, 2, 4, 2])
    with col1:
        new_name = st.text_input(
            "Participant name", label_visibility="collapsed", placeholder="Name"
        )
    with col2:
        new_name_button = st.button(
            label="",
            key="new_name_button",
            icon=":material/person_add:",
            type="primary",
        )
    if new_name_button:
        group_data.add(name=new_name)
        st.rerun()

    with col4, st.container(horizontal_alignment="right"):
        is_submit = st.button(
            "Submit", key="Submit", type="primary", disabled=not ready_next
        )
    return is_submit


def controller() -> bool:
    """Main controller of page 2, items assignment

    Returns:
        bool: True if user has completed all required actions in
        this page
    """
    manager = session_data.split_manager.get()
    if manager is None:
        receipt = session_data.receipt_data.get()
        if receipt is None:
            st.error("Upload a receipt first...")
            return False
        group_data = session_data.group_data.get()
        manager = SplitManager(group_data, receipt)
        session_data.split_manager.set(manager)

    for participant in list(manager.group_data.participants.values()):
        participant_data_view(participant, manager)
    is_ok = warning_summary_view(manager)
    return participant_adder_and_submit_view(manager.group_data, is_ok)
