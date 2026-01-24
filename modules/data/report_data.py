from dataclasses import dataclass
from typing import Self

import pandas as pd

from modules.utils import format_number_to_currency

from .assignment_data import AssignedItemData, ParticipantData, SplitManager


@dataclass
class PurchasedItemReportData:
    """Report data for an item."""

    item_id: int
    name: str
    purchased_count: int
    unit_price: float

    @classmethod
    def from_item_assignment_data(cls, item_assignment: AssignedItemData) -> Self:
        """Create report for an item.

        Args:
            item_assignment (AssignedItemData): Item assignment data

        Returns:
            Self: parsed report
        """
        return cls(
            item_id=item_assignment.item.id,
            name=item_assignment.item.name,
            purchased_count=item_assignment.assigned_count,
            unit_price=item_assignment.item.unit_price,
        )

    @property
    def total(self) -> float:
        """Purchased total price of this item report.

        Returns:
            float: item's purchased total price
        """
        return self.purchased_count * self.unit_price


@dataclass
class ParticipantReportData:
    """Report data for a participant."""

    participant_id: int
    name: str
    purchased_items: list[PurchasedItemReportData]
    purchased_subtotal: float
    purchased_total: float

    @property
    def purchased_others(self) -> float:
        """Extra prices like tax, discount, etc.

        Returns:
            float: extra prices like tax, discount, etc.
        """
        return self.purchased_total - self.purchased_subtotal

    @classmethod
    def from_assignment_data(
        cls,
        participant: ParticipantData,
        assigned_items: list[AssignedItemData],
        receipt_subtotal: float,
        receipt_total: float,
    ) -> Self:
        """Generate participant report from assignment data.

        Args:
            participant (ParticipantData): the participant data
            assigned_items (list[AssignedItemData]): items assignment for
                this participant
            receipt_subtotal (float): subtotal of the overall receipt
            receipt_total (float): total oft he overall receipt

        Returns:
            Self: the generated report data
        """
        purchased_items = [
            PurchasedItemReportData.from_item_assignment_data(it)
            for it in assigned_items
        ]
        subtotal = sum(it.total for it in purchased_items)
        total = (subtotal / receipt_subtotal) * receipt_total
        return cls(
            participant_id=participant.id,
            name=participant.name,
            purchased_items=purchased_items,
            purchased_subtotal=subtotal,
            purchased_total=total,
        )

    def to_dataframe_display(self) -> pd.DataFrame:
        """Convert this data to a DataFrame for display purpose.

        Returns:
            pd.DataFrame: generated DataFrame
        """
        rows = [
            {
                "Name": it.name,
                "Count": it.purchased_count,
                "Unit price": format_number_to_currency(it.unit_price),
                "Total": format_number_to_currency(it.total),
            }
            for it in self.purchased_items
        ]
        return pd.DataFrame(
            rows, columns=["Name", "Count", "Unit price", "Total"]
        ).set_index("Name")


@dataclass
class ReportData:
    """Complete split report data."""

    participants_reports: list[ParticipantReportData]

    @classmethod
    def from_split_manager(cls, manager: SplitManager) -> Self:
        """Create report from split assignment manager.

        Args:
            manager (SplitManager): the split assignment manager.

        Returns:
            Self: generated report data
        """
        order_subtotal = manager.receipt_data.subtotal
        order_total = manager.receipt_data.total
        return cls(
            participants_reports=[
                ParticipantReportData.from_assignment_data(
                    p,
                    manager.get_participant_items_assignment_list(p.id),
                    order_subtotal,
                    order_total,
                )
                for p in manager.get_all_participants()
            ],
        )
