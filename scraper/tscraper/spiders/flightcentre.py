
import re
import scrapy
from tscraper.utils import (parse_jsonld, price_from_jsonld, title_from_jsonld, parse_price_text,
    parse_nights, parse_sale_end, build_item, filter_links, page_has_price_signal, extract_price_from_scripts)

BASE = "https://www.flightcentre.co.nz"
ALLOW = [r"^/product/\d{6,}$",
         r"^/holidays/(?!types/|destinations/|inspiration/)[a-z0-9-]+/[a-z0-9-]+(?:-NZ\d{3,})?$",
         r"^/deals?/[a-z0-9-]+(?:-NZ\d{3,})?$"]
DENY = [r"/holidays/types/", r"/holidays/destinations/", r"/holidays/?$",
        r"/accommodation/search", r"/cruises/?$", r"\?.*\b(page|q|sort|destinations)="]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"

class FlightcentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz"]
    start_urls = [f"{BASE}/holidays", f"{BASE}/deals", f"{BASE}/product/21747107"]
    custom_settings = {"DOWNLOAD_DELAY": 1.0}

    def start_requests(self):
        for url in self.start_urls:
            meta = {}
            if any(x in url for x in ("/holidays","/deals")):
                meta = {"playwright": True,
                        "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                        "playwright_page_methods": [
                            ("wait_for_load_state", "networkidle"),
                            ("evaluate", "document.querySelector('#onetrust-accept-btn-handler, button[aria-label*=Accept i], button:has-text(\\'Accept\\')')?.click?.()"),
                            ("wait_for_timeout", 1000),
                        ]}
            yield scrapy.Request(url, callback=self.parse, meta=meta, dont_filter=True)

    def parse(self, response):
        hrefs = response.xpath("//a/@href").getall()
        for url in filter_links(response.url, hrefs, ALLOW, DENY):
            yield scrapy.Request(url, callback=self.parse_detail, dont_filter=True,
                meta={"playwright": True,
                      "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                      "playwright_page_methods": [("wait_for_load_state", "networkidle"),
                                                  ("evaluate", "document.querySelector('#onetrust-accept-btn-handler, button[aria-label*=Accept i], button:has-text(\\'Accept\\')')?.click?.()"),
                                                  ("wait_for_timeout", 800)]})

        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href)").getall():
            yield scrapy.Request(response.urljoin(nxt), callback=self.parse,
                meta={"playwright": True,
                      "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                      "playwright_page_methods": [("wait_for_load_state", "networkidle"), ("wait_for_timeout", 800)]})

    def parse_detail(self, response):
        txt = " ".join(response.xpath("//body//text()").getall())
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()
        price, currency, pvu = price_from_jsonld(objs)
        if not price:
            price_text = " ".join(response.css("[class*='price'], .price, [data-test*='price'] ::text").getall())
            price = parse_price_text(price_text) or extract_price_from_scripts(response.text) or parse_price_text(txt)
        if not price or price < 99:
            return
        nights = parse_nights(txt)
        sale_end = pvu or parse_sale_end(txt)
        yield build_item("flightcentre", response.url, title, price, currency, nights, sale_end, txt)
