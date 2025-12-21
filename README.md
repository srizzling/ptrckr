# ptrckr

A self-hosted price tracker for Australian retailers.

## Why?

My monitor died. I'm on holiday. Naturally, the best use of my time is building a price tracking website instead of just... buying a monitor.

I tried the usual suspects - StaticICE, PCPartPicker AU - but kept running into issues. Some models weren't listed. Others had stale prices. A few retailers were missing entirely. I wanted something I could run myself and add scrapers to as needed.

Also, I wanted to learn Astro. Two birds, one stone.

## What it does

- Tracks prices from multiple Australian retailers
- Stores price history in SQLite
- Shows you charts so you can obsess over $10 fluctuations
- Sends Discord notifications when prices drop
- Runs on a schedule so you don't have to refresh manually

## Scrapers

Currently supports:
- **StaticICE** - aggregates prices from dozens of AU retailers
- **PCPartPicker AU** - good for PC components
- **PB Tech** - AU/NZ retailer
- **Dell Australia** - direct from Dell

Adding more is straightforward - each scraper is just a file that knows how to extract prices from a specific site.

## Running it

Docker is the easiest way:

```yaml
services:
  ptrckr:
    image: ghcr.io/srizzling/ptrckr:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
```

The database lives in `/app/data/ptrckr.db`. Mount that somewhere persistent.

## Tech

- Astro (SSR mode with Node adapter)
- SQLite via Drizzle ORM
- Cheerio for scraping
- Chart.js for the graphs
- Tailwind + shadcn/ui for the UI

## Roadmap

Things I might add when I'm procrastinating on other projects:

- [ ] **AI research agent** - tell it what you're looking for ("27 inch 4K OLED monitor under $1500") and it finds products, adds them to tracking, and monitors prices for you
- [ ] More scrapers (Amazon AU, Scorptec, Umart, etc.)
- [ ] Price alerts via email/Telegram
- [ ] Browser extension for one-click tracking
- [ ] Price prediction (probably overkill but would be fun)

## License

MIT. Do whatever you want with it.
