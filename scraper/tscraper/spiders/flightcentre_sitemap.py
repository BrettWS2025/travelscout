import re
import scrapy
from scrapy.spiders import SitemapSpider
from tscraper.spiders.flightcentre import FlightCentreSpider

class FlightCentreSitemapSpider(SitemapSpider, FlightCentreSpider):
    name = "flightcentre_sitemap"
    allowed_domains = ["flightcentre.co.nz", "www.flightcentre.co.nz"]

    # Discover sitemaps from robots + common sitemap endpoints
    sitemap_urls = [
        "https://www.flightcentre.co.nz/robots.txt",
        "https://www.flightcentre.co.nz/sitemap.xml",
        "https://www.flightcentre.co.nz/sitemap_index.xml",
    ]

    # Only follow sitemaps that look relevant (reduces noise)
    sitemap_follow = [r"(?i)holidays", r"(?i)product"]
    sitemap_alternate_links = True

    # Only detail pages
    sitemap_rules = [
        (r"/product/\d+/?$", "parse_detail"),
        (r"/holidays/.+-NZ\d+/?$", "parse_detail"),
    ]

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "USER_AGENT": "TravelScoutBot/1.0 (+contact: data@travelscout.example)",
        "CONCURRENT_REQUESTS": 8,
        "DOWNLOAD_DELAY": 1.0,
        "AUTOTHROTTLE_ENABLED": True,
        "CLOSESPIDER_TIMEOUT": 1800,
    }
