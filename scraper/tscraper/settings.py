# TravelScout Scrapy settings

BOT_NAME = "TravelScoutBot"  # kept
SPIDER_MODULES = ["tscraper.spiders"]
NEWSPIDER_MODULE = "tscraper.spiders"

# Crawl politeness
ROBOTSTXT_OBEY = True
DOWNLOAD_DELAY = 0.25           # kept from your file
CONCURRENT_REQUESTS = 16
CONCURRENT_REQUESTS_PER_DOMAIN = 16
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 0.25
AUTOTHROTTLE_TARGET_CONCURRENCY = 8.0
AUTOTHROTTLE_MAX_DELAY = 5.0

# Headers
DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "TravelScoutBot/1.0 (+contact: brettstrawbridge@windowslive.com)",
    "Accept-Language": "en-NZ,en;q=0.9",
}

# Caching & logging
HTTPCACHE_ENABLED = True
HTTPCACHE_DIR = "httpcache"
FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"

# Playwright (kept as-is for any JS sites you already crawl)
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
DOWNLOAD_HANDLERS = {
    "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
    "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
}
PLAYWRIGHT_BROWSER_TYPE = "chromium"
PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT = 20000
