from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class PackageItem(BaseModel):
    package_id: str
    source: str
    url: str
    title: str
    destinations: List[str] = []
    duration_days: int = 0
    nights: Optional[int] = None
    price: float = 0.0
    currency: str = "NZD"
    price_basis: str = "per_person"  # default; override per site if needed
    includes: dict = {}
    hotel: dict = {}
    sale_ends_at: Optional[str] = None
    last_seen_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
