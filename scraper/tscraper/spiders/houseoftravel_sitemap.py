import re, scrapy
from scrapy.spiders import SitemapSpider
from tscraper.spiders.houseoftravel import HouseOfTravelSpider

class HouseOfTravelSitemapSpider(SitemapSpider, HouseOfTravelSpider):
    name = "houseoftravel_sitemap"
    allowed_domains = ["houseoftravel.co.nz", "www.houseoftravel.co.nz"]
    sitemap_urls = ["https://www.houseoftravel.co.nz/sitemap.xml"]
    # Only follow likely detail pages (deals/holidays/cruise sailings)
    sitemap_rules = [
        (r"/deals/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$", "parse_detail"),
        (r"/holidays/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$", "parse_detail"),
        (r"/cruises/.+/sailings/[a-z0-9-]+/?$", "parse_detail"),
    ]
    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "AUTOTHROTTLE_ENABLED": True,
        "CONCURRENT_REQUESTS": 8,
        "DOWNLOAD_DELAY": 0.7,
        "CLOSESPIDER_TIMEOUT": 1800,  # ~30 min hard stop
    }
