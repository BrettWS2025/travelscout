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


# --- Playwright for JS-rendered sites (Flight Centre) ---
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
DOWNLOAD_HANDLERS = {
    "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
    "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
}
PLAYWRIGHT_BROWSER_TYPE = "chromium"
PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT = 20000
CONCURRENT_REQUESTS = 8
