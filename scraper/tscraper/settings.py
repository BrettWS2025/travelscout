BOT_NAME = "TravelScoutBot"
SPIDER_MODULES = ["tscraper.spiders"]
NEWSPIDER_MODULE = "tscraper.spiders"

ROBOTSTXT_OBEY = True
DOWNLOAD_DELAY = 1.5
AUTOTHROTTLE_ENABLED = True
CONCURRENT_REQUESTS = 8

DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "TravelScoutBot/1.0 (+contact: brettstrawbridge@windowslive.com)"
}

HTTPCACHE_ENABLED = True
HTTPCACHE_DIR = "httpcache"
FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"
