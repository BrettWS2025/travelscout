
import scrapy

class PackageItem(scrapy.Item):
    package_id = scrapy.Field()
    source = scrapy.Field()
    url = scrapy.Field()
    title = scrapy.Field()
    destinations = scrapy.Field()
    duration_days = scrapy.Field()
    nights = scrapy.Field()
    price = scrapy.Field()
    currency = scrapy.Field()
    price_basis = scrapy.Field()
    price_nzd = scrapy.Field()
    price_pppn = scrapy.Field()
    includes = scrapy.Field()
    hotel = scrapy.Field()
    sale_ends_at = scrapy.Field()
    last_seen_at = scrapy.Field()
