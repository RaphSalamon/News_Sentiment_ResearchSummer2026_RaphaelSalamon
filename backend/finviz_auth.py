"""
finviz_auth.py

Finviz Elite screener integration using the official API token.

Add to your .env:
    FINVIZ_API_TOKEN=your_token_here

API endpoint: https://elite.finviz.com/export/screener
Authentication: append &auth=TOKEN to the URL
Response: CSV with ticker, company, sector, market cap, price, volume, etc.
"""

import os
import csv
import io
import requests
from dotenv import load_dotenv

load_dotenv()

FINVIZ_API_TOKEN = os.getenv("FINVIZ_API_TOKEN")

EXPORT_URL = "https://elite.finviz.com/export/screener"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

CAP_FILTER_MAP = {
    "Mega":  "cap_mega",
    "Large": "cap_large",
    "Mid":   "cap_mid",
    "Small": "cap_small",
    "Micro": "cap_micro",
    "Nano":  "cap_nano",
    "All":   None,
}

SECTOR_FILTER_MAP = {
    "Technology":             "sec_technology",
    "Healthcare":             "sec_healthcare",
    "Financial":              "sec_financial",
    "Consumer Cyclical":      "sec_cyclical",
    "Consumer Defensive":     "sec_defensive",
    "Energy":                 "sec_energy",
    "Industrials":            "sec_industrials",
    "Basic Materials":        "sec_basicmaterials",
    "Real Estate":            "sec_realestate",
    "Utilities":              "sec_utilities",
    "Communication Services": "sec_communicationservices",
    "All":                    None,
}

MIN_VOLUME_FILTER_MAP = {
    100_000:   "sh_avgvol_o100",
    200_000:   "sh_avgvol_o200",
    500_000:   "sh_avgvol_o500",
    1_000_000: "sh_avgvol_o1000",
}


def pull_screener(
    cap_tier="All",
    sector="All",
    min_avg_volume=200_000,
    limit=50,
    us_only=True,
):
    if not FINVIZ_API_TOKEN:
        raise ValueError(
            "FINVIZ_API_TOKEN must be set in .env. "
            "Get your token from finviz.com > Settings > API."
        )

    filters = []

    cap_f = CAP_FILTER_MAP.get(cap_tier)
    if cap_f:
        filters.append(cap_f)

    sec_f = SECTOR_FILTER_MAP.get(sector)
    if sec_f:
        filters.append(sec_f)

    vol_f = None
    for threshold in sorted(MIN_VOLUME_FILTER_MAP.keys()):
        if min_avg_volume >= threshold:
            vol_f = MIN_VOLUME_FILTER_MAP[threshold]
    if vol_f:
        filters.append(vol_f)

    if us_only:
        filters.append("geo_usa")

    params = {
        "v":    "111",
        "f":    ",".join(filters) if filters else "",
        "o":    "-volume",
        "auth": FINVIZ_API_TOKEN,
    }

    resp = requests.get(
        EXPORT_URL,
        params=params,
        headers=HEADERS,
        timeout=30,
        allow_redirects=True,
    )

    if resp.status_code == 401:
        raise ConnectionError(
            "Finviz API returned 401 Unauthorized. "
            "Check that FINVIZ_API_TOKEN is correct in your .env."
        )

    if resp.status_code != 200:
        raise ConnectionError(
            f"Finviz screener export failed (HTTP {resp.status_code})."
        )

    text = resp.text.strip()
    if not text or text.startswith("<!DOCTYPE") or text.startswith("<html"):
        raise ConnectionError(
            "Finviz returned HTML instead of CSV. "
            "Verify your API token is valid and your Elite subscription is active."
        )

    reader  = csv.DictReader(io.StringIO(text))
    results = []
    for i, row in enumerate(reader):
        if i >= limit:
            break
        ticker  = row.get("Ticker", "").strip()
        company = row.get("Company", "").strip()
        if not ticker or not company:
            continue
        results.append({
            "ticker":            ticker,
            "company_name":      company,
            "sector":            row.get("Sector", "").strip(),
            "finviz_market_cap": row.get("Market Cap", "").strip(),
        })

    print(f"Finviz API: {len(results)} tickers "
          f"(cap={cap_tier}, sector={sector}, limit={limit})")
    return results


if __name__ == "__main__":
    try:
        tickers = pull_screener(cap_tier="Large", sector="Technology", limit=5)
        for t in tickers:
            print(t)
    except Exception as e:
        print(f"Error: {e}")