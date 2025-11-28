from __future__ import annotations
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, HttpUrl, validator, constr
from datetime import datetime

# ---------------------------
# Existing package models (kept)
# ---------------------------

class Includes(BaseModel):
    flights: Optional[bool] = None
    hotel: Optional[bool] = None
    board: Optional[str] = None
    transfers: Optional[bool] = None
    activities: Optional[List[str]] = None

class Hotel(BaseModel):
    name: Optional[str] = None
    stars: Optional[float] = None
    room_type: Optional[str] = None

class PackageModel(BaseModel):
    package_id: Optional[str] = None
    source: str
    url: str
    title: str
    destinations: Optional[List[str]] = None
    duration_days: Optional[int] = None
    nights: Optional[int] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    price_basis: Optional[str] = None
    price_nzd: Optional[float] = None
    price_pppn: Optional[float] = None
    includes: Optional[Includes] = None
    hotel: Optional[Hotel] = None
    sale_ends_at: Optional[str] = None
    last_seen_at: Optional[str] = None

    @validator("title")
    def title_non_empty(cls, v):
        if not v or not str(v).strip():
            raise ValueError("title missing")
        return v

    @validator("url")
    def url_non_empty(cls, v):
        if not v or not str(v).strip():
            raise ValueError("url missing")
        return v

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
    region: Optional[str] = None        # was "Canterbury"
    country: Optional[str] = "New Zealand"
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
    Unified record for events & places.
    Set per-spider values such as `source` and `location.region`.
    """
    id: str
    record_type: Literal["event", "place"]
    name: str
    description: Optional[str] = None
    categories: List[str] = []
    tags: List[str] = []
    url: HttpUrl
    source: Optional[str] = None        # was "christchurchnz.com"
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
    import json
    print(json.dumps(TravelScoutRecord.model_json_schema(), indent=2))
