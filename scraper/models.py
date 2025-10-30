
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, validator

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
