"""
finviz_auth.py

Finviz Elite authenticated screener integration.

Credentials go in .env — never hardcoded:
    FINVIZ_EMAIL=your@email.com
    FINVIZ_PASSWORD=yourpassword

Login flow:
    1. POST to https://finviz.com/login.ashx with email + password
    2. Session receives auth cookies
    3. GET https://elite.finviz.com/export.ashx with filters → CSV
    4. Parse CSV → list of {ticker, company_name, sector, market_cap}

If login or export fails (wrong credentials, blocked, network error),
the module raises clearly so the caller can handle it gracefully.
"""

import os
import csv
import io
import time
import requests
from dotenv import load_dotenv

load_dotenv()

FINVIZ_EMAIL    = os.getenv("FINVIZ_EMAIL")
FINVIZ_PASSWORD = os.getenv("FINVIZ_PASSWORD")

LOGIN_URL    = "https://finviz.com/login.ashx"
EXPORT_URL   = "https://elite.finviz.com/export.ashx"
SCREENER_URL = "https://finviz.com/screener.ashx"     # fallback for non-Elite

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finviz.com/",
}

# Finviz filter strings for market cap tiers
CAP_FILTER_MAP = {
    "Mega":  "cap_mega",
    "Large": "cap_large",
    "Mid":   "cap_mid",
    "Small": "cap_small",
    "Micro": "cap_micro",
    "Nano":  "cap_nano",
    "All":   None,
}

# Finviz filter strings for sectors
SECTOR_FILTER_MAP = {
    "Technology":            "sec_technology",
    "Healthcare":            "sec_healthcare",
    "Financial":             "sec_financial",
    "Consumer Cyclical":     "sec_cyclical",
    "Consumer Defensive":    "sec_defensive",
    "Energy":                "sec_energy",
    "Industrials":           "sec_industrials",
    "Basic Materials":       "sec_basicmaterials",
    "Real Estate":           "sec_realestate",
    "Utilities":             "sec_utilities",
    "Communication Services": "sec_communicationservices",
    "All":                   None,
}

# Minimum average volume filters
MIN_VOLUME_FILTER_MAP = {
    100_000:  "sh_avgvol_o100",
    200_000:  "sh_avgvol_o200",
    500_000:  "sh_avgvol_o500",
    1_000_000: "sh_avgvol_o1000",
}


def _get_session():
    """
    Login to Finviz Elite and return an authenticated requests.Session.
    Raises ValueError if credentials are not configured.
    Raises ConnectionError if login fails.
    """
    if not FINVIZ_EMAIL or not FINVIZ_PASSWORD:
        raise ValueError(
            "FINVIZ_EMAIL and FINVIZ_PASSWORD must be set in .env — "
            "see finviz_auth.py for instructions."
        )

    session = requests.Session()
    session.headers.update(HEADERS)

    payload = {
        "email":    FINVIZ_EMAIL,
        "password": FINVIZ_PASSWORD,
        "remember": "true",
    }

    resp = session.post(LOGIN_URL, data=payload, timeout=20)

    if resp.status_code not in (200, 302):
        raise ConnectionError(
            f"Finviz login returned HTTP {resp.status_code}. "
            "Check your credentials in .env."
        )

    # Elite login sets an auth_token cookie; if it's missing the login
    # succeeded on the HTTP level but the credentials were wrong.
    if "auth_token" not in session.cookies:
        raise ConnectionError(
            "Finviz login did not return an auth_token cookie. "
            "Verify FINVIZ_EMAIL and FINVIZ_PASSWORD are correct."
        )

    print(f"Finviz Elite login successful for {FINVIZ_EMAIL}")
    return session


def pull_screener(
    cap_tier="All",
    sector="All",
    min_avg_volume=200_000,
    limit=50,
    us_only=True,
):
    """
    Pull a list of tickers from Finviz Elite screener with the given filters.

    Parameters:
        cap_tier      - market cap tier: 'Mega', 'Large', 'Mid', 'Small',
                        'Micro', 'Nano', or 'All'
        sector        - sector name (see SECTOR_FILTER_MAP) or 'All'
        min_avg_volume - minimum average daily volume (filters illiquid stocks)
        limit         - maximum number of tickers to return
        us_only       - if True, adds geo_usa filter (US-listed stocks only)

    Returns list of dicts:
        [{'ticker': 'AAPL', 'company_name': 'Apple Inc',
          'sector': 'Technology', 'finviz_market_cap': '$3.10T'}, ...]
    """
    session = _get_session()

    # Build filter list
    filters = []

    cap_f = CAP_FILTER_MAP.get(cap_tier)
    if cap_f:
        filters.append(cap_f)

    sec_f = SECTOR_FILTER_MAP.get(sector)
    if sec_f:
        filters.append(sec_f)

    # Find the nearest min volume filter
    vol_f = None
    for threshold in sorted(MIN_VOLUME_FILTER_MAP.keys()):
        if min_avg_volume >= threshold:
            vol_f = MIN_VOLUME_FILTER_MAP[threshold]
    if vol_f:
        filters.append(vol_f)

    if us_only:
        filters.append("geo_usa")

    params = {
        "v": "152",                          # overview view
        "f": ",".join(filters),
        "o": "-volume",                       # order by volume descending
        "c": "1,2,3,4,5,6,7,66,8,9,10",    # columns: No,Ticker,Company,Sector,Industry,Country,Market Cap,Change,P/E,Price,Volume
    }

    # Small delay to be polite to the server
    time.sleep(0.5)

    resp = session.get(EXPORT_URL, params=params, timeout=30)

    if resp.status_code == 401:
        raise ConnectionError(
            "Finviz returned 401 Unauthorized on screener export. "
            "Your account may not have Elite access to this endpoint."
        )

    if resp.status_code != 200:
        raise ConnectionError(
            f"Finviz screener export failed (HTTP {resp.status_code})."
        )

    # Parse the CSV response
    text = resp.text.strip()
    if not text or text.startswith("<!DOCTYPE"):
        raise ConnectionError(
            "Finviz returned HTML instead of CSV — "
            "login session may have expired or Elite access is required."
        )

    reader = csv.DictReader(io.StringIO(text))
    results = []
    for i, row in enumerate(reader):
        if i >= limit:
            break
        ticker  = row.get("Ticker", "").strip()
        company = row.get("Company", "").strip()
        if not ticker or not company:
            continue
        results.append({
            "ticker":           ticker,
            "company_name":     company,
            "sector":           row.get("Sector", "").strip(),
            "finviz_market_cap": row.get("Market Cap", "").strip(),
        })

    print(f"Finviz screener returned {len(results)} tickers "
          f"(cap={cap_tier}, sector={sector}, limit={limit})")
    return results


if __name__ == "__main__":
    try:
        tickers = pull_screener(cap_tier="Large", sector="Technology", limit=10)
        for t in tickers:
            print(t)
    except Exception as e:
        print(f"Error: {e}")
