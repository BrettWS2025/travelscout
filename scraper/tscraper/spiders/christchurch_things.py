from urllib.parse import urljoin
import scrapy
from scrapy.linkextractors import LinkExtractor
from scrapy.spiders import CrawlSpider, Rule
from datetime import datetime
from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_prices, nz_months, build_embedding_text

BASE = "https://www.christchurchnz.com"

class ChristchurchThingsSpider(CrawlSpider):
    name = "christchurch_things"
    allowed_domains = ["christchurchnz.com","www.christchurchnz.com"]
    start_urls = ["https://www.christchurchnz.com/visit/things-to-do/"]

    rules = (
        Rule(LinkExtractor(allow=(r"/visit/things-to-do/listing/[a-z0-9\-]+",)), callback="parse_place", follow=True),
        Rule(LinkExtractor(allow=(r"/visit/things-to-do/.*",))),
    )

    def parse_place(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        cats = response.xpath("//a[contains(@href,'things-to-do') and contains(@href,'/')]//text()").getall()
        categories = [clean(c) for c in cats if clean(c)]

        pricing_text = clean(" ".join(response.xpath("//*[contains(., 'Pricing and Conditions')]/following::*[1]//text()").getall()))
        if not pricing_text:
            pricing_text = clean(" ".join(response.xpath("//p[contains(.,'$') or contains(.,'Free')]//text()").getall()))
        price = parse_prices(pricing_text or "")

        site = response.xpath("//a[contains(.,'View website') or contains(.,'Book now')]/@href").get()
        site = urljoin(url, site) if site else None

        email = response.xpath("//a[starts-with(@href,'mailto:')]/@href").re_first(r"mailto:(.+)")
        phone = response.xpath("//*[contains(text(),'Phone')]/following::*[1]//text()").get()
        phone = clean(phone)

        address = response.xpath("//*[normalize-space()='Address']/following::*[1]//text()").get()
        address = clean(address)

        months_text = clean(" ".join(response.xpath("//*[contains(., 'Months of operation')]/following::*[1]//text()").getall()))
        months = nz_months(months_text) if months_text else None
        hours = clean(" ".join(response.xpath("//*[contains(., 'Opening hours')]/following::*[1]//text()").getall()))

        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(BASE, img)

        item = TravelScoutItem(
            id=make_id(url),
            record_type="place",
            name=name,
            description=desc,
            categories=categories or ["Activities & Attractions"],
            tags=[],
            url=url,
            source="christchurchnz.com",
            images=[img] if img else [],
            location={
                "name": None,
                "address": address,
                "city": "Christchurch" if address and "Christchurch" in address else None,
                "region": "Canterbury",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None
            },
            price=price,
            booking={"url": site, "email": email, "phone": phone},
            event_dates=None,
            opening_hours=hours,
            operating_months=months,
            data_collected_at=datetime.now().astimezone().isoformat(),
            text_for_embedding=build_embedding_text(name, desc, {"address":address,"city":"Christchurch","region":"Canterbury"},
                                                    None, price.get("text"), categories)
        )
        yield item.to_dict()
