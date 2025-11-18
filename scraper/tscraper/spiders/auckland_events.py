import json
import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone
from email.utils import format_datetime

import scrapy
from w3lib.html import remove_tags


# -------------------- config --------------------

START_URLS = [
    "https://heartofthecity.co.nz/auckland-events",
    "https://heartofthecity.co.nz/auckland-events/this-month",
    "https://heartofthecity.co.nz/auckland-events/this-week",
    "https://heartofthecity.co.nz/auckland-events/this-weekend",
    "https://heartofthecity.co.nz/auckland-events/today",
    "https://heartofthecity.co.nz/auckland-events/tomorrow",
    "https://heartofthecity.co.nz/auckland-events/next-7-days",
    "https://heartofthecity.co.nz/auckland-events/next-30-days",
    "https://heartofthecity.co.nz/auckland-events/music-events",
    "https://heartofthecity.co.nz/auckland-events/theatre",
    "https://heartofthecity.co.nz/auckland-events/exhibitions",
    "https://heartofthecity.co.nz/auckland-events/festivals",
    "https://heartofthecity.co.nz/auckland-events/food-drink-events",
    "https://heartofthecity.co.nz/auckland-events/sports-events",
]

AGGREGATOR_TAILS = {
    "today", "tomorrow", "this-week", "this-weekend", "this-month",
    "next-7-days", "next-30-days",
    "music-events", "theatre", "exhibitions", "festivals",
    "food-drink-events", "sports-events", "events", "event", "search",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)


class AucklandEventsSpider(scrapy.Spider):
    """
    Heart of the City — Events spider (LEAN OUTPUT)

    Emits ONLY:
      id, record_type, name, url, source, location, price, event_dates,
      opening_hours, operating_months, data_collected_at
    """

    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = START_URLS

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": False,  # flip to True if you must obey robots
        "COOKIES_ENABLED": False,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.5,
        "CONCURRENT_REQUESTS": 6,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.25,
        "AUTOTHROTTLE_MAX_DELAY": 4.0,
        "DEFAULT_REQUEST_HEADERS": {
            "Accept-Language": "en-NZ,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        "CLOSESPIDER_PAGECOUNT": 5000,
        "FEEDS": {
            "data/Events.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
        "LOG_LEVEL": "INFO",
    }

    # --------------- listing ---------------

    def parse(self, response):
        base = response.url

        # detail pages look like /auckland-events/<slug>
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            url = urljoin(base, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
                if len(parts) == 2 and parts[1] not in AGGREGATOR_TAILS:
                    yield response.follow(url, callback=self.parse_event, headers={"Referer": base})

        # keep exploring inside the events section only
        for href in response.css('a[href*="/auckland-events/"]::attr(href)').getall():
            url = urljoin(base, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
