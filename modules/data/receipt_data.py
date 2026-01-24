from dataclasses import asdict, dataclass, field

import pandas as pd

from .base import IDGenerator


class ItemIDGenerator(IDGenerator):
    """Generator for item ID in the receipt."""

    pass


@dataclass
class ItemData:
    """Item data from the receipt."""

    name: str
    count: int
    total_price: float

    id: int = field(default_factory=ItemIDGenerator.get)

    @property
    def unit_price(self) -> float:
        """Get unit price of the item.

        Returns:
            float: item's unit price
        """
        return self.total_price / self.count


@dataclass
class ReceiptData:
    """Receipt data from AI reading."""

    items: dict[int, ItemData]
    total: float

    @property
    def subtotal(self) -> float:
        """Subtotal of the receipt.

        Which is sum of all items total price.
        """
        return sum(item.total_price for item in self.items.values())

    def to_items_df(self) -> pd.DataFrame:
        """Convert data to pandas DataFrame.

        Returns:
            pd.DataFrame: data as DataFrame
        """
        return pd.DataFrame([asdict(item) for item in self.items.values()])

    @classmethod
    def from_items_df(cls, items_df: pd.DataFrame, total: float) -> "ReceiptData":
        """Build this data from a DataFrame.

        Expected columns are "name", "count", and "total_price".

        Args:
            items_df (pd.DataFrame): DataFrame to be converted
            total (float): total price of the receipt, after tax, discount, etc.

        Returns:
            ReceiptData: parsed receipt data
        """
        items = [
            ItemData(
                name=row["name"],
                count=row["count"],
                total_price=row["total_price"],
            )
            for _, row in items_df.iterrows()
        ]
        return cls(items={it.id: it for it in items}, total=total)
