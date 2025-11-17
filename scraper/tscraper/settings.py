BOT_NAME = "tscraper"
SPIDER_MODULES = ["tscraper.spiders"]
NEWSPIDER_MODULE = "tscraper.spiders"

ROBOTSTXT_OBEY = True

# Speed (still polite)
CONCURRENT_REQUESTS = 16
CONCURRENT_REQUESTS_PER_DOMAIN = 16
DOWNLOAD_DELAY = 0.25
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 0.25
AUTOTHROTTLE_TARGET_CONCURRENCY = 8.0
AUTOTHROTTLE_MAX_DELAY = 5.0

# Hard guards to prevent runaway crawls
DEPTH_LIMIT = 2
CLOSESPIDER_PAGECOUNT = 5000

# Timeouts/retries
DOWNLOAD_TIMEOUT = 20
RETRY_TIMES = 1

# Cache to speed re-runs
HTTPCACHE_ENABLED = True
HTTPCACHE_DIR = "httpcache"
HTTPCACHE_EXPIRATION_SECS = 60 * 60 * 24

FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"

DEFAULT_REQUEST_HEADERS = {
    "User-Agent": "TravelScoutScraper/1.0 (+https://airnz.co.nz)",
    "Accept-Language": "en-NZ,en;q=0.9",
}

# Silence telnet errors
TELNETCONSOLE_ENABLED = False

# Playwright: disable unless needed
# TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
# DOWNLOAD_HANDLERS = {
#     "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
#     "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
# }
# PLAYWRIGHT_BROWSER_TYPE = "chromium"
# PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT = 20000
