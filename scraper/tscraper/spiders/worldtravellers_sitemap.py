import re, scrapy
from scrapy.spiders import SitemapSpider
from tscraper.spiders.worldtravellers import WorldTravellersSpider

class WorldTravellersSitemapSpider(SitemapSpider, WorldTravellersSpider):
    name = "worldtravellers_sitemap"
    allowed_domains = ["worldtravellers.co.nz", "www.worldtravellers.co.nz"]
    sitemap_urls = ["https://www.worldtravellers.co.nz/sitemap.xml"]
    sitemap_rules = [
        (r"/deals/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$", "parse_detail"),
    ]
    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "AUTOTHROTTLE_ENABLED": True,
        "CONCURRENT_REQUESTS": 8,
        "DOWNLOAD_DELAY": 0.8,
        "CLOSESPIDER_TIMEOUT": 1800,
    }
