from typing import ClassVar


class IDGenerator:
    """Unique ID generator."""

    num: ClassVar[int] = 0

    @classmethod
    def get(cls) -> int:
        """Get new ID."""
        cls.num += 1
        return cls.num
