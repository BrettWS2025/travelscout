
from scrapy.spiders import SitemapSpider
from tscraper.utils import (parse_jsonld, price_from_jsonld, title_from_jsonld, parse_price_text,
    parse_nights, parse_sale_end, build_item, page_has_price_signal, extract_price_from_scripts)

class FlightcentreSitemapSpider(SitemapSpider):
    name = "flightcentre_sitemap"
    allowed_domains = ["flightcentre.co.nz"]
    sitemap_urls = ["https://www.flightcentre.co.nz/sitemap.xml"]
    sitemap_rules = [(r"/product/\d{6,}$", "parse_detail"),
                     (r"/holidays/(?!types/|destinations/)[a-z0-9-]+/[a-z0-9-]+(?:-NZ\d{3,})?$", "parse_detail"),
                     (r"/deals?/[a-z0-9-]+(?:-NZ\d{3,})?$", "parse_detail")]

    def parse_detail(self, response):
        txt = " ".join(response.xpath("//body//text()").getall())
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()
        price, currency, pvu = price_from_jsonld(objs)
        if not price:
            price_text = " ".join(response.css("[class*='price'], .price, [data-test*='price'] ::text").getall())
            price = parse_price_text(price_text) or extract_price_from_scripts(response.text) or parse_price_text(txt)
        if not price or price < 99: return
        nights = parse_nights(txt)
        sale_end = pvu or parse_sale_end(txt)
        yield build_item("flightcentre", response.url, title, price, currency, nights, sale_end, txt)
