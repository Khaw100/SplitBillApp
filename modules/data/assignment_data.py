from dataclasses import dataclass, field

from .base import IDGenerator
from .receipt_data import ItemData, ReceiptData


class AssignedItemIDGenerator(IDGenerator):
    """Generator for item assignment data ID."""

    pass


class ParticipantIDGenerator(IDGenerator):
    """Generator participant ID."""

    pass


@dataclass
class AssignedItemData:
    """Class that handles item assignment."""

    item: ItemData
    assigned_count: int = 0

    id: int = field(default_factory=AssignedItemIDGenerator.get)

    def set_count(self, count: int) -> None:
        """Set number of item assigned in this data.

        Args:
            count (int): number of item
        """
        self.assigned_count = count


@dataclass
class ParticipantData:
    """Class that handles data about a participant."""

    name: str

    id: int = field(default_factory=ParticipantIDGenerator.get)


@dataclass
class GroupData:
    """Class that contains data about collection of participants."""

    participants: dict[int, ParticipantData] = field(default_factory=dict)

    def add(self, name: str) -> None:
        """Add participant to the group.

        Args:
            name (str): participant name
        """
        new_participant = ParticipantData(name=name)
        self.participants[new_participant.id] = new_participant

    def remove(self, participant_id: int) -> None:
        """Remove participant from the group.

        Args:
            participant_id (int): participant ID to be removed
        """
        if participant_id in self.participants:
            self.participants.pop(participant_id)

    def __len__(self) -> int:
        """Number of participants.

        Returns:
            int: number of participants.
        """
        return len(self.participants)


class SplitManager:
    """Class that handles item to participant assignment mechanism."""

    def __init__(self, group_data: GroupData, receipt_data: ReceiptData) -> None:
        """Initialize the data.

        Args:
            group_data (GroupData): participants data
            receipt_data (ReceiptData): receipt data from AI reading
        """
        self.group_data = group_data
        self.receipt_data = receipt_data
        self.participant_assignments: dict[int, list[AssignedItemData]] = {}

    @property
    def item_ids(self) -> list[int]:
        """Get all item IDs from the AI reading.

        Returns:
            list[int]: item IDs
        """
        return [it.id for it in self.get_all_items()]

    def get_all_items(self) -> list[ItemData]:
        """Get all items from AI reading

        Returns:
            list[ItemData]: list of items from the receipt
        """
        return list(self.receipt_data.items.values())

    def get_item(self, item_id: int) -> ItemData:
        """Get an item from AI reading.

        Args:
            item_id (int): requested item ID

        Returns:
            ItemData: the item data
        """
        return self.receipt_data.items[item_id]

    def get_all_participants(self) -> list[ParticipantData]:
        """Get all participants.

        Returns:
            list[ParticipantData]: list of participants data
        """
        return list(self.group_data.participants.values())

    def remove_participant(self, participant_id: int) -> None:
        """Remove participant.

        Args:
            participant_id (int): participant ID that will be removed
        """
        self.group_data.remove(participant_id)
        if participant_id in self.participant_assignments:
            self.participant_assignments.pop(participant_id)

    def get_items_assignment_total(self, item_id: int) -> int:
        """Get total count of an item that is already assigned to any participant.

        Args:
            item_id (int): the item ID.

        Returns:
            int: number items already assigned from the item
        """
        total = 0
        for _, assigned_items in self.participant_assignments.items():
            total += sum(
                assigned_item.assigned_count
                for assigned_item in assigned_items
                if assigned_item.item.id == item_id
            )
        return total

    def get_participant_items_assignment_list(
        self, participant_id: int
    ) -> list[AssignedItemData]:
        """Get item assignments for a participant.

        Args:
            participant_id (int): requested participant ID

        Returns:
            list[AssignedItemData]: list of items assignment to the participant
        """
        if participant_id not in self.participant_assignments:
            self.participant_assignments[participant_id] = []
        return self.participant_assignments[participant_id]

    def add_item_assignment(self, participant_id: int, item_id: int) -> None:
        """Add item assignment to the participant.

        Args:
            participant_id (int): participant ID
            item_id (int): item ID (from AI) to be assigned to the participant
        """
        participant_items = self.get_participant_items_assignment_list(participant_id)
        participant_items.append(
            AssignedItemData(self.get_item(item_id), assigned_count=1)
        )

    def remove_items_assignment(
        self, participant_id: int, item_idxs: list[int]
    ) -> None:
        """Remove item assignments from a participant.

        Args:
            participant_id (int): participant ID
            item_idxs (list[int]): item assignment IDs to be removed
        """
        participant_items = self.get_participant_items_assignment_list(participant_id)
        for idx in item_idxs:
            participant_items.pop(idx)
