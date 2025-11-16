from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime
import hashlib

# ---------------------------
# Existing PackageItem (kept)
# ---------------------------
from pydantic import BaseModel, Field

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

# ---------------------------
# TravelScout item (new)
# ---------------------------

def make_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]

@dataclass
class TravelScoutItem:
    id: str
    record_type: str                 # "event" | "place"
    name: str
    description: Optional[str]
    categories: List[str]
    tags: List[str]
    url: str
    source: str
    images: List[str]
    location: Dict[str, Any]
    price: Dict[str, Any]
    booking: Dict[str, Any]
    event_dates: Optional[Dict[str, Any]]
    opening_hours: Optional[str]
    operating_months: Optional[List[str]]
    data_collected_at: str
    text_for_embedding: Optional[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
