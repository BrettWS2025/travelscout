import re
from urllib.parse import urljoin
import scrapy
from scrapy.linkextractors import LinkExtractor
from scrapy.spiders import CrawlSpider, Rule
from datetime import datetime
from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_date_range, parse_prices, build_embedding_text

BASE = "https://www.christchurchnz.com"

class ChristchurchWhatsOnSpider(CrawlSpider):
    name = "christchurch_whats_on"
    allowed_domains = ["christchurchnz.com","www.christchurchnz.com"]
    start_urls = ["https://www.christchurchnz.com/visit/whats-on/"]

    rules = (
        Rule(LinkExtractor(allow=(r"/visit/whats-on/(?:listing/)?[a-z0-9\-]+",), deny=(r"/visit/whats-on/$",)), callback="parse_event", follow=True),
        Rule(LinkExtractor(allow=(r"/visit/whats-on/.*",), deny=(r"\?(?:.*)?subscribe",))),
    )

    def parse_event(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        date_text = clean(" ".join(response.xpath("//*[contains(., 'Event info')]/following::*[1]//text()").getall()))
        start_iso, end_iso = parse_date_range(date_text or "")

        address = clean(" ".join(response.xpath("//*[normalize-space()='Address']/following::*[1]//text()").getall()))
        loc_name = None
        if address and "," in address:
            loc_name = address.split(",")[0].strip()

        ticket_link = response.xpath("//*[contains(translate(., 'TICKET', 'ticket'),'ticket')]/following::a[1]/@href").get()
        ticket_link = urljoin(url, ticket_link) if ticket_link else None

        price_block = clean(" ".join(response.xpath("//*[contains(., 'Ticket pricing')]/following::*[1]//text()").getall()))
        if not price_block:
            price_block = clean(" ".join(response.xpath("//p[contains(.,'$') or contains(.,'Free') or contains(.,'free')]//text()").getall()))
        price = parse_prices(price_block or "")

        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(BASE, img)

        item = TravelScoutItem(
            id=make_id(url),
            record_type="event",
            name=name,
            description=desc,
            categories=["Events"],
            tags=[],
            url=url,
            source="christchurchnz.com",
            images=[img] if img else [],
            location={
                "name": loc_name,
                "address": address,
                "city": "Christchurch" if address and "Christchurch" in address else None,
                "region": "Canterbury",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None
            },
            price=price,
            booking={"url": ticket_link, "email": None, "phone": None},
            event_dates={"start": start_iso, "end": end_iso, "timezone": "Pacific/Auckland"},
            opening_hours=None,
            operating_months=None,
            data_collected_at=datetime.now().astimezone().isoformat(),
            text_for_embedding=build_embedding_text(name, desc, {"address":address,"city":"Christchurch","region":"Canterbury"},
                                                    date_text, price.get("text"), ["Events"])
        )
        yield item.to_dict()
