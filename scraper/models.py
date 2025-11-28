from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, HttpUrl, constr


# ---------------------------
# TravelScout schema
# ---------------------------

class Price(BaseModel):
    currency: constr(min_length=3, max_length=3) = "NZD"
    min: Optional[float] = None
    max: Optional[float] = None
    text: Optional[str] = None
    free: bool = False


class Location(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None            # ⟵ removed "Canterbury" default
    country: Optional[str] = "New Zealand"  # keep a sensible country default
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class Booking(BaseModel):
    url: Optional[HttpUrl] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class EventDates(BaseModel):
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    timezone: str = "Pacific/Auckland"


class TravelScoutRecord(BaseModel):
    """
    Unified record for events & places (attractions/activities).
    IMPORTANT: Set `source`, `location.region`, etc. **per spider**.
    """
    id: str
    record_type: Literal["event", "place"]
    name: str
    description: Optional[str] = None
    categories: List[str] = []
    tags: List[str] = []
    url: HttpUrl
    source: Optional[str] = None           # ⟵ removed "christchurchnz.com"
    images: List[HttpUrl] = []
    location: Location = Location()
    price: Price = Price()
    booking: Booking = Booking()
    event_dates: Optional[EventDates] = None
    opening_hours: Optional[str] = None
    operating_months: Optional[List[str]] = None
    data_collected_at: Optional[datetime] = None
    text_for_embedding: Optional[str] = None


if __name__ == "__main__":
    # Handy: print JSON Schema for the TravelScoutRecord
    import json
    print(json.dumps(TravelScoutRecord.model_json_schema(), indent=2))
